import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { WORD_CLASS_OPTIONS, genderLabel } from '@ensemble/types';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ClassBadge } from '../../src/components/ClassBadge';
import { trpc } from '../../src/lib/trpc';
import {
  FlashcardPreviewModal,
  type PreviewCard,
} from '../../src/features/practice/FlashcardPreviewModal';
import { PlayModeToggle, type PlayMode } from '../../src/features/practice/PlayModeToggle';

/**
 * Aggregate "All decks" screen. Lists every card the user owns — across all
 * decks plus uncategorized — newest first. Mirrors the per-deck DeckDetail
 * screen but skips the deck-only bits (audio language, deck delete,
 * practice queue) since those don't apply to the aggregate.
 *
 * Each card row shows its source deck inline so the user can tell at a
 * glance which deck a card belongs to without leaving the list.
 */
export default function AllCardsScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // ── Filter state ──────────────────────────────────────────────────────────
  // Empty array = "all" (no filter applied). Individual items toggled below.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>('in_order');

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleClass(value: string) {
    setSelectedClasses((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function toggleRating(value: string) {
    setSelectedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  const cardsQuery = trpc.flashcards.listAll.useQuery();
  const categoriesQuery = trpc.categories.list.useQuery();

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listAll.invalidate();
      utils.categories.list.invalidate();
    },
    onError: (err) => Alert.alert('Could not delete card', err.message),
  });

  // Build a deck lookup so each row can show its source deck without an
  // N+1 query. Categories.list is already in the cache from the home view.
  const decksById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string | null; backLanguage: string | null }
    >();
    for (const c of categoriesQuery.data ?? []) {
      map.set(c.id, { name: c.name, color: c.color, backLanguage: c.backLanguage ?? null });
    }
    return map;
  }, [categoriesQuery.data]);

  // Apply filters to the displayed card list.
  const allCards = cardsQuery.data ?? [];
  const filteredCards = useMemo(() => {
    let result = allCards;
    if (selectedCategoryIds.length > 0) {
      result = result.filter((c) => c.categoryId && selectedCategoryIds.includes(c.categoryId));
    }
    if (selectedClasses.length > 0) {
      result = result.filter((c) => c.class && selectedClasses.includes(c.class));
    }
    if (selectedRatings.length > 0) {
      result = result.filter((c) => {
        const level = (c as { difficultyLevel?: string | null }).difficultyLevel ?? null;
        if (selectedRatings.includes('no_rating') && level === null) return true;
        return level !== null && selectedRatings.includes(level);
      });
    }
    return result;
  }, [allCards, selectedCategoryIds, selectedClasses, selectedRatings]);

  // Build the ordered card array for the preview modal.
  const previewCards: PreviewCard[] = useMemo(
    () =>
      filteredCards.map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        frontExamples: card.frontExamples ?? [],
        backExamples: card.backExamples ?? [],
        class: card.class ?? null,
        gender: (card as { gender?: string | null }).gender ?? null,
        pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
        backLanguage: (card.categoryId
          ? (decksById.get(card.categoryId)?.backLanguage ?? null)
          : null) as import('@ensemble/types').BackLanguageValue | null,
      })),
    [filteredCards, decksById],
  );

  function confirmDeleteCard(cardId: string) {
    Alert.alert('Delete card?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate({ id: cardId }),
      },
    ]);
  }

  function navigateToPractice() {
    const params = new URLSearchParams();
    if (selectedCategoryIds.length > 0) {
      params.set('categoryIds', selectedCategoryIds.join(','));
    }
    if (selectedClasses.length > 0) {
      params.set('classes', selectedClasses.join(','));
    }
    if (selectedRatings.length > 0) {
      params.set('difficultyLevels', selectedRatings.join(','));
    }
    if (playMode === 'shuffle') {
      params.set('shuffle', '1');
    }
    const qs = params.toString();
    router.push((qs ? `/all-cards-practice?${qs}` : '/all-cards-practice') as never);
  }

  if (cardsQuery.isLoading && !cardsQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  const hasActiveFilters =
    selectedCategoryIds.length > 0 || selectedClasses.length > 0 || selectedRatings.length > 0;
  // Practice button count = filtered cards when filters active, otherwise the
  // total card count.
  const practiceCountLabel = hasActiveFilters
    ? filteredCards.length > 0
      ? ` (${filteredCards.length})`
      : ''
    : allCards.length > 0
      ? ` (${allCards.length})`
      : '';

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        data={filteredCards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="mb-4 gap-4">
            <View>
              <Text className="text-2xl font-bold text-slate-900">All decks</Text>
              <Text className="text-sm text-slate-500">
                Every card you've created, including uncategorized ones.
              </Text>
            </View>

            <View className="flex-row gap-2">
              <Stat label="Total" value={allCards.length} />
            </View>

            {/* ── Practice filter panel ──────────────────────────────────── */}
            <Card className="gap-4 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-slate-700">Play filters</Text>
                {hasActiveFilters && (
                  <Pressable
                    onPress={() => {
                      setSelectedCategoryIds([]);
                      setSelectedClasses([]);
                      setSelectedRatings([]);
                    }}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-medium text-blue-500">Reset</Text>
                  </Pressable>
                )}
              </View>

              {/* Categories */}
              {(categoriesQuery.data?.length ?? 0) > 0 && (
                <View className="gap-1.5">
                  <Text className="text-xs text-slate-500">Categories</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-1.5">
                      {categoriesQuery.data!.map((cat) => {
                        const selected = selectedCategoryIds.includes(cat.id);
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => toggleCategory(cat.id)}
                            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                              selected ? 'bg-blue-500' : 'bg-slate-100'
                            }`}
                          >
                            <View
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.color ?? '#94a3b8' }}
                            />
                            <Text
                              className={`text-xs font-medium ${
                                selected ? 'text-white' : 'text-slate-600'
                              }`}
                            >
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Word classes */}
              <View className="gap-1.5">
                <Text className="text-xs text-slate-500">Word class</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {WORD_CLASS_OPTIONS.map((cls) => {
                    const selected = selectedClasses.includes(cls.value);
                    return (
                      <Pressable
                        key={cls.value}
                        onPress={() => toggleClass(cls.value)}
                        className={`rounded-full px-3 py-1.5 ${
                          selected ? 'bg-blue-500' : 'bg-slate-100'
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            selected ? 'text-white' : 'text-slate-600'
                          }`}
                        >
                          {cls.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Rating */}
              <View className="gap-1.5">
                <Text className="text-xs text-slate-500">Rating</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {(
                    [
                      { value: 'easy', label: 'Easy' },
                      { value: 'good', label: 'Good' },
                      { value: 'challenging', label: 'Challenging' },
                      { value: 'no_rating', label: 'No rating' },
                    ] as const
                  ).map((opt) => {
                    const selected = selectedRatings.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggleRating(opt.value)}
                        className={`rounded-full px-3 py-1.5 ${
                          selected ? 'bg-blue-500' : 'bg-slate-100'
                        }`}
                      >
                        <Text
                          className={`text-xs font-medium ${
                            selected ? 'text-white' : 'text-slate-600'
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Play order
                </Text>
                <PlayModeToggle value={playMode} onChange={setPlayMode} />
              </View>

              <Button onPress={navigateToPractice}>{`Play${practiceCountLabel}`}</Button>
            </Card>
          </View>
        }
        renderItem={({ item, index: itemIndex }) => {
          const deck = item.categoryId ? decksById.get(item.categoryId) : null;
          return (
            <Pressable onPress={() => setPreviewIndex(itemIndex)} className="active:opacity-80">
              <Card className="flex-row items-start gap-3 p-4">
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-slate-900" numberOfLines={2}>
                    {item.front}
                  </Text>
                  <Text className="text-sm text-slate-500" numberOfLines={2}>
                    {item.back}
                  </Text>
                  {item.frontExamples?.length > 0 || item.backExamples?.length > 0 ? (
                    <View className="mt-1.5 gap-1 border-t border-slate-100 pt-1.5">
                      {Array.from({
                        length: Math.max(
                          item.frontExamples?.length ?? 0,
                          item.backExamples?.length ?? 0,
                        ),
                      }).map((_, i) => (
                        <View key={i} className="flex-row gap-2">
                          <Text
                            className="flex-1 text-xs font-semibold text-slate-800"
                            numberOfLines={2}
                          >
                            {item.frontExamples?.[i] ?? ''}
                          </Text>
                          <Text className="flex-1 text-xs text-slate-400" numberOfLines={2}>
                            {item.backExamples?.[i] ?? ''}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                    {item.class ? <ClassBadge value={item.class} /> : null}
                    {(item as { gender?: string | null }).gender ? (
                      <Text className="text-xs text-slate-400">
                        {genderLabel((item as { gender?: string | null }).gender)}
                      </Text>
                    ) : null}
                    {deck ? (
                      <View className="flex-row items-center gap-1.5">
                        <View
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                        />
                        <Text className="text-xs text-slate-500">{deck.name}</Text>
                      </View>
                    ) : (
                      <Text className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                        No deck
                      </Text>
                    )}
                    {item.difficultyLevel ? (
                      <>
                        <Text className="text-xs text-slate-400">•</Text>
                        <Text className="text-xs capitalize text-slate-400">
                          {item.difficultyLevel}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                {/* Inner Pressables win over the outer tap — edit/delete still work */}
                <View className="flex-row">
                  <Pressable
                    onPress={() => router.push(`/cards/${item.id}/edit`)}
                    hitSlop={8}
                    className="px-2 py-1"
                  >
                    <Text className="text-primary text-sm font-medium">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteCard(item.id)}
                    hitSlop={8}
                    className="px-2 py-1"
                  >
                    <Text className="text-destructive text-sm font-medium">Delete</Text>
                  </Pressable>
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          hasActiveFilters ? (
            <Card className="items-center gap-3 border-dashed p-10">
              <Text className="text-lg font-semibold text-slate-900">No matching cards</Text>
              <Text className="text-center text-sm text-slate-500">
                No cards match the current filters. Try adjusting your selection above.
              </Text>
            </Card>
          ) : (
            <Card className="items-center gap-3 border-dashed p-10">
              <Text className="text-lg font-semibold text-slate-900">No cards yet</Text>
              <Text className="text-center text-sm text-slate-500">
                Add your first card here, or create one inside a specific deck.
              </Text>
              <View className="mt-2 w-full">
                <Button onPress={() => router.push('/new-card')}>Add a card</Button>
              </View>
            </Card>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={cardsQuery.isRefetching}
            onRefresh={() => {
              cardsQuery.refetch();
              categoriesQuery.refetch();
            }}
            tintColor="#5584bb"
          />
        }
      />

      {/* Flashcard preview modal — opens when a card row is tapped */}
      <FlashcardPreviewModal
        cards={previewCards}
        initialIndex={previewIndex ?? 0}
        visible={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        canRate
        onRated={() => {
          utils.flashcards.listAll.invalidate();
        }}
      />
    </View>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className="flex-1 p-3">
      <Text className="text-xs uppercase tracking-wide text-slate-500">{label}</Text>
      <Text className={`mt-1 text-2xl font-bold ${highlight ? 'text-primary' : 'text-slate-900'}`}>
        {value}
      </Text>
    </Card>
  );
}
