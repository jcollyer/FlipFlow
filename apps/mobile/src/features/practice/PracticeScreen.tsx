import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { type BackLanguageValue, type DifficultyLevel } from '@ensemble/types';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAuth, useRequireAuth } from '@/lib/AuthContext';
import { trpc } from '@/lib/trpc';
import { shuffleArray } from '@/lib/format';
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
   * When true, randomize the card order for this session. Stable across
   * renders and rating submissions — re-shuffles only on "Play again".
   */
  shuffle?: boolean;
  /**
   * Where the user entered practice from. Controls the back-button label and
   * destination shown on the completion screen:
   *   - 'home'  → "Back to home" → navigates to /
   *   - 'deck'  → "Back to deck" → navigates to /decks/<id>
   *   - undefined → falls back to the legacy isAllCards logic
   */
  origin?: 'home' | 'deck';
}

/**
 * Practice flow. Matches the web PracticeSession:
 *   1. Fetch every card in scope on mount.
 *   2. Walk cards locally (tap card to flip).
 *   3. After each rating, fire submitReview and advance — don't block
 *      the UI on the network.
 *   4. When the queue is done, show a summary and invalidate stats. "Play
 *      again" reuses the same fetched card list (no refetch) so the user
 *      gets a true restart from card 0.
 */
