import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Grid2x2, List, Play } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

import { type BackLanguageValue, genderLabel } from '@ensemble/types';

import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ClassBadge } from '../../../../src/components/ClassBadge';
import { Stat } from '../../../../src/components/Stat';
import { PracticeFiltersModal } from '../../../../src/components/PracticeFiltersModal';
import { trpc } from '../../../../src/lib/trpc';
import {
  FlashcardPreviewModal,
  type PreviewCard,
} from '../../../../src/features/practice/FlashcardPreviewModal';

/**
 * Deck detail. Shows the deck's cards, stats, and the entry points
 * for practice / add card / edit card / delete deck. Mirrors the web
 * CategoryDetail feature.
 */
export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = id as string;
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: category } = trpc.categories.byId.useQuery({ id: categoryId });
  const cardsQuery = trpc.flashcards.listByCategory.useQuery({ categoryId });
  const isOwner = category?.isOwner ?? false;
  const statsQuery = trpc.practice.stats.useQuery(
    { categoryId },
    { enabled: category?.isOwner === true },
  );

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [practiceFiltersOpen, setPracticeFiltersOpen] = useState(false);
  const [cardViewMode, setCardViewMode] = useState<'grid' | 'list'>('grid');

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      utils.categories.list.invalidate();
    },
    onError: (err) => Alert.alert('Could not delete card', err.message),
  });

  const deleteDeck = trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      router.replace('/');
    },
    onError: (err) => Alert.alert('Could not delete deck', err.message),
  });

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

  function confirmDeleteDeck() {
    Alert.alert(
      `Delete "${category?.name ?? 'this deck'}"?`,
      'All cards in this deck will be deleted too. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDeck.mutate({ id: categoryId }),
        },
      ],
    );
  }

  if (cardsQuery.isLoading && !cardsQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  const cards = cardsQuery.data ?? [];
  const stats = statsQuery.data;

  // Build the card array for the preview modal. All cards in this deck share
  // the same backLanguage from the deck-level category.
  const previewCards: PreviewCard[] = cards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    frontExamples: card.frontExamples ?? [],
    backExamples: card.backExamples ?? [],
    class: card.class ?? null,
    gender: (card as { gender?: string | null }).gender ?? null,
    pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
    backLanguage: (category?.backLanguage ?? null) as BackLanguageValue | null,
  }));

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: category?.name ?? 'Deck' }} />

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="mb-4 gap-4">
            <View className="flex-row items-center gap-3">
              <View
                className="h-10 w-10 shrink-0 rounded-md"
                style={{ backgroundColor: category?.color ?? '#94a3b8' }}
              />
              <View className="flex-1">
                <Text className="text-2xl font-bold text-slate-900" numberOfLines={1}>
                  {category?.name ?? 'Loading…'}
                </Text>
                {(category as { description?: string | null } | undefined)?.description ? (
                  <Text className="mt-0.5 text-sm text-slate-500">
                    {(category as { description?: string | null }).description}
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="flex-row gap-2">
              {isOwner ? (
                <>
                  <Stat label="Total" value={stats?.total ?? cards.length} tone="slate" />
                  <Stat
                    label="Challenging"
                    value={stats?.difficultyBreakdown?.challenging ?? 0}
                    tone="amber"
                  />
                  <Stat label="Good" value={stats?.difficultyBreakdown?.good ?? 0} tone="blue" />
                  <Stat label="Easy" value={stats?.difficultyBreakdown?.easy ?? 0} tone="green" />
                </>
              ) : null}
            </View>

            <View className="flex-row gap-2">
              {isOwner ? (
                <View className="flex-1">
                  <Button
                    variant="outline"
                    onPress={() => router.push(`/new-card?categoryId=${categoryId}`)}
                  >
                    + New card
                  </Button>
                </View>
              ) : null}
              <View className="flex-1">
                <Button onPress={() => setPracticeFiltersOpen(true)}>
                  <View className="flex-row items-center justify-center gap-2">
                    <Play size={15} color="#ffffff" fill="#ffffff" />
                    <Text className="font-semibold text-white">
                      {`Play${isOwner && cards.length > 0 ? ` (${cards.length})` : ''}`}
                    </Text>
                  </View>
                </Button>
              </View>
            </View>

            {/* Grid / List view toggle — only shown when there are cards */}
            {cards.length > 0 ? (
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
                      shadowColor: cardViewMode === 'grid' ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: cardViewMode === 'grid' ? 0.1 : 0,
                      shadowRadius: 2,
                      elevation: cardViewMode === 'grid' ? 2 : 0,
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
                      shadowColor: cardViewMode === 'list' ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: cardViewMode === 'list' ? 0.1 : 0,
                      shadowRadius: 2,
                      elevation: cardViewMode === 'list' ? 2 : 0,
                    }}
                  >
                    <List size={15} color={cardViewMode === 'list' ? '#5584bb' : '#94a3b8'} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index: itemIndex }) => (
          <Pressable onPress={() => setPreviewIndex(itemIndex)} className="active:opacity-80">
            <Card
              className={`gap-3 p-4 ${cardViewMode === 'list' ? 'flex-row items-center' : 'flex-row items-start'}`}
            >
              <View className="flex-1 gap-1">
                {cardViewMode === 'list' ? (
                  /* ── List mode: condensed single-line row ── */
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
                    {(item as { gender?: string | null }).gender ? (
                      <>
                        <Text className="text-slate-300"> · </Text>
                        <Text className="text-xs text-slate-400">
                          {genderLabel((item as { gender?: string | null }).gender)}
                        </Text>
                      </>
                    ) : null}
                    {isOwner && item.difficultyLevel ? (
                      <>
                        <Text className="text-slate-300"> · </Text>
                        <Text className="text-xs capitalize text-slate-400">
                          {item.difficultyLevel}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : (
                  /* ── Grid mode: full card body ── */
                  <>
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
                      {isOwner && item.difficultyLevel ? (
                        <Text className="text-xs capitalize text-slate-400">
                          {item.difficultyLevel}
                        </Text>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
              {/* Inner Pressables win over the outer tap — edit/delete still work */}
              {isOwner ? (
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
              ) : null}
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-8">
            <Text className="text-lg font-semibold text-slate-900">No cards yet</Text>
            <Text className="text-center text-sm text-slate-500">
              {isOwner
                ? 'Add your first card to start practicing this deck.'
                : 'This public deck does not have any cards yet.'}
            </Text>
            {isOwner ? (
              <View className="mt-2 w-full">
                <Button onPress={() => router.push(`/decks/${categoryId}/new-card`)}>
                  Add a card
                </Button>
              </View>
            ) : null}
          </Card>
        }
        ListFooterComponent={
          isOwner ? (
            <View className="mt-8 flex-row items-center justify-center gap-6 py-3">
              <Pressable onPress={confirmDeleteDeck} hitSlop={8} className="active:opacity-70">
                <Text className="text-destructive text-sm font-medium">Delete deck</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/decks/${categoryId}/edit`)}
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text className="text-primary text-sm font-medium">Edit deck</Text>
              </Pressable>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={cardsQuery.isRefetching}
            onRefresh={() => {
              cardsQuery.refetch();
              if (isOwner) statsQuery.refetch();
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
        canRate={isOwner}
        onRated={() => {
          utils.flashcards.listByCategory.invalidate({ categoryId });
          // No-arg invalidate so the dashboard's `practice.stats({})`
          // also refreshes — not just this view's `{ categoryId }` query.
          utils.practice.stats.invalidate();
        }}
      />

      {/* Practice filters modal — opened from the Play button */}
      <PracticeFiltersModal
        visible={practiceFiltersOpen}
        onClose={() => setPracticeFiltersOpen(false)}
        categoryId={categoryId}
      />
    </View>
  );
}
