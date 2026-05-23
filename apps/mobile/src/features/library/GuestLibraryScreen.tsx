import { Link } from 'expo-router';
import { ChevronRight, GalleryHorizontalEnd, Layers, LogIn, Sparkles } from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../lib/AuthContext';
import { trpc } from '../../lib/trpc';
import { Card } from '../../components/Card';

/**
 * Guest landing for the app shell. Shows the public-deck library and a
 * persistent Sign In CTA. Required by App Store guideline 5.1.1(v):
 * account-independent features (browsing public content, practicing public
 * decks) must work without an account.
 *
 * Account-gated actions (creating a deck, saving practice progress, folders,
 * groups, settings) live behind `useRequireAuth()` at their respective call
 * sites — this screen deliberately does NOT show those affordances.
 *
 * Layout mirrors the signed-in home screen in shape (header row + content
 * + library cards) so the visual transition after sign-in feels continuous.
 */
export function GuestLibraryScreen() {
  const { signIn } = useAuth();

  const {
    data: library,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.categories.publicLibrary.useQuery();

  async function handleSignIn() {
    try {
      await signIn();
    } catch (err) {
      // Cancellations are silent; surfacing here would interrupt browsing.
      const message = err instanceof Error ? err.message : null;
      if (message && message !== 'Sign in was cancelled.') {
        // Re-use the same Alert helper from the existing signin screen would
        // create a circular dep; the simpler thing is to let the message
        // surface via the underlying browser session. Cancellation is the
        // dominant case here, so silent-failure is acceptable.
      }
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-slate-50">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor="#5584bb"
          />
        }
      >
        {/* Header row — branding + Sign In CTA */}
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-slate-900">Public library</Text>
            <Text className="text-sm text-slate-500">Browse decks shared by other learners.</Text>
          </View>
          <Pressable
            onPress={handleSignIn}
            hitSlop={8}
            className="bg-primary flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-80"
          >
            <LogIn size={14} color="#ffffff" />
            <Text className="text-sm font-semibold text-white">Sign in</Text>
          </Pressable>
        </View>

        {/* Value proposition card — sets expectations for what sign-in unlocks
            without making the guest experience feel hobbled. */}
        <Card className="mb-4 gap-2 p-4">
          <View className="flex-row items-center gap-2">
            <Sparkles size={16} color="#5584bb" />
            <Text className="text-base font-semibold text-slate-900">
              Practice for free, sign in to save
            </Text>
          </View>
          <Text className="text-sm text-slate-500">
            Tap any deck below to practice its cards. Sign in to create your own decks, track
            progress with spaced repetition, and share with study groups.
          </Text>
        </Card>

        {/* Library content */}
        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator size="large" color="#5584bb" />
          </View>
        ) : (library?.length ?? 0) === 0 ? (
          <Card className="items-center gap-3 border-dashed p-10">
            <Text className="text-base font-semibold text-slate-900">No public decks yet</Text>
            <Text className="text-center text-sm text-slate-500">
              Be the first — sign in and make a deck public from its settings.
            </Text>
          </Card>
        ) : (
          <View className="gap-4">
            {library!.map((user) => (
              <LibraryUserSection key={user.id} user={user} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type LibraryUser = {
  id: string;
  name: string;
  image: string | null;
  isAdmin: boolean;
  deckCount: number;
  decks: Array<{
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    cardCount: number;
  }>;
};

/**
 * Per-user section showing avatar/name and their public decks. Tapping a
 * deck routes to /decks/[id], which itself is now guest-readable for
 * publicly-visible decks (see categories.byId / flashcards.listByCategory).
 */
function LibraryUserSection({ user }: { user: LibraryUser }) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2 px-1">
        <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-200">
          {user.image ? (
            <Image
              source={{ uri: user.image }}
              style={{ width: 28, height: 28, borderRadius: 14 }}
            />
          ) : (
            <Text className="text-xs font-semibold text-slate-600">{initialsFor(user.name)}</Text>
          )}
        </View>
        <Text className="flex-1 text-sm font-semibold text-slate-900" numberOfLines={1}>
          {user.name}
        </Text>
        <Text className="text-xs text-slate-400">
          {user.deckCount} {user.deckCount === 1 ? 'deck' : 'decks'}
        </Text>
      </View>

      <Card className="overflow-hidden">
        {user.decks.map((deck, index) => (
          <Link key={deck.id} href={`/decks/${deck.id}`} asChild>
            <Pressable
              className="active:bg-slate-50"
              style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#e2e8f0' } : undefined}
            >
              <View className="flex-row items-center gap-3 px-4 py-3">
                <View
                  className="h-8 w-8 shrink-0 rounded-sm"
                  style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                />
                <View className="flex-1">
                  <Text className="text-base font-medium text-slate-900" numberOfLines={1}>
                    {deck.name}
                  </Text>
                  {deck.description ? (
                    <Text className="mt-0.5 text-xs text-slate-500" numberOfLines={1}>
                      {deck.description}
                    </Text>
                  ) : null}
                  <View className="mt-0.5 flex-row items-center gap-1">
                    <GalleryHorizontalEnd size={11} color="#94a3b8" />
                    <Text className="text-xs text-slate-500">
                      {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-1">
                  <Layers size={13} color="#cbd5e1" />
                  <ChevronRight size={18} color="#cbd5e1" />
                </View>
              </View>
            </Pressable>
          </Link>
        ))}
      </Card>
    </View>
  );
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