export function PracticeScreen({
  categoryId,
  categoryIds,
  classes,
  difficultyLevels,
  shuffle = false,
  origin,
}: Props) {
  const isAllCards = !categoryId;
  const router = useRouter();
  const utils = trpc.useUtils();
  const { isGuest } = useAuth();
  const requireAuth = useRequireAuth();

  const { data, isLoading } = trpc.practice.queue.useQuery(
    {
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
    },
    { refetchOnMount: 'always' },
  );

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
  // Signed-in users who don't own the deck can't rate cards on it (existing
  // behaviour). Guests are a separate case: we still show them the rating
  // buttons so they understand what the app does, but tapping one routes
  // through `requireAuth` to prompt sign-in instead of submitting.
  const canRate = !isReadOnlyPublicDeck;
  const showRatingButtons = canRate || isGuest;
  const current = cards[index];
  const backLanguage = (current?.category?.backLanguage ??
    data?.category?.backLanguage ??
    null) as BackLanguageValue | null;
  const done = !isLoading && cards.length > 0 && index >= cards.length;
  // Resolve the back-button destination and label. When an explicit origin is
  // provided (set by PracticeFiltersModal), use it. Otherwise fall back to the
  // legacy per-categoryId logic used by the direct /decks/[id]/practice route.
  const deckBackId = categoryId ?? categoryIds?.[0];
  const backTarget =
    origin === 'home'
      ? '/'
      : origin === 'deck'
        ? `/decks/${deckBackId}`
        : isAllCards
          ? '/all-cards'
          : `/decks/${categoryId}`;
  const backLabel =
    origin === 'home'
      ? 'Back to home'
      : origin === 'deck'
        ? 'Back to deck'
        : isAllCards
          ? 'Back to all cards'
          : 'Back to deck';

  function handleRate(level: DifficultyLevel) {
    if (!current) return;
    // Guests see the rating buttons but tapping one prompts sign-in rather
    // than submitting a review. We don't try to auto-submit after sign-in:
    // a freshly signed-in user viewing someone else's public deck still
    // can't rate it (canRate stays false), and pretending otherwise would
    // be confusing. The natural next step for them is to import the deck.
    if (isGuest) {
      requireAuth(() => {}, {
        title: 'Sign in to save progress',
        reason:
          'Create an account to track your progress with spaced repetition. ' +
          'After signing in, you can import this deck into your own library.',
      });
      return;
    }
    if (!canRate) return;
    submit.mutate({ cardId: current.id, difficultyLevel: level });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // Skip controls. These intentionally don't fire submitReview, so a card
  // the user navigates past without rating keeps its previous
  // difficultyLevel. Pressing "next" on the last card advances past the end
  // of the queue, which triggers the session-complete screen.
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

  // Per-rating cache invalidation lives in submit's onSuccess above, so
  // there's nothing to do here once the session wraps up.

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.min(index, cards.length) / cards.length;
  }, [index, cards.length]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen
        options={{ title: data?.category?.name ?? (isAllCards ? 'All cards' : 'Play') }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        {cards.length === 0 ? (
          <EmptyQueue
            backLabel={backLabel}
            emptyTitle={isAllCards ? 'No cards to practice' : 'No cards in this deck'}
            onBack={() => router.push(backTarget as never)}
          />
        ) : done ? (
          <SessionSummary
            reviewed={canRate ? reviewed : cards.length}
            canRate={canRate}
            backLabel={backLabel}
            onBack={() => router.push(backTarget as never)}
            onAgain={() => {
              // Reuse the fetched card list — Play again should restart from
              // card 0 with the same set of cards. In shuffle mode we bump
              // shuffleEpoch so the order is re-randomized.
              setIndex(0);
              setReviewed(0);
              setFlipped(false);
              if (shuffle) setShuffleEpoch((n) => n + 1);
            }}
          />
        ) : (
          <>
            <ProgressBar value={progress} />
            <Text className="mt-2 text-center text-xs text-slate-500">
              {Math.min(index + 1, cards.length)} of {cards.length}
            </Text>

            <View className="mt-6 flex-row items-stretch gap-2">
              <NavButton direction="prev" onPress={handlePrev} disabled={!canGoPrev} />
              <FlipCard
                front={current?.front ?? ''}
                back={current?.back ?? ''}
                frontExamples={current?.frontExamples ?? []}
                backExamples={current?.backExamples ?? []}
                cardClass={current?.class ?? null}
                gender={(current as { gender?: string | null } | undefined)?.gender ?? null}
                pronunciation={
                  (current as { pronunciation?: string | null } | undefined)?.pronunciation ?? null
                }
                flipped={flipped}
                onPress={() => setFlipped((f) => !f)}
                cardId={current?.id}
                backLanguage={backLanguage}
              />
              <NavButton direction="next" onPress={handleNext} disabled={!canGoNext} />
            </View>

            {flipped && showRatingButtons ? (
              <>
                <RatingButtons onRate={handleRate} />
                {isGuest ? (
                  <Text className="mt-3 text-center text-xs text-slate-400">
                    Sign in to save your progress.
                  </Text>
                ) : null}
              </>
            ) : flipped ? (
              <View className="mt-6">
                <Text className="text-center text-sm text-slate-500">
                  Public deck practice is read-only. Use the arrow buttons to move between cards.
                </Text>
              </View>
            ) : (
              <View className="mt-6">
                <Button size="lg" onPress={() => setFlipped(true)}>
                  Flip
                </Button>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <View className="bg-primary h-full" style={{ width: `${Math.round(value * 100)}%` }} />
    </View>
  );
}

/**
 * Empty-state card for when the requested scope contains zero cards (deck
 * has no cards yet, or filters match nothing). There's no longer a
 * "caught up on your schedule" state — every card is always practiceable.
 */
function EmptyQueue({
  backLabel,
  emptyTitle,
  onBack,
}: {
  backLabel: string;
  emptyTitle: string;
  onBack: () => void;
}) {
  return (
    <Card className="items-center gap-3 p-10">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <Text className="text-2xl">✓</Text>
      </View>
      <Text className="text-lg font-semibold text-slate-900">{emptyTitle}</Text>
      <Text className="text-center text-sm text-slate-500">
        There&apos;s nothing here to practice yet. Add some cards to get started.
      </Text>
      <View className="mt-2 w-full gap-2">
        <Button variant="outline" onPress={onBack}>
          {backLabel}
        </Button>
      </View>
    </Card>
  );
}

function SessionSummary({
  reviewed,
  canRate,
  backLabel,
  onBack,
  onAgain,
}: {
  reviewed: number;
  canRate: boolean;
  backLabel: string;
  onBack: () => void;
  onAgain: () => void;
}) {
  return (
    <Card className="items-center gap-3 p-10">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <Text className="text-2xl">✓</Text>
      </View>
      <Text className="text-lg font-semibold text-slate-900">Session complete</Text>
      <Text className="text-center text-sm text-slate-500">
        {canRate ? 'You reviewed ' : 'You went through '}
        <Text className="font-semibold">{reviewed}</Text> {reviewed === 1 ? 'card' : 'cards'}.
      </Text>
      <View className="mt-2 w-full flex-row gap-2">
        <View className="flex-1">
          <Button variant="outline" onPress={onBack}>
            {backLabel}
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onAgain}>Play again</Button>
        </View>
      </View>
    </Card>
  );
}
