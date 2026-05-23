import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';

/**
 * Route group for the main app shell. Renders the same navigation tree for
 * signed-in users and guests; individual screens handle their own guest
 * affordances (e.g. the home screen renders the public library when there
 * is no session, deck/practice screens prompt to sign in before saving).
 *
 * Used to redirect guests to /signin, but App Store guideline 5.1.1(v)
 * requires that account-independent features (browsing/practicing public
 * decks) work without an account, so the gate has moved inward — see
 * `useRequireAuth` for the per-action sign-in flow.
 */
export default function AppLayout() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTitleStyle: { color: '#0f172a', fontWeight: '600' },
        headerTintColor: '#5584bb',
        headerShadowVisible: true,
        contentStyle: { backgroundColor: '#f8fafc' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="all-cards" options={{ title: 'All decks' }} />
      <Stack.Screen name="all-cards-practice" options={{ title: 'Play' }} />
      <Stack.Screen name="folders/index" options={{ title: 'Folders' }} />
      <Stack.Screen name="groups/index" options={{ title: 'Groups' }} />
      <Stack.Screen name="groups/[id]/index" options={{ title: 'Group' }} />
      <Stack.Screen name="new-deck" options={{ title: 'New deck', presentation: 'modal' }} />
      <Stack.Screen name="new-card" options={{ title: 'New card', presentation: 'modal' }} />
      <Stack.Screen name="decks/[id]/index" options={{ title: 'Deck' }} />
      <Stack.Screen name="decks/[id]/practice" options={{ title: 'Play' }} />
      <Stack.Screen
        name="decks/[id]/edit"
        options={{ title: 'Edit deck', presentation: 'modal' }}
      />
      {/* Legacy redirect — see decks/[id]/new-card.tsx for context. Kept so
          deep links and stale navigation still resolve. */}
      <Stack.Screen
        name="decks/[id]/new-card"
        options={{ title: 'New card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="cards/[id]/edit"
        options={{ title: 'Edit card', presentation: 'modal' }}
      />
    </Stack>
  );
}
