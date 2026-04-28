import { Feather } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { type BackLanguageValue } from '@flipflow/types';

import { Button } from '../../../../src/components/Button';
import { Card } from '../../../../src/components/Card';
import { ClassBadge } from '../../../../src/components/ClassBadge';
import { trpc } from '../../../../src/lib/trpc';

/**
 * Practice flow. Matches the web PracticeSession:
 *   1. Fetch the queue once on mount.
 *   2. Walk cards locally (tap card to flip).
 *   3. After each rating, fire submitReview and advance — don't block
 *      the UI on the network.
 *   4. When the queue is done, show a summary and invalidate stats.
 */
export default function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = id as string;
  const router = useRouter();
  const utils = trpc.useUtils();

  // When `practiceAll` is true we ignore the SM-2 schedule and pull every
  // card in the deck. The user opts in via "Practice anyway" on the empty
  // state, so we only flip this on after they confirm.
  const [practiceAll, setPracticeAll] = useState(false);

  const { data, isLoading } = trpc.practice.queue.useQuery(
    { categoryId, limit: 20, includeAll: practiceAll },
    { refetchOnMount: 'always' },
  );

  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const cards = data?.cards ?? [];
  const current = cards[index];
  const done = !isLoading && cards.length > 0 && index >= cards.length;

  function handleRate(quality: number) {
    if (!current) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // Refresh counts when the session wraps up.
  useEffect(() => {
    if (done) {
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({ categoryId });
      utils.flashcards.listByCategory.invalidate({ categoryId });
    }
  }, [done, utils, categoryId]);

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.min(index, cards.length) / cards.length;
  }, [index, cards.length]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <Stack.Screen options={{ title: data?.category.name ?? 'Practice' }} />

      <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
        {cards.length === 0 ? (
          <EmptyQueue
            practiceAll={practiceAll}
            onBack={() => router.back()}
            onPracticeAnyway={() => setPracticeAll(true)}
          />
        ) : done ? (
          <SessionSummary
            reviewed={reviewed}
            onBack={() => router.back()}
            onAgain={() => {
              setIndex(0);
              setReviewed(0);
              setFlipped(false);
              utils.practice.queue.invalidate({ categoryId, limit: 20 });
            }}
          />
        ) : (
          <>
            <ProgressBar value={progress} />
            <Text className="mt-2 text-center text-xs text-slate-500">
              {Math.min(index + 1, cards.length)} of {cards.length}
            </Text>

            <Pressable onPress={() => setFlipped((f) => !f)} className="mt-6 active:opacity-90">
              <Card
                className={`min-h-[280px] items-center justify-center p-6 ${
                  flipped ? 'border-primary bg-blue-50' : ''
                }`}
              >
                {current?.class ? (
                  <View className="mb-3">
                    <ClassBadge value={current.class} size="md" />
                  </View>
                ) : null}
                <Text
                  className={`text-center leading-snug ${
                    flipped
                      ? 'text-xl font-bold text-slate-900'
                      : 'text-2xl font-bold text-slate-900'
                  }`}
                >
                  {flipped ? current?.back : current?.front}
                </Text>
                {flipped && (current?.backExamples?.length ?? 0) > 0 ? (
                  <View className="mt-3 w-full gap-1 self-start pl-2">
                    {current!.backExamples.map((ex, i) => (
                      <Text key={i} className="text-sm italic text-slate-500">
                        {ex}
                      </Text>
                    ))}
                  </View>
                ) : !flipped && (current?.frontExamples?.length ?? 0) > 0 ? (
                  <View className="mt-3 w-full gap-1 self-start pl-2">
                    {current!.frontExamples.map((ex, i) => (
                      <Text key={i} className="text-sm italic text-slate-500">
                        {ex}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text className="mt-6 text-xs uppercase tracking-wider text-slate-400">
                  {flipped ? 'Answer' : 'Tap to reveal'}
                </Text>

                {/* Floating speaker button on the back of the card. Only
                    rendered when the deck has a configured language and we
                    have a card to read. Absolute-positioned so it doesn't
                    push the centered text around. */}
                {flipped && current && data?.category.backLanguage ? (
                  <View className="absolute right-3 top-3">
                    <AudioButton
                      cardId={current.id}
                      text={current.back}
                      examples={current.backExamples ?? []}
                      languageCode={data.category.backLanguage as BackLanguageValue}
                    />
                  </View>
                ) : null}
              </Card>
            </Pressable>

            {flipped ? (
              <RatingButtons onRate={handleRate} />
            ) : (
              <View className="mt-6">
                <Button size="lg" onPress={() => setFlipped(true)}>
                  Show answer
                </Button>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <View className="bg-primary h-full" style={{ width: `${Math.round(value * 100)}%` }} />
    </View>
  );
}

const RATINGS: { value: number; label: string; sub: string; tone: string }[] = [
  { value: 0, label: 'Again', sub: 'No idea', tone: 'border-red-300' },
  { value: 2, label: 'Hard', sub: 'Wrong', tone: 'border-orange-300' },
  { value: 3, label: 'Good', sub: 'Got it', tone: 'border-blue-300' },
  { value: 5, label: 'Easy', sub: 'Perfect', tone: 'border-green-300' },
];

function RatingButtons({ onRate }: { onRate: (q: number) => void }) {
  return (
    <View className="mt-6 flex-row flex-wrap gap-2">
      {RATINGS.map((r) => (
        <Pressable
          key={r.value}
          onPress={() => onRate(r.value)}
          className={`min-w-[45%] flex-1 items-center rounded-lg border bg-white py-3 active:opacity-70 ${r.tone}`}
        >
          <Text className="text-base font-semibold text-slate-900">{r.label}</Text>
          <Text className="text-xs text-slate-500">{r.sub}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyQueue({
  practiceAll,
  onBack,
  onPracticeAnyway,
}: {
  practiceAll: boolean;
  onBack: () => void;
  onPracticeAnyway: () => void;
}) {
  // If the user already opted into "Practice anyway" and we still got zero
  // cards back, the deck is genuinely empty — change the message and drop
  // the button.
  const deckIsEmpty = practiceAll;

  return (
    <Card className="items-center gap-3 p-10">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <Text className="text-2xl">✓</Text>
      </View>
      <Text className="text-lg font-semibold text-slate-900">
        {deckIsEmpty ? 'No cards in this deck' : 'Nothing due right now'}
      </Text>
      <Text className="text-center text-sm text-slate-500">
        {deckIsEmpty
          ? "There's nothing here to practice yet. Add some cards to get started."
          : "You're all caught up. Your schedule will surface cards as they become due — or jump back in early with Practice anyway."}
      </Text>
      <View className="mt-2 w-full gap-2">
        <Button variant="outline" onPress={onBack}>
          Back to deck
        </Button>
        {!deckIsEmpty && <Button onPress={onPracticeAnyway}>Practice anyway</Button>}
      </View>
    </Card>
  );
}

/**
 * Speaker button that fetches and plays a TTS pronunciation of the back-of-
 * card text (followed by each example, with a short pause between segments)
 * via the `tts.synthesize` mutation. Mirrors the web AudioButton but uses
 * `expo-av` for playback.
 *
 * Caching: per-session in-memory cache keyed by text content so the same
 * phrase is never re-billed. Re-tapping while audio plays cancels the current
 * sequence and restarts from the beginning.
 *
 * `stopPropagation` doesn't exist in React Native — instead, the parent
 * Pressable for "tap to flip" wraps the *card content*, but this button is
 * positioned absolutely on top of it. RN's Pressable consumes its own taps
 * and doesn't bubble to the parent Pressable, so a nested Pressable here is
 * sufficient to keep the flip from toggling on tap.
 */
function AudioButton({
  cardId: _cardId,
  text,
  examples,
  languageCode,
}: {
  cardId: string;
  text: string;
  examples: string[];
  languageCode: BackLanguageValue;
}) {
  const synthesize = trpc.tts.synthesize.useMutation();

  // text content -> base64 data URI cache so the same phrase is never re-billed.
  const cacheRef = useRef<Map<string, string>>(new Map());
  const soundRef = useRef<Audio.Sound | null>(null);
  // Symbol token to cancel an in-flight sequence when the user taps again.
  const runTokenRef = useRef<symbol | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort cleanup if the user navigates away mid-playback.
  useEffect(() => {
    return () => {
      runTokenRef.current = null;
      const s = soundRef.current;
      soundRef.current = null;
      if (s) {
        s.unloadAsync().catch(() => {});
      }
    };
  }, []);

  // Fetch (or return cached) TTS audio for a single text segment.
  const fetchAudio = useCallback(
    async (t: string): Promise<string> => {
      const cached = cacheRef.current.get(t);
      if (cached) return cached;
      const { audioContent } = await synthesize.mutateAsync({ text: t, languageCode });
      const dataUrl = `data:audio/mp3;base64,${audioContent}`;
      cacheRef.current.set(t, dataUrl);
      return dataUrl;
    },
    [synthesize, languageCode],
  );

  // Play a single audio data URL via expo-av; resolves when the clip ends.
  const playSingle = useCallback((dataUrl: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      (async () => {
        if (soundRef.current) {
          await soundRef.current.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
        try {
          const { sound } = await Audio.Sound.createAsync({ uri: dataUrl }, { shouldPlay: true });
          soundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
            if (!status.isLoaded) {
              if ('error' in status && status.error) {
                reject(new Error('Audio playback failed.'));
              }
              return;
            }
            if (status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              if (soundRef.current === sound) soundRef.current = null;
              resolve();
            }
          });
        } catch (err) {
          reject(err);
        }
      })();
    });
  }, []);

  const handlePress = useCallback(async () => {
    // Stop any current playback and cancel the in-flight sequence.
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
    }
    setError(null);

    const token = Symbol();
    runTokenRef.current = token;
    const isActive = () => runTokenRef.current === token;

    const texts = examples.length > 0 ? [text, ...examples] : [text];

    setLoading(true);
    setPlaying(false);
    try {
      // Pre-fetch all segments (uses cache on repeat plays).
      const dataUrls: string[] = [];
      for (const t of texts) {
        if (!isActive()) return;
        dataUrls.push(await fetchAudio(t));
      }

      if (!isActive()) return;
      setLoading(false);
      setPlaying(true);

      // Play segments with a 400 ms pause between each.
      for (let i = 0; i < dataUrls.length; i++) {
        if (!isActive()) break;
        await playSingle(dataUrls[i]);
        if (i < dataUrls.length - 1 && isActive()) {
          await new Promise<void>((resolve) => setTimeout(resolve, 400));
        }
      }
    } catch {
      if (isActive()) setError('Audio playback failed.');
    } finally {
      if (isActive()) {
        setLoading(false);
        setPlaying(false);
      }
    }
  }, [text, examples, fetchAudio, playSingle]);

  return (
    <View className="items-end gap-1">
      <Pressable
        onPress={handlePress}
        disabled={loading}
        accessibilityLabel={playing ? 'Playing pronunciation' : 'Hear pronunciation'}
        accessibilityRole="button"
        hitSlop={6}
        className={`border-border h-10 w-10 items-center justify-center rounded-full border bg-white active:opacity-70 ${
          playing ? 'bg-blue-50' : ''
        }`}
        style={{ opacity: loading ? 0.6 : 1 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : (
          // Same icon for idle and playing — the blue background on the
          // wrapper signals "currently playing", and Feather doesn't ship
          // an animated spinner equivalent to lucide's Loader2.
          <Feather name="volume-2" size={18} color="#3b82f6" />
        )}
      </Pressable>
      {error ? (
        <View className="max-w-[180px] rounded bg-red-50 px-2 py-1">
          <Text className="text-destructive text-[10px]" numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SessionSummary({
  reviewed,
  onBack,
  onAgain,
}: {
  reviewed: number;
  onBack: () => void;
  onAgain: () => void;
}) {
  return (
    <Card className="items-center gap-3 p-10">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <Text className="text-2xl">✓</Text>
      </View>
      <Text className="text-lg font-semibold text-slate-900">Session complete</Text>
      <Text className="text-center text-sm text-slate-500">
        You reviewed <Text className="font-semibold">{reviewed}</Text>{' '}
        {reviewed === 1 ? 'card' : 'cards'}. Nice.
      </Text>
      <View className="mt-2 w-full flex-row gap-2">
        <View className="flex-1">
          <Button variant="outline" onPress={onBack}>
            Back to deck
          </Button>
        </View>
        <View className="flex-1">
          <Button onPress={onAgain}>Practice again</Button>
        </View>
      </View>
    </Card>
  );
}
