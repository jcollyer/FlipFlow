import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

import { type BackLanguageValue } from '@flipflow/types';

import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { LanguagePicker } from '../../../../src/components/LanguagePicker';
import { formatRelative } from '../../../../src/lib/format';
import { trpc } from '../../../../src/lib/trpc';

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
  const statsQuery = trpc.practice.stats.useQuery({ categoryId });

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      utils.practice.stats.invalidate({ categoryId });
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
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const cards = cardsQuery.data ?? [];
  const stats = statsQuery.data;

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
                className="h-10 w-10 rounded-md"
                style={{ backgroundColor: category?.color ?? '#94a3b8' }}
              />
              <Text className="flex-1 text-2xl font-bold text-slate-900" numberOfLines={1}>
                {category?.name ?? 'Loading…'}
              </Text>
            </View>

            <View className="flex-row gap-2">
              <Stat label="Total" value={stats?.total ?? cards.length} />
              <Stat label="Due now" value={stats?.due ?? 0} highlight={(stats?.due ?? 0) > 0} />
              <Stat label="Mastered" value={stats?.mastered ?? 0} />
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  variant="outline"
                  onPress={() => router.push(`/decks/${categoryId}/practice`)}
                >
                  {`Practice${stats?.due ? ` (${stats.due})` : ''}`}
                </Button>
              </View>
              <View className="flex-1">
                <Button onPress={() => router.push(`/decks/${categoryId}/new-card`)}>
                  + New card
                </Button>
              </View>
            </View>

            <DeckAudioLanguage
              categoryId={categoryId}
              backLanguage={(category?.backLanguage ?? null) as BackLanguageValue | null}
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card className="flex-row items-start gap-3 p-4">
            <View className="flex-1 gap-1">
              <Text className="font-medium text-slate-900" numberOfLines={2}>
                {item.front}
              </Text>
              <Text className="text-sm text-slate-500" numberOfLines={2}>
                {item.back}
              </Text>
              <View className="mt-1 flex-row gap-2">
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
                <Text className="text-sm font-medium text-primary">Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDeleteCard(item.id)}
                hitSlop={8}
                className="px-2 py-1"
              >
                <Text className="text-sm font-medium text-destructive">Delete</Text>
              </Pressable>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-8">
            <Text className="text-lg font-semibold text-slate-900">No cards yet</Text>
            <Text className="text-center text-sm text-slate-500">
              Add your first card to start practicing this deck.
            </Text>
            <View className="mt-2 w-full">
              <Button onPress={() => router.push(`/decks/${categoryId}/new-card`)}>
                Add a card
              </Button>
            </View>
          </Card>
        }
        ListFooterComponent={
          cards.length > 0 ? (
            <Pressable
              onPress={confirmDeleteDeck}
              className="mt-8 items-center py-3 active:opacity-70"
            >
              <Text className="text-sm font-medium text-destructive">Delete deck</Text>
            </Pressable>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={cardsQuery.isRefetching}
            onRefresh={() => {
              cardsQuery.refetch();
              statsQuery.refetch();
            }}
            tintColor="#3b82f6"
          />
        }
      />
    </View>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className="flex-1 p-3">
      <Text className="text-xs uppercase tracking-wide text-slate-500">{label}</Text>
      <Text
        className={`mt-1 text-2xl font-bold ${highlight ? 'text-primary' : 'text-slate-900'}`}
      >
        {value}
      </Text>
    </Card>
  );
}

/**
 * Inline editor for the deck's back-of-card audio language. Hidden if the
 * server can't reach Google Cloud TTS (no API key) so the user doesn't see
 * a setting that wouldn't do anything. Saves on every change — there's
 * nothing to "submit".
 */
function DeckAudioLanguage({
  categoryId,
  backLanguage,
}: {
  categoryId: string;
  backLanguage: BackLanguageValue | null;
}) {
  const utils = trpc.useUtils();

  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery();
  const ttsAvailable = !!ttsAvailability?.available;

  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.byId.invalidate({ id: categoryId });
      utils.categories.list.invalidate();
    },
    onError: (err) => Alert.alert('Could not update deck', err.message),
  });

  if (!ttsAvailable) return null;

  return (
    <Card className="gap-2 p-4">
      <Text className="text-sm font-medium text-slate-700">
        Audio language (back of card)
      </Text>
      <LanguagePicker
        value={backLanguage}
        disabled={update.isPending}
        onChange={(next) => {
          // No-op if unchanged (the picker fires onChange even when the
          // user re-selects the current value).
          if ((next ?? null) === (backLanguage ?? null)) return;
          update.mutate({ id: categoryId, backLanguage: next });
        }}
      />
      <Text className="text-xs text-slate-500">
        Pick a language to enable a speaker button on the back of cards during practice.
      </Text>
    </Card>
  );
}
