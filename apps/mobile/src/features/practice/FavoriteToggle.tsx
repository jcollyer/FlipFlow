import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

/**
 * Segmented "Favorite" filter for the Play Flashcards modal. Three states:
 *   - 'all' (default): no favorite filter
 *   - 'favorite': only show favorited cards
 *   - 'not_favorite': only show non-favorited cards
 *
 * Styled to match `PlayModeToggle` so the modal's segmented controls read
 * as a consistent set. No external label — the segments themselves carry
 * the meaning. The callers keep their underlying `selectedFavorites: string[]`
 * state so URL params and filter logic don't change; the helpers below
 * convert between the array and the radio-style value.
 */
export type FavoriteFilterValue = 'all' | 'favorite' | 'not_favorite';

interface Props {
  value: FavoriteFilterValue;
  onChange: (next: FavoriteFilterValue) => void;
  /**
   * When true the control is non-interactive and visually muted. Used by the
   * Favorites view's Play modal, where every card is already a favorite so the
   * filter is fixed to "Favorite" and shown grayed out.
   */
  disabled?: boolean;
}

const OPTIONS: {
  value: FavoriteFilterValue;
  label: string;
  icon: 'list' | 'heart' | 'slash';
}[] = [
  { value: 'all', label: 'All', icon: 'list' },
  { value: 'favorite', label: 'Favorite', icon: 'heart' },
  { value: 'not_favorite', label: 'Not favorite', icon: 'slash' },
];

export function FavoriteToggle({ value, onChange, disabled = false }: Props) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Favorite filter"
      accessibilityState={{ disabled }}
      className="flex-row items-center gap-0.5 self-start rounded-full bg-slate-100 p-0.5"
      style={disabled ? { opacity: 0.5 } : undefined}
    >
      {OPTIONS.map((opt) => {
        const checked = value === opt.value;
        // Use rose when "Favorite" is the active segment so it visually
        // echoes the heart used on cards and in the rating panel.
        const iconColor =
          checked && opt.value === 'favorite' ? '#e11d48' : checked ? '#0f172a' : '#94a3b8';
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: checked, disabled }}
            accessibilityLabel={opt.label}
            disabled={disabled}
            onPress={() => onChange(opt.value)}
            className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
            style={
              checked
                ? {
                    backgroundColor: '#ffffff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                : undefined
            }
          >
            <Feather name={opt.icon} size={12} color={iconColor} />
            <Text
              className="text-xs font-medium"
              style={{
                color: checked ? (opt.value === 'favorite' ? '#e11d48' : '#0f172a') : '#64748b',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert `selectedFavorites: string[]` to the toggle's single-value form.
 * Anything that isn't exactly `['favorite']` or `['not_favorite']` collapses
 * to `'all'` (empty array, both selected, or unrecognized tokens all mean
 * "no filter").
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
