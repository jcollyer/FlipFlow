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
import {
  ADVANCED_DIFFICULTY_LEVEL_OPTIONS,
  genderLabel,
} from '@ensemble/types';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ClassBadge } from '@/features/cards/ClassBadge';

// ── Rating definitions ─────────────────────────────────────────────────────────

export const RATINGS: { value: DifficultyLevel; label: string; sub: string; tone: string }[] = [
  {
    value: 'challenging',
    label: 'Challenging',
    sub: 'Not yet',
    tone: 'border-orange-500/40 hover:bg-orange-500/10',
  },
  {
    value: 'good',
    label: 'Good',
    sub: 'Warm',
    tone: 'border-blue-500/40 hover:bg-blue-500/10',
  },
  {
    value: 'easy',
    label: 'Easy',
    sub: 'Got it',
    tone: 'border-green-500/40 hover:bg-green-500/10',
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
        <Card className="flip-card-face flex items-center justify-center p-6 text-center shadow-md">
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
        <Card className="flip-card-face flip-card-back border-primary/40 bg-primary/5 relative flex items-stretch justify-center p-6 text-center shadow-md">
          <CardContent className="flex h-full w-full flex-col gap-3 pb-0">
            {cardClass ? (
              <div className="flex justify-center">
                <ClassBadge value={cardClass} size="md" />
              </div>
            ) : null}
            <p className="text-xl font-bold leading-snug">{back}</p>
            {backExamples.length > 0 ? (
              <ul className="w-fit space-y-1 divide-y divide-gray-200 text-left">
                {backExamples.map((ex, i) => (
                  <li key={i} className="text-base">
                    {ex}
                  </li>
                ))}
              </ul>
            ) : null}
            {pronunciation && (
              <p className="text-muted-foreground mt-auto text-right italic">[{pronunciation}]</p>
            )}
          </CardContent>
          {/* Gender indicator — bottom-left of the back face. */}
          {gender ? (
            <span className="text-muted-foreground absolute bottom-3 left-3 text-xs italic">
              {genderLabel(gender)}
            </span>
          ) : null}
          {/* Only render the audio button if the deck has a configured language. */}
          {backLanguage && cardId ? (
            <AudioButton
              cardId={cardId}
              text={back}
              examples={backExamples}
              languageCode={backLanguage}
            />
          ) : null}
        </Card>
      </div>
    </button>
  );
}

// ── AudioButton ────────────────────────────────────────────────────────────────

/**
 * Speaker button that fetches and plays a TTS pronunciation of the back-of-
 * card text (followed by each example, with a short pause between segments)
 * via the `tts.synthesize` mutation.
 *
 * Caching: we keep a per-session in-memory cache keyed by text content so
 * the same phrase is never re-synthesized. Re-clicking while audio is playing
 * cancels the current sequence and restarts from the beginning.
 *
 * `stopPropagation` on the click is essential — the audio button is nested
 * inside the FlipCard `<button>`, so without it the click would also
 * toggle the flip.
 */
export function AudioButton({
  cardId,
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

  // text content -> data URL cache so the same phrase is never re-billed.
  const cacheRef = useRef<Map<string, string>>(new Map());
  // Holds the currently-playing element so re-clicks restart cleanly.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Symbol token to cancel an in-flight sequence when the user clicks again.
  const runTokenRef = useRef<symbol | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user navigates away mid-playback the parent unmounts; stop the
  // audio so it doesn't keep playing in the background.
  useEffect(() => {
    return () => {
      runTokenRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
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

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Cancel any running sequence.
      audioRef.current?.pause();
      audioRef.current = null;
      setError(null);

      const token = Symbol();
      runTokenRef.current = token;
      const isActive = () => runTokenRef.current === token;

      const texts = examples.length > 0 ? [text, ...examples] : [text];

      setLoading(true);
      setPlaying(false);
      try {
        // Pre-fetch all segments sequentially (uses cache on repeat plays).
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
    },
    [text, examples, fetchAudio, playSingle],
  );

  return (
    <span
      className="absolute right-3 top-3 inline-flex flex-col items-end gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={playing ? 'Playing pronunciation' : 'Hear pronunciation'}
        className={cn(
          'bg-background text-primary inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition',
          'hover:bg-primary/10 focus:ring-ring focus:outline-none focus:ring-2 focus:ring-offset-1',
          'disabled:cursor-progress disabled:opacity-60',
          playing && 'bg-primary/10 animate-pulse',
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {error ? (
        <span className="bg-destructive/10 text-destructive max-w-[180px] truncate rounded px-1.5 py-0.5 text-[10px]">
          {error}
        </span>
      ) : null}
    </span>
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
}) {
  const showFavorite = favorite !== undefined && onToggleFavorite !== undefined;
  return (
    <div className="flex items-stretch gap-2">
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {RATINGS.map((r) => (
          <button
            key={r.value}
            onClick={() => onRate(r.value)}
            disabled={disabled}
            className={cn(
              'bg-background flex flex-col items-center rounded-md border py-3 transition disabled:opacity-50',
              r.tone,
            )}
          >
            <span className="text-base font-semibold">{r.label}</span>
            <span className="text-muted-foreground text-xs">{r.sub}</span>
          </button>
        ))}
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
  // "Do not know" is the default sentinel until the user picks something
  // else — matches the "← defaults until you check another" spec.
  const [selected, setSelected] = useState<Set<AdvancedDifficultyLevel>>(() => {
    if (initial && initial.length > 0) return new Set(initial);
    return new Set(['do_not_know']);
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
