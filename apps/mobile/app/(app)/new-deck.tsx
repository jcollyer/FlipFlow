import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';

import { type BackLanguageValue, CategoryCreateInput } from '@ensemble/types';

import { Button } from '../../src/components/Button';
import { FolderPicker } from '../../src/components/FolderPicker';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import { TextField } from '../../src/components/TextField';
import { trpc } from '../../src/lib/trpc';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/**
 * Modal for creating a deck. Same palette as the web app so a deck's
 * color shows up consistently across clients.
 */
export default function NewDeckScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Folder — required.
  const { data: folders } = trpc.folders.list.useQuery();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(PALETTE[0]!);
  const [backLanguage, setBackLanguage] = useState<BackLanguageValue | null>(null);
  // The toggle is "Deck public" and starts off, which corresponds to
  // `private = true` on the model.
  const [isPrivate, setIsPrivate] = useState(true);
  const [nameError, setNameError] = useState<string | undefined>();

  // Only surface the audio-language picker if the server can actually call
  // Google Cloud TTS — otherwise the option would be a dead end.
  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery();
  const ttsAvailable = !!ttsAvailability?.available;

  const setDeckFolders = trpc.folders.setDeckFolders.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert('Could not assign folder', err.message),
  });

  const create = trpc.categories.create.useMutation({
    onSuccess: (deck) => {
      utils.categories.list.invalidate();
      // Always assign the required folder.
      if (folderId) {
        setDeckFolders.mutate({ categoryId: deck.id, folderIds: [folderId] });
      } else {
        router.back();
      }
    },
    onError: (err) => Alert.alert('Could not create deck', err.message),
  });

  function handleSubmit() {
    // Validate folder first.
    if (!folderId) {
      setFolderError(true);
      return;
    }
    setFolderError(false);
    setNameError(undefined);
    const parsed = CategoryCreateInput.safeParse({
      name,
      description: description.trim() || null,
      color,
      backLanguage,
      private: isPrivate,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.find((i) => i.path[0] === 'name')?.message ?? 'Invalid input';
      setNameError(msg);
      return;
    }
    create.mutate(parsed.data);
  }

  const isBusy = create.isPending || setDeckFolders.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-6 text-base text-slate-500">
          Group related flashcards into a deck. You can change the name and color later.
        </Text>

        <View className="gap-5">
          {/* Folder — required, shown first */}
          <View className="gap-2">
            <Text className="text-sm font-medium text-slate-700">
              Folder <Text className="text-red-500">*</Text>
            </Text>
            <FolderPicker
              folders={folders ?? []}
              value={folderId}
              onChange={(id) => {
                setFolderId(id);
                setFolderError(false);
              }}
              disabled={isBusy}
            />
            {folderError ? (
              <Text className="text-sm text-red-500">Please select a folder.</Text>
            ) : null}
          </View>

          <TextField
            label="Name"
            placeholder="e.g. Spanish verbs"
            value={name}
            onChangeText={setName}
            error={nameError}
            autoFocus
            returnKeyType="next"
          />

          <TextField
            label="Description (optional)"
            placeholder="What is this deck about?"
            value={description}
            onChangeText={setDescription}
            multiline
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <View className="gap-2">
            <Text className="text-sm font-medium text-slate-700">Color</Text>
            <View className="flex-row flex-wrap gap-3">
              {PALETTE.map((c) => {
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
                  />
                );
              })}
            </View>
          </View>

          {ttsAvailable ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">
                Audio language (back of card)
              </Text>
              <LanguagePicker value={backLanguage} onChange={setBackLanguage} />
              <Text className="text-xs text-slate-500">
                Pick a language to enable a speaker button on the back of cards during practice.
              </Text>
            </View>
          ) : null}

          <View className="flex-row items-center justify-between gap-3">
            <View className="shrink gap-1">
              <Text className="text-sm font-medium text-slate-700">Deck public</Text>
              <Text className="text-xs text-slate-500">
                Off keeps the deck private to you. On makes it public.
              </Text>
            </View>
            <Switch
              // The control is "Deck public" — checked means not private.
              value={!isPrivate}
              onValueChange={(checked) => setIsPrivate(!checked)}
            />
          </View>
        </View>

        <View className="mt-8 flex-row gap-3">
          <View className="flex-1">
            <Button variant="ghost" onPress={() => router.back()}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={handleSubmit} loading={isBusy}>
              Create deck
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
