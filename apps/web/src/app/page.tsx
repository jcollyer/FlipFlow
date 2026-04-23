import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Sparkles, Zap, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { auth } from '@/server/auth';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/app');

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <RefreshCw className="h-5 w-5 text-primary" />
            FlipFlow
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Spaced repetition, the way it should be
        </div>
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Flashcards that <span className="text-primary">actually stick.</span>
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground">
          Build decks, rate your recall, and let FlipFlow surface exactly the cards you're about
          to forget.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signin">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard icon={<Zap className="h-5 w-5" />} title="Fast capture" body="Add cards in seconds." />
          <FeatureCard icon={<RefreshCw className="h-5 w-5" />} title="SM-2 scheduling" body="The classic algorithm, dialed in." />
          <FeatureCard icon={<Sparkles className="h-5 w-5" />} title="One backend" body="Web today, mobile next." />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border p-5 text-left">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
