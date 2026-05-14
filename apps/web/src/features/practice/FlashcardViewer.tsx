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
import { ChevronLeft, ChevronRight, Loader2, Volume2 } from 'lucide-react';

import type { BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import { genderLabel } from '@ensemble/types';
import { Card, CardContent } from '@/components/ui/card';
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

// ── RatingButtons ──────────────────────────────────────────────────────────────

export function RatingButtons({
  onRate,
  disabled,
}: {
  onRate: (level: DifficultyLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
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
  );
}
