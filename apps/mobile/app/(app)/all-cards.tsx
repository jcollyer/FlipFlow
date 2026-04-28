import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ClassBadge } from '../../src/components/ClassBadge';
import { formatRelative } from '../../src/lib/format';
import { trpc } from '../../src/lib/trpc';

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

  const cardsQuery = trpc.flashcards.listAll.useQuery();
  const statsQuery = trpc.practice.stats.useQuery({});
  const categoriesQuery = trpc.categories.list.useQuery();

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listAll.invalidate();
      utils.practice.stats.invalidate({});
      utils.categories.list.invalidate();
    },
    onError: (err) => Alert.alert('Could not delete card', err.message),
  });

  // Build a deck lookup so each row can show its source deck without an
  // N+1 query. Categories.list is already in the cache from the home view.
  const decksById = useMemo(() => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const c of categoriesQuery.data ?? []) {
      map.set(c.id, { name: c.name, color: c.color });
    }
    return map;
  }, [categoriesQuery.data]);

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

  if (cardsQuery.isLoading && !cardsQuery.data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const cards = cardsQuery.data ?? [];
  const stats = statsQuery.data;

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        data={cards}
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
              <Stat label="Total" value={stats?.total ?? cards.length} />
              <Stat label="Due now" value={stats?.due ?? 0} highlight={(stats?.due ?? 0) > 0} />
              <Stat label="Mastered" value={stats?.mastered ?? 0} />
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const deck = item.categoryId ? decksById.get(item.categoryId) : null;
          return (
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
                  <Text className="text-xs text-slate-400">•</Text>
                  <Text className="text-xs text-slate-400">
                    Next: {formatRelative(item.nextReview)}
                  </Text>
                  <Text className="text-xs text-slate-400">•</Text>
                  <Text className="text-xs text-slate-400">{item.repetitions} reps</Text>
                </View>
              </View>
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
          );
        }}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-10">
            <Text className="text-lg font-semibold text-slate-900">No cards yet</Text>
            <Text className="text-center text-sm text-slate-500">
              Add your first card here, or create one inside a specific deck.
            </Text>
            <View className="mt-2 w-full">
              <Button onPress={() => router.push('/new-card')}>Add a card</Button>
            </View>
          </Card>
        }
        refreshControl={
          <RefreshControl
            refreshing={cardsQuery.isRefetching}
            onRefresh={() => {
              cardsQuery.refetch();
              statsQuery.refetch();
              categoriesQuery.refetch();
            }}
            tintColor="#3b82f6"
          />
        }
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
