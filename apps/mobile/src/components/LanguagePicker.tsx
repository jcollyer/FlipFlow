import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from 'react-native';

import { BACK_LANGUAGES, type BackLanguageValue } from '@flipflow/types';

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
        className="flex-row items-center justify-between rounded-lg border border-border bg-white px-4 py-3 active:opacity-80"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <Text className="text-base text-slate-900">{labelFor(value)}</Text>
        <Text className="text-base text-slate-400">▾</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-white">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-lg font-semibold text-slate-900">Audio language</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} className="px-2 py-1">
              <Text className="text-base font-medium text-primary">Done</Text>
            </Pressable>
          </View>

          <FlatList
            data={OPTIONS}
            keyExtractor={(o) => o.value}
            ItemSeparatorComponent={() => (
              <View className="ml-4 h-px bg-border" />
            )}
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
                  {selected ? (
                    <Text className="text-base font-semibold text-primary">✓</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
