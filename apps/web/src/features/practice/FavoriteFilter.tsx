'use client';

/**
 * Shared chip-group for the "Favorite" filter section in the Play modal.
 * Lives next to AdvancedRatingFilter so the three Play-modal hosts
 * (CategoriesDashboard, CategoryDetail, AllCardsView) render the same
 * affordance instead of each maintaining their own copy.
 *
 * The chip-group has two values: `'favorite'` and `'not_favorite'`. Both
 * selected (or neither) means "no favorite filter" — the same any-of
 * semantics as the Rating and Advanced Rating filters.
 *
 * Purely presentational: the parent owns the `string[]` state.
 */

import { cn } from '@/lib/utils';

const FAVORITE_OPTIONS = [
  { value: 'favorite', label: 'Favorite' },
  { value: 'not_favorite', label: 'Not favorite' },
] as const;

interface Props {
  /** Currently selected filter tokens. */
  selected: string[];
  /** Fired with the clicked chip's token. The parent toggles it in/out. */
  onToggle: (value: string) => void;
  /** Section heading. Defaults to "Favorite". */
  label?: string;
}

export function FavoriteFilter({ selected, onToggle, label = 'Favorite' }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="flex flex-wrap gap-2">
        {FAVORITE_OPTIONS.map((opt) => {
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
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
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

export const FAVORITE_FILTER_VALUES = FAVORITE_OPTIONS.map((o) => o.value);
