'use client';

/**
 * Shared chip-group for the "Advanced Rating" filter section in the Play
 * Flashcards modal. Lives next to the other practice primitives so the two
 * Play-modal hosts — the home dashboard (CategoriesDashboard) and a single
 * deck's detail page (CategoryDetail) — render the same affordance instead
 * of each maintaining their own copy.
 *
 * The component is purely presentational:
 *   - `selected` is the array of currently chosen filter tokens (members of
 *     `ADVANCED_DIFFICULTY_LEVEL_VALUES` plus the literal `'no_rating'`).
 *   - `onToggle` is fired with a single token whenever a chip is clicked;
 *     the parent owns the array and decides whether to add or remove.
 *
 * We deliberately keep the data shape as `string[]` (rather than narrowing
 * to `AdvancedDifficultyLevel | 'no_rating'`) so the parent can hand its
 * existing `selectedAdvancedRatings: string[]` state in unchanged. The
 * underlying token vocabulary is still validated at the URL/edge boundary.
 */

import { ADVANCED_DIFFICULTY_LEVEL_OPTIONS } from '@ensemble/types';

import { cn } from '@/lib/utils';

interface Props {
  /** Currently selected filter tokens. */
  selected: string[];
  /** Fired with the clicked chip's token. The parent toggles it in/out. */
  onToggle: (value: string) => void;
}

export function AdvancedRatingFilter({ selected, onToggle }: Props) {
  // Build the option list once per render. The seven advanced tokens come
  // straight from the types package so a rename or addition there flows here
  // automatically; we then append the synthetic "Not rated" pill that maps
  // to "advancedDifficultyLevel IS NULL or empty" on the filter side.
  const options: { value: string; label: string }[] = [
    ...ADVANCED_DIFFICULTY_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    { value: 'no_rating', label: 'Not rated' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/70 bg-muted',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
