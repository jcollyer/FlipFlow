'use client';

/**
 * FlashcardPreviewModal
 *
 * Opens a modal that lets the user flip, navigate, and rate any card
 * from a card list (AllCardsView or CategoryDetail) — the same interaction
 * as the /practice page, but without leaving the current page.
 *
 * Usage:
 *   const [previewIndex, setPreviewIndex] = useState<number | null>(null);
 *
 *   <FlashcardPreviewModal
 *     cards={previewCards}
 *     initialIndex={previewIndex ?? 0}
 *     open={previewIndex !== null}
 *     onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}
 *     canRate={true}
 *     onRated={() => { utils.practice.stats.invalidate(); }}
 *   />
 */

import { useCallback, useEffect, useState } from 'react';

import type { BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { FlipCard, NavButton, RatingButtons } from './FlashcardViewer';

// ── Public type for a card passed to this modal ────────────────────────────────

export interface PreviewCard {
  id: string;
  front: string;
  back: string;
  frontExamples: string[];
  backExamples: string[];
  class: string | null;
  gender: string | null;
  pronunciation: string | null;
  backLanguage: BackLanguageValue | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface FlashcardPreviewModalProps {
  /** Ordered list of cards to navigate through. */
  cards: PreviewCard[];
  /** Which card to start on (index into `cards`). Defaults to 0. */
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the user can rate cards (false for public decks). */
  canRate?: boolean;
  /** Called after each successful rating so the parent can invalidate caches. */
  onRated?: (cardId: string, level: DifficultyLevel) => void;
}

export function FlashcardPreviewModal({
  cards,
  initialIndex = 0,
  open,
  onOpenChange,
  canRate = true,
  onRated,
}: FlashcardPreviewModalProps) {
  const submit = trpc.practice.submitReview.useMutation();

  const [index, setIndex] = useState(initialIndex);
  const [flipped, setFlipped] = useState(false);

  // Reset to the chosen card whenever the modal opens.
  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
      setFlipped(false);
    }
  }, [open, initialIndex]);

  // Also reset flip when the index changes (e.g. via arrow buttons).
  // We do this inside the handlers below, but guard here too for safety.
  const current = cards[index];
  const canGoPrev = index > 0;
  const canGoNext = index < cards.length - 1;

  const handlePrev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => Math.min(cards.length - 1, i + 1));
  }, [cards.length]);

  // Keyboard shortcuts — only active when the modal is open.
  // Space = flip, ArrowLeft = prev, ArrowRight = next.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if the user is focused on an interactive element
      // other than the modal backdrop (e.g. a button inside the modal).
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === 'Space' && tag !== 'BUTTON') {
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
  }, [open, canGoPrev, canGoNext, handlePrev, handleNext]);

  function handleRate(level: DifficultyLevel) {
    if (!current || !canRate) return;
    submit.mutate({ cardId: current.id, difficultyLevel: level });
    onRated?.(current.id, level);
    // After rating, advance to the next card; if on the last card just reset
    // the flip so the user can see the front again.
    if (canGoNext) {
      setFlipped(false);
      setIndex((i) => i + 1);
    } else {
      setFlipped(false);
    }
  }

  // Nothing to show yet (cards array empty or modal closed before first open).
  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-6">
        {/* Visually hidden title for screen readers */}
        <DialogTitle className="sr-only">Flashcard preview</DialogTitle>

        <div className="flex flex-col space-y-4">
          {/* Counter */}
          <div className="text-muted-foreground text-center text-xs">
            {index + 1} of {cards.length}
          </div>

          {/* Card + navigation */}
          <div className="flex flex-1 items-stretch gap-2 sm:gap-3">
            <NavButton direction="prev" onClick={handlePrev} disabled={!canGoPrev} />
            <div className="min-w-0 flex-1">
              <FlipCard
                front={current.front}
                back={current.back}
                frontExamples={current.frontExamples}
                backExamples={current.backExamples}
                cardClass={current.class}
                gender={current.gender}
                pronunciation={current.pronunciation}
                flipped={flipped}
                onClick={() => setFlipped((f) => !f)}
                cardId={current.id}
                backLanguage={current.backLanguage}
              />
            </div>
            <NavButton direction="next" onClick={handleNext} disabled={!canGoNext} />
          </div>

          {/* Flip button or rating buttons */}
          {flipped && canRate ? (
            <RatingButtons onRate={handleRate} disabled={submit.isPending} />
          ) : flipped ? (
            <p className="text-muted-foreground text-center text-sm">
              Public deck — read-only. Use the arrows to navigate.
            </p>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
