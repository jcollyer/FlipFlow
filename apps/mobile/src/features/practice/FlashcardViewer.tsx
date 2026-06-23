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

import { Feather, FontAwesome } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Switch, Text, View } from 'react-native';

import type { AdvancedDifficultyLevel, BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import { ADVANCED_DIFFICULTY_LEVEL_OPTIONS, genderLabel } from '@ensemble/types';
import { Card } from '@/components/Card';
import { ClassBadge } from '@/components/ClassBadge';
import { trpc } from '@/lib/trpc';

// ── Rating definitions ─────────────────────────────────────────────────────────

export const RATINGS: {
  value: DifficultyLevel;
  label: string;
  sub: string;
  tone: string;
  selectedBg: string;
  selectedBorder: string;
}[] = [
  {
    value: 'challenging',
    label: 'Challenging',
    sub: 'Not yet',
    tone: 'border-orange-300',
    selectedBg: 'bg-orange-100',
    selectedBorder: 'border-orange-500',
  },
  {
    value: 'good',
    label: 'Good',
    sub: 'Warm',
    tone: 'border-blue-300',
    selectedBg: 'bg-blue-100',
    selectedBorder: 'border-blue-500',
  },
  {
    value: 'easy',
    label: 'Easy',
    sub: 'Got it',
    tone: 'border-green-300',
    selectedBg: 'bg-green-100',
    selectedBorder: 'border-green-500',
  },
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
  // Teaching notes have no answer side. We always show the front content (even
  // when "flipped"), hide the back text/audio/gender, and give the card an
  // amber treatment so notes are distinguishable from vocab cards.
  const isNote = cardClass === 'note';
  // Per-line audio is only meaningful on the back of a vocab card in a deck
  // with a configured language. There's no hover on a touch device, so every
  // line carries its own always-visible speaker button (replacing the old
  // single card-level button).
  const showLineAudio = flipped && !isNote && !!cardId && !!backLanguage;
  // Shared controller so every per-line button shares the TTS cache and only
  // one line ever plays at a time. Runs unconditionally (it only allocates a
  // tRPC handle + refs and does nothing until a button is pressed).
  const tts = useCardTts(backLanguage);
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-90">
      <Card
        className={`relative min-h-[280px] items-center justify-center p-6 ${
          isNote ? 'border-amber-300 bg-amber-50' : flipped ? 'border-primary bg-blue-50' : ''
        }`}
      >
        {cardClass ? (
          <View className="mb-3">
            <ClassBadge value={cardClass} size="md" />
          </View>
        ) : null}

        {showLineAudio ? (
          <View className="w-full flex-row items-center justify-center gap-2">
            <Text className="text-center text-xl font-bold leading-snug text-slate-900">
              {back}
            </Text>
            <LineSpeakerButton tts={tts} audioKey="main" texts={[back]} label="Hear this line" />
          </View>
        ) : (
          <Text
            className={`text-center leading-snug ${
              flipped && !isNote
                ? 'text-xl font-bold text-slate-900'
                : 'text-2xl font-bold text-slate-900'
            }`}
          >
            {isNote ? front : flipped ? back : front}
          </Text>
        )}

        {showLineAudio && tts.errorKey ? (
          <Text className="text-destructive mt-1 text-[10px]">Audio playback failed.</Text>
        ) : null}

        {flipped && pronunciation && !isNote ? (
          <Text className="mt-2 text-center text-base italic text-slate-500">{pronunciation}</Text>
        ) : null}

        {flipped && backExamples.length > 0 ? (
          <View className="mt-3 w-full gap-1 self-start pl-2">
            {backExamples.map((ex, i) =>
              showLineAudio ? (
                <View key={i} className="flex-row items-center gap-2">
                  <Text className="flex-1 text-sm italic text-slate-500">{ex}</Text>
                  <LineSpeakerButton
                    tts={tts}
                    audioKey={`ex:${i}`}
                    texts={[ex]}
                    label="Hear this line"
                  />
                </View>
              ) : (
                <Text key={i} className="text-sm italic text-slate-500">
                  {ex}
                </Text>
              ),
            )}
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

        {!isNote ? (
          <Text className="mt-6 text-xs uppercase tracking-wider text-slate-400">
            {flipped ? 'Answer' : 'Tap to reveal'}
          </Text>
        ) : null}

        {/* Gender indicator — bottom-left of the back face. */}
        {flipped && gender && !isNote ? (
          <View className="absolute bottom-3 left-3 z-10">
            <Text className="text-xs italic text-slate-500">{genderLabel(gender)}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

// ── useCardTts ─────────────────────────────────────────────────────────────────

type TtsStatus = 'idle' | 'loading' | 'playing';

/** Speaking rate used when the user taps a line a second time. */
const SLOW_SPEAKING_RATE = 0.6;

export interface CardTtsController {
  /** Begin playing `texts` under the given key at an optional speaking rate. */
  play: (key: string, texts: string[], speakingRate?: number) => void;
  /**
   * Play a single line, toggling speed on repeat taps: first tap plays at
   * normal speed, a second consecutive tap on the same line plays slowly, a
   * third returns to normal. Switching lines resets to normal speed.
   */
  playLine: (key: string, texts: string[]) => void;
  /** Key of the segment currently loading/playing, or null when idle. */
  activeKey: string | null;
  /** Playback state of the active key. */
  status: TtsStatus;
  /** True while the active playback is the slowed-down variant. */
  slow: boolean;
  /** Key whose last play attempt errored, or null. */
  errorKey: string | null;
}

/**
 * Shared TTS controller for one flashcard back face. Mirrors the web version:
 * one rate-keyed cache so a phrase is never re-synthesized (or re-billed),
 * and a single expo-av sound so only one line plays at a time.
 */
export function useCardTts(languageCode: BackLanguageValue | null): CardTtsController {
  const synthesize = trpc.tts.synthesize.useMutation();

  // `${rate}:${text}` -> data URL, so normal and slow renderings cache apart.
  const cacheRef = useRef<Map<string, string>>(new Map());
  const soundRef = useRef<Audio.Sound | null>(null);
  const runTokenRef = useRef<symbol | null>(null);
  // Toggle bookkeeping for `playLine`.
  const lastLineKeyRef = useRef<string | null>(null);
  const lastLineSlowRef = useRef(false);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [slow, setSlow] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

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
    async (segment: string, speakingRate: number): Promise<string> => {
      const cacheKey = `${speakingRate}:${segment}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) return cached;
      const { audioContent } = await synthesize.mutateAsync({
        text: segment,
        languageCode: languageCode as BackLanguageValue,
        // Omit when normal so the server uses Google's default 1.0.
        ...(speakingRate !== 1 ? { speakingRate } : {}),
      });
      const dataUrl = `data:audio/mp3;base64,${audioContent}`;
      cacheRef.current.set(cacheKey, dataUrl);
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

          sound.setOnPlaybackStatusUpdate((s: AVPlaybackStatus) => {
            if (!s.isLoaded) {
              if ('error' in s && s.error) {
                reject(new Error('Audio playback failed.'));
              }
              return;
            }
            if (s.didJustFinish) {
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

  const play = useCallback(
    (key: string, texts: string[], speakingRate = 1) => {
      void (async () => {
        if (soundRef.current) {
          await soundRef.current.stopAsync().catch(() => {});
        }
        setErrorKey(null);

        const token = Symbol();
        runTokenRef.current = token;
        const isActive = () => runTokenRef.current === token;

        setActiveKey(key);
        setSlow(speakingRate < 1);
        setStatus('loading');
        try {
          const dataUrls: string[] = [];
          for (const segment of texts) {
            if (!isActive()) return;
            dataUrls.push(await fetchAudio(segment, speakingRate));
          }

          if (!isActive()) return;
          setStatus('playing');

          for (let i = 0; i < dataUrls.length; i++) {
            if (!isActive()) break;
            await playSingle(dataUrls[i] as string);
            if (i < dataUrls.length - 1 && isActive()) {
              await new Promise<void>((resolve) => setTimeout(resolve, 400));
            }
          }
        } catch {
          if (isActive()) setErrorKey(key);
        } finally {
          if (isActive()) {
            setStatus('idle');
            setActiveKey(null);
            setSlow(false);
          }
        }
      })();
    },
    [fetchAudio, playSingle],
  );

  const playLine = useCallback(
    (key: string, texts: string[]) => {
      const slowThisTime = lastLineKeyRef.current === key ? !lastLineSlowRef.current : false;
      lastLineKeyRef.current = key;
      lastLineSlowRef.current = slowThisTime;
      play(key, texts, slowThisTime ? SLOW_SPEAKING_RATE : 1);
    },
    [play],
  );

  return { play, playLine, activeKey, status, slow, errorKey };
}

// ── LineSpeakerButton ──────────────────────────────────────────────────────────

/**
 * A small speaker shown beside a single line of back-of-card text. Tapping it
 * plays just that line; tapping again plays it slower. While the line is
 * playing, the icon does a gentle pulse — slower when the slow variant is
 * playing — so the animation tracks the speech.
 */
export function LineSpeakerButton({
  tts,
  audioKey,
  texts,
  label,
}: {
  tts: CardTtsController;
  audioKey: string;
  texts: string[];
  label: string;
}) {
  const isActive = tts.activeKey === audioKey;
  const loading = isActive && tts.status === 'loading';
  const playing = isActive && tts.status === 'playing';
  const slow = isActive && tts.slow;

  // Gentle scale pulse while speaking, using core RN Animated (native driver,
  // no extra deps). Slower cadence for the slowed-down clip so the animation
  // tracks the speech.
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!playing) {
      scale.setValue(1);
      return;
    }
    const duration = slow ? 550 : 300;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.22, duration, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [playing, slow, scale]);

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        tts.playLine(audioKey, texts);
      }}
      disabled={loading}
      accessibilityLabel={playing ? 'Playing line' : label}
      accessibilityRole="button"
      hitSlop={8}
      className={`border-border h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white active:opacity-70 ${
        playing ? 'bg-blue-50' : ''
      }`}
      style={{ opacity: loading ? 0.6 : 1 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#5584bb" />
      ) : (
        <Animated.View style={{ transform: [{ scale }] }}>
          <Feather name="volume-2" size={16} color="#5584bb" />
        </Animated.View>
      )}
    </Pressable>
  );
}

// ── FavoriteButton ─────────────────────────────────────────────────────────────

/**
 * Heart-icon toggle for the per-user "favorite" flag. Lives to the right of
 * the three rating buttons in simple mode and as a visually-distinct 8th
 * row in the advanced panel.
 *
 * Filled rose heart = favorited; outline = not. Sized narrower than the
 * rating buttons so Challenging / Good / Easy keep their visual weight as
 * the primary affordances.
 */
export function FavoriteButton({
  favorite,
  onToggle,
  disabled,
}: {
  favorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite, disabled }}
      accessibilityLabel={favorite ? 'Unfavorite' : 'Favorite'}
      hitSlop={6}
      className={`items-center justify-center rounded-lg border bg-white px-3 py-3 active:opacity-70 ${
        favorite ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <FontAwesome
        name={favorite ? 'heart' : 'heart-o'}
        size={20}
        color={favorite ? '#e11d48' : '#94a3b8'}
      />
    </Pressable>
  );
}

// ── RatingButtons ──────────────────────────────────────────────────────────────

export function RatingButtons({
  onRate,
  disabled,
  favorite,
  onToggleFavorite,
  initialDifficulty,
}: {
  onRate: (level: DifficultyLevel) => void;
  disabled?: boolean;
  /**
   * Optional favorite state. When provided, a heart toggle is rendered to
   * the right of the three rating buttons. Omitting both `favorite` and
   * `onToggleFavorite` hides the heart entirely.
   */
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Pre-select this rating on mount to reflect the card's saved difficultyLevel. */
  initialDifficulty?: DifficultyLevel | null;
}) {
  const [selected, setSelected] = useState<DifficultyLevel | null>(initialDifficulty ?? null);
  const showFavorite = favorite !== undefined && onToggleFavorite !== undefined;
  return (
    <View className="mt-6 flex-row items-stretch gap-2">
      {RATINGS.map((r) => {
        const isSelected = selected === r.value;
        return (
          <Pressable
            key={r.value}
            onPress={() => {
              setSelected(r.value);
              onRate(r.value);
            }}
            disabled={disabled}
            className={`min-w-0 flex-1 items-center rounded-lg border px-2 py-3 active:opacity-70 ${
              isSelected ? `${r.selectedBg} ${r.selectedBorder}` : `bg-white ${r.tone}`
            } ${disabled ? 'opacity-50' : ''}`}
          >
            <Text className="text-base font-semibold text-slate-900">{r.label}</Text>
            <Text className="text-xs text-slate-500">{r.sub}</Text>
          </Pressable>
        );
      })}
      {showFavorite ? (
        <FavoriteButton favorite={favorite} onToggle={onToggleFavorite} disabled={disabled} />
      ) : null}
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
  onChange,
  disabled,
  initial,
  favorite,
  onToggleFavorite,
}: {
  onChange: (advanced: AdvancedDifficultyLevel[]) => void;
  disabled?: boolean;
  initial?: readonly AdvancedDifficultyLevel[];
  /**
   * Optional favorite state. When both are provided, the panel renders an
   * 8th row at the bottom of the checkbox list (visually distinct, heart
   * icon, rose-tint when active) that toggles the per-user favorite column
   * independently of the rating selection.
   *
   * Intentionally NOT part of the do_not_know / know_all mutual-exclusion
   * rules — it lives outside the rating set.
   */
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const showFavorite = favorite !== undefined && onToggleFavorite !== undefined;
  const [selected, setSelected] = useState<Set<AdvancedDifficultyLevel>>(() => {
    if (initial && initial.length > 0) return new Set(initial);
    // No saved rating — start with nothing checked so NULL stays NULL until
    // the user makes an explicit selection.
    return new Set();
  });

  function getNextSelected(
    prev: ReadonlySet<AdvancedDifficultyLevel>,
    value: AdvancedDifficultyLevel,
  ): Set<AdvancedDifficultyLevel> {
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
        if (next.size === 1) return new Set(prev);
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
  }

  function toggle(value: AdvancedDifficultyLevel) {
    const next = getNextSelected(selected, value);
    setSelected(next);
    onChange(Array.from(next) as AdvancedDifficultyLevel[]);
  }

  return (
    <View className="mt-2 gap-3 rounded-lg border border-slate-200 bg-white p-3">
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

      {/* Favorite — visually distinct 8th row that toggles the per-user
          favorite column independently of the rating selection. Top border
          + heart icon + rose tint when active signal that it's a different
          kind of action from the 7 advanced-rating checkboxes above. */}
      {showFavorite ? (
        <Pressable
          onPress={() => onToggleFavorite?.()}
          disabled={disabled}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: favorite }}
          accessibilityLabel="Favorite"
          className={`-mx-1 mt-1 flex-row items-center gap-3 rounded-md border-t border-slate-200 px-3 py-2.5 pt-3 active:bg-rose-50 ${
            disabled ? 'opacity-60' : ''
          } ${favorite ? 'bg-rose-50/60' : ''}`}
        >
          <View
            className={`h-5 w-5 items-center justify-center rounded border ${
              favorite ? 'border-rose-500 bg-rose-500' : 'border-slate-300 bg-white'
            }`}
          >
            {favorite ? <Feather name="check" size={14} color="#ffffff" /> : null}
          </View>
          <FontAwesome
            name={favorite ? 'heart' : 'heart-o'}
            size={16}
            color={favorite ? '#e11d48' : '#94a3b8'}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-slate-900">Favorite</Text>
            <Text className="text-xs text-slate-500">
              Mark this card to find it quickly in the Favorite filter
            </Text>
          </View>
        </Pressable>
      ) : null}
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
  initialDifficulty,
  favorite,
  onToggleFavorite,
}: {
  onRate: (level?: DifficultyLevel, advanced?: AdvancedDifficultyLevel[]) => void;
  disabled?: boolean;
  initialAdvanced?: readonly AdvancedDifficultyLevel[];
  /** Pre-select this rating on mount to reflect the card's saved difficultyLevel. */
  initialDifficulty?: DifficultyLevel | null;
  /**
   * Current favorite state and toggle callback. Threaded into both the
   * simple and advanced sub-panels. Omit both to hide the heart entirely
   * (e.g. public-deck read-only views).
   */
  favorite?: boolean;
  onToggleFavorite?: () => void;
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
      <RatingButtons
        disabled={disabled}
        onRate={(level) => onRate(level)}
        favorite={favorite}
        onToggleFavorite={onToggleFavorite}
        initialDifficulty={initialDifficulty}
      />
      <View className="flex-row items-center justify-end gap-2">
        <Text className="text-xs text-slate-500">Advanced rating</Text>
        <Switch value={advanced} onValueChange={handleToggle} disabled={disabled} />
      </View>
      {advanced ? (
        <AdvancedRatingPanel
          disabled={disabled}
          initial={initialAdvanced}
          onChange={(values) => onRate(undefined, values)}
        />
      ) : null}
    </View>
  );
}
