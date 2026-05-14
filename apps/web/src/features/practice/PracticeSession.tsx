'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Pencil, RotateCcw } from 'lucide-react';

import type { BackLanguageValue, DifficultyLevel } from '@ensemble/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc/client';
import { shuffleArray } from '@/lib/utils';
import { EditCardDialog } from '@/features/cards/EditCardDialog';
import { FlipCard, NavButton, RatingButtons } from './FlashcardViewer';

interface Props {
  categoryId?: string;
  /** Filter to multiple categories. Used by the all-cards filtered practice. */
  categoryIds?: string[];
  /** Filter by word classes (e.g. ['noun', 'verb']). Empty = all classes. */
  classes?: string[];
  /**
   * Filter by difficulty level. Values are 'easy', 'good', 'challenging', or
   * 'no_rating' (for cards with a null difficultyLevel). Empty = all ratings.
   */
  difficultyLevels?: string[];
  /**
   * When true, randomize the card order for this session. The shuffle is
   * stable across renders and across rating submissions — it only re-shuffles
   * when the user presses "Play again".
   */
  shuffle?: boolean;
}

/**
 * Practice flow:
 *   1. Fetch every card in the requested scope once on mount.
 *   2. Walk through them locally — a slow network shouldn't block the UX.
 *   3. After each rating, fire-and-forget a submitReview mutation to store
 *      the latest difficulty rating. We don't block on it; the summary
 *      screen only needs fresh stats, which we refresh in an effect.
 *   4. "Play again" resets the local index to 0 and reuses the same fetched
 *      card list (no refetch) so the user gets a true restart from card 0
 *      with the same set of cards, in the same order.
 */
export function PracticeSession({
  categoryId,
  categoryIds,
  classes,
  difficultyLevels,
  shuffle = false,
}: Props) {
  const utils = trpc.useUtils();
  const isAllCards = !categoryId;
  const backHref = isAllCards ? '/app' : `/app/categories/${categoryId}`;
  const backLabel = isAllCards ? 'Back to home' : 'Back to deck';

  const { data, isLoading } = trpc.practice.queue.useQuery(
    {
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
    },
    { refetchOnMount: 'always' },
  );
  const { data: categories } = trpc.categories.list.useQuery(undefined, {
    enabled: !categoryId,
  });

  // Invalidate stats / list queries on every successful rating so the
  // ProgressSnapshotCard tiles (both per-deck and dashboard variants)
  // refresh in real time as the user rates cards. We invalidate
  // `practice.stats` with no input so BOTH `{}` (dashboard aggregate) and
  // `{ categoryId: ... }` (deck-scoped) variants are refetched. Same for
  // categories.list, which feeds deck-tile counts on the dashboard.
  const submit = trpc.practice.submitReview.useMutation({
    onSuccess: () => {
      utils.practice.stats.invalidate();
      utils.categories.list.invalidate();
      if (categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId });
      } else {
        utils.flashcards.listAll.invalidate();
      }
    },
  });

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Incremented every time the user presses "Play again" so we can re-shuffle
  // when shuffle mode is active. Stays at 0 for in-order play.
  const [shuffleEpoch, setShuffleEpoch] = useState(0);

  const rawCards = data?.cards ?? [];
  const filteredCards = useMemo(() => {
    if (!difficultyLevels?.length) return rawCards;
    return rawCards.filter((c) => {
      const level = (c as { difficultyLevel?: string | null }).difficultyLevel ?? null;
      if (difficultyLevels.includes('no_rating') && level === null) return true;
      return level !== null && difficultyLevels.includes(level);
    });
  }, [rawCards, difficultyLevels]);

  // Apply shuffle on top of the filtered list. Keyed by a signature derived
  // from the card ids so the order stays stable across re-renders and across
  // rating submissions — it only re-derives when the underlying card set
  // changes or the user presses "Play again" (which bumps shuffleEpoch).
  const cardsKey = filteredCards.map((c) => c.id).join('|');
  const cards = useMemo(() => {
    if (!shuffle) return filteredCards;
    return shuffleArray(filteredCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsKey, shuffle, shuffleEpoch]);
  const isReadOnlyPublicDeck = Boolean(categoryId && data?.category && !data.category.isOwner);
  const canRate = !isReadOnlyPublicDeck;
  const current = cards[index];
  const done = !isLoading && cards.length > 0 && index >= cards.length;
  const canEdit = Boolean(current && !isReadOnlyPublicDeck);
  const decks = useMemo(() => {
    if (categoryId && data?.category) {
      return [{ id: data.category.id, name: data.category.name }];
    }
    return (categories ?? []).map((category) => ({ id: category.id, name: category.name }));
  }, [categoryId, categories, data?.category]);

  // Skip controls. These intentionally don't fire submitReview, so a card the
  // user navigates past without rating keeps its previous difficultyLevel.
  // Pressing "next" on the last card advances past the end of the queue,
  // which triggers the session-complete screen.
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
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[contenteditable="true"]'))
      ) {
        return;
      }
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

  function handleRate(level: DifficultyLevel) {
    if (!current || !canRate) return;
    submit.mutate({ cardId: current.id, difficultyLevel: level });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // "Play again" resets local index/flip state and re-walks the same cards.
  // We intentionally do NOT refetch the queue here — the user's expectation
  // is "restart from card 0", same deck. In shuffle mode we bump shuffleEpoch
  // so the order is re-randomized; in-order mode reuses the existing order.
  // Per-rating stats refreshes are handled by submit's onSuccess above.
  const handlePracticeAgain = useCallback(() => {
    setIndex(0);
    setReviewed(0);
    setFlipped(false);
    if (shuffle) setShuffleEpoch((n) => n + 1);
  }, [shuffle]);

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
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="text-muted-foreground text-center">
              {Math.min(index + 1, cards.length)} of {cards.length}
            </div>
            {canEdit ? (
              <Button variant="outline" size="sm" onClick={() => setEditingId(current?.id ?? null)}>
                <Pencil className="h-4 w-4" />
                Edit card
              </Button>
            ) : null}
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

      {editingId ? (
        <EditCardDialog
          cardId={editingId}
          decks={decks}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            void utils.practice.queue.invalidate();
            void utils.flashcards.listAll.invalidate();
            if (categoryId) {
              void utils.flashcards.listByCategory.invalidate({ categoryId });
            }
            setEditingId(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Empty-state card for when the requested scope contains zero cards (deck
 * has no cards yet, or filters match nothing). There's no longer a
 * "caught up on your schedule" state — every card is always practiceable.
 */
function EmptyQueue({
  backHref,
  backLabel,
  emptyTitle,
}: {
  backHref: string;
  backLabel: string;
  emptyTitle: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">{emptyTitle}</div>
        <p className="text-muted-foreground max-w-sm text-sm">
          There&apos;s nothing here to practice yet. Add some cards to get started.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
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
            Play again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
