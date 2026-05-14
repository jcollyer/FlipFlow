'use client';

import { ListOrdered, Shuffle } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Two play modes used by the Play Flashcards entry points:
 *   - 'in_order' (default): walk the deck in its existing chronological order.
 *   - 'shuffle': randomize once per session, re-shuffle on "Play again".
 */
export type PlayMode = 'in_order' | 'shuffle';

interface PlayModeToggleProps {
  value: PlayMode;
  onChange: (next: PlayMode) => void;
  /**
   * Optional class to size/position the toggle in its container. The base
   * styling assumes a small, inline segmented control.
   */
  className?: string;
}

/**
 * Segmented toggle for choosing chronological vs shuffled playback. Rendered
 * next to (or above) the Play button in every Play Flashcards modal so the
 * mode applies to the very next session.
 */
export function PlayModeToggle({ value, onChange, className }: PlayModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Play order"
      className={cn(
        'bg-muted inline-flex items-center gap-0.5 rounded-full p-0.5 text-sm',
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'in_order'}
        onClick={() => onChange('in_order')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition',
          value === 'in_order'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ListOrdered className="h-3.5 w-3.5" />
        In order
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'shuffle'}
        onClick={() => onChange('shuffle')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition',
          value === 'shuffle'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Shuffle className="h-3.5 w-3.5" />
        Shuffle
      </button>
    </div>
  );
}
