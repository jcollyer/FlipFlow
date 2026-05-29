import { Pressable, Text, View } from 'react-native';

export type RatingMode = 'basic' | 'advanced';

interface RatingModeToggleProps {
  value: RatingMode;
  onChange: (next: RatingMode) => void;
}

const OPTIONS: { value: RatingMode; label: string }[] = [
  { value: 'basic', label: 'Rating' },
  { value: 'advanced', label: 'Advanced Rating' },
];

export function RatingModeToggle({ value, onChange }: RatingModeToggleProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row items-center gap-0.5 self-start rounded-full bg-slate-100 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 ${selected ? 'bg-white shadow-sm' : ''}`}
          >
            <Text
              className={`text-xs font-medium ${selected ? 'text-slate-900' : 'text-slate-500'}`}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
