'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

interface Props {
  categoryId: string;
}

/**
 * Practice flow:
 *   1. Fetch the queue once on mount.
 *   2. Walk through cards locally so a slow network doesn't block the UX.
 *   3. After each rating, fire-and-forget a submitReview mutation; we only
 *      wait for it on the *last* card so the summary screen has fresh stats.
 */
export function PracticeSession({ categoryId }: Props) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.practice.queue.useQuery(
    { categoryId, limit: 20 },
    { refetchOnMount: 'always' },
  );

  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const cards = data?.cards ?? [];
  const current = cards[index];
  const done = !isLoading && cards.length > 0 && index >= cards.length;

  // Spacebar = flip.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && current && !done) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, done]);

  function handleRate(quality: number) {
    if (!current) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // When the session ends, refresh anything that shows due/mastered counts.
  useEffect(() => {
    if (done) {
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({ categoryId });
      utils.flashcards.listByCategory.invalidate({ categoryId });
    }
  }, [done, utils, categoryId]);

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round((Math.min(index, cards.length) / cards.length) * 100);
  }, [index, cards.length]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/app/categories/${categoryId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to deck
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">
          {data?.category.name ?? ''}
        </div>
      </div>

      {!isLoading && cards.length === 0 ? (
        <EmptyQueue categoryId={categoryId} />
      ) : done ? (
        <SessionSummary categoryId={categoryId} reviewed={reviewed} />
      ) : (
        <>
          <Progress value={progress} />
          <div className="text-center text-xs text-muted-foreground">
            {Math.min(index + 1, cards.length)} of {cards.length}
          </div>

          <FlipCard
            front={current?.front ?? ''}
            back={current?.back ?? ''}
            flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
          />

          {flipped ? (
            <RatingButtons onRate={handleRate} disabled={submit.isPending} />
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => setFlipped(true)} size="lg">
                Show answer
                <span className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  Space
                </span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FlipCard({
  front,
  back,
  flipped,
  onClick,
}: {
  front: string;
  back: string;
  flipped: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flip-card block h-72 w-full select-text outline-none', flipped && 'is-flipped')}
      aria-label={flipped ? 'Hide answer' : 'Show answer'}
    >
      <div className="flip-card-inner">
        <Card className="flip-card-face flex items-center justify-center p-6 text-center shadow-md">
          <CardContent className="text-2xl font-medium leading-snug">{front}</CardContent>
        </Card>
        <Card className="flip-card-face flip-card-back flex items-center justify-center border-primary/40 bg-primary/5 p-6 text-center shadow-md">
          <CardContent className="text-xl leading-snug">{back}</CardContent>
        </Card>
      </div>
    </button>
  );
}

const RATINGS: { value: number; label: string; sub: string; tone: string }[] = [
  { value: 0, label: 'Again', sub: 'No idea', tone: 'border-red-500/40 hover:bg-red-500/10' },
  { value: 2, label: 'Hard', sub: 'Wrong', tone: 'border-orange-500/40 hover:bg-orange-500/10' },
  { value: 3, label: 'Good', sub: 'Got it', tone: 'border-blue-500/40 hover:bg-blue-500/10' },
  { value: 5, label: 'Easy', sub: 'Perfect', tone: 'border-green-500/40 hover:bg-green-500/10' },
];

function RatingButtons({ onRate, disabled }: { onRate: (q: number) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {RATINGS.map((r) => (
        <button
          key={r.value}
          onClick={() => onRate(r.value)}
          disabled={disabled}
          className={cn(
            'flex flex-col items-center rounded-md border bg-background py-3 transition disabled:opacity-50',
            r.tone,
          )}
        >
          <span className="text-base font-semibold">{r.label}</span>
          <span className="text-xs text-muted-foreground">{r.sub}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyQueue({ categoryId }: { categoryId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Nothing due right now</div>
        <p className="max-w-sm text-sm text-muted-foreground">
          You're all caught up. Add more cards or come back later — your schedule will surface
          cards as they become due.
        </p>
        <Button asChild>
          <Link href={`/app/categories/${categoryId}`}>Back to deck</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SessionSummary({ categoryId, reviewed }: { categoryId: string; reviewed: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Session complete</div>
        <p className="text-sm text-muted-foreground">
          You reviewed <strong>{reviewed}</strong> {reviewed === 1 ? 'card' : 'cards'}. Nice.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/categories/${categoryId}`}>Back to deck</Link>
          </Button>
          <Button asChild>
            <Link href={`/app/categories/${categoryId}/practice`}>
              <RotateCcw className="h-4 w-4" />
              Practice again
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
