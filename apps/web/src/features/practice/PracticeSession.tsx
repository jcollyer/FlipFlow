'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Volume2 } from 'lucide-react';

import type { BackLanguageValue } from '@flipflow/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

interface Props {
  categoryId: string;
}

/**
 * Practice flow:
 *   1. Fetch the queue once on mount.
 *   2. Walk through cards locally so a slow network doesn't block the UX.
 *   3. After each rating, fire-and-forget a submitReview mutation; we only
 *      wait for it on the *last* card so the summary screen has fresh stats.
 */
export function PracticeSession({ categoryId }: Props) {
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

  // Spacebar = flip.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && current && !done) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, done]);

  function handleRate(quality: number) {
    if (!current) return;
    submit.mutate({ cardId: current.id, confidence: quality });
    setReviewed((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // When the session ends, refresh anything that shows due/mastered counts.
  useEffect(() => {
    if (done) {
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({ categoryId });
      utils.flashcards.listByCategory.invalidate({ categoryId });
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
          <Link href={`/app/categories/${categoryId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to deck
          </Link>
        </Button>
        <div className="text-sm text-muted-foreground">
          {data?.category.name ?? ''}
        </div>
      </div>

      {!isLoading && cards.length === 0 ? (
        <EmptyQueue
          categoryId={categoryId}
          practiceAll={practiceAll}
          onPracticeAnyway={() => setPracticeAll(true)}
        />
      ) : done ? (
        <SessionSummary categoryId={categoryId} reviewed={reviewed} />
      ) : (
        <>
          <Progress value={progress} />
          <div className="text-center text-xs text-muted-foreground">
            {Math.min(index + 1, cards.length)} of {cards.length}
          </div>

          <FlipCard
            front={current?.front ?? ''}
            back={current?.back ?? ''}
            flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
            cardId={current?.id}
            // Cast: backLanguage is widened to `string | null` from the wire,
            // but on the server we only ever store BackLanguageValue values.
            backLanguage={(data?.category.backLanguage ?? null) as BackLanguageValue | null}
          />

          {flipped ? (
            <RatingButtons onRate={handleRate} disabled={submit.isPending} />
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => setFlipped(true)} size="lg">
                Show answer
                <span className="ml-2 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
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

function FlipCard({
  front,
  back,
  flipped,
  onClick,
  cardId,
  backLanguage,
}: {
  front: string;
  back: string;
  flipped: boolean;
  onClick: () => void;
  cardId: string | undefined;
  backLanguage: BackLanguageValue | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flip-card block h-72 w-full select-text outline-none', flipped && 'is-flipped')}
      aria-label={flipped ? 'Hide answer' : 'Show answer'}
    >
      <div className="flip-card-inner">
        <Card className="flip-card-face flex items-center justify-center p-6 text-center shadow-md">
          <CardContent className="text-2xl font-medium leading-snug">{front}</CardContent>
        </Card>
        <Card className="flip-card-face flip-card-back relative flex items-center justify-center border-primary/40 bg-primary/5 p-6 text-center shadow-md">
          <CardContent className="text-xl leading-snug">{back}</CardContent>
          {/* Only render the audio button if the deck has a configured language. */}
          {backLanguage && cardId ? (
            <AudioButton cardId={cardId} text={back} languageCode={backLanguage} />
          ) : null}
        </Card>
      </div>
    </button>
  );
}

/**
 * Speaker button that fetches and plays a TTS pronunciation of the back-of-
 * card text via the `tts.synthesize` mutation.
 *
 * Caching: we keep a per-session in-memory cache keyed by `cardId` so the
 * same card never re-bills the user — flipping back to a card you've heard
 * already plays instantly with no network round-trip. The cache lives on a
 * useRef Map (instead of useState) because we never need a re-render when
 * an entry is added; we just lazily read from it on click.
 *
 * `stopPropagation` on the click is essential — the audio button is nested
 * inside the FlipCard `<button>`, so without it the click would also
 * toggle the flip and rate the user's progress out from under them.
 */
function AudioButton({
  cardId,
  text,
  languageCode,
}: {
  cardId: string;
  text: string;
  languageCode: BackLanguageValue;
}) {
  const synthesize = trpc.tts.synthesize.useMutation();

  // cardId -> data URL we can hand to `new Audio()`.
  const cacheRef = useRef<Map<string, string>>(new Map());
  // Holds the currently-playing element so a second click while playing
  // restarts cleanly rather than overlapping audio.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user navigates away mid-playback the parent unmounts; stop the
  // audio so it doesn't keep playing in the background.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(
    (dataUrl: string) => {
      // Always tear down any previous element so repeated clicks restart.
      audioRef.current?.pause();
      const audio = new Audio(dataUrl);
      audioRef.current = audio;
      setPlaying(true);
      audio.addEventListener('ended', () => setPlaying(false));
      audio.addEventListener('error', () => {
        setPlaying(false);
        setError('Audio playback failed.');
      });
      // play() returns a Promise; some browsers reject if interrupted.
      audio.play().catch(() => {
        setPlaying(false);
        setError('Audio playback failed.');
      });
    },
    [],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setError(null);

      const cached = cacheRef.current.get(cardId);
      if (cached) {
        play(cached);
        return;
      }

      synthesize.mutate(
        { text, languageCode },
        {
          onSuccess: ({ audioContent }) => {
            const dataUrl = `data:audio/mp3;base64,${audioContent}`;
            cacheRef.current.set(cardId, dataUrl);
            play(dataUrl);
          },
          onError: (err) => {
            setError(err.message);
          },
        },
      );
    },
    [cardId, text, languageCode, synthesize, play],
  );

  const loading = synthesize.isPending;

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
          'inline-flex h-9 w-9 items-center justify-center rounded-full border bg-background text-primary shadow-sm transition',
          'hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          'disabled:cursor-progress disabled:opacity-60',
          playing && 'animate-pulse bg-primary/10',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>
      {error ? (
        <span className="max-w-[180px] truncate rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
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
            'flex flex-col items-center rounded-md border bg-background py-3 transition disabled:opacity-50',
            r.tone,
          )}
        >
          <span className="text-base font-semibold">{r.label}</span>
          <span className="text-xs text-muted-foreground">{r.sub}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyQueue({
  categoryId,
  practiceAll,
  onPracticeAnyway,
}: {
  categoryId: string;
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
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">
          {deckIsEmpty ? 'No cards in this deck' : 'Nothing due right now'}
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          {deckIsEmpty
            ? "There's nothing here to practice yet. Add some cards to get started."
            : "You're all caught up. Your schedule will surface cards as they become due — or jump back in early with Practice anyway."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={`/app/categories/${categoryId}`}>Back to deck</Link>
          </Button>
          {!deckIsEmpty && <Button onClick={onPracticeAnyway}>Practice anyway</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionSummary({ categoryId, reviewed }: { categoryId: string; reviewed: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">Session complete</div>
        <p className="text-sm text-muted-foreground">
          You reviewed <strong>{reviewed}</strong> {reviewed === 1 ? 'card' : 'cards'}. Nice.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/categories/${categoryId}`}>Back to deck</Link>
          </Button>
          <Button asChild>
            <Link href={`/app/categories/${categoryId}/practice`}>
              <RotateCcw className="h-4 w-4" />
              Practice again
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
