'use client';

/**
 * Shared primitives for the flashcard flip UI.
 *
 * These are used by both:
 *  - PracticeSession  (the full /practice page)
 *  - FlashcardPreviewModal  (click-to-preview from card lists)
 *
 * Keeping them here avoids duplicating the CSS flip animation,
 * the audio-button caching logic, and the rating button layout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Loader2, Volume2 } from 'lucide-react';

import type { AdvancedDifficultyLevel, BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import { ADVANCED_DIFFICULTY_LEVEL_OPTIONS, genderLabel } from '@ensemble/types';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ClassBadge } from '@/features/cards/ClassBadge';

// ── Rating definitions ─────────────────────────────────────────────────────────

export const RATINGS: {
  value: DifficultyLevel;
  label: string;
  sub: string;
  tone: string;
  selectedTone: string;
}[] = [
  {
    value: 'challenging',
    label: 'Challenging',
    sub: 'Not yet',
    tone: 'border-orange-500/40 hover:bg-orange-500/10',
    selectedTone: 'border-orange-500 bg-orange-500/20 hover:bg-orange-500/25',
  },
  {
    value: 'good',
    label: 'Good',
    sub: 'Warm',
    tone: 'border-blue-500/40 hover:bg-blue-500/10',
    selectedTone: 'border-blue-500 bg-blue-500/20 hover:bg-blue-500/25',
  },
  {
    value: 'easy',
    label: 'Easy',
    sub: 'Got it',
    tone: 'border-green-500/40 hover:bg-green-500/10',
    selectedTone: 'border-green-500 bg-green-500/20 hover:bg-green-500/25',
  },
];

// ── NavButton ──────────────────────────────────────────────────────────────────

export function NavButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
}) {
  const isPrev = direction === 'prev';
  const Icon = isPrev ? ChevronLeft : ChevronRight;
  const label = isPrev ? 'Previous card' : 'Next card';
  const hint = isPrev ? 'Left arrow' : 'Right arrow';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label} (${hint})`}
      title={`${label} (${hint})`}
      className={cn(
        'bg-background hover:bg-muted focus:ring-ring inline-flex w-10 shrink-0 items-center justify-center self-stretch rounded-md border transition sm:w-12',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:hover:bg-background disabled:cursor-not-allowed disabled:opacity-30',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

// ── FlipCard ───────────────────────────────────────────────────────────────────

export function FlipCard({
  front,
  back,
  frontExamples,
  backExamples,
  cardClass,
  gender,
  pronunciation,
  flipped,
  onClick,
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
  onClick: () => void;
  cardId: string | undefined;
  backLanguage: BackLanguageValue | null;
}) {
  // Teaching notes have no answer side. We hide the back text/audio/gender and
  // mirror the front content onto the back face (so a flip never lands on a
  // blank card), with an amber treatment to distinguish notes from vocab.
  const isNote = cardClass === 'note';
  // Audio is only meaningful for vocab cards in a deck with a configured
  // language. When that holds we render per-line speakers + the play-all
  // button; otherwise no audio UI at all.
  const showLineAudio = !isNote && !!backLanguage && !!cardId;
  // Single controller shared by the play-all button and every per-line
  // button so they share the TTS cache and never play over each other.
  // (The hook runs unconditionally — it only allocates a tRPC mutation
  // handle and some refs, and does no work until a button is clicked.)
  const tts = useCardTts(backLanguage);
  // Click-to-play: clicking a line plays just that line. We stop propagation
  // so the click doesn't also bubble up to the FlipCard button and flip the
  // card — flipping still works by clicking anywhere else on the face.
  const linePlay = (e: React.MouseEvent, key: string, texts: string[]) => {
    e.stopPropagation();
    e.preventDefault();
    tts.playLine(key, texts);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flip-card block h-full min-h-72 w-full select-text outline-none',
        flipped && 'is-flipped',
      )}
      aria-label={flipped ? 'Hide answer' : 'Flip'}
    >
      <div className="flip-card-inner">
        <Card
          className={cn(
            'flip-card-face flex items-center justify-center p-6 text-center shadow-md',
            isNote && 'border-amber-300 bg-amber-50',
          )}
        >
          <CardContent className="w-full space-y-3">
            {cardClass ? (
              <div className="flex justify-center">
                <ClassBadge value={cardClass} size="md" />
              </div>
            ) : null}
            <p className="text-2xl font-bold leading-snug">{front}</p>
            {frontExamples.length > 0 ? (
              <ul className="space-y-1 text-left">
                {frontExamples.map((ex, i) => (
                  <li key={i} className="text-muted-foreground pl-4 text-base italic">
                    {ex}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
        <Card
          className={cn(
            'flip-card-face flip-card-back relative flex items-stretch justify-center p-6 text-center shadow-md',
            isNote ? 'border-amber-300 bg-amber-50' : 'border-primary/40 bg-primary/5',
          )}
        >
          <CardContent className="flex h-full w-full flex-col gap-3 pb-0">
            {cardClass ? (
              <div className="flex justify-center">
                <ClassBadge value={cardClass} size="md" />
              </div>
            ) : null}
            {/* Per-line audio: each line gets its own speaker that plays just
                that line. On desktop the buttons reveal on hover (the card
                still has the play-all button top-right); on mobile they're
                always visible and the play-all button is hidden. */}
            {showLineAudio ? (
              <div
                className="group/line flex cursor-pointer items-center justify-center gap-2"
                onClick={(e) => linePlay(e, 'main', [back])}
              >
                <p className="text-xl font-bold leading-snug">{back}</p>
                <LineSpeakerButton
                  tts={tts}
                  audioKey="main"
                  texts={[back]}
                  label="Hear this line"
                />
              </div>
            ) : (
              <p className="text-xl font-bold leading-snug">{isNote ? front : back}</p>
            )}
            {backExamples.length > 0 ? (
              <ul className="w-fit space-y-[5px] divide-y divide-gray-200 text-left">
                {backExamples.map((ex, i) => (
                  <li key={i} className="pt-1 text-base">
                    {showLineAudio ? (
                      <span
                        className="group/line flex cursor-pointer items-center gap-2"
                        onClick={(e) => linePlay(e, `ex:${i}`, [ex])}
                      >
                        <span>{ex}</span>
                        <LineSpeakerButton
                          tts={tts}
                          audioKey={`ex:${i}`}
                          texts={[ex]}
                          label="Hear this line"
                        />
                      </span>
                    ) : (
                      ex
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {!isNote && pronunciation && (
              <p className="text-muted-foreground mt-auto text-right italic">[{pronunciation}]</p>
            )}
          </CardContent>
          {/* Gender indicator — bottom-left of the back face. */}
          {!isNote && gender ? (
            <span className="text-muted-foreground absolute bottom-3 left-3 text-xs italic">
              {genderLabel(gender)}
            </span>
          ) : null}
          {/* Card-level play-all button (back text + every example). Kept on
              desktop as a convenient "hear the whole card" affordance; hidden
              on mobile, where the per-line buttons take over (no hover there). */}
          {showLineAudio ? <CardAudioButton tts={tts} texts={[back, ...backExamples]} /> : null}
        </Card>
      </div>
    </button>
  );
}

// ── useCardTts ─────────────────────────────────────────────────────────────────

type TtsStatus = 'idle' | 'loading' | 'playing';

/** Speaking rate used when the user clicks a line a second time. */
const SLOW_SPEAKING_RATE = 0.6;

export interface CardTtsController {
  /** Begin playing `texts` (one or many segments) under the given key. */
  play: (key: string, texts: string[], speakingRate?: number) => void;
  /**
   * Play a single line, toggling speed on repeat clicks: the first click on a
   * line plays at normal speed, a second consecutive click on the same line
   * plays slowly, a third returns to normal, and so on. Switching to a
   * different line resets back to normal speed.
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
 * Shared TTS controller for one flashcard back face.
 *
 * A single controller backs both the card-level "play all" button and every
 * per-line button. Centralizing it means:
 *  - one in-memory cache keyed by text content, so a phrase is never
 *    re-synthesized (and never re-billed) whether played alone or as part of
 *    the whole-card sequence;
 *  - only one clip ever plays at a time — clicking any button cancels
 *    whatever was already playing and restarts from its own first segment;
 *  - each button can show its own loading/playing state by comparing its key
 *    against `activeKey`.
 *
 * `stopPropagation` is still required at each button (handled in the button
 * components) because the buttons are nested inside the FlipCard `<button>`.
 */
export function useCardTts(languageCode: BackLanguageValue | null): CardTtsController {
  const synthesize = trpc.tts.synthesize.useMutation();

  // text content -> data URL cache so the same phrase is never re-billed.
  const cacheRef = useRef<Map<string, string>>(new Map());
  // Holds the currently-playing element so re-clicks restart cleanly.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Symbol token to cancel an in-flight sequence when the user clicks again.
  const runTokenRef = useRef<symbol | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [slow, setSlow] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Toggle bookkeeping for `playLine`: the last line key played and whether
  // that play was the slow variant. A repeat click on the same key flips it.
  const lastLineKeyRef = useRef<string | null>(null);
  const lastLineSlowRef = useRef(false);

  // If the user navigates away mid-playback the parent unmounts; stop the
  // audio so it doesn't keep playing in the background.
  useEffect(() => {
    return () => {
      runTokenRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Fetch (or return cached) TTS audio for a single text segment at a given
  // speaking rate. The cache key includes the rate so the normal and slow
  // renderings of the same phrase are stored (and billed) separately.
  const fetchAudio = useCallback(
    async (t: string, speakingRate: number): Promise<string> => {
      const cacheKey = `${speakingRate}:${t}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) return cached;
      if (!languageCode) throw new Error('No language configured.');
      const { audioContent } = await synthesize.mutateAsync({
        text: t,
        languageCode,
        // Omit when normal so the server uses Google's default 1.0.
        ...(speakingRate !== 1 ? { speakingRate } : {}),
      });
      const dataUrl = `data:audio/mp3;base64,${audioContent}`;
      cacheRef.current.set(cacheKey, dataUrl);
      return dataUrl;
    },
    [synthesize, languageCode],
  );

  // Play a single audio data URL; resolves when the clip ends.
  const playSingle = useCallback((dataUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      audioRef.current?.pause();
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      audio.addEventListener('ended', () => resolve());
      audio.addEventListener('error', () => reject(new Error('Audio playback failed.')));
      audio.play().catch(reject);
    });
  }, []);

  const play = useCallback(
    (key: string, texts: string[], speakingRate = 1) => {
      void (async () => {
        // Cancel any running sequence.
        audioRef.current?.pause();
        audioRef.current = null;
        setErrorKey(null);

        const token = Symbol();
        runTokenRef.current = token;
        const isActive = () => runTokenRef.current === token;

        setActiveKey(key);
        setSlow(speakingRate < 1);
        setStatus('loading');
        try {
          // Pre-fetch all segments sequentially (uses cache on repeat plays).
          const dataUrls: string[] = [];
          for (const t of texts) {
            if (!isActive()) return;
            dataUrls.push(await fetchAudio(t, speakingRate));
          }

          if (!isActive()) return;
          setStatus('playing');

          // Play segments with a 400 ms pause between each.
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

  // Per-line play with a speed toggle: same line twice in a row → slow; a
  // third time → normal again; switching lines resets to normal.
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

// ── CardAudioButton ──────────────────────────────────────────────────────────

/**
 * The card-level "play all" speaker: top-right of the back face, plays the
 * back text followed by every example. Hidden on mobile (`hidden sm:flex`),
 * where the per-line buttons take over because there's no hover.
 */
export function CardAudioButton({ tts, texts }: { tts: CardTtsController; texts: string[] }) {
  const isActive = tts.activeKey === 'all';
  const loading = isActive && tts.status === 'loading';
  const playing = isActive && tts.status === 'playing';

  return (
    <span
      className="absolute right-3 top-3 hidden flex-col items-end gap-1 sm:inline-flex"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          tts.play('all', texts);
        }}
        disabled={loading}
        aria-label={playing ? 'Playing pronunciation' : 'Hear the whole card'}
        title="Hear the whole card"
        className={cn(
          'bg-background text-primary inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition',
          'hover:bg-primary/10 focus:ring-ring focus:outline-none focus:ring-2 focus:ring-offset-1',
          'disabled:cursor-progress disabled:opacity-60',
          playing && 'bg-primary/10',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Volume2 className={cn('h-4 w-4', playing && 'animate-speaking')} />
        )}
      </button>
      {isActive && tts.errorKey === 'all' ? (
        <span className="bg-destructive/10 text-destructive max-w-[180px] truncate rounded px-1.5 py-0.5 text-[10px]">
          Audio playback failed.
        </span>
      ) : null}
    </span>
  );
}

// ── LineSpeakerButton ──────────────────────────────────────────────────────────

/**
 * A small speaker shown next to a single line of back-of-card text. Plays
 * only that line. Place it inside a `group/line` wrapper: on desktop it stays
 * hidden until the line is hovered (or the button is focused); on mobile
 * (where there's no hover) it's always visible, since the card-level play-all
 * button is hidden there.
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

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        tts.playLine(audioKey, texts);
      }}
      disabled={loading}
      aria-label={playing ? 'Playing line' : label}
      title={label}
      className={cn(
        // Larger tap target on mobile (where these are the only audio control),
        // tightened to a subtle inline size on desktop where hover reveals them.
        'bg-background text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm transition sm:h-6 sm:w-6',
        'hover:bg-primary/10 focus:ring-ring focus:outline-none focus:ring-2 focus:ring-offset-1 focus-visible:opacity-100',
        'disabled:cursor-progress disabled:opacity-60',
        // Always visible on mobile; hover/focus-reveal on desktop.
        'opacity-100 sm:opacity-0 sm:group-hover/line:opacity-100',
        // Keep visible whenever this line is the active one, even on desktop
        // when the pointer has moved off after clicking.
        isActive && 'opacity-100 sm:opacity-100',
        playing && 'bg-primary/10',
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin sm:h-3 sm:w-3" />
      ) : (
        <Volume2
          className={cn(
            'h-4 w-4 sm:h-3 sm:w-3',
            playing && (slow ? 'animate-speaking-slow' : 'animate-speaking'),
          )}
        />
      )}
    </button>
  );
}

// ── FavoriteButton ─────────────────────────────────────────────────────────────

/**
 * Heart-icon toggle for the per-user "favorite" flag. Lives to the right of
 * the rating buttons in simple mode and as a visually-distinct 8th row in
 * the advanced panel.
 *
 * Filled-red heart = favorited; outline = not. Click toggles. We deliberately
 * keep this narrower than a rating button so the three Challenging / Good /
 * Easy choices stay the primary affordance.
 */
export function FavoriteButton({
  favorite,
  onToggle,
  disabled,
  className,
}: {
  favorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={favorite}
      aria-label={favorite ? 'Unfavorite' : 'Favorite'}
      title={favorite ? 'Unfavorite' : 'Favorite'}
      className={cn(
        'bg-background flex shrink-0 items-center justify-center rounded-md border px-3 py-3 transition disabled:opacity-50',
        favorite
          ? 'border-rose-500/60 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20'
          : 'border-muted-foreground/30 text-muted-foreground hover:border-rose-500/40 hover:text-rose-500',
        className,
      )}
    >
      <Heart className={cn('h-5 w-5', favorite && 'fill-current')} />
    </button>
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
   * `onToggleFavorite` hides the heart entirely — useful for callers that
   * don't yet have a card id (e.g. legacy preview surfaces).
   */
  favorite?: boolean;
  onToggleFavorite?: () => void;
  /** Pre-select this rating on mount (e.g. current card's saved difficultyLevel). */
  initialDifficulty?: DifficultyLevel | null;
}) {
  const [selected, setSelected] = useState<DifficultyLevel | null>(initialDifficulty ?? null);
  const showFavorite = favorite !== undefined && onToggleFavorite !== undefined;
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {RATINGS.map((r) => {
          const isSelected = selected === r.value;
          return (
            <button
              key={r.value}
              onClick={() => {
                setSelected(r.value);
                onRate(r.value);
              }}
              disabled={disabled}
              className={cn(
                'flex flex-col items-center rounded-md border py-3 transition disabled:opacity-50',
                isSelected ? r.selectedTone : `bg-background ${r.tone}`,
              )}
            >
              <span className="text-base font-semibold">{r.label}</span>
              <span className="text-muted-foreground text-xs">{r.sub}</span>
            </button>
          );
        })}
      </div>
      {showFavorite ? (
        <FavoriteButton favorite={favorite} onToggle={onToggleFavorite} disabled={disabled} />
      ) : null}
    </div>
  );
}

// ── AdvancedRatingPanel ────────────────────────────────────────────────────────

/**
 * Replaces the three Challenging/Good/Easy buttons with the seven detailed
 * checkboxes spec'd by Advanced rating. Checking "Know all" auto-ticks every
 * other box except "Do not know"; checking "Do not know" clears every other
 * box (since it's the "I literally can't use this yet" sentinel).
 *
 * The component is uncontrolled at the value level — callers just receive the
 * chosen advanced values and can persist them independently from any coarse
 * difficulty selection.
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
  /** Pre-tick these boxes on mount (e.g. after a re-rate). */
  initial?: readonly AdvancedDifficultyLevel[];
  /**
   * Optional favorite state. When both are provided, the panel renders an
   * 8th row at the bottom of the checkbox list (visually distinct, separated
   * by a divider, with a heart icon) that toggles the per-user favorite
   * column independently of the advanced rating selection.
   *
   * NOTE: this row is intentionally NOT part of the do_not_know / know_all
   * mutual-exclusion rules — it lives outside the rating set.
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
        // "Do not know" default so the user always has at least one box.
        return new Set(['do_not_know']);
      }
      // Ticking "Know all" auto-ticks every middle option but NOT "Do not
      // know" (that's mutually exclusive with knowing anything).
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
        // Unticking "Do not know" with nothing else checked: stay on it so
        // the panel never reaches "no boxes ticked." An immediate save in
        // that state would be ambiguous.
        if (next.size === 1) return new Set(prev);
        next.delete('do_not_know');
        return next;
      }
      // Ticking "Do not know" clears every other selection — they're
      // mutually exclusive with the "can't use yet" sentinel.
      return new Set(['do_not_know']);
    }

    // Any of the five middle options: untick if already on, otherwise
    // tick it AND drop the "Do not know" sentinel (mutually exclusive).
    if (isChecked) {
      next.delete(value);
      // If unticking this dropped us to empty, fall back to the sentinel
      // so the panel always has a coherent state.
      if (next.size === 0) return new Set(['do_not_know']);
      // Also drop "Know all" since the set is no longer exhaustive.
      next.delete('know_all');
      return next;
    }
    next.add(value);
    next.delete('do_not_know');
    // If this brings the middle five to all-on, automatically tick
    // "Know all" so the visual state matches the implied rating.
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
    <div className="space-y-3 rounded-md border p-3">
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {ADVANCED_DIFFICULTY_LEVEL_OPTIONS.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <li key={opt.value}>
              <label
                className={cn(
                  'hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition',
                  disabled && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(opt.value)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="text-muted-foreground block text-xs">{opt.description}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {/* Favorite — visually distinct 8th row that toggles the per-user
          favorite column independently of the rating selection. Border-top
          + heart icon + slight background tint signal that it's a different
          kind of action from the 7 advanced-rating checkboxes above. */}
      {showFavorite ? (
        <label
          className={cn(
            'border-border/70 mt-1 flex cursor-pointer items-center gap-2 rounded-md border-t px-2 py-2 pt-3 transition hover:bg-rose-500/5',
            disabled && 'pointer-events-none opacity-60',
            favorite && 'bg-rose-500/5',
          )}
        >
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer accent-rose-500"
            checked={favorite}
            disabled={disabled}
            onChange={() => onToggleFavorite?.()}
          />
          <Heart
            className={cn(
              'h-4 w-4 shrink-0',
              favorite ? 'fill-rose-500 text-rose-500' : 'text-muted-foreground',
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Favorite</span>
            <span className="text-muted-foreground block text-xs">
              Mark this card to find it quickly in the Favorite filter
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

// ── RatingPanel ────────────────────────────────────────────────────────────────

/**
 * localStorage key for the global "Advanced rating" toggle preference.
 *
 * The toggle is a per-user-per-browser preference: once a user flips it on it
 * stays on across cards, deck/practice views, and sessions, until they flip
 * it back off. We deliberately don't sync this through the database because
 * it's a UI display choice, not part of any user's profile — losing it on a
 * new device is a feature, not a bug (a fresh device shouldn't surprise the
 * user with the heavier picker before they ask for it).
 */
const ADVANCED_RATING_PREF_KEY = 'ensemble:rating:advanced';

function readAdvancedRatingPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ADVANCED_RATING_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeAdvancedRatingPref(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADVANCED_RATING_PREF_KEY, String(on));
  } catch {
    // Storage may be unavailable (private mode, quota, etc.); failing to
    // persist is non-fatal — the toggle still works in-memory for the rest
    // of the session.
  }
}

/**
 * Wraps the simple three-button picker and the seven-checkbox advanced picker
 * behind a single "Advanced rating" toggle so every caller (Practice page,
 * preview modal, etc.) gets identical UX without each one re-implementing
 * the switch.
 *
 * The toggle preference is persisted in localStorage under
 * `ADVANCED_RATING_PREF_KEY`, so flipping it once turns the advanced picker
 * on for every subsequent card — across views and across sessions — until
 * the user flips it back off.
 *
 * If a specific card already has an advanced rating, we still open in
 * advanced mode for that card regardless of the global pref (so re-rating
 * never silently downgrades the existing selection). Toggling off via the
 * switch then clears the global pref AND the per-card override.
 */
export function RatingPanel({
  onRate,
  disabled,
  initialAdvanced,
  initialDifficulty,
  favorite,
  onToggleFavorite,
}: {
  /**
   * Called with the coarse `DifficultyLevel` when the user used the simple
   * picker, and with `advanced` when they used the advanced picker. The two
   * payloads are intentionally independent so submitting an advanced rating
   * does not rewrite the coarse difficulty column.
   */
  onRate: (level?: DifficultyLevel, advanced?: AdvancedDifficultyLevel[]) => void;
  disabled?: boolean;
  /** Pre-tick these boxes when the advanced panel opens (re-rate UX). */
  initialAdvanced?: readonly AdvancedDifficultyLevel[];
  /** Pre-select this rating on mount to reflect the card's saved difficultyLevel. */
  initialDifficulty?: DifficultyLevel | null;
  /**
   * Current favorite state and toggle callback. Threaded straight into the
   * simple and advanced sub-panels so the heart button / row appears in
   * both modes. Omit both to hide the heart entirely (e.g. public-deck
   * read-only previews where favoriting is meaningless).
   */
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  // Lazy initializer reads the persisted preference on mount. This is a
  // client component (PracticeSession / FlashcardPreviewModal both render
  // client-side and the panel only ever mounts after the user clicks Flip),
  // so reading localStorage here is safe and avoids a flicker that an
  // effect-based read would cause.
  //
  // We OR in `initialAdvanced.length > 0` so a card that already has an
  // advanced rating opens advanced even if the global pref is off. That
  // protects the re-rate flow: flipping a previously-advanced rating back
  // to a coarse one should be a deliberate user action, not the side-effect
  // of having the global pref off.
  const [advanced, setAdvanced] = useState<boolean>(() => {
    if ((initialAdvanced?.length ?? 0) > 0) return true;
    return readAdvancedRatingPref();
  });

  function handleToggle(next: boolean) {
    setAdvanced(next);
    // Persist the user's intent. We update the global pref on every flip
    // (including the case where the panel opened in advanced mode purely
    // because of the per-card override) — the user's explicit toggle wins.
    writeAdvancedRatingPref(next);
  }

  return (
    <div className="space-y-3">
      <RatingButtons
        disabled={disabled}
        onRate={(level) => onRate(level)}
        favorite={favorite}
        onToggleFavorite={onToggleFavorite}
        initialDifficulty={initialDifficulty}
      />
      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="advanced-rating-toggle" className="cursor-pointer text-xs">
          Advanced rating
        </Label>
        <Switch
          id="advanced-rating-toggle"
          checked={advanced}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
      </div>
      {advanced ? (
        <AdvancedRatingPanel
          disabled={disabled}
          initial={initialAdvanced}
          onChange={(values) => onRate(undefined, values)}
        />
      ) : null}
    </div>
  );
}
