import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  clearStoredSession,
  getStoredSession,
  signInWithBrowser,
  type StoredSession,
} from './auth';

interface AuthContextValue {
  session: StoredSession | null;
  /** True before the persisted session has been checked. Render a splash until it flips. */
  isLoading: boolean;
  /**
   * True when we know the user is browsing as a guest (i.e. we've finished
   * loading and there's no session). Convenience flag for gating UI without
   * having to repeat the `!isLoading && !session` dance everywhere.
   */
  isGuest: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load any persisted session on mount.
  useEffect(() => {
    (async () => {
      const stored = await getStoredSession();
      setSession(stored);
      setIsLoading(false);
    })();
  }, []);

  const signIn = useCallback(async () => {
    const next = await signInWithBrowser();
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    await clearStoredSession();
    setSession(null);
  }, []);

  const isGuest = !isLoading && session === null;

  return (
    <AuthContext.Provider value={{ session, isLoading, isGuest, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Returns a function that gates a UI action behind an authenticated session.
 *
 *   const requireAuth = useRequireAuth();
 *   <Button onPress={() => requireAuth(() => router.push('/new-deck'),
 *                                       { reason: 'Sign in to create your own decks.' })}>
 *
 * Behaviour:
 *   - Signed in → runs `onAuthed()` immediately.
 *   - Guest     → shows a native alert with [Cancel, Sign in]. If the user
 *                 taps Sign in we kick off the hosted browser flow; on
 *                 success we run `onAuthed()` so the original action
 *                 completes seamlessly.
 *
 * This is the single place we ask the user to sign in for an action. Adding
 * a sign-in prompt to a new button is one line at the call site, and the
 * messaging stays consistent across the app.
 */
export function useRequireAuth() {
  const { session, signIn } = useAuth();

  return useCallback(
    (onAuthed: () => void, opts?: { reason?: string; title?: string }) => {
      if (session) {
        onAuthed();
        return;
      }
      Alert.alert(opts?.title ?? 'Sign in required', opts?.reason ?? 'Sign in to continue.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign in',
          onPress: async () => {
            try {
              await signIn();
              // The auth state update will re-render anything that depends
              // on `session`, but the caller's specific action still needs
              // to fire — e.g. they were trying to push to /new-deck.
              onAuthed();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Something went wrong.';
              if (message !== 'Sign in was cancelled.') {
                Alert.alert('Sign in failed', message);
              }
            }
          },
        },
      ]);
    },
    [session, signIn],
  );
}
