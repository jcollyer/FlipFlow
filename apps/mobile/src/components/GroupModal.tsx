import { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { DECK_FOLDER_COLOR_PALETTE, GroupCreateInput, GroupUpdateInput } from '@ensemble/types';

import { Button } from './Button';
import { TextField } from './TextField';

export type GroupModalMode =
  | { kind: 'create' }
  | {
      kind: 'edit';
      group: {
        id: string;
        name: string;
        color: string | null;
        description: string | null;
      };
    };

export type GroupValues =
  | {
      name: string;
      color?: string | null;
      description?: string | null;
    }
  | {
      id: string;
      name?: string;
      color?: string | null;
      description?: string | null;
    };

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: GroupModalMode;
  onSubmit: (values: GroupValues) => void;
  isPending: boolean;
}

/**
 * React-Native sheet modal for creating/editing groups. Mirrors FolderModal
 * so group CRUD feels native and consistent with the rest of the app.
 */
export function GroupModal({ visible, onClose, mode, onSubmit, isPending }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DECK_FOLDER_COLOR_PALETTE[0]);
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    if (mode.kind === 'edit') {
      setName(mode.group.name);
      setColor(mode.group.color ?? DECK_FOLDER_COLOR_PALETTE[0]);
      setDescription(mode.group.description ?? '');
    } else {
      setName('');
      setColor(DECK_FOLDER_COLOR_PALETTE[0]);
      setDescription('');
    }
    setNameError(undefined);
  }, [visible, mode]);

  const isEdit = mode.kind === 'edit';

  function handleSubmit() {
    const trimmedDescription = description.trim() || null;

    if (isEdit) {
      const parsed = GroupUpdateInput.safeParse({
        id: mode.group.id,
        name,
        color: color ?? null,
        description: trimmedDescription,
      });
      if (!parsed.success) {
        const message =
          parsed.error.issues.find((issue) => issue.path[0] === 'name')?.message ?? 'Invalid input';
        setNameError(message);
        return;
      }
      setNameError(undefined);
      onSubmit(parsed.data);
      return;
    }

    const parsed = GroupCreateInput.safeParse({
      name,
      color: color ?? null,
      description: trimmedDescription,
    });
    if (!parsed.success) {
      const message =
        parsed.error.issues.find((issue) => issue.path[0] === 'name')?.message ?? 'Invalid input';
      setNameError(message);
      return;
    }
    setNameError(undefined);
    onSubmit(parsed.data);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white">
        <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
          <Pressable onPress={onClose} hitSlop={8} disabled={isPending}>
            <Text className="text-base font-medium text-slate-500">Cancel</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Edit group' : 'Create a group'}
          </Text>
          <View style={{ width: 56 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text className="mb-6 text-base text-slate-500">
            {isEdit
              ? 'Update the group name, color, or description.'
              : 'Groups let you share decks with other people. Members can add their own decks and cards.'}
          </Text>

          <View className="gap-5">
            <TextField
              label="Name"
              placeholder="e.g. French class - Spring '26"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setNameError(undefined);
              }}
              error={nameError}
              returnKeyType="next"
            />

            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Color</Text>
              <View className="flex-row flex-wrap gap-3">
                {DECK_FOLDER_COLOR_PALETTE.map((swatch) => {
                  const selected = swatch === color;
                  return (
                    <Pressable
                      key={swatch}
                      onPress={() => setColor(swatch)}
                      className="h-10 w-10 rounded-md"
                      style={{
                        backgroundColor: swatch,
                        borderWidth: selected ? 3 : 0,
                        borderColor: '#0f172a',
                      }}
                      accessibilityLabel={`Color ${swatch}`}
                      accessibilityState={{ selected }}
                    />
                  );
                })}
              </View>
            </View>

            <TextField
              label="Description (optional)"
              placeholder="What is this group for?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          <View className="mt-8 flex-row gap-3">
            <View className="flex-1">
              <Button variant="ghost" onPress={onClose} disabled={isPending}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={handleSubmit} loading={isPending}>
                {isEdit ? 'Save' : 'Create group'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
