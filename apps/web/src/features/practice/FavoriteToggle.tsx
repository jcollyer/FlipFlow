'use client';

/**
 * Segmented "Favorite" filter for the Play Flashcards modal. Three states:
 *   - 'all' (default): no favorite filter
 *   - 'favorite': only show favorited cards
 *   - 'not_favorite': only show non-favorited cards
 *
 * Styled to match PlayModeToggle so the modal's footer-row controls read
 * as a consistent set of segmented pickers. No external label — the
 * segments themselves carry the meaning. The dashboard / deck-detail /
 * all-cards Play modals keep their underlying `selectedFavorites: string[]`
 * state so URL params and filter logic don't change; this component just
 * converts between the array and the radio-style value.
 */

import { Heart, HeartOff, List } from 'lucide-react';

import { cn } from '@/lib/utils';

export type FavoriteFilterValue = 'all' | 'favorite' | 'not_favorite';

interface Props {
  value: FavoriteFilterValue;
  onChange: (next: FavoriteFilterValue) => void;
  className?: string;
}

const OPTIONS: { value: FavoriteFilterValue; label: string; Icon: typeof Heart }[] = [
  { value: 'all', label: 'All', Icon: List },
  { value: 'favorite', label: 'Favorite', Icon: Heart },
  { value: 'not_favorite', label: 'Not favorite', Icon: HeartOff },
];

export function FavoriteToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Favorite filter"
      className={cn(
        'bg-muted inline-flex items-center gap-0.5 rounded-full p-0.5 text-sm',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const checked = value === opt.value;
        const { Icon } = opt;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition',
              checked
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              // Tint the heart rose when "Favorite" is the active segment so
              // it visually echoes the heart used on cards / in the rating
              // panel.
              checked && opt.value === 'favorite' && 'text-rose-500',
            )}
          >
            <Icon
              className={cn('h-3.5 w-3.5', checked && opt.value === 'favorite' && 'fill-current')}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert the existing `selectedFavorites: string[]` shape to the toggle's
 * single-value form. Anything that isn't exactly `['favorite']` or
 * `['not_favorite']` collapses to `'all'` (empty array, both selected, or
 * an unrecognized token all mean "no filter").
 */
export function favoriteFilterFromArray(arr: string[]): FavoriteFilterValue {
  if (arr.length === 1) {
    if (arr[0] === 'favorite') return 'favorite';
    if (arr[0] === 'not_favorite') return 'not_favorite';
  }
  return 'all';
}

/**
 * Inverse of `favoriteFilterFromArray`. `'all'` becomes an empty array so
 * the existing "empty = no filter" semantics in URL builders and the
 * client-side filter logic keep working unchanged.
 */
export function favoriteFilterToArray(value: FavoriteFilterValue): string[] {
  if (value === 'all') return [];
  return [value];
}
