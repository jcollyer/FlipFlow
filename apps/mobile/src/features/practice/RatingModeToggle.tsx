import { Pressable, Text, View } from 'react-native';

/**
 * Two rating modes used by the Play Flashcards filter modal:
 *   - 'basic' (default): three-chip rating filter (Challenging / Good / Easy / No rating).
 *   - 'advanced': seven-chip filter over the advancedDifficultyLevel tokens.
 *
 * Styled to match `PlayModeToggle`. Active/inactive styles are applied via
 * inline `style` rather than a dynamic className — that keeps NativeWind's
 * generated styles stable across renders and rules out a JSX/styling
 * reconciliation issue that previously surfaced as a misleading
 * "navigation context" error on the second Pressable during a state flip.
 */
export type RatingMode = 'basic' | 'advanced';

interface RatingModeToggleProps {
  value: RatingMode;
  onChange: (next: RatingMode) => void;
}

const ACTIVE_BG = { backgroundColor: '#ffffff' } as const;
// Match `shadow-sm` from Tailwind on iOS/Android. The values mirror what
// NativeWind compiles `shadow-sm` to so the look is unchanged.
const ACTIVE_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
} as const;

export function RatingModeToggle({ value, onChange }: RatingModeToggleProps) {
  const basicSelected = value === 'basic';
  const advancedSelected = value === 'advanced';
  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row items-center gap-0.5 self-start rounded-full bg-slate-100 p-0.5"
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: basicSelected }}
        accessibilityLabel="Basic Rating"
        onPress={() => onChange('basic')}
        className="rounded-full px-3 py-1.5"
        style={basicSelected ? [ACTIVE_BG, ACTIVE_SHADOW] : undefined}
      >
        <Text
          className="text-xs font-medium"
          style={{ color: basicSelected ? '#0f172a' : '#64748b' }}
        >
          Basic Rating
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: advancedSelected }}
        accessibilityLabel="Advanced Rating"
        onPress={() => onChange('advanced')}
        className="rounded-full px-3 py-1.5"
        style={advancedSelected ? [ACTIVE_BG, ACTIVE_SHADOW] : undefined}
      >
        <Text
          className="text-xs font-medium"
          style={{ color: advancedSelected ? '#0f172a' : '#64748b' }}
        >
          Advanced Rating
        </Text>
      </Pressable>
    </View>
  );
}
