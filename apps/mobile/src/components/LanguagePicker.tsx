import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, SafeAreaView, Text, View } from 'react-native';

import { BACK_LANGUAGES, type BackLanguageValue } from '@ensemble/types';

/**
 * Sentinel for "no audio". We use a string instead of `null` because the
 * FlatList key extractor needs a stable string per row, and using a
 * sentinel keeps the row data uniform.
 */
const NO_LANGUAGE = '__none__';

interface Option {
  value: typeof NO_LANGUAGE | BackLanguageValue;
  label: string;
}

const OPTIONS: Option[] = [
  { value: NO_LANGUAGE, label: 'No audio' },
  ...BACK_LANGUAGES.map((l) => ({ value: l.value, label: l.label })),
];

function labelFor(value: BackLanguageValue | null): string {
  if (!value) return 'No audio';
  return BACK_LANGUAGES.find((l) => l.value === value)?.label ?? value;
}

interface Props {
  /** Current selection. `null` = no audio. */
  value: BackLanguageValue | null;
  /** Called with `null` if the user picks "No audio", otherwise the BCP-47 tag. */
  onChange: (next: BackLanguageValue | null) => void;
  /** Disable the trigger (e.g. while a save mutation is pending). */
  disabled?: boolean;
  /** Accessible label / placeholder when used without an external label. */
  accessibilityLabel?: string;
}

/**
 * Trigger button + modal list for choosing a back-of-card audio language.
 *
 * Mobile doesn't have a dropdown primitive in our stock components, and
 * `@react-native-picker/picker` ships a different look on each platform.
 * A modal with a `FlatList` keeps the look consistent and matches the
 * user's expectation for a "tap to select from a list" interaction on both
 * iOS and Android. Tapping a row commits the change and closes the modal.
 */
export function LanguagePicker({ value, onChange, disabled, accessibilityLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? 'Select audio language'}
        accessibilityRole="button"
        className="border-border flex-row items-center justify-between rounded-lg border bg-white px-4 py-3 active:opacity-80"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Text className="text-base text-slate-900">{labelFor(value)}</Text>
        <ChevronDown size={18} color="#94a3b8" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
            <Text className="text-lg font-semibold text-slate-900">Audio language</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} className="px-2 py-1">
              <Text className="text-primary text-base font-medium">Done</Text>
            </Pressable>
          </View>

          <FlatList
            data={OPTIONS}
            keyExtractor={(o) => o.value}
            ItemSeparatorComponent={() => <View className="bg-border ml-4 h-px" />}
            renderItem={({ item }) => {
              const selected =
                (item.value === NO_LANGUAGE && value === null) || item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value === NO_LANGUAGE ? null : (item.value as BackLanguageValue));
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between bg-white px-4 py-3 active:bg-slate-100"
                >
                  <Text className="text-base text-slate-900">{item.label}</Text>
                  {selected ? <Check size={18} color="#5584bb" /> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
