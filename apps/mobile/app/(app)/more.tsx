import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { trpc } from '@/lib/trpc';

export default function MoreDecksScreen() {
  const { data: users, isLoading } = trpc.categories.publicLibrary.useQuery();
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  if (isLoading && !users) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <FlatList
        data={users ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View className="mb-4 gap-1">
            <Text className="text-2xl font-bold text-slate-900">Public decks</Text>
            <Text className="text-sm text-slate-500">
              Duplicate a deck to springboard off of and edit to make it your own, or play a deck to practice sample sentences new to you.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOpen = openUserId === item.id;

          return (
            <Card>
              <Pressable
                onPress={() => setOpenUserId((current) => (current === item.id ? null : item.id))}
                className="p-4 active:opacity-70"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="text-lg font-semibold text-slate-900" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-sm text-slate-500">
                      {item.deckCount} {item.deckCount === 1 ? 'deck' : 'decks'}
                    </Text>
                  </View>
                  <Text className="text-sm font-medium text-slate-500">
                    {isOpen ? 'Hide decks' : 'Show decks'}
                  </Text>
                </View>
              </Pressable>

              {isOpen ? (
                <View className="gap-2 px-4 pb-4">
                  {item.decks.length > 0 ? (
                    item.decks.map((deck) => (
                      <Link key={deck.id} href={`/decks/${deck.id}` as never} asChild>
                        <Pressable className="border-border flex-row items-center justify-between rounded-xl border p-3 active:opacity-70">
                          <View className="min-w-0 flex-1 flex-row items-center gap-3">
                            <View
                              className="h-10 w-10 rounded-md"
                              style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                            />
                            <View className="min-w-0 flex-1">
                              <Text className="font-semibold text-slate-900" numberOfLines={1}>
                                {deck.name}
                              </Text>
                              <Text className="text-sm text-slate-500">Read-only deck</Text>
                            </View>
                          </View>
                          <Text className="text-sm text-slate-500">
                            {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                          </Text>
                        </Pressable>
                      </Link>
                    ))
                  ) : (
                    <View className="border-border rounded-xl border border-dashed p-4">
                      <Text className="text-sm text-slate-500">
                        This user does not have any public decks yet.
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}
            </Card>
          );
        }}
        ListEmptyComponent={
          <Card className="items-center gap-3 border-dashed p-10">
            <Text className="text-lg font-semibold text-slate-900">No public users yet</Text>
            <Text className="text-center text-sm text-slate-500">
              When other users make their profile and decks public, they will show up here.
            </Text>
          </Card>
        }
      />
    </View>
  );
}
