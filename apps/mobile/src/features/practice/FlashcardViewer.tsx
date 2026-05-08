/**
 * Shared React Native primitives for the flashcard flip UI.
 *
 * Used by both:
 *  - PracticeScreen  (the full practice flow)
 *  - FlashcardPreviewModal  (tap-to-preview from card lists)
 *
 * Keeping them here avoids duplicating the card face rendering,
 * audio-button caching logic, and rating button layout.
 */

import { Feather } from '@expo/vector-icons';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { BackLanguageValue } from '@ensemble/types';
import { Card } from '@/components/Card';
import { ClassBadge } from '@/components/ClassBadge';
import { trpc } from '@/lib/trpc';

// ── Rating definitions ─────────────────────────────────────────────────────────

export const RATINGS: { value: number; label: string; sub: string; tone: string }[] = [
  { value: 2, label: 'Challenging', sub: 'Not yet', tone: 'border-orange-300' },
  { value: 3, label: 'Good', sub: 'Warm', tone: 'border-blue-300' },
  { value: 5, label: 'Easy', sub: 'Got it', tone: 'border-green-300' },
];

// ── NavButton ──────────────────────────────────────────────────────────────────

export function NavButton({
  direction,
  onPress,
  disabled,
}: {
  direction: 'prev' | 'next';
  onPress: () => void;
  disabled: boolean;
}) {
  const isPrev = direction === 'prev';
  const label = isPrev ? 'Previous card' : 'Next card';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      className={`border-border w-12 items-center justify-center rounded-md border bg-white active:opacity-70 ${
        disabled ? 'opacity-30' : ''
      }`}
    >
      <Feather name={isPrev ? 'chevron-left' : 'chevron-right'} size={22} color="#0f172a" />
    </Pressable>
  );
}

// ── FlipCard ───────────────────────────────────────────────────────────────────

/**
 * Tappable card that shows either the front or the back of a flashcard.
 * On mobile there is no 3D CSS flip — we simply swap the content on press,
 * mirroring the original PracticeScreen behaviour.
 */
export function FlipCard({
  front,
  back,
  frontExamples,
  backExamples,
  cardClass,
  pronunciation,
  flipped,
  onPress,
  cardId,
  backLanguage,
}: {
  front: string;
  back: string;
  frontExamples: string[];
  backExamples: string[];
  cardClass: string | null;
  pronunciation: string | null;
  flipped: boolean;
  onPress: () => void;
  cardId: string | undefined;
  backLanguage: BackLanguageValue | null;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-90">
      <Card
        className={`relative min-h-[280px] items-center justify-center p-6 ${
          flipped ? 'border-primary bg-blue-50' : ''
        }`}
      >
        {cardClass ? (
          <View className="mb-3">
            <ClassBadge value={cardClass} size="md" />
          </View>
        ) : null}

        <Text
          className={`text-center leading-snug ${
            flipped ? 'text-xl font-bold text-slate-900' : 'text-2xl font-bold text-slate-900'
          }`}
        >
          {flipped ? back : front}
        </Text>

        {flipped && pronunciation ? (
          <Text className="mt-2 text-center text-base italic text-slate-500">{pronunciation}</Text>
        ) : null}

        {flipped && backExamples.length > 0 ? (
          <View className="mt-3 w-full gap-1 self-start pl-2">
            {backExamples.map((ex, i) => (
              <Text key={i} className="text-sm italic text-slate-500">
                {ex}
              </Text>
            ))}
          </View>
        ) : !flipped && frontExamples.length > 0 ? (
          <View className="mt-3 w-full gap-1 self-start pl-2">
            {frontExamples.map((ex, i) => (
              <Text key={i} className="text-sm italic text-slate-500">
                {ex}
              </Text>
            ))}
          </View>
        ) : null}

        <Text className="mt-6 text-xs uppercase tracking-wider text-slate-400">
          {flipped ? 'Answer' : 'Tap to reveal'}
        </Text>

        {flipped && cardId && backLanguage ? (
          <View className="absolute right-3 top-3 z-10">
            <AudioButton
              cardId={cardId}
              text={back}
              examples={backExamples}
              languageCode={backLanguage}
            />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

// ── AudioButton ────────────────────────────────────────────────────────────────

/**
 * Speaker button that fetches TTS audio for the back text + examples and
 * plays them sequentially. Uses expo-av and an in-memory cache so the same
 * phrase is never re-synthesized within a session.
 */
export function AudioButton({
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

  const cacheRef = useRef<Map<string, string>>(new Map());
  const soundRef = useRef<Audio.Sound | null>(null);
  const runTokenRef = useRef<symbol | null>(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      runTokenRef.current = null;
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const fetchAudio = useCallback(
    async (segment: string): Promise<string> => {
      const cached = cacheRef.current.get(segment);
      if (cached) return cached;
      const { audioContent } = await synthesize.mutateAsync({ text: segment, languageCode });
      const dataUrl = `data:audio/mp3;base64,${audioContent}`;
      cacheRef.current.set(segment, dataUrl);
      return dataUrl;
    },
    [synthesize, languageCode],
  );

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
      const dataUrls: string[] = [];
      for (const segment of texts) {
        if (!isActive()) return;
        dataUrls.push(await fetchAudio(segment));
      }

      if (!isActive()) return;
      setLoading(false);
      setPlaying(true);

      for (let i = 0; i < dataUrls.length; i++) {
        if (!isActive()) break;
        await playSingle(dataUrls[i] as string);
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
        onPress={(event) => {
          event.stopPropagation();
          void handlePress();
        }}
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

// ── RatingButtons ──────────────────────────────────────────────────────────────

export function RatingButtons({
  onRate,
  disabled,
}: {
  onRate: (q: number) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mt-6 flex-row gap-2">
      {RATINGS.map((r) => (
        <Pressable
          key={r.value}
          onPress={() => onRate(r.value)}
          disabled={disabled}
          className={`min-w-0 flex-1 items-center rounded-lg border bg-white px-2 py-3 active:opacity-70 ${r.tone} ${
            disabled ? 'opacity-50' : ''
          }`}
        >
          <Text className="text-base font-semibold text-slate-900">{r.label}</Text>
          <Text className="text-xs text-slate-500">{r.sub}</Text>
        </Pressable>
      ))}
    </View>
  );
}
