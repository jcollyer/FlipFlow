import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Legacy entry point. The new-card screen now lives at /new-card and accepts
 * an optional `categoryId` query param so it can serve both "create in this
 * deck" and "create uncategorized" flows from a single screen. We keep this
 * route as a redirect for any deep link or stale navigation that still
 * targets /decks/:id/new-card.
 */
export default function LegacyDeckNewCardRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = typeof id === 'string' ? id : '';
  return <Redirect href={categoryId ? `/new-card?categoryId=${categoryId}` : '/new-card'} />;
}
