import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { prisma } from '@flipflow/db';
import { auth } from '@/server/auth';

/**
 * Mobile auth bridge.
 *
 * Flow:
 *   1. Expo app opens WebBrowser.openAuthSessionAsync() at `/auth/mobile?scheme=flipflow`
 *   2. If no Auth.js session cookie, we redirect into the normal sign-in flow
 *      with this URL as the callback so we end up back here after sign-in.
 *   3. Once signed in, we look up an active Session row for this user and hand
 *      the session token back to the app via the `flipflow://auth?token=...`
 *      custom URL scheme. Expo's auth session resolves and gives the app the
 *      token, which it then stores in SecureStore.
 *
 * No changes to `@flipflow/api` — this bridge lives entirely in the Next app.
 */
export async function GET(req: Request) {
  // In Next.js route handlers behind a proxy (ngrok, Vercel, etc.) `req.url`
  // can reflect the internal origin (http://localhost:3000) instead of the
  // public one. Prefer AUTH_URL, then x-forwarded-*, and fall back to req.url.
  const h = await headers();
  const forwardedHost = h.get('x-forwarded-host') ?? h.get('host');
  const forwardedProto = h.get('x-forwarded-proto') ?? 'https';
  const publicOrigin =
    process.env.AUTH_URL ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(req.url).origin);

  const url = new URL(req.url);
  const scheme = url.searchParams.get('scheme') ?? 'flipflow';

  // Prefer an explicit returnUrl passed by the client (needed in Expo Go,
  // which doesn't register custom URL schemes — the real return URL looks
  // like `exp://<devserver>/--/auth`). Fall back to the custom scheme for
  // older clients and built dev/prod apps.
  const clientReturnUrl = url.searchParams.get('returnUrl');
  const returnBase = clientReturnUrl ?? `${scheme}://auth`;
  const errorRedirect = appendParams(returnBase, { error: 'sign_in_failed' });

  // Helpful while you're debugging the ngrok flow — remove once it works.
  console.log(
    '[auth/mobile] req.url=%s publicOrigin=%s returnBase=%s',
    req.url,
    publicOrigin,
    returnBase,
  );

  const session = await auth();

  if (!session?.user?.id) {
    // Kick into Auth.js sign-in, then loop back here. Re-include returnUrl
    // so the bridge still has it after the sign-in round-trip.
    const signInUrl = new URL('/signin', publicOrigin);
    const loopBack = new URL('/auth/mobile', publicOrigin);
    loopBack.searchParams.set('scheme', scheme);
    if (clientReturnUrl) loopBack.searchParams.set('returnUrl', clientReturnUrl);
    signInUrl.searchParams.set('callbackUrl', loopBack.pathname + loopBack.search);
    return NextResponse.redirect(signInUrl);
  }

  // Find (or mint) a DB session row for the signed-in user. With
  // `session.strategy = 'database'` this row already exists from the browser
  // sign-in — grab the newest one so the mobile app uses the freshest token.
  const dbSession = await prisma.session.findFirst({
    where: { userId: session.user.id, expires: { gt: new Date() } },
    orderBy: { expires: 'desc' },
    select: { sessionToken: true, expires: true },
  });

  if (!dbSession) {
    return NextResponse.redirect(errorRedirect);
  }

  const deepLink = appendParams(returnBase, {
    token: dbSession.sessionToken,
    expires: dbSession.expires.toISOString(),
  });

  return NextResponse.redirect(deepLink);
}

/**
 * Safely append query params to a URL that may use a custom scheme
 * (`flipflow://`, `exp://`), where `new URL(...).searchParams` behavior can
 * be quirky across runtimes. String concatenation keeps the scheme intact.
 */
function appendParams(base: string, params: Record<string, string>): string {
  const sep = base.includes('?') ? '&' : '?';
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}${sep}${qs}`;
}
