import Image from 'next/image';
import Link from 'next/link';
import underlinePng from './underline.png';
import appIconPng from './app-icon.png';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  Sparkles,
  Star,
  Crown,
  Globe,
  HeartHandshake,
  Smartphone,
  ListStart,
} from 'lucide-react';

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
            <div className="bg-primary inline-flex size-8 items-center justify-center rounded-full">
              <p className="font-brand h-12 text-4xl font-semibold text-white">e</p>
            </div>
            <span className="font-brand text-primary text-xl font-semibold leading-none">
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
          Language learning made easy and efficient.
        </div>
        <h1 className="font-brand text-primary max-w-3xl text-balance text-6xl font-semibold leading-tight sm:text-8xl sm:leading-[0.9]">
          ensemble
        </h1>
        <h2 className="font-accent text-xl text-gray-700">
          LANGUAGE BRINGS PEOPLE{' '}
          <span className="relative inline-block font-semibold italic">
            TOGETHER
            <Image
              src={underlinePng}
              alt=""
              className="absolute left-1/4 w-[120%] max-w-none -translate-x-1/4"
              style={{ top: '55%' }}
            />
          </span>
        </h2>
        <p className="text-muted-foreground text-md mt-6 max-w-xl text-balance">
          Create flashcards. Play your decks. Track your progress.
        </p>
        <p className="text-muted-foreground text-md max-w-xl text-balance">
          Build vocabulary for ensemble to act as your personalized conversation partner.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signin" className="group">
              Get started{' '}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Globe className="h-5 w-5" />}
            title="Quick creation"
            body="Turn on translation to both see + hear it"
          />
          <FeatureCard
            icon={<ListStart className="h-5 w-5" />}
            title="Organization"
            body="Group cards by course, by week"
          />
          <FeatureCard
            icon={<Star className="h-5 w-5" />}
            title="Rating"
            body="Track your progress as you learn"
          />
          <FeatureCard
            icon={<HeartHandshake className="h-5 w-5" />}
            title="Collaborate"
            body="Create together or duplicate classmates’ decks"
          />
          <FeatureCard
            icon={<Smartphone className="h-5 w-5" />}
            title="On the go"
            body="Play on the app in easy 5 or 10 minute pockets of time"
          />
          <FeatureCard
            icon={<Crown className="h-5 w-5" />}
            title="Personalized convos"
            body="Chat with ensemble using only your known vocabulary"
            badge="Coming soon"
          />
        </div>
        <div className="mt-20 w-full max-w-3xl">
          <div className="bg-muted/30 flex flex-col items-center gap-6 rounded-2xl border p-8 sm:flex-row sm:gap-8 sm:p-10 sm:text-left">
            <Image
              src={appIconPng}
              alt="ensemble app icon"
              width={96}
              height={96}
              className="h-24 w-24 flex-shrink-0 rounded-[22%] shadow-md"
            />
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-brand text-primary text-2xl font-semibold sm:text-3xl">
                Take ensemble with you
              </h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Practice on the go — download the iOS app and learn in those spare 5 or 10 minute
                pockets of time.
              </p>
            </div>
            <a
              href="https://apps.apple.com/us/app/ensemble-language/id6770618195"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 transition-transform duration-200 hover:scale-105"
              aria-label="Download ensemble on the App Store"
            >
              <img
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
                alt="Download on the App Store"
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>

        <div className="mt-14 text-center">
          <a href="mailto:hello@ensemblelanguage.com" className="text-primary hover:underline">
            hello@ensemblelanguage.com
          </a>
          <div className="mx-2 inline-block text-gray-300">|</div>
          <Link href="/privacy" className="text-primary hover:underline">
            privacy policy
          </Link>
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
      <div className="font-semibold text-gray-600">{title}</div>
      <div className="text-muted-foreground text-sm">{body}</div>
    </div>
  );
}
