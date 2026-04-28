import { Link, useRouter } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';
import { trpc } from '../../src/lib/trpc';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';

/**
 * Decks list — the home screen once signed in.
 *
 * Mirrors the web CategoriesDashboard: a grid of decks with card count
 * and due count per deck, plus an FAB-style "New deck" entry in the
 * header. Pull-to-refresh re-runs the list query.
 */
export default function DecksScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading, refetch, isRefetching } = trpc.categories.list.useQuery();

  const onRefresh = useCallback(() => {
    utils.categories.list.invalidate();
    refetch();
  }, [utils, refetch]);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/signin');
        },
      },
    ]);
  }

  if (isLoading && !data) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 180 }}
        ListHeaderComponent={
          <View className="mb-4 gap-4">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-2xl font-bold text-slate-900">Your decks</Text>
                <Text className="text-sm text-slate-500">Practice with spaced repetition.</Text>
              </View>
              <Pressable onPress={confirmSignOut} hitSlop={8}>
                <Text className="text-sm font-medium text-slate-500">Sign out</Text>
              </Pressable>
            </View>
            {/* Aggregate "All decks" entry. Visually distinct from real decks
                (dashed border, library icon, bold label) so it reads as a
                meta-entry rather than a deck named "All decks". */}
            <AllDecksEntry />
          </View>
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <Link href={`/decks/${item.id}`} asChild>
            <Pressable className="active:opacity-70">
              <Card className="p-4">
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-10 w-10 rounded-md"
                    style={{ backgroundColor: item.color ?? '#94a3b8' }}
                  />
                  <Text className="flex-1 text-lg font-semibold text-slate-900" numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <View className="mt-3 flex-row gap-4">
                  <Text className="text-sm text-slate-500">
                    {item.cardCount} {item.cardCount === 1 ? 'card' : 'cards'}
                  </Text>
                  <Text className="text-sm text-slate-500">•</Text>
                  <Text
                    className={`text-sm ${
                      item.dueCount > 0 ? 'text-primary font-medium' : 'text-slate-500'
                    }`}
                  >
                    {item.dueCount} due
                  </Text>
                </View>
              </Card>
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-10">
            <Text className="text-lg font-semibold text-slate-900">No decks yet</Text>
            <Text className="text-center text-sm text-slate-500">
              Create your first deck to start adding flashcards.
            </Text>
            <View className="mt-2 w-full">
              <Button onPress={() => router.push('/new-deck')}>Create your first deck</Button>
            </View>
          </Card>
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      />

      {/* Stacked floating action buttons. + New card sits above + New deck
          so the higher-frequency action is closer to the thumb. */}
      <View className="absolute bottom-6 left-4 right-4 gap-2">
        <Button size="lg" variant="outline" onPress={() => router.push('/new-card')}>
          + New card
        </Button>
        <Button size="lg" onPress={() => router.push('/new-deck')}>
          + New deck
        </Button>
      </View>
    </View>
  );
}

/**
 * Pseudo-deck card linking to the all-cards aggregate view. Renders inside
 * the FlatList header so it always sits at the very top of the list,
 * regardless of how many real decks exist.
 */
function AllDecksEntry() {
  const { data: stats } = trpc.practice.stats.useQuery({});
  const total = stats?.total ?? 0;
  const due = stats?.due ?? 0;

  return (
    <Link href="/all-cards" asChild>
      <Pressable className="active:opacity-70">
        <Card className="border-2 border-dashed border-slate-300 p-4">
          <View className="flex-row items-center gap-3">
            <View className="bg-primary/10 h-10 w-10 items-center justify-center rounded-md">
              <Text className="text-primary text-lg font-bold">≡</Text>
            </View>
            <Text className="flex-1 text-lg font-bold text-slate-900" numberOfLines={1}>
              All decks
            </Text>
          </View>
          <View className="mt-3 flex-row gap-4">
            <Text className="text-sm text-slate-500">
              {total} {total === 1 ? 'card' : 'cards'}
            </Text>
            <Text className="text-sm text-slate-500">•</Text>
            <Text className={`text-sm ${due > 0 ? 'text-primary font-medium' : 'text-slate-500'}`}>
              {due} due
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
