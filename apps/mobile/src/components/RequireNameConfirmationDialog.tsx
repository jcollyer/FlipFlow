import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Button } from './Button';
import { TextField } from './TextField';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** Singular noun for the thing being deleted, e.g. "Group" or "Folder". Used in the mismatch message. */
  confirmLabel: string;
  /** The name the user must type verbatim to enable the destructive button. */
  expectedName: string;
  /** Label on the destructive button (e.g. "Delete group" or "Deleting..."). */
  confirmActionLabel: string;
  isPending?: boolean;
  /** Override the default mismatch error message. */
  mismatchMessage?: string;
  /** Override how typed vs. expected names are compared (default: trim). */
  normalizeValue?: (value: string) => string;
  onConfirm: () => void;
}

/**
 * Mobile counterpart to the web `RequireNameConfirmationDialog`.
 *
 * Centered modal that explains the consequences of a destructive action and
 * requires the user to type the resource name before the confirm button
 * becomes enabled. Tap-outside-to-dismiss is disabled while a delete is in
 * flight to avoid orphaning the request.
 */
export function RequireNameConfirmationDialog({
  visible,
  onClose,
  title,
  description,
  confirmLabel,
  expectedName,
  confirmActionLabel,
  isPending = false,
  mismatchMessage,
  normalizeValue,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal opens/closes.
  useEffect(() => {
    if (!visible) {
      setValue('');
      setError(null);
    }
  }, [visible]);

  const normalize = normalizeValue ?? ((next: string) => next.trim());
  const isMatch = normalize(value) === normalize(expectedName);

  function handleConfirm() {
    if (!isMatch) {
      setError(
        mismatchMessage ?? `The ${confirmLabel.toLowerCase()} name you typed doesn't match.`,
      );
      return;
    }
    setError(null);
    onConfirm();
  }

  function handleRequestClose() {
    if (isPending) return;
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleRequestClose}>
      <TouchableWithoutFeedback onPress={handleRequestClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          {/* Swallow taps inside the sheet so they don't bubble to the backdrop. */}
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 14,
                  padding: 20,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.2,
                  shadowRadius: 16,
                  elevation: 12,
                }}
              >
                <Text className="text-destructive text-lg font-semibold">{title}</Text>
                <Text className="mt-2 text-sm text-slate-600">{description}</Text>

                <View className="mt-5 gap-2">
                  <Text className="text-sm text-slate-700">
                    To confirm, type{' '}
                    <Text className="font-mono font-semibold text-slate-900">{expectedName}</Text>{' '}
                    below:
                  </Text>
                  <TextField
                    value={value}
                    onChangeText={(t) => {
                      setValue(t);
                      setError(null);
                    }}
                    placeholder={expectedName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoFocus
                    editable={!isPending}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                    error={error ?? undefined}
                  />
                </View>

                <View className="mt-6 flex-row gap-3">
                  <View className="flex-1">
                    <Button variant="outline" onPress={onClose} disabled={isPending}>
                      Cancel
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Pressable
                      onPress={handleConfirm}
                      disabled={isPending || !isMatch}
                      className={`flex-row items-center justify-center rounded-lg px-4 py-3 ${
                        isPending || !isMatch
                          ? 'bg-destructive/50'
                          : 'bg-destructive active:opacity-80'
                      }`}
                    >
                      <Text className="font-semibold text-white">{confirmActionLabel}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
