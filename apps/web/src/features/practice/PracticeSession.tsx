'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Volume2,
} from 'lucide-react';

import type { BackLanguageValue } from '@ensemble/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { ClassBadge } from '@/features/cards/ClassBadge';

interface Props {
  categoryId?: string;
  /** Filter to multiple categories. Used by the all-cards filtered practice. */
  categoryIds?: string[];
  /** Filter by word classes (e.g. ['noun', 'verb']). Empty = all classes. */
  classes?: string[];
  /** Max cards to pull for this session. Defaults to 20. */
  practiceLimit?: number;
}

/**
 * Practice flow:
 *   1. Fetch the queue once on mount.
 *   2. Walk through cards locally so a slow network doesn't block the UX.
 *   3. After each rating, fire-and-forget a submitReview mutation; we only
 *      wait for it on the *last* card so the summary screen has fresh stats.
 */
export function PracticeSession({ categoryId, categoryIds, classes, practiceLimit }: Props) {
  const utils = trpc.useUtils();
  const isAllCards = !categoryId;
  const backHref = isAllCards ? '/app/all-categories' : `/app/categories/${categoryId}`;
  const backLabel = isAllCards ? 'Back to all cards' : 'Back to deck';

  // When `practiceAll` is true we ignore the SM-2 schedule and pull every
  // card in the deck. The user opts in via "Practice anyway" on the empty
  // state, so we only flip this on after they confirm.
  const [practiceAll, setPracticeAll] = useState(false);

  const { data, isLoading } = trpc.practice.queue.useQuery(
    {
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
      limit: practiceLimit ?? 20,
      includeAll: practiceAll,
    },
    { refetchOnMount: 'always' },
  );

  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const cards = data?.cards ?? [];
  const current = cards[index];
  const done = !isLoading && cards.length > 0 && index >= cards.length;

  // Skip controls. These intentionally do NOT touch SM-2 state — no
  // submitReview is fired, so confidence / easeFactor / interval / nextReview
  // remain unchanged. We also reset the flip so the next card always lands
  // on its front side. Pressing "next" on the last card advances past the
  // end of the queue, which triggers the session-complete screen.
  const canGoPrev = !done && index > 0;
  const canGoNext = !done && cards.length > 0;

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, cards.length));
  }, [cards.length]);

  // Hotkeys: Space = flip, ArrowLeft = prev, ArrowRight = next.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current || done) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        handlePrev();
      } else if (e.code === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, done, canGoPrev, canGoNext, handlePrev, handleNext]);

  function handleRate(quality: number) {
    if (!current) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // "Practice again" stays on the same route, so a Link wouldn't remount the
  // component and `index`/`reviewed`/`flipped` would still be at their
  // session-complete values. Reset locally and re-fetch the queue so the SM-2
  // schedule (and any reviews submitted this session) is reflected.
  const handlePracticeAgain = useCallback(() => {
    setIndex(0);
    setReviewed(0);
    setFlipped(false);
    utils.practice.queue.invalidate({
      categoryId,
      categoryIds: categoryIds?.length ? categoryIds : undefined,
      classes: classes?.length ? classes : undefined,
      limit: practiceLimit ?? 20,
      includeAll: practiceAll,
    });
  }, [utils, categoryId, categoryIds, classes, practiceLimit, practiceAll]);

  // When the session ends, refresh anything that shows due/mastered counts.
  useEffect(() => {
    if (done) {
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({ categoryId });
      if (categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId });
      } else {
        utils.flashcards.listAll.invalidate();
      }
    }
  }, [done, utils, categoryId]);

  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round((Math.min(index, cards.length) / cards.length) * 100);
  }, [index, cards.length]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="text-muted-foreground text-sm">{data?.category?.name ?? 'All cards'}</div>
      </div>

      {!isLoading && cards.length === 0 ? (
        <EmptyQueue
          backHref={backHref}
          backLabel={backLabel}
          emptyTitle={isAllCards ? 'No cards to practice' : 'No cards in this deck'}
          practiceAll={practiceAll}
          onPracticeAnyway={() => setPracticeAll(true)}
        />
      ) : done ? (
        <SessionSummary
          backHref={backHref}
          backLabel={backLabel}
          reviewed={reviewed}
          onPracticeAgain={handlePracticeAgain}
        />
      ) : (
        <>
          <Progress value={progress} />
          <div className="text-muted-foreground text-center text-xs">
            {Math.min(index + 1, cards.length)} of {cards.length}
          </div>

          <div className="flex items-stretch gap-2 sm:gap-3">
            <NavButton
              direction="prev"
              onClick={handlePrev}
              disabled={!canGoPrev}
            />
            <div className="min-w-0 flex-1">
              <FlipCard
                front={current?.front ?? ''}
                back={current?.back ?? ''}
                frontExamples={current?.frontExamples ?? []}
                backExamples={current?.backExamples ?? []}
                cardClass={current?.class ?? null}
                pronunciation={
                  (current as { pronunciation?: string | null } | undefined)?.pronunciation ?? null
                }
                flipped={flipped}
                onClick={() => setFlipped((f) => !f)}
                cardId={current?.id}
                // Cast: backLanguage is widened to `string | null` from the wire,
                // but on the server we only ever store BackLanguageValue values.
                backLanguage={
                  ((current?.category?.backLanguage ?? data?.category?.backLanguage ?? null) as
                    | BackLanguageValue
                    | null)
                }
              />
            </div>
            <NavButton
              direction="next"
              onClick={handleNext}
              disabled={!canGoNext}
            />
          </div>

          {flipped ? (
            <RatingButtons onRate={handleRate} disabled={submit.isPending} />
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => setFlipped(true)} size="lg">
                Flip
                <span className="bg-muted text-muted-foreground ml-2 rounded border px-1.5 py-0.5 text-xs">
                  Space
                </span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NavButton({
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
        'disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-background',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function FlipCard({
  front,
  back,
  frontExamples,
  backExamples,
  cardClass,
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
        'flip-card block min-h-72 w-full select-text outline-none',
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
        <Card className="flip-card-face flip-card-back border-primary/40 bg-primary/5 relative flex items-center justify-center p-6 text-center shadow-md">
          <CardContent className="w-full space-y-3">
            {cardClass ? (
              <div className="flex justify-center">
                <ClassBadge value={cardClass} size="md" />
              </div>
            ) : null}
            <p className="text-xl font-bold leading-snug">{back}</p>
            {backExamples.length > 0 ? (
              <ul className="space-y-1 w-fit text-left  divide-y divide-gray-200">
                {backExamples.map((ex, i) => (
                  <li key={i} className="text-base">
                    {ex}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
          {/* Only render the audio button if the deck has a configured language. */}
          {backLanguage && cardId ? (
            <AudioButton
              cardId={cardId}
              text={back}
              examples={backExamples}
              languageCode={backLanguage}
            />
          ) : null}
               {pronunciation && (
              <p className="text-muted-foreground text-right italic mt-auto">[{pronunciation}]</p>
            )}
        </Card>
      </div>
    </button>
  );
}

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
 * toggle the flip and rate the user's progress out from under them.
 */
function AudioButton({
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
      // Stop the wrapper too so hovering / focusing the button area never
      // accidentally triggers the surrounding flip-card click target.
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

const RATINGS: { value: number; label: string; sub: string; tone: string }[] = [
  { value: 0, label: 'Again', sub: 'No idea', tone: 'border-red-500/40 hover:bg-red-500/10' },
  { value: 2, label: 'Hard', sub: 'Wrong', tone: 'border-orange-500/40 hover:bg-orange-500/10' },
  { value: 3, label: 'Good', sub: 'Got it', tone: 'border-blue-500/40 hover:bg-blue-500/10' },
  { value: 5, label: 'Easy', sub: 'Perfect', tone: 'border-green-500/40 hover:bg-green-500/10' },
];

function RatingButtons({ onRate, disabled }: { onRate: (q: number) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

function EmptyQueue({
  backHref,
  backLabel,
  emptyTitle,
  practiceAll,
  onPracticeAnyway,
}: {
  backHref: string;
  backLabel: string;
  emptyTitle: string;
  practiceAll: boolean;
  onPracticeAnyway: () => void;
}) {
  // If the user already opted into "Practice anyway" and we still got zero
  // cards back, the deck is genuinely empty — don't keep saying "caught up"
  // and don't offer the button again.
  const deckIsEmpty = practiceAll;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">{deckIsEmpty ? emptyTitle : 'Nothing due right now'}</div>
        <p className="text-muted-foreground max-w-sm text-sm">
          {deckIsEmpty
            ? "There's nothing here to practice yet. Add some cards to get started."
            : "You're all caught up. Your schedule will surface cards as they become due — or jump back in early with Practice anyway."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          {!deckIsEmpty && <Button onClick={onPracticeAnyway}>Practice anyway</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionSummary({
  backHref,
  backLabel,
  reviewed,
  onPracticeAgain,
}: {
  backHref: string;
  backLabel: string;
  reviewed: number;
  onPracticeAgain: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Session complete</div>
        <p className="text-muted-foreground text-sm">
          You reviewed <strong>{reviewed}</strong> {reviewed === 1 ? 'card' : 'cards'}. Nice.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          <Button onClick={onPracticeAgain}>
            <RotateCcw className="h-4 w-4" />
            Practice again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
