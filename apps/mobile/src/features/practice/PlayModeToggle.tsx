import { Pressable, Text, View } from 'react-native';

/**
 * Two play modes used by the mobile Play / Practice entry points:
 *   - 'in_order' (default): walk the deck in its existing chronological order.
 *   - 'shuffle': randomize once per session, re-shuffle on "Play again".
 *
 * Mirrors the web `PlayModeToggle` so the URL query param (`shuffle=1`) and
 * the user-visible labels stay consistent across platforms.
 */
export type PlayMode = 'in_order' | 'shuffle';

interface PlayModeToggleProps {
  value: PlayMode;
  onChange: (next: PlayMode) => void;
}

/**
 * Segmented toggle for choosing chronological vs shuffled playback. Placed
 * next to the Play / Practice button on every entry point.
 */
export function PlayModeToggle({ value, onChange }: PlayModeToggleProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row items-center gap-0.5 self-start rounded-full bg-slate-100 p-0.5"
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'in_order' }}
        onPress={() => onChange('in_order')}
        className={`rounded-full px-3 py-1.5 ${
          value === 'in_order' ? 'bg-white shadow-sm' : ''
        }`}
      >
        <Text
          className={`text-xs font-medium ${
            value === 'in_order' ? 'text-slate-900' : 'text-slate-500'
          }`}
        >
          In order
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'shuffle' }}
        onPress={() => onChange('shuffle')}
        className={`rounded-full px-3 py-1.5 ${
          value === 'shuffle' ? 'bg-white shadow-sm' : ''
        }`}
      >
        <Text
          className={`text-xs font-medium ${
            value === 'shuffle' ? 'text-slate-900' : 'text-slate-500'
          }`}
        >
          Shuffle
        </Text>
      </Pressable>
    </View>
  );
}
