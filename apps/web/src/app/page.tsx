import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Sparkles, Zap, Volume2, Wand2, Star, Tags, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { auth } from '@/server/auth';

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect('/app');

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-full">
              <p className="text-primary font-brand text-4xl font-semibold leading-none">e</p>
            </div>
            <span className="font-brand text-2xl font-semibold leading-none text-gray-600">
              ensemble
            </span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="bg-muted/50 text-muted-foreground mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <Sparkles className="h-3 w-3" />
          Learn on your own, or together
        </div>
        <h1 className="font-brand text-primary max-w-3xl text-balance text-6xl font-semibold leading-[0.8] sm:text-8xl">
          ensemble
        </h1>
        <h2 className="text-xl text-gray-700">
          Language brings people <span className="font-semibold italic">together</span>
        </h2>
        <p className="text-muted-foreground text-md mt-6 max-w-xl text-balance">
          Create flashcards, building vocabulary for ensemble to act as your personal conversation
          tutor.
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
            title="Quick creation"
            body="Add cards in seconds."
          />
          <FeatureCard
            icon={<Star className="h-5 w-5" />}
            title="Rating"
            body="Learn more by rating flashards."
          />
          <FeatureCard
            icon={<Tags className="h-5 w-5" />}
            title="Play by tags"
            body="Focus on what you want to practice."
          />
          <FeatureCard
            icon={<Volume2 className="h-5 w-5" />}
            title="Hear translation"
            body="Tap the back of any card to hear it spoken aloud."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Collaboration"
            body="Share decks with friends, or let ensemble combine your decks for group practice."
          />
          <FeatureCard
            icon={<Wand2 className="h-5 w-5" />}
            title="Let ensemble test you"
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
