import { useState } from 'react';
import { FlatList, Modal, Pressable, SafeAreaView, Text, View } from 'react-native';

interface Folder {
  id: string;
  name: string;
  color: string | null;
}

function labelFor(folders: Folder[], id: string | null): string {
  if (!id) return 'Select a folder…';
  return folders.find((f) => f.id === id)?.name ?? 'Select a folder…';
}

interface Props {
  /** All folders the user owns. */
  folders: Folder[];
  /** Currently selected folder id, or null if nothing selected. */
  value: string | null;
  /** Called with the selected folder id. */
  onChange: (id: string) => void;
  /** Disable the trigger (e.g. while a save mutation is pending). */
  disabled?: boolean;
}

/**
 * Trigger button + modal list for choosing a folder. Follows the same
 * pattern as LanguagePicker so the UI is consistent across pickers.
 */
export function FolderPicker({ folders, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled || folders.length === 0}
        accessibilityLabel="Select folder"
        accessibilityRole="button"
        className="border-border flex-row items-center justify-between rounded-lg border bg-white px-4 py-3 active:opacity-80"
        style={{ opacity: disabled || folders.length === 0 ? 0.5 : 1 }}
      >
        <Text className={`text-base ${value ? 'text-slate-900' : 'text-slate-400'}`}>
          {folders.length === 0 ? 'No folders yet — create one first' : labelFor(folders, value)}
        </Text>
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
            <Text className="text-lg font-semibold text-slate-900">Select folder</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8} className="px-2 py-1">
              <Text className="text-primary text-base font-medium">Done</Text>
            </Pressable>
          </View>

          <FlatList
            data={folders}
            keyExtractor={(f) => f.id}
            ItemSeparatorComponent={() => <View className="bg-border ml-4 h-px" />}
            renderItem={({ item }) => {
              const selected = item.id === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between bg-white px-4 py-3 active:bg-slate-100"
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: item.color ?? '#94a3b8' }}
                    />
                    <Text className="text-base text-slate-900">{item.name}</Text>
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
