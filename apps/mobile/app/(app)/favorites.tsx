import { Stack, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Grid2x2, Heart, List, Play } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { type BackLanguageValue, genderLabel } from '@ensemble/types';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ClassBadge } from '../../src/components/ClassBadge';
import { PracticeFiltersModal } from '../../src/components/PracticeFiltersModal';
import { trpc } from '../../src/lib/trpc';
import {
  FlashcardPreviewModal,
  type PreviewCard,
} from '../../src/features/practice/FlashcardPreviewModal';

/**
 * Sort options for the favorites list. "custom" is the user's saved manual
 * order (CardProgress.favoriteSortOrder) and is the only mode where the
 * reorder handles are shown. The rest are non-destructive client-side view
 * transforms — they never write to the server, so switching back to "custom"
 * restores the saved arrangement untouched. Mirrors the web FavoritesDetail.
 */
type SortMode = 'custom' | 'front' | 'rating' | 'favorited' | 'deck';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'front', label: 'Front A–Z' },
  { value: 'rating', label: 'Rating' },
  { value: 'favorited', label: 'Date' },
  { value: 'deck', label: 'Deck' },
];

// Lower rank sorts first: hardest cards surface at the top, unrated last.
const RATING_RANK: Record<string, number> = { challenging: 0, good: 1, easy: 2 };
const RATING_RANK_UNRATED = 3;

