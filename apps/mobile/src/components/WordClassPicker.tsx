import { useState } from 'react';
import { FlatList, Modal, Pressable, SafeAreaView, Text, View } from 'react-native';

import { WORD_CLASS_OPTIONS } from '@ensemble/types';

/**
 * Sentinel for "no class selected". We use a string instead of `null` so the
 * FlatList key extractor has a stable string per row and the row data stays
 * uniform with the rest of the WORD_CLASS_OPTIONS list.
 */
const NO_CLASS = '__none__';

interface Option {
  value: string;
  label: string;
  description?: string;
}

const OPTIONS: Option[] = [
  { value: NO_CLASS, label: 'None', description: 'No part of speech.' },
  ...WORD_CLASS_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    description: o.description,
  })),
];

function labelFor(value: string | null): string {
  if (!value) return 'None';
  return WORD_CLASS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

interface Props {
  /** Current selection. `null` = no class chosen. */
  value: string | null;
  /** Called with `null` if the user picks "None", otherwise the canonical class value. */
  onChange: (next: string | null) => void;
  /** Disable the trigger (e.g. while a save mutation is pending). */
  disabled?: boolean;
  /** Accessible label / placeholder when used without an external label. */
  accessibilityLabel?: string;
}

/**
 * Trigger button + modal list for choosing a flashcard's word class
 * (noun / verb / adjective / …). Mirrors LanguagePicker's pattern so the
 * two pickers feel identical on both iOS and Android. Tapping a row commits
 * the change and dismisses the modal.
 */
export function WordClassPicker({ value, onChange, disabled, accessibilityLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel ?? 'Select word class'}
        accessibilityRole="button"
        className="border-border flex-row items-center justify-between rounded-lg border bg-white px-4 py-3 active:opacity-80"
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
          <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
            <Text className="text-lg font-semibold text-slate-900">Word class</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} className="px-2 py-1">
              <Text className="text-primary text-base font-medium">Done</Text>
            </Pressable>
          </View>

          <FlatList
            data={OPTIONS}
            keyExtractor={(o) => o.value}
            ItemSeparatorComponent={() => <View className="bg-border ml-4 h-px" />}
            renderItem={({ item }) => {
              const selected = (item.value === NO_CLASS && value === null) || item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value === NO_CLASS ? null : item.value);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between gap-3 bg-white px-4 py-3 active:bg-slate-100"
                >
                  <View className="flex-1">
                    <Text className="text-base text-slate-900">{item.label}</Text>
                    {item.description ? (
                      <Text className="mt-0.5 text-xs text-slate-500">{item.description}</Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Text className="text-primary text-base font-semibold">✓</Text>
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
