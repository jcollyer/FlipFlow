import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { FlashcardCreateInput, GENDER_OPTIONS, VERB_TYPE_OPTIONS } from '@flipflow/types';

import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { useDebouncedValue } from '../../src/lib/hooks';
import { trpc } from '../../src/lib/trpc';

/** Languages exposed in the translation segmented control. Must match the server enum. */
const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

interface TranslatePrefs {
  v: 1;
  enabled: boolean;
  target: TranslateTargetValue;
}

// Translation prefs are scoped per-deck so a "French Vocab" deck always opens
// in French mode. Cards created without a deck use a single shared key —
// there's no per-deck context to remember.
const prefsKey = (categoryId: string | null) =>
  categoryId ? `flipflow:translate:${categoryId}` : `flipflow:translate:__none__`;

async function readPrefs(categoryId: string | null): Promise<TranslatePrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TranslatePrefs>;
    if (
      parsed.v === 1 &&
      typeof parsed.enabled === 'boolean' &&
      TRANSLATE_TARGETS.some((t) => t.value === parsed.target)
    ) {
      return parsed as TranslatePrefs;
    }
  } catch {
    // Ignore corrupt entries — the user just gets defaults.
  }
  return null;
}

async function writePrefs(categoryId: string | null, prefs: TranslatePrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(prefsKey(categoryId), JSON.stringify(prefs));
  } catch {
    // AsyncStorage can throw on quota exhaustion — non-fatal.
  }
}

// Sentinel for the deck picker since we represent "no deck" as null in the
// payload but need a stable string key for the selector UI.
const NO_DECK = '__none__';

/**
 * Top-level new-card screen. Optionally accepts a `categoryId` query param
 * to pre-select a deck (used when launched from the deck detail page).
 * Without it, the user sees a deck picker that defaults to "No deck" and
 * the card is created as uncategorized.
 *
 * Translation mode: identical to the per-deck flow, scoped per-deck (or to
 * a shared "no deck" key) so the toggle/language survive remounts.
 */
