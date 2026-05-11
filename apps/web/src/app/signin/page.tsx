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
  const hasEmail = !!process.env.AUTH_RESEND_KEY;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/" className="mx-auto mb-2 inline-flex items-center gap-2">
            <div className="bg-primary/10 inline-flex size-10 items-center justify-center rounded-full">
              <p className="text-primary font-brand h-12 text-4xl font-semibold">e</p>
            </div>
            <span className="font-brand text-xl font-semibold leading-none text-gray-700">
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

          {hasGoogle && hasEmail ? (
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

          {!hasGoogle && !hasEmail ? (
            <div className="bg-muted/50 text-muted-foreground rounded-md border p-4 text-sm">
              No auth providers are configured yet. Set <code>AUTH_GOOGLE_ID</code> /
              <code> AUTH_GOOGLE_SECRET</code> or <code>AUTH_RESEND_KEY</code> in your{' '}
              <code>.env.local</code>.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
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