/**
 * Favorites screen — reads like a deck detail page, but the cards come from
 * the per-user favorite flag (across every deck) rather than one category.
 * In Custom order, each card has up/down handles that reorder it (saved to
 * favoriteSortOrder); the field sorts re-arrange the view non-destructively.
 * Newly favorited cards land at the bottom.
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const favoritesQuery = trpc.flashcards.listFavorites.useQuery();

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [cardViewMode, setCardViewMode] = useState<'grid' | 'list'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('custom');
  const [playOpen, setPlayOpen] = useState(false);

  type FavoriteCard = NonNullable<typeof favoritesQuery.data>[number];

  // Local order state seeded from the server query, updated optimistically on
  // reorder so rows don't snap back before the mutation settles.
  const [orderedCards, setOrderedCards] = useState<FavoriteCard[]>([]);
  useEffect(() => {
    setOrderedCards(favoritesQuery.data ?? []);
  }, [favoritesQuery.data]);

  const reorder = trpc.flashcards.reorderFavorites.useMutation({
    onError: (err) => {
      setOrderedCards(favoritesQuery.data ?? []);
      Alert.alert('Could not save order', err.message);
    },
  });

  // Move a card one slot up or down in the custom order, persisting the new
  // arrangement. Only meaningful in "custom" sort mode.
  function moveCard(cardId: string, direction: 'up' | 'down') {
    setOrderedCards((prev) => {
      const index = prev.findIndex((c) => c.id === cardId);
      if (index === -1) return prev;
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      reorder.mutate({ orderedIds: next.map((c) => c.id) });
      return next;
    });
  }

  // Un-favorite from a row. Optimistically drops the card from both local
  // order and the query cache so it disappears immediately.
  const setFavorite = trpc.practice.setFavorite.useMutation({
    onMutate: async ({ cardId }) => {
      await utils.flashcards.listFavorites.cancel();
      const previous = utils.flashcards.listFavorites.getData();
      if (previous) {
        utils.flashcards.listFavorites.setData(
          undefined,
          previous.filter((c) => c.id !== cardId),
        );
      }
      setOrderedCards((prev) => prev.filter((c) => c.id !== cardId));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) utils.flashcards.listFavorites.setData(undefined, ctx.previous);
      Alert.alert('Could not update favorite', err.message);
    },
    onSettled: () => {
      utils.flashcards.listFavorites.invalidate();
    },
  });

  // The list the user actually sees. "custom" is the manual order; the rest
  // are stable client-side sorts layered on top (ties keep custom position).
  const displayCards = useMemo(() => {
    if (sortMode === 'custom') return orderedCards;

    const withIndex = orderedCards.map((card, index) => ({ card, index }));
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

    withIndex.sort((a, b) => {
      let cmp = 0;
      if (sortMode === 'front') {
        cmp = collator.compare(a.card.front, b.card.front);
      } else if (sortMode === 'rating') {
        const rank = (c: FavoriteCard) =>
          RATING_RANK[(c as { difficultyLevel?: string | null }).difficultyLevel ?? ''] ??
          RATING_RANK_UNRATED;
        cmp = rank(a.card) - rank(b.card);
      } else if (sortMode === 'favorited') {
        const ts = (c: FavoriteCard) => {
          const v = (c as { favoritedAt?: string | Date | null }).favoritedAt;
          return v ? new Date(v).getTime() : 0;
        };
        cmp = ts(a.card) - ts(b.card);
      } else if (sortMode === 'deck') {
        cmp = collator.compare(
          (a.card as { deckName?: string | null }).deckName ?? '',
          (b.card as { deckName?: string | null }).deckName ?? '',
        );
      }
      return cmp !== 0 ? cmp : a.index - b.index;
    });

    return withIndex.map((w) => w.card);
  }, [orderedCards, sortMode]);

  const previewCards: PreviewCard[] = displayCards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    frontExamples: card.frontExamples ?? [],
    backExamples: card.backExamples ?? [],
    class: card.class ?? null,
    gender: (card as { gender?: string | null }).gender ?? null,
    pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
    // Favorites span decks, so each card carries its own back language.
    backLanguage: ((card as { backLanguage?: string | null }).backLanguage ??
      null) as BackLanguageValue | null,
    advancedDifficultyLevel:
      (card as { advancedDifficultyLevel?: string | null }).advancedDifficultyLevel ?? null,
    difficultyLevel:
      ((card as { difficultyLevel?: string | null }).difficultyLevel as
        | import('@ensemble/types').DifficultyLevel
        | null) ?? null,
    favorite: true,
  }));

  if (favoritesQuery.isLoading && !favoritesQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Stack.Screen options={{ title: 'Favorites' }} />
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  const canReorder = sortMode === 'custom';

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: 'Favorites' }} />

      <FlatList
        data={displayCards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="mb-4 gap-4">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-100">
                <Heart size={20} color="#e11d48" fill="#e11d48" />
              </View>
              <View className="flex-1">
                <Text className="text-2xl font-bold text-slate-900">Favorites</Text>
                <Text className="mt-0.5 text-sm text-slate-500">From across all your decks.</Text>
              </View>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button onPress={() => setPlayOpen(true)} disabled={displayCards.length === 0}>
                  <View className="flex-row items-center justify-center gap-2">
                    <Play size={15} color="#ffffff" fill="#ffffff" />
                    <Text className="font-semibold text-white">
                      {`Play${displayCards.length > 0 ? ` (${displayCards.length})` : ''}`}
                    </Text>
                  </View>
                </Button>
              </View>
            </View>

            {displayCards.length > 0 ? (
              <>
                {/* Sort pills */}
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {SORT_OPTIONS.map((opt) => {
                    const selected = sortMode === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setSortMode(opt.value)}
                        className={`rounded-full px-3 py-1.5 ${selected ? 'bg-blue-500' : 'bg-slate-100'}`}
                      >
                        <Text
                          className={`text-xs font-medium ${selected ? 'text-white' : 'text-slate-600'}`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Grid / List toggle */}
                <View style={{ alignItems: 'flex-end' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      backgroundColor: '#f1f5f9',
                      borderRadius: 8,
                      padding: 3,
                    }}
                  >
                    <Pressable
                      onPress={() => setCardViewMode('grid')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 6,
                        backgroundColor: cardViewMode === 'grid' ? '#ffffff' : 'transparent',
                      }}
                    >
                      <Grid2x2 size={15} color={cardViewMode === 'grid' ? '#5584bb' : '#94a3b8'} />
                    </Pressable>
                    <Pressable
                      onPress={() => setCardViewMode('list')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 6,
                        backgroundColor: cardViewMode === 'list' ? '#ffffff' : 'transparent',
                      }}
                    >
                      <List size={15} color={cardViewMode === 'list' ? '#5584bb' : '#94a3b8'} />
                    </Pressable>
                  </View>
                </View>

                {!canReorder ? (
                  <Text className="text-xs text-slate-400">
                    Showing a sorted view. Switch to Custom to reorder and save your own order.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        }
        renderItem={({ item, index: itemIndex }) => {
          const gender = (item as { gender?: string | null }).gender ?? null;
          const deckName = (item as { deckName?: string | null }).deckName ?? null;
          const isFirst = itemIndex === 0;
          const isLast = itemIndex === displayCards.length - 1;

          return (
            <Pressable onPress={() => setPreviewIndex(itemIndex)} className="active:opacity-80">
              <Card
                className={`gap-3 p-4 ${cardViewMode === 'list' ? 'flex-row items-center' : 'flex-row items-start'}`}
              >
                {/* Reorder handles — only in Custom order */}
                {canReorder ? (
                  <View className="shrink-0 items-center justify-center gap-1">
                    <Pressable
                      onPress={() => moveCard(item.id, 'up')}
                      disabled={isFirst}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Move up"
                      className="px-1"
                    >
                      <ChevronUp size={18} color={isFirst ? '#cbd5e1' : '#64748b'} />
                    </Pressable>
                    <Pressable
                      onPress={() => moveCard(item.id, 'down')}
                      disabled={isLast}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Move down"
                      className="px-1"
                    >
                      <ChevronDown size={18} color={isLast ? '#cbd5e1' : '#64748b'} />
                    </Pressable>
                  </View>
                ) : null}

                <View className="flex-1 gap-1">
                  {cardViewMode === 'list' ? (
                    <View className="flex-row flex-wrap items-center gap-1">
                      <Text className="font-semibold text-slate-900" numberOfLines={1}>
                        {item.front}
                      </Text>
                      <Text className="text-slate-400"> – </Text>
                      <Text className="flex-shrink text-sm text-slate-500" numberOfLines={1}>
                        {item.back}
                      </Text>
                      {item.class ? (
                        <>
                          <Text className="text-slate-300"> · </Text>
                          <ClassBadge value={item.class} />
                        </>
                      ) : null}
                      {gender ? (
                        <>
                          <Text className="text-slate-300"> · </Text>
                          <Text className="text-xs text-slate-400">{genderLabel(gender)}</Text>
                        </>
                      ) : null}
                      {sortMode === 'deck' && deckName ? (
                        <>
                          <Text className="text-slate-300"> · </Text>
                          <Text className="text-xs text-slate-400" numberOfLines={1}>
                            {deckName}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  ) : (
                    <>
                      <Text className="font-semibold text-slate-900" numberOfLines={2}>
                        {item.front}
                      </Text>
                      <Text className="text-sm text-slate-500" numberOfLines={2}>
                        {item.back}
                      </Text>
                      <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                        {item.class ? <ClassBadge value={item.class} /> : null}
                        {gender ? (
                          <Text className="text-xs text-slate-400">{genderLabel(gender)}</Text>
                        ) : null}
                        {sortMode === 'deck' && deckName ? (
                          <Text className="text-xs text-slate-400" numberOfLines={1}>
                            {deckName}
                          </Text>
                        ) : null}
                      </View>
                    </>
                  )}
                </View>

                <Pressable
                  onPress={() => setFavorite.mutate({ cardId: item.id, favorite: false })}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel="Unfavorite"
                  className="px-2 py-1"
                >
                  <Heart size={18} color="#e11d48" fill="#e11d48" />
                </Pressable>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-8">
            <Text className="text-lg font-semibold text-slate-900">No favorites yet</Text>
            <Text className="text-center text-sm text-slate-500">
              Tap the heart on any card to add it here for quick access and focused practice.
            </Text>
            <View className="mt-2 w-full">
              <Button variant="outline" onPress={() => router.replace('/')}>
                Browse your decks
              </Button>
            </View>
          </Card>
        }
      />

      <FlashcardPreviewModal
        cards={previewCards}
        initialIndex={previewIndex ?? 0}
        visible={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        canRate
        onRated={() => {
          utils.flashcards.listFavorites.invalidate();
          utils.practice.stats.invalidate();
        }}
        onFavoriteToggled={(cardId, favorite) => {
          // Unfavoriting from the preview should drop the card here too.
          if (!favorite) {
            setOrderedCards((prev) => prev.filter((c) => c.id !== cardId));
            const previous = utils.flashcards.listFavorites.getData();
            if (previous) {
              utils.flashcards.listFavorites.setData(
                undefined,
                previous.filter((c) => c.id !== cardId),
              );
            }
          }
        }}
      />

      <PracticeFiltersModal visible={playOpen} onClose={() => setPlayOpen(false)} lockFavorites />
    </View>
  );
}
