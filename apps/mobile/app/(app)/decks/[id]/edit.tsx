import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  type BackLanguageValue,
  CategoryUpdateInput,
  DECK_FOLDER_COLOR_PALETTE,
} from '@ensemble/types';

import { Button } from '../../../../src/components/Button';
import { FolderPicker } from '../../../../src/components/FolderPicker';
import { LanguagePicker } from '../../../../src/components/LanguagePicker';
import { TextField } from '../../../../src/components/TextField';
import { trpc } from '../../../../src/lib/trpc';

/**
 * Edit deck modal. Loads the current category, hydrates the form fields
 * once, and submits a partial update on save. Mirrors the web
 * EditCategoryDialog feature.
 */
export default function EditDeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = id as string;
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: category, isLoading } = trpc.categories.byId.useQuery({ id: categoryId });

  useEffect(() => {
    if (category && category.isOwner === false) {
      Alert.alert('Read-only deck', 'You can only edit decks that you own.', [
        { text: 'OK', onPress: () => router.replace(`/decks/${categoryId}`) },
      ]);
    }
  }, [category, router, categoryId]);

  // Only surface the audio-language picker if the server can actually call
  // Google Cloud TTS — otherwise the option would be a dead end.
  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery();
  const ttsAvailable = !!ttsAvailability?.available;

  // Folder — required.
  const { data: folders } = trpc.folders.list.useQuery();
  const { data: folderIdsForDeck } = trpc.folders.forDeck.useQuery({ categoryId });
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderHydrated, setFolderHydrated] = useState(false);
  const [folderError, setFolderError] = useState(false);

  // Hydrate folder from current membership once the query returns.
  useEffect(() => {
    if (!folderHydrated && folderIdsForDeck) {
      setFolderId(folderIdsForDeck[0] ?? null);
      setFolderHydrated(true);
    }
  }, [folderIdsForDeck, folderHydrated]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(DECK_FOLDER_COLOR_PALETTE[0]);
  const [backLanguage, setBackLanguage] = useState<BackLanguageValue | null>(null);
  // Privacy flag — "Deck public" toggle is the inverse of this.
  const [isPrivate, setIsPrivate] = useState(true);
  const [nameError, setNameError] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);

  // Seed the form from the fetched category once; don't clobber edits on
  // subsequent background refetches.
  useEffect(() => {
    if (category && !hydrated) {
      setName(category.name);
      setDescription((category as { description?: string | null }).description ?? '');
      // Fall back to the first palette swatch if the deck has no color set,
      // so the swatch UI always has a selected option.
      setColor(category.color ?? DECK_FOLDER_COLOR_PALETTE[0]);
      setBackLanguage((category.backLanguage as BackLanguageValue | null) ?? null);
      setIsPrivate((category as { private?: boolean }).private ?? true);
      setHydrated(true);
    }
  }, [category, hydrated]);

  const setDeckFolders = trpc.folders.setDeckFolders.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      utils.folders.forDeck.invalidate({ categoryId });
      router.back();
    },
    onError: (err) => Alert.alert('Could not assign folder', err.message),
  });

  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.byId.invalidate({ id: categoryId });
      utils.categories.list.invalidate();
      // Sync folder membership if it changed.
      const newFolderIds = folderId ? [folderId] : [];
      const prevFolderIds = folderIdsForDeck ?? [];
      const changed = [...newFolderIds].sort().join(',') !== [...prevFolderIds].sort().join(',');
      if (changed) {
        setDeckFolders.mutate({ categoryId, folderIds: newFolderIds });
      } else {
        router.back();
      }
    },
    onError: (err) => Alert.alert('Could not save deck', err.message),
  });

  function handleSubmit() {
    // Validate folder first.
    if (!folderId) {
      setFolderError(true);
      return;
    }
    setFolderError(false);
    setNameError(undefined);
    const parsed = CategoryUpdateInput.safeParse({
      id: categoryId,
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
    update.mutate(parsed.data);
  }

  const isBusy = update.isPending || setDeckFolders.isPending;

  if (isLoading || !category || category.isOwner === false) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-6 text-base text-slate-500">
          Update the deck name, color, and audio language.
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
              onChange={(newId) => {
                setFolderId(newId);
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
                  />
                );
              })}
            </View>
          </View>

          {ttsAvailable ? (
            <View className="gap-2">
              <Text className="text-sm font-medium text-slate-700">Language for translation</Text>
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
            <Switch value={!isPrivate} onValueChange={(checked) => setIsPrivate(!checked)} />
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
              Save
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
