import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mail, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth, signIn } from '@/server/auth';

interface SignInPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, callbackUrl } = await searchParams;

  // Only accept same-origin callbacks (must start with "/"). This stops
  // someone from crafting a link like /signin?callbackUrl=https://evil.com
  // and phishing us after sign-in.
  const target = callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/app';

  const session = await auth();
  if (session?.user) redirect(target);

  const hasGoogle = !!process.env.AUTH_GOOGLE_ID;
  const hasApple = !!process.env.AUTH_APPLE_ID;
  const hasEmail = !!process.env.AUTH_RESEND_KEY;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-2 inline-flex items-center gap-2">
            <div className="bg-primary inline-flex size-8 items-center justify-center rounded-full">
              <p className="font-brand h-12 text-4xl font-semibold text-white">e</p>
            </div>
            <span className="font-brand text-primary text-xl font-semibold leading-none">
              ensemble
            </span>
          </Link>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to keep your streak alive.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm">
              Couldn't sign you in: {error}
            </div>
          ) : null}

          {hasApple ? (
            // Apple HIG requires this button to be presented with at least
            // equal prominence to other third-party sign-in options. We put
            // it first in the stack and use the official black-on-white
            // styling. (See https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
            <form
              action={async () => {
                'use server';
                await signIn('apple', { redirectTo: target });
              }}
            >
              <Button type="submit" className="w-full bg-black text-white hover:bg-black/90">
                <AppleIcon className="h-4 w-4" />
                Continue with Apple
              </Button>
            </form>
          ) : null}

          {hasGoogle ? (
            <form
              action={async () => {
                'use server';
                await signIn('google', { redirectTo: target });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                <GoogleIcon className="h-4 w-4" />
                Continue with Google
              </Button>
            </form>
          ) : null}

          {(hasApple || hasGoogle) && hasEmail ? (
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">or</span>
              </div>
            </div>
          ) : null}

          {hasEmail ? (
            <form
              action={async (formData: FormData) => {
                'use server';
                const email = String(formData.get('email') ?? '').trim();
                if (!email) return;
                await signIn('resend', { email, redirectTo: target });
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                <Mail className="h-4 w-4" />
                Email me a magic link
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Apple logo (filled). The path is sized to sit cleanly inside a 24×24
 * viewBox — leaf-and-body proportions match Apple's branding guidelines
 * and nothing extends beyond the box, so the icon scales to any pixel
 * size without clipping. Per Apple's HIG, the logo and label must appear
 * together on the button — no logo-only or label-only variants.
 */
function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        fill="currentColor"
      />
    </svg>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.84-2.66-5.84-5.95s2.62-5.95 5.84-5.95c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.9 3.95 14.7 3 12 3 6.92 3 2.8 7.13 2.8 12.2S6.92 21.4 12 21.4c6.92 0 9.55-4.85 9.55-7.36 0-.5-.05-.83-.2-1.94z"
        fill="currentColor"
      />
    </svg>
  );
}
