import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Sparkles, Zap, RefreshCw, Languages, Volume2, Wand2 } from 'lucide-react';

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
            <RefreshCw className="text-primary h-5 w-5" />
            FlipFlow
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="bg-muted/50 text-muted-foreground mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <Sparkles className="h-3 w-3" />
          Spaced repetition, the way it should be
        </div>
        <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Flashcards that <span className="text-primary">actually stick.</span>
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-balance text-lg">
          Build decks, rate your recall, and let FlipFlow surface exactly the cards you're about to
          forget.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signin">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Fast capture"
            body="Add cards in seconds."
          />
          <FeatureCard
            icon={<RefreshCw className="h-5 w-5" />}
            title="SM-2 scheduling"
            body="The classic algorithm, dialed in."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="One backend"
            body="Web today, mobile next."
          />
          <FeatureCard
            icon={<Languages className="h-5 w-5" />}
            title="Auto translate mode"
            body="Type in one language, get the other side filled in for you."
          />
          <FeatureCard
            icon={<Volume2 className="h-5 w-5" />}
            title="Click to hear translation"
            body="Tap the back of any card to hear it spoken aloud."
          />
          <FeatureCard
            icon={<Wand2 className="h-5 w-5" />}
            title="Auto-generate practice text"
            body="Turn your deck into reading passages on the fly."
            badge="Coming soon"
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <div className="rounded-xl border p-5 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="bg-primary/10 text-primary inline-flex h-9 w-9 items-center justify-center rounded-lg">
          {icon}
        </div>
        {badge ? (
          <span className="bg-muted/50 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-muted-foreground text-sm">{body}</div>
    </div>
  );
}
