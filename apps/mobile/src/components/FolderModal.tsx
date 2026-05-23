import { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';

import { DECK_FOLDER_COLOR_PALETTE } from '@ensemble/types';

import { Button } from './Button';
import { TextField } from './TextField';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FolderModalMode =
  | { kind: 'create' }
  | {
      kind: 'edit';
      folder: {
        id: string;
        name: string;
        color: string | null;
        description: string | null;
      };
    };

export interface FolderValues {
  name: string;
  color: string | null;
  description: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: FolderModalMode;
  /** Called with the validated values when the user submits the form. */
  onSubmit: (values: FolderValues) => void;
  isPending: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React-Native equivalent of the web FolderModal. Presents as a page-sheet
 * with name, color picker, and optional description.
 *
 * Follows the same Modal → SafeAreaView → ScrollView pattern as FolderPicker
 * (no KeyboardAvoidingView, which doesn't play well inside a sheet modal).
 */
export function FolderModal({ visible, onClose, mode, onSubmit, isPending }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DECK_FOLDER_COLOR_PALETTE[0]);
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();

  // Reset fields whenever the modal opens or switches between create/edit.
  useEffect(() => {
    if (!visible) return;
    if (mode.kind === 'edit') {
      setName(mode.folder.name);
      setColor(mode.folder.color ?? DECK_FOLDER_COLOR_PALETTE[0]);
      setDescription(mode.folder.description ?? '');
    } else {
      setName('');
      setColor(DECK_FOLDER_COLOR_PALETTE[0]);
      setDescription('');
    }
    setNameError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode.kind]);

  const isEdit = mode.kind === 'edit';

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Name is required');
      return;
    }
    setNameError(undefined);
    onSubmit({
      name: trimmedName,
      color: color ?? null,
      description: description.trim() || null,
    });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* Sheet header */}
        <View className="border-border flex-row items-center justify-between border-b px-4 py-3">
          <Pressable onPress={onClose} hitSlop={8} disabled={isPending}>
            <Text className="text-base font-medium text-slate-500">Cancel</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Edit folder' : 'Create a folder'}
          </Text>
          {/* Right-side spacer keeps the title visually centred. */}
          <View style={{ width: 56 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <Text className="mb-6 text-base text-slate-500">
            {isEdit
              ? 'Update the folder name, color, or description.'
              : 'Group decks together for better organization.'}
          </Text>

          <View className="gap-5">
            {/* Name — no autoFocus so the keyboard doesn't fire on open */}
            <TextField
              label="Name"
              placeholder="e.g. Languages"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setNameError(undefined);
              }}
              error={nameError}
              returnKeyType="next"
            />

            {/* Color palette */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Color</Text>
              <View className="flex-row flex-wrap gap-3">
                {DECK_FOLDER_COLOR_PALETTE.map((c) => {
                  const selected = c === color;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setColor(c)}
                      className="h-10 w-10 rounded-md"
                      style={{
                        backgroundColor: c,
                        borderWidth: selected ? 3 : 0,
                        borderColor: '#0f172a',
                      }}
                      accessibilityLabel={`Color ${c}`}
                      accessibilityState={{ selected }}
                    />
                  );
                })}
              </View>
            </View>

            {/* Description */}
            <TextField
              label="Description (optional)"
              placeholder="What's in this folder?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {/* Actions */}
          <View className="mt-8 flex-row gap-3">
            <View className="flex-1">
              <Button variant="ghost" onPress={onClose} disabled={isPending}>
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button onPress={handleSubmit} loading={isPending}>
                {isEdit ? 'Save' : 'Create folder'}
              </Button>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
