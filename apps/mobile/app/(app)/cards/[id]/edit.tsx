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

import { FlashcardUpdateInput, GENDER_OPTIONS, VERB_TYPE_OPTIONS } from '@flipflow/types';

import { Button } from '../../../../src/components/Button';
import { TextField } from '../../../../src/components/TextField';
import { useDebouncedValue } from '../../../../src/lib/hooks';
import { trpc } from '../../../../src/lib/trpc';

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
    // ignore
  }
  return null;
}

async function writePrefs(categoryId: string | null, prefs: TranslatePrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(prefsKey(categoryId), JSON.stringify(prefs));
  } catch {
    // non-fatal
  }
}

// Sentinel for "leave the card uncategorized" — we represent that as
// undefined in the payload (don't touch the field) but need a stable string
// key for the picker UI.
const KEEP_UNCATEGORIZED = '__none__';

/**
 * Edit card modal. Loads the current card, hydrates the form fields once,
 * and sends a partial update on submit.
 *
 * For uncategorized cards (categoryId === null), an "Assign to deck"
 * picker is shown so the user can move the card into a deck. Cards that
 * are already in a deck don't get a re-assign UI here — that wasn't asked
 * for and matches the web edit dialog's behavior.
 */
export default function EditCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = id as string;
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: card, isLoading } = trpc.flashcards.byId.useQuery({ id: cardId });
  const { data: categories } = trpc.categories.list.useQuery();

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [frontError, setFrontError] = useState<string | undefined>();
  const [backError, setBackError] = useState<string | undefined>();
  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);
  // Gender and verb type — optional.
  const [gender, setGender] = useState<string | null>(null);
  const [verbType, setVerbType] = useState<string | null>(null);
  // Optional pronunciation hint.
  const [pronunciation, setPronunciation] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Translation state
  const [translateOn, setTranslateOn] = useState(false);
  const [target, setTarget] = useState<TranslateTargetValue>('fr');
  const [translateHydrated, setTranslateHydrated] = useState(false);

  const lastTranslatedRef = useRef<{ text: string; target: string } | null>(null);
  const lastTranslatedExamplesRef = useRef(new Map<number, { text: string; target: string }>());
  // Gates: auto-translate only fires after the user actively edits the field,
  // not during initial hydration from the fetched card.
  const userEditedFrontRef = useRef(false);
  const userEditedExamplesRef = useRef(false);

  // Tracks the deck-assignment picker. Only meaningful when the card is
  // currently uncategorized; a value other than KEEP_UNCATEGORIZED means
  // "move this card into this deck on save".
  const [assignDeck, setAssignDeck] = useState<string>(KEEP_UNCATEGORIZED);

  // Seed the form from the fetched card once; don't clobber edits on
  // subsequent background refetches.
  useEffect(() => {
    if (card && !hydrated) {
      setFront(card.front);
      setBack(card.back);
      setFrontExamples(card.frontExamples ?? []);
      setBackExamples(card.backExamples ?? []);
      setGender(card.gender ?? null);
      setVerbType(card.verb_type ?? null);
      setPronunciation(
        (card as { pronunciation?: string | null }).pronunciation ?? '',
      );
      setHydrated(true);
    }
  }, [card, hydrated]);

  // Hydrate translation prefs from the card's categoryId.
  useEffect(() => {
    if (!card) return;
    let cancelled = false;
    setTranslateHydrated(false);
    (async () => {
      const stored = await readPrefs(card.categoryId ?? null);
      if (cancelled) return;
      if (stored) {
        setTranslateOn(stored.enabled);
        setTarget(stored.target);
      } else {
        setTranslateOn(false);
        setTarget('fr');
      }
      setTranslateHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  // Persist translate prefs changes.
  useEffect(() => {
    if (!translateHydrated || !card) return;
    writePrefs(card.categoryId ?? null, { v: 1, enabled: translateOn, target });
  }, [translateHydrated, card, translateOn, target]);

  const update = trpc.flashcards.update.useMutation({
    onSuccess: (updated) => {
      // categoryId can now be null (uncategorized) — only invalidate the
      // per-deck cache when the card actually belongs to a deck.
      if (updated.categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId: updated.categoryId });
        utils.practice.stats.invalidate({ categoryId: updated.categoryId });
      }
      utils.flashcards.listAll.invalidate();
      utils.flashcards.byId.invalidate({ id: cardId });
      utils.practice.stats.invalidate({});
      utils.categories.list.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert('Could not save card', err.message),
  });

  const translate = trpc.translate.translate.useMutation();
  const { data: availability } = trpc.translate.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const translateAvailable = !!availability?.available;

  const debouncedFront = useDebouncedValue(front.trim(), 500);
  const debouncedFrontExamples = useDebouncedValue(frontExamples, 500);

  useEffect(() => {
    if (!translateOn || !translateAvailable || !userEditedFrontRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFront, target, translateOn, translateAvailable]);

  useEffect(() => {
    if (!translateOn || !translateAvailable || !userEditedExamplesRef.current) return;
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

  // Show the deck assigner only for uncategorized cards. Cards already in a
  // deck don't get a re-assign UI — keep that as a separate, explicit
  // action if it's ever needed.
  const showAssign = card != null && !card.categoryId && decks.length > 0;

  function handleSubmit() {
    setFrontError(undefined);
    setBackError(undefined);

    // Only include categoryId in the payload if the user explicitly picked
    // a deck for an uncategorized card. Leaving it out preserves the
    // "don't touch this field" semantics of the partial update.
    const categoryId = showAssign && assignDeck !== KEEP_UNCATEGORIZED ? assignDeck : undefined;

    const parsed = FlashcardUpdateInput.safeParse({
      id: cardId,
      front,
      back,
      ...(categoryId ? { categoryId } : {}),
      frontExamples,
      backExamples,
      gender,
      verb_type: verbType,
      pronunciation: pronunciation.trim() ? pronunciation.trim() : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'front') setFrontError(issue.message);
        if (issue.path[0] === 'back') setBackError(issue.message);
      }
      return;
    }
    update.mutate(parsed.data);
  }

  if (isLoading || !card) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <View className="gap-5">
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
            value={front}
            onChangeText={(v) => {
              userEditedFrontRef.current = true;
              setFront(v);
            }}
            error={frontError}
            multiline
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <TextField
            label="Back"
            value={back}
            onChangeText={setBack}
            error={backError}
            multiline
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />

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
                          userEditedExamplesRef.current = true;
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

          {showAssign ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Assign to deck</Text>
              <View className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <DeckOption
                  label="Leave uncategorized"
                  selected={assignDeck === KEEP_UNCATEGORIZED}
                  onPress={() => setAssignDeck(KEEP_UNCATEGORIZED)}
                />
                {decks.map((d) => (
                  <DeckOption
                    key={d.id}
                    label={d.name}
                    color={d.color ?? undefined}
                    selected={assignDeck === d.id}
                    onPress={() => setAssignDeck(d.id)}
                  />
                ))}
              </View>
              <Text className="text-xs text-slate-500">
                Move this card into one of your decks. You can&apos;t move it back to uncategorized
                once assigned.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-8 flex-row gap-3">
          <View className="flex-1">
            <Button variant="ghost" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={handleSubmit} loading={update.isPending}>
              Save
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Single row in the deck picker. Mirrors the picker on the new-card screen
 * for visual consistency.
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
