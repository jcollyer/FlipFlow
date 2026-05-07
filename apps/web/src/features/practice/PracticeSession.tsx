'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

import type { BackLanguageValue } from '@ensemble/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc/client';
import { FlipCard, NavButton, RatingButtons } from './FlashcardViewer';

interface Props {
  categoryId?: string;
  /** Filter to multiple categories. Used by the all-cards filtered practice. */
  categoryIds?: string[];
  /** Filter by word classes (e.g. ['noun', 'verb']). Empty = all classes. */
  classes?: string[];
  /** Max cards to pull for this session. Defaults to 20. */
  practiceLimit?: number;
}

/**
 * Practice flow:
 *   1. Fetch the queue once on mount.
 *   2. Walk through cards locally so a slow network doesn't block the UX.
 *   3. After each rating, fire-and-forget a submitReview mutation; we only
 *      wait for it on the *last* card so the summary screen has fresh stats.
 */
export function PracticeSession({ categoryId, categoryIds, classes, practiceLimit }: Props) {
  const utils = trpc.useUtils();
  const isAllCards = !categoryId;
  const backHref = isAllCards ? '/app/all-categories' : `/app/categories/${categoryId}`;
  const backLabel = isAllCards ? 'Back to all cards' : 'Back to deck';

  // When `practiceAll` is true we ignore the SM-2 schedule and pull every
  // card in the deck. The user opts in via "Practice anyway" on the empty
  // state, so we only flip this on after they confirm.
  const [practiceAll, setPracticeAll] = useState(false);

  const { data, isLoading } = trpc.practice.queue.useQuery(
    {
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
      limit: practiceLimit ?? 20,
      includeAll: practiceAll,
    },
    { refetchOnMount: 'always' },
  );

  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const cards = data?.cards ?? [];
  const isReadOnlyPublicDeck = Boolean(categoryId && data?.category && !data.category.isOwner);
  const canRate = !isReadOnlyPublicDeck;
  const current = cards[index];
  const done = !isLoading && cards.length > 0 && index >= cards.length;

  // Skip controls. These intentionally do NOT touch SM-2 state — no
  // submitReview is fired, so confidence / easeFactor / interval / nextReview
  // remain unchanged. We also reset the flip so the next card always lands
  // on its front side. Pressing "next" on the last card advances past the
  // end of the queue, which triggers the session-complete screen.
  const canGoPrev = !done && index > 0;
  const canGoNext = !done && cards.length > 0;

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, cards.length));
  }, [cards.length]);

  // Hotkeys: Space = flip, ArrowLeft = prev, ArrowRight = next.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current || done) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        handlePrev();
      } else if (e.code === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, done, canGoPrev, canGoNext, handlePrev, handleNext]);

  function handleRate(quality: number) {
    if (!current || !canRate) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // "Practice again" stays on the same route, so a Link wouldn't remount the
  // component and `index`/`reviewed`/`flipped` would still be at their
  // session-complete values. Reset locally and re-fetch the queue so the SM-2
  // schedule (and any reviews submitted this session) is reflected.
  const handlePracticeAgain = useCallback(() => {
    setIndex(0);
    setReviewed(0);
    setFlipped(false);
    utils.practice.queue.invalidate({
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
      limit: practiceLimit ?? 20,
      includeAll: practiceAll,
    });
  }, [utils, categoryId, categoryIds, classes, practiceLimit, practiceAll]);

  // When the session ends, refresh anything that shows due/mastered counts.
  useEffect(() => {
    if (done && canRate) {
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({ categoryId });
      if (categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId });
      } else {
        utils.flashcards.listAll.invalidate();
      }
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
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="text-muted-foreground text-sm">{data?.category?.name ?? 'All cards'}</div>
      </div>

      {!isLoading && cards.length === 0 ? (
        <EmptyQueue
          backHref={backHref}
          backLabel={backLabel}
          emptyTitle={isAllCards ? 'No cards to practice' : 'No cards in this deck'}
          practiceAll={isReadOnlyPublicDeck ? true : practiceAll}
          canPracticeAnyway={!isReadOnlyPublicDeck}
          onPracticeAnyway={() => setPracticeAll(true)}
        />
      ) : done ? (
        <SessionSummary
          backHref={backHref}
          backLabel={backLabel}
          reviewed={canRate ? reviewed : cards.length}
          canRate={canRate}
          onPracticeAgain={handlePracticeAgain}
        />
      ) : (
        <>
          <Progress value={progress} />
          <div className="text-muted-foreground text-center text-xs">
            {Math.min(index + 1, cards.length)} of {cards.length}
          </div>

          <div className="flex items-stretch gap-2 sm:gap-3">
            <NavButton direction="prev" onClick={handlePrev} disabled={!canGoPrev} />
            <div className="min-w-0 flex-1">
              <FlipCard
                front={current?.front ?? ''}
                back={current?.back ?? ''}
                frontExamples={current?.frontExamples ?? []}
                backExamples={current?.backExamples ?? []}
                cardClass={current?.class ?? null}
                pronunciation={
                  (current as { pronunciation?: string | null } | undefined)?.pronunciation ?? null
                }
                flipped={flipped}
                onClick={() => setFlipped((f) => !f)}
                cardId={current?.id}
                // Cast: backLanguage is widened to `string | null` from the wire,
                // but on the server we only ever store BackLanguageValue values.
                backLanguage={
                  (current?.category?.backLanguage ??
                    data?.category?.backLanguage ??
                    null) as BackLanguageValue | null
                }
              />
            </div>
            <NavButton direction="next" onClick={handleNext} disabled={!canGoNext} />
          </div>

          {flipped && canRate ? (
            <RatingButtons onRate={handleRate} disabled={submit.isPending} />
          ) : flipped ? (
            <div className="text-muted-foreground text-center text-sm">
              Public deck practice is read-only. Use the arrow buttons to move between cards.
            </div>
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => setFlipped(true)} size="lg">
                Flip
                <span className="bg-muted text-muted-foreground ml-2 rounded border px-1.5 py-0.5 text-xs">
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

function EmptyQueue({
  backHref,
  backLabel,
  emptyTitle,
  practiceAll,
  canPracticeAnyway,
  onPracticeAnyway,
}: {
  backHref: string;
  backLabel: string;
  emptyTitle: string;
  practiceAll: boolean;
  canPracticeAnyway: boolean;
  onPracticeAnyway: () => void;
}) {
  // If the user already opted into "Practice anyway" and we still got zero
  // cards back, the deck is genuinely empty — don't keep saying "caught up"
  // and don't offer the button again.
  const deckIsEmpty = practiceAll;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">
          {deckIsEmpty ? emptyTitle : 'Nothing due right now'}
        </div>
        <p className="text-muted-foreground max-w-sm text-sm">
          {deckIsEmpty
            ? "There's nothing here to practice yet. Add some cards to get started."
            : "You're all caught up. Your schedule will surface cards as they become due — or jump back in early with Practice anyway."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          {!deckIsEmpty && canPracticeAnyway ? (
            <Button onClick={onPracticeAnyway}>Practice anyway</Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionSummary({
  backHref,
  backLabel,
  reviewed,
  canRate,
  onPracticeAgain,
}: {
  backHref: string;
  backLabel: string;
  reviewed: number;
  canRate: boolean;
  onPracticeAgain: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Session complete</div>
        <p className="text-muted-foreground text-sm">
          {canRate ? 'You reviewed ' : 'You went through '}
          <strong>{reviewed}</strong> {reviewed === 1 ? 'card' : 'cards'}.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          <Button onClick={onPracticeAgain}>
            <RotateCcw className="h-4 w-4" />
            Practice again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
