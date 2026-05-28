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

import type { AdvancedDifficultyLevel, BackLanguageValue, DifficultyLevel } from '@ensemble/types';
import { decodeAdvancedDifficultyLevels } from '@ensemble/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { FlipCard, NavButton, RatingPanel } from './FlashcardViewer';

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
  /**
   * Existing advanced-rating selection (comma-separated CSV from the
   * CardProgress row). Used to pre-tick the checkboxes when the user
   * re-rates a card. Optional — omitting it just opens the advanced
   * panel empty.
   */
  advancedDifficultyLevel?: string | null;
  /**
   * Whether this card is currently favorited by the viewer. Drives the
   * filled/outlined state of the heart in the rating panel. Optional —
   * omitting it (or passing false) renders the heart outlined.
   */
  favorite?: boolean;
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
  /**
   * Called when the user toggles the heart inside the rating panel. The
   * parent owns the card list, so it should both invalidate its query
   * cache and optimistically reflect the new state on the underlying row.
   * The mutation itself is fired from inside the modal — this callback
   * only signals "the user just changed favorite state."
   */
  onFavoriteToggled?: (cardId: string, favorite: boolean) => void;
}

export function FlashcardPreviewModal({
  cards,
  initialIndex = 0,
  open,
  onOpenChange,
  canRate = true,
  onRated,
  onFavoriteToggled,
}: FlashcardPreviewModalProps) {
  const submit = trpc.practice.submitReview.useMutation();
  const setFavorite = trpc.practice.setFavorite.useMutation();

  const [index, setIndex] = useState(initialIndex);
  const [flipped, setFlipped] = useState(false);
  // Local overlay of favorite state so the heart updates instantly while the
  // mutation is in flight. Keyed by cardId so it survives navigation between
  // cards inside the modal. Cleared when the modal closes.
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) setFavoriteOverrides({});
  }, [open]);

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

  function handleRate(level: DifficultyLevel, advanced?: AdvancedDifficultyLevel[]) {
    if (!current || !canRate) return;
    submit.mutate({
      cardId: current.id,
      difficultyLevel: level,
      // Only forward the advanced field when the user actually used the
      // advanced picker — `undefined` leaves the column untouched on the
      // server, preserving any prior selection. Empty arrays explicitly
      // clear, but the panel guarantees at least one box is checked at
      // submit time so we shouldn't hit that branch in practice.
      ...(advanced !== undefined ? { advancedDifficultyLevel: advanced } : {}),
    });
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
            <RatingPanel
              // Re-mount the panel per card so the internal "advanced toggle"
              // state and the checkbox selection reset between cards instead
              // of bleeding over from the last one the user just rated.
              key={current.id}
              onRate={handleRate}
              disabled={submit.isPending}
              initialAdvanced={decodeAdvancedDifficultyLevels(current.advancedDifficultyLevel)}
              favorite={favoriteOverrides[current.id] ?? current.favorite ?? false}
              onToggleFavorite={() => {
                const next = !(favoriteOverrides[current.id] ?? current.favorite ?? false);
                // Optimistically update the heart so it flips instantly,
                // then fire the mutation and let the parent invalidate the
                // underlying list query.
                setFavoriteOverrides((prev) => ({ ...prev, [current.id]: next }));
                setFavorite.mutate(
                  { cardId: current.id, favorite: next },
                  {
                    onError: () => {
                      // Roll back the override on failure so the heart
                      // matches the server-confirmed state again.
                      setFavoriteOverrides((prev) => {
                        const { [current.id]: _omit, ...rest } = prev;
                        return rest;
                      });
                    },
                    onSuccess: () => onFavoriteToggled?.(current.id, next),
                  },
                );
              }}
            />
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
