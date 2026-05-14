import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../../src/lib/AuthContext';

/**
 * Route group for authed screens. Kicks unauth'd users back to /signin;
 * uses a native stack so the app feels like a real iOS/Android app.
 */
export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }
  if (!session) return <Redirect href="/signin" />;

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
      <Stack.Screen name="more" options={{ title: 'Public decks' }} />
      <Stack.Screen name="all-cards" options={{ title: 'All decks' }} />
      <Stack.Screen name="all-cards-practice" options={{ title: 'Play' }} />
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
