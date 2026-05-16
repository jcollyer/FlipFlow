import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/server/auth';
import { AcceptInviteClient } from '@/features/groups/AcceptInviteClient';

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * /groups/join/[token] — public landing page for shareable invite links.
 *
 * Why this lives outside /app: the /app layout redirects unauthenticated
 * visitors to /signin without preserving the URL. Invitees often arrive
 * here from an email or chat message, so we need the join URL to handle
 * the not-signed-in case ourselves and pass a callbackUrl through to
 * /signin. After signing in the user is sent back here and can click Accept.
 */
export default async function JoinGroupPage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  // Token shape sanity check before hitting the database. Anything that
  // doesn't look like a token is treated as a 404. The real validation
  // happens server-side in invites.previewByToken / invites.accept.
  if (!token || token.length < 16 || token.length > 128) {
    redirect('/');
  }

  if (!session?.user) {
    // Encode the original URL so the signin page can send the user back
    // here after they authenticate. The signin handler validates the
    // callbackUrl is same-origin before honoring it.
    const callbackUrl = `/groups/join/${encodeURIComponent(token)}`;
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">You&apos;ve been invited</CardTitle>
            <CardDescription>Sign in to accept the invitation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
                Sign in to continue
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/">Cancel</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Authenticated → render the client component that previews the invite
  // and exposes the Accept button.
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <AcceptInviteClient token={token} />
    </main>
  );
}
