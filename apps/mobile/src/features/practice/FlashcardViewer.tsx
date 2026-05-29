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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import type { AdvancedDifficultyLevel, BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import {
  ADVANCED_DIFFICULTY_LEVEL_OPTIONS,
  difficultyLevelFromAdvanced,
  genderLabel,
} from '@ensemble/types';
import { Card } from '@/components/Card';
import { ClassBadge } from '@/components/ClassBadge';
import { trpc } from '@/lib/trpc';

// ── Rating definitions ─────────────────────────────────────────────────────────

export const RATINGS: { value: DifficultyLevel; label: string; sub: string; tone: string }[] = [
  { value: 'challenging', label: 'Challenging', sub: 'Not yet', tone: 'border-orange-300' },
  { value: 'good', label: 'Good', sub: 'Warm', tone: 'border-blue-300' },
  { value: 'easy', label: 'Easy', sub: 'Got it', tone: 'border-green-300' },
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
  gender,
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
  gender?: string | null;
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

        {/* Gender indicator — bottom-left of the back face. */}
        {flipped && gender ? (
          <View className="absolute bottom-3 left-3 z-10">
            <Text className="text-xs italic text-slate-500">{genderLabel(gender)}</Text>
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
          <ActivityIndicator size="small" color="#5584bb" />
        ) : (
          <Feather name="volume-2" size={18} color="#5584bb" />
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
  onRate: (level: DifficultyLevel) => void;
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

// ── AdvancedRatingPanel ────────────────────────────────────────────────────────

/**
 * React Native equivalent of the web AdvancedRatingPanel. Replaces the three
 * Challenging/Good/Easy buttons with seven detailed checkbox-style rows.
 *
 * Interaction rules mirror the web version exactly:
 *   - "Know all" auto-ticks the five middle options (definition / gender /
 *     pronunciation / audibly / spelling) but NOT "Do not know".
 *   - "Do not know" is mutually exclusive with everything else — ticking it
 *     clears any other selection; ticking a middle option drops it.
 *   - The panel always has at least one box checked so a submit is never
 *     ambiguous. Unticking the last box falls back to the "Do not know"
 *     sentinel.
 *   - When every middle option is ticked by hand, "Know all" auto-ticks too.
 */
export function AdvancedRatingPanel({
  onSubmit,
  disabled,
  initial,
}: {
  onSubmit: (level: DifficultyLevel, advanced: AdvancedDifficultyLevel[]) => void;
  disabled?: boolean;
  initial?: readonly AdvancedDifficultyLevel[];
}) {
  const [selected, setSelected] = useState<Set<AdvancedDifficultyLevel>>(() => {
    if (initial && initial.length > 0) return new Set(initial);
    return new Set(['do_not_know']);
  });

  function toggle(value: AdvancedDifficultyLevel) {
    setSelected((prev) => {
      const next = new Set(prev);
      const isChecked = next.has(value);

      if (value === 'know_all') {
        if (isChecked) {
          // Unticking "Know all" leaves nothing checked; fall back to the
          // sentinel so the panel always has a coherent state.
          return new Set(['do_not_know']);
        }
        return new Set<AdvancedDifficultyLevel>([
          'know_definition',
          'know_gender',
          'know_pronunciation',
          'know_audibly',
          'know_spelling',
          'know_all',
        ]);
      }

      if (value === 'do_not_know') {
        if (isChecked) {
          if (next.size === 1) return prev;
          next.delete('do_not_know');
          return next;
        }
        return new Set(['do_not_know']);
      }

      if (isChecked) {
        next.delete(value);
        if (next.size === 0) return new Set(['do_not_know']);
        next.delete('know_all');
        return next;
      }
      next.add(value);
      next.delete('do_not_know');
      const middleFiveCovered =
        next.has('know_definition') &&
        next.has('know_gender') &&
        next.has('know_pronunciation') &&
        next.has('know_audibly') &&
        next.has('know_spelling');
      if (middleFiveCovered) next.add('know_all');
      else next.delete('know_all');
      return next;
    });
  }

  function handleSubmit() {
    const values = Array.from(selected) as AdvancedDifficultyLevel[];
    const level = difficultyLevelFromAdvanced(values) ?? 'good';
    onSubmit(level, values);
  }

  return (
    <View className="mt-6 gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <View className="gap-1">
        {ADVANCED_DIFFICULTY_LEVEL_OPTIONS.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => toggle(opt.value)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={opt.label}
              className={`flex-row items-start gap-3 rounded-md px-2 py-2 active:bg-slate-50 ${
                disabled ? 'opacity-60' : ''
              }`}
            >
              {/* Hand-rolled checkbox so we don't pull in another dependency.
                  The 4px inner square gives a clear "ticked" affordance and
                  inherits the primary color when checked. */}
              <View
                className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                  checked ? 'border-blue-500 bg-blue-500' : 'border-slate-300 bg-white'
                }`}
              >
                {checked ? <Feather name="check" size={14} color="#ffffff" /> : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium text-slate-900">{opt.label}</Text>
                <Text className="text-xs text-slate-500">{opt.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={handleSubmit}
        disabled={disabled}
        accessibilityRole="button"
        className={`items-center rounded-md bg-blue-500 px-3 py-3 active:opacity-80 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <Text className="text-sm font-semibold text-white">Submit rating</Text>
      </Pressable>
    </View>
  );
}

// ── RatingPanel ────────────────────────────────────────────────────────────────

/**
 * AsyncStorage key for the global "Advanced rating" toggle preference. Same
 * UX contract as the web (window.localStorage on that side): once the user
 * flips the switch on, every subsequent card opens in advanced mode until
 * they flip it back off — across cards, screens, and app launches.
 */
const ADVANCED_RATING_PREF_KEY = 'ensemble:rating:advanced';

/**
 * Wraps the simple three-button picker and the seven-checkbox advanced
 * picker behind a single "Advanced rating" toggle so every caller (the
 * full-screen practice flow, the preview modal) gets identical UX and
 * persistence rules without each one re-implementing the switch.
 *
 * If a card already has an advanced rating, we open in advanced mode for
 * that card regardless of the global pref (so re-rating never silently
 * downgrades). Explicit toggle flips persist the new global pref.
 */
export function RatingPanel({
  onRate,
  disabled,
  initialAdvanced,
}: {
  onRate: (level: DifficultyLevel, advanced?: AdvancedDifficultyLevel[]) => void;
  disabled?: boolean;
  initialAdvanced?: readonly AdvancedDifficultyLevel[];
}) {
  // Default: open advanced if this card already has an advanced rating.
  // Otherwise wait for the AsyncStorage read below to fill in the pref. We
  // can't read AsyncStorage synchronously, so the first paint may flicker
  // from the three-button view to the seven-checkbox view if the global
  // pref is on — that's acceptable on mobile (rendering happens after Flip)
  // and matches the React Native idiom for persisted prefs.
  const [advanced, setAdvanced] = useState<boolean>(() => (initialAdvanced?.length ?? 0) > 0);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ADVANCED_RATING_PREF_KEY);
        if (cancelled) return;
        // Don't clobber a user flip that happened while we were reading
        // storage — `userTouchedRef` tracks that case.
        if (userTouchedRef.current) return;
        if (raw === 'true') setAdvanced(true);
        else if (raw === 'false' && (initialAdvanced?.length ?? 0) === 0) {
          // Explicit "off" pref only applies when the card has no existing
          // advanced selection. Otherwise the re-rate UX wins.
          setAdvanced(false);
        }
      } catch {
        // Storage may be unavailable; the in-memory default is fine.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialAdvanced]);

  function handleToggle(next: boolean) {
    userTouchedRef.current = true;
    setAdvanced(next);
    // Persist the user's intent. Failures are non-fatal; the toggle still
    // works in-memory for the rest of the session.
    AsyncStorage.setItem(ADVANCED_RATING_PREF_KEY, String(next)).catch(() => {});
  }

  return (
    <View className="mt-6 gap-2">
      <View className="flex-row items-center justify-end gap-2">
        <Text className="text-xs text-slate-500">Advanced rating</Text>
        <Switch value={advanced} onValueChange={handleToggle} disabled={disabled} />
      </View>
      {advanced ? (
        <AdvancedRatingPanel
          disabled={disabled}
          initial={initialAdvanced}
          onSubmit={(level, values) => onRate(level, values)}
        />
      ) : (
        <RatingButtons disabled={disabled} onRate={(level) => onRate(level)} />
      )}
    </View>
  );
}
