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

import { type BackLanguageValue, CategoryUpdateInput } from '@ensemble/types';

import { Button } from '../../../../src/components/Button';
import { LanguagePicker } from '../../../../src/components/LanguagePicker';
import { TextField } from '../../../../src/components/TextField';
import { trpc } from '../../../../src/lib/trpc';

// Same palette as the create-deck screen (and the web app) so editing
// matches creating and a deck's color stays consistent across clients.
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

  // Only surface the audio-language picker if the server can actually call
  // Google Cloud TTS — otherwise the option would be a dead end.
  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery();
  const ttsAvailable = !!ttsAvailability?.available;

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PALETTE[0]!);
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
      // Fall back to the first palette swatch if the deck has no color set,
      // so the swatch UI always has a selected option.
      setColor(category.color ?? PALETTE[0]!);
      setBackLanguage((category.backLanguage as BackLanguageValue | null) ?? null);
      setIsPrivate((category as { private?: boolean }).private ?? true);
      setHydrated(true);
    }
  }, [category, hydrated]);

  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.byId.invalidate({ id: categoryId });
      utils.categories.list.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert('Could not save deck', err.message),
  });

  function handleSubmit() {
    setNameError(undefined);
    const parsed = CategoryUpdateInput.safeParse({
      id: categoryId,
      name,
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

  if (isLoading || !category) {
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
          <TextField
            label="Name"
            placeholder="e.g. Spanish verbs"
            value={name}
            onChangeText={setName}
            error={nameError}
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
            <Button onPress={handleSubmit} loading={update.isPending}>
              Save
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