export default function NewCardScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const initialCategoryId = typeof params.categoryId === 'string' ? params.categoryId : null;

  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: categories } = trpc.categories.list.useQuery();

  // The deck selector is bound to a string (Radix-style sentinel). We
  // translate to/from null at the edges. Initialize from the query param
  // so the deck-detail entry point pre-fills correctly.
  const [deckSelection, setDeckSelection] = useState<string>(initialCategoryId ?? NO_DECK);
  const selectedCategoryId = deckSelection === NO_DECK ? null : deckSelection;

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [frontError, setFrontError] = useState<string | undefined>();
  const [backError, setBackError] = useState<string | undefined>();
  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);
  // Gender and verb type — optional.
  const [gender, setGender] = useState<string | null>(null);
  const [verbType, setVerbType] = useState<string | null>(null);
  // Optional pronunciation hint (e.g. IPA or romanization).
  const [pronunciation, setPronunciation] = useState('');

  // Translation state. `hydrated` gates the persist effect so the initial
  // defaults don't clobber stored prefs before the read completes.
  const [translateOn, setTranslateOn] = useState(false);
  const [target, setTarget] = useState<TranslateTargetValue>('fr');
  const [hydrated, setHydrated] = useState(false);

  const { data: availability } = trpc.translate.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const translateAvailable = !!availability?.available;

  const create = trpc.flashcards.create.useMutation({
    onSuccess: (created) => {
      // Invalidate per-deck caches only when the card actually landed in
      // a deck — listAll covers the uncategorized case.
      if (created.categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId: created.categoryId });
        utils.practice.stats.invalidate({ categoryId: created.categoryId });
      }
      utils.flashcards.listAll.invalidate();
      utils.practice.stats.invalidate({});
      utils.categories.list.invalidate();
      setFront('');
      setBack('');
      setFrontExamples([]);
      setBackExamples([]);
      setPronunciation('');
      lastTranslatedRef.current = null;
      lastTranslatedExamplesRef.current.clear();
      router.back();
    },
    onError: (err) => Alert.alert('Could not add card', err.message),
  });

  const translate = trpc.translate.translate.useMutation();

  // Object-identity guard against out-of-order responses. See the web client
  // for the detailed rationale — same race, same fix.
  const lastTranslatedRef = useRef<{ text: string; target: string } | null>(null);
  // Per-slot memoization for example translations: slot index -> last {text, target} sent
  const lastTranslatedExamplesRef = useRef(new Map<number, { text: string; target: string }>());

  // Re-hydrate prefs when the selected deck changes — each deck remembers
  // its own translation defaults. Using selectedCategoryId in the dep list
  // keeps the read in sync with the picker.
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    (async () => {
      const stored = await readPrefs(selectedCategoryId);
      if (cancelled) return;
      if (stored) {
        setTranslateOn(stored.enabled);
        setTarget(stored.target);
      } else {
        setTranslateOn(false);
        setTarget('fr');
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId]);

  // Persist changes — only after hydration to avoid wiping stored prefs on
  // first render with the defaults.
  useEffect(() => {
    if (!hydrated) return;
    writePrefs(selectedCategoryId, { v: 1, enabled: translateOn, target });
  }, [hydrated, selectedCategoryId, translateOn, target]);

  // Debounced translation on front-text change.
  const debouncedFront = useDebouncedValue(front.trim(), 500);
  const debouncedFrontExamples = useDebouncedValue(frontExamples, 500);

  useEffect(() => {
    if (!translateOn || !translateAvailable) return;

    if (!debouncedFront) {
      setBack('');
      lastTranslatedRef.current = null;
      return;
    }

    const last = lastTranslatedRef.current;
    if (last && last.text === debouncedFront && last.target === target) return;

    const request = { text: debouncedFront, target };
    lastTranslatedRef.current = request;

    translate.mutate(
      { text: debouncedFront, target },
      {
        onSuccess: ({ translation }) => {
          if (lastTranslatedRef.current !== request) return;
          setBack(translation);
          setBackError(undefined);
        },
      },
    );
    // `translate` from useMutation isn't referentially stable; including it
    // would re-run the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFront, target, translateOn, translateAvailable]);

  // Per-example translation: translate each front example slot into the
  // corresponding back example slot when the toggle is on.
  useEffect(() => {
    if (!translateOn || !translateAvailable) return;
    debouncedFrontExamples.forEach((text, i) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const last = lastTranslatedExamplesRef.current.get(i);
      if (last && last.text === trimmed && last.target === target) return;
      const request = { text: trimmed, target };
      lastTranslatedExamplesRef.current.set(i, request);
      translate.mutate(
        { text: trimmed, target },
        {
          onSuccess: ({ translation }) => {
            if (lastTranslatedExamplesRef.current.get(i) !== request) return;
            setBackExamples((prev) => {
              const next = [...prev];
              next[i] = translation;
              return next;
            });
          },
        },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFrontExamples, target, translateOn, translateAvailable]);

  // Sorted decks for the picker. Stable order = predictable UI.
  const decks = useMemo(
    () =>
      (categories ?? [])
        .map((c) => ({ id: c.id, name: c.name, color: c.color }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  function handleSubmit() {
    setFrontError(undefined);
    setBackError(undefined);
    const parsed = FlashcardCreateInput.safeParse({
      front,
      back,
      categoryId: selectedCategoryId,
      frontExamples,
      backExamples,
      gender: gender ?? undefined,
      verb_type: verbType ?? undefined,
      pronunciation: pronunciation.trim() ? pronunciation.trim() : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'front') setFrontError(issue.message);
        if (issue.path[0] === 'back') setBackError(issue.message);
      }
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-6 text-base text-slate-500">
          The front is the prompt, the back is the answer.
        </Text>

        <View className="gap-5">
          {/* Deck picker — always visible. Defaults to the query-param deck
              when launched from a deck, otherwise "No deck" so the card
              becomes uncategorized. */}
          <View className="gap-2">
            <Text className="text-sm font-medium text-slate-700">Deck</Text>
            <View className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <DeckOption
                label="No deck"
                selected={deckSelection === NO_DECK}
                onPress={() => setDeckSelection(NO_DECK)}
              />
              {decks.map((d) => (
                <DeckOption
                  key={d.id}
                  label={d.name}
                  color={d.color ?? undefined}
                  selected={deckSelection === d.id}
                  onPress={() => setDeckSelection(d.id)}
                />
              ))}
            </View>
            <Text className="text-xs text-slate-500">Choose a deck or leave uncategorized.</Text>
          </View>

          {translateAvailable ? (
            <View className="gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold text-slate-900">Translation card</Text>
                  <Text className="mt-0.5 text-sm text-slate-500">
                    Auto-translate the front into the chosen language.
                  </Text>
                </View>
                <Switch value={translateOn} onValueChange={setTranslateOn} />
              </View>
              {translateOn ? (
                <View className="flex-row gap-2">
                  {TRANSLATE_TARGETS.map((opt) => {
                    const active = target === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setTarget(opt.value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                          active ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <Text
                          className={`text-center text-sm font-semibold ${
                            active ? 'text-white' : 'text-slate-700'
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          <TextField
            label="Front"
            placeholder="What's on the prompt side?"
            value={front}
            onChangeText={setFront}
            error={frontError}
            autoFocus
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />

          {/* Back: render label + optional spinner ourselves instead of using
              TextField's `label` prop, so we can show "Translating…" inline. */}
          <View className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-medium text-slate-700">Back</Text>
              {translateOn && translate.isPending ? (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size="small" color="#64748b" />
                  <Text className="text-xs text-slate-500">Translating…</Text>
                </View>
              ) : null}
            </View>
            <TextField
              placeholder="What's the answer?"
              value={back}
              onChangeText={(v) => {
                setBack(v);
                if (backError) setBackError(undefined);
              }}
              error={backError}
              multiline
              style={{ minHeight: 120, textAlignVertical: 'top' }}
            />
            {translate.error ? (
              <Text className="text-destructive text-xs">{translate.error.message}</Text>
            ) : null}
          </View>

          {/* Examples section */}
          {frontExamples.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Examples</Text>
              {frontExamples.map((ex, i) => (
                <View key={i} className="gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1">
                      <TextField
                        placeholder="Front example"
                        value={ex}
                        onChangeText={(v) => {
                          setFrontExamples((prev) => {
                            const next = [...prev];
                            next[i] = v;
                            return next;
                          });
                        }}
                      />
                    </View>
                    <Pressable
                      onPress={() => {
                        setFrontExamples((prev) => prev.filter((_, j) => j !== i));
                        setBackExamples((prev) => prev.filter((_, j) => j !== i));
                        lastTranslatedExamplesRef.current.delete(i);
                      }}
                      hitSlop={8}
                      className="h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white active:opacity-70"
                    >
                      <Text className="text-base text-slate-500">✕</Text>
                    </Pressable>
                  </View>
                  <TextField
                    placeholder="Back example"
                    value={backExamples[i] ?? ''}
                    onChangeText={(v) => {
                      setBackExamples((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              setFrontExamples((prev) => [...prev, '']);
              setBackExamples((prev) => [...prev, '']);
            }}
            className="flex-row items-center gap-2 py-1 active:opacity-70"
          >
            <Text className="text-primary text-sm font-medium">+ Add example</Text>
          </Pressable>

          {/* Gender picker */}
          <View className="gap-2">
            <Text className="text-sm font-medium text-slate-700">Gender (optional)</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setGender(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === null }}
                className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                  gender === null ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                }`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    gender === null ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  None
                </Text>
              </Pressable>
              {GENDER_OPTIONS.map((opt) => {
                const active = gender === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setGender(opt.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                      active ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-center text-sm font-semibold ${
                        active ? 'text-white' : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Verb type picker */}
          <View className="gap-2">
            <Text className="text-sm font-medium text-slate-700">Verb type (optional)</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setVerbType(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: verbType === null }}
                className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                  verbType === null ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                }`}
              >
                <Text
                  className={`text-center text-sm font-semibold ${
                    verbType === null ? 'text-white' : 'text-slate-700'
                  }`}
                >
                  None
                </Text>
              </Pressable>
              {VERB_TYPE_OPTIONS.map((opt) => {
                const active = verbType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setVerbType(opt.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                      active ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-center text-sm font-semibold ${
                        active ? 'text-white' : 'text-slate-700'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Pronunciation hint (optional) — IPA, romanization, etc. */}
          <TextField
            label="Pronunciation (optional)"
            placeholder="e.g. /bɔ̃.ʒuʁ/ or bohn-zhoor"
            value={pronunciation}
            onChangeText={setPronunciation}
          />
        </View>

        <View className="mt-8 flex-row gap-3">
          <View className="flex-1">
            <Button variant="ghost" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={handleSubmit} loading={create.isPending}>
              Add card
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Single row in the deck picker. Renders a checkmark-style indicator on the
 * selected entry. Color swatch is omitted for "No deck" — passing `color`
 * undefined hides it.
 */
function DeckOption({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 active:opacity-80 ${
        selected ? 'bg-primary/10' : ''
      }`}
    >
      {color ? (
        <View className="h-4 w-4 rounded-sm" style={{ backgroundColor: color }} />
      ) : (
        <View className="h-4 w-4 rounded-sm border border-dashed border-slate-300" />
      )}
      <Text
        className={`flex-1 text-base ${selected ? 'text-primary font-semibold' : 'text-slate-900'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? <Text className="text-primary text-base font-bold">✓</Text> : null}
    </Pressable>
  );
}
