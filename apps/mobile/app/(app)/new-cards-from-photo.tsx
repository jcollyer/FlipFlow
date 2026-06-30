import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type AiCardDraft,
  type BackLanguageValue,
  backLanguageName,
  GENDER_OPTIONS,
  type GenderValue,
} from '@ensemble/types';

import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { WordClassPicker } from '../../src/components/WordClassPicker';
import { trpc } from '../../src/lib/trpc';

/** Hard cap mirroring the server's base64 limit (~8MB). We compress on pick,
 *  but bail early with a friendly message if a photo is still too large. */
const MAX_BASE64_BYTES = 7_800_000;

/** Editable draft in the review list — example arrays kept paired by index. */
interface EditableDraft {
  id: string;
  front: string;
  back: string;
  examples: Array<{ front: string; back: string }>;
  class: string | null;
  gender: GenderValue | null;
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `draft_${localIdCounter}`;
}

function toEditable(draft: AiCardDraft): EditableDraft {
  const examples: Array<{ front: string; back: string }> = [];
  const len = Math.min(draft.frontExamples.length, draft.backExamples.length);
  for (let i = 0; i < len; i += 1) {
    examples.push({ front: draft.frontExamples[i] ?? '', back: draft.backExamples[i] ?? '' });
  }
  return {
    id: nextLocalId(),
    front: draft.front,
    back: draft.back,
    examples,
    class: draft.class ?? null,
    gender: (draft.gender as GenderValue | null) ?? null,
  };
}

/**
 * "New cards from photo" — mobile counterpart of the web GenerateCardsFromPhoto
 * dialog. The user picks a photo (library or camera); GPT-4o reads it and
 * drafts flashcards (English front, deck-language back, with example
 * sentences). Drafts are shown in an editable review list and only saved to
 * the deck when the user confirms.
 */
export default function NewCardsFromPhotoScreen() {
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const categoryId = typeof params.categoryId === 'string' ? params.categoryId : '';

  const router = useRouter();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();

  const { data: category } = trpc.categories.byId.useQuery(
    { id: categoryId },
    { enabled: !!categoryId },
  );
  const backLanguage = (category?.backLanguage as BackLanguageValue | null) ?? null;
  const languageLabel = backLanguageName(backLanguage) || 'the deck language';

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = trpc.cardsAi.generateFromImage.useMutation();
  const createMany = trpc.flashcards.createMany.useMutation();

  function assetToDataUrl(asset: ImagePicker.ImagePickerAsset): string | null {
    if (!asset.base64) return null;
    const mime = asset.mimeType ?? 'image/jpeg';
    return `data:${mime};base64,${asset.base64}`;
  }

  async function handlePicked(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const dataUrl = assetToDataUrl(asset);
    if (!dataUrl) {
      setError('Could not read that image. Please try another photo.');
      return;
    }
    if (dataUrl.length > MAX_BASE64_BYTES) {
      setError('That photo is too large. Please choose a smaller or lower-resolution image.');
      return;
    }
    setError(null);
    setDrafts(null);
    generate.reset();
    setImageDataUrl(dataUrl);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to upload a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.5,
      base64: true,
    });
    await handlePicked(result);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
    });
    await handlePicked(result);
  }

  function handleGenerate() {
    if (!imageDataUrl || !backLanguage) return;
    setError(null);
    generate.mutate(
      { imageDataUrl, backLanguage },
      {
        onSuccess: ({ cards }) => {
          if (cards.length === 0) {
            setError('No vocabulary was found in that image. Try a clearer photo or another page.');
            setDrafts(null);
            return;
          }
          setDrafts(cards.map(toEditable));
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  function updateDraft(id: string, patch: Partial<EditableDraft>) {
    setDrafts((prev) => (prev ? prev.map((d) => (d.id === id ? { ...d, ...patch } : d)) : prev));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
  }

  function addExample(id: string) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id ? { ...d, examples: [...d.examples, { front: '', back: '' }] } : d,
          )
        : prev,
    );
  }

  function updateExample(id: string, idx: number, side: 'front' | 'back', value: string) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  examples: d.examples.map((ex, i) => (i === idx ? { ...ex, [side]: value } : ex)),
                }
              : d,
          )
        : prev,
    );
  }

  function removeExample(id: string, idx: number) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id ? { ...d, examples: d.examples.filter((_, i) => i !== idx) } : d,
          )
        : prev,
    );
  }

  const validCount = drafts ? drafts.filter((d) => d.front.trim() && d.back.trim()).length : 0;

  function handleSave() {
    if (!drafts || !categoryId) return;
    setError(null);

    const payload = drafts
      .map((d) => {
        const examples = d.examples
          .map((ex) => ({ front: ex.front.trim(), back: ex.back.trim() }))
          .filter((ex) => ex.front && ex.back);
        return {
          front: d.front.trim(),
          back: d.back.trim(),
          frontExamples: examples.map((e) => e.front),
          backExamples: examples.map((e) => e.back),
          class: d.class,
          gender: d.gender ?? undefined,
          verb_type: null,
          pronunciation: null,
        };
      })
      .filter((c) => c.front && c.back);

    if (payload.length === 0) {
      setError('Every card needs a front and a back before saving.');
      return;
    }

    createMany.mutate(
      { categoryId, cards: payload },
      {
        onSuccess: () => {
          utils.flashcards.listByCategory.invalidate({ categoryId });
          utils.flashcards.listAll.invalidate();
          utils.categories.list.invalidate();
          utils.practice.stats.invalidate();
          router.back();
        },
        onError: (err) => Alert.alert('Could not add cards', err.message),
      },
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <Stack.Screen options={{ title: 'New cards from photo' }} />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-5 text-base text-slate-500">
          Upload a photo of a vocabulary list. We&apos;ll read it and draft cards with English on
          the front and {languageLabel} on the back. Review and edit before saving.
        </Text>

        {!backLanguage ? (
          <View className="border-destructive/40 bg-destructive/5 mb-5 rounded-lg border p-3">
            <Text className="text-destructive text-sm">
              This deck doesn&apos;t have a back-of-card language set yet. Add one in Edit deck so
              we know which language to translate into.
            </Text>
          </View>
        ) : null}

        {/* Image preview + picker */}
        {imageDataUrl ? (
          <View className="mb-4 overflow-hidden rounded-lg border border-slate-200">
            <Image
              source={{ uri: imageDataUrl }}
              style={{ width: '100%', height: 220 }}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {!drafts ? (
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button variant="outline" onPress={pickFromLibrary} disabled={!backLanguage}>
                  {imageDataUrl ? 'Choose another' : 'Choose photo'}
                </Button>
              </View>
              <View className="flex-1">
                <Button variant="outline" onPress={takePhoto} disabled={!backLanguage}>
                  Take photo
                </Button>
              </View>
            </View>

            {imageDataUrl ? (
              <Button
                onPress={handleGenerate}
                loading={generate.isPending}
                disabled={!backLanguage}
              >
                {generate.isPending ? 'Reading photo…' : 'Generate cards'}
              </Button>
            ) : null}
          </View>
        ) : null}

        {generate.isPending ? (
          <View className="mt-4 flex-row items-center justify-center gap-2">
            <ActivityIndicator size="small" color="#5584bb" />
            <Text className="text-sm text-slate-500">Reading photo…</Text>
          </View>
        ) : null}

        {error ? <Text className="text-destructive mt-3 text-sm">{error}</Text> : null}

        {/* Review list */}
        {drafts ? (
          <View className="mt-2 gap-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-slate-900">
                {validCount} card{validCount === 1 ? '' : 's'} ready
              </Text>
              <Pressable
                onPress={() => {
                  setDrafts(null);
                  setImageDataUrl(null);
                  generate.reset();
                }}
                className="active:opacity-70"
              >
                <Text className="text-primary text-sm font-medium">Start over</Text>
              </Pressable>
            </View>

            {drafts.map((d, idx) => (
              <View key={d.id} className="gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-semibold text-slate-500">Card {idx + 1}</Text>
                  <Pressable
                    onPress={() => removeDraft(d.id)}
                    hitSlop={8}
                    className="active:opacity-70"
                  >
                    <Text className="text-destructive text-sm font-medium">Remove</Text>
                  </Pressable>
                </View>

                <TextField
                  label="Front (English)"
                  value={d.front}
                  onChangeText={(v) => updateDraft(d.id, { front: v })}
                />
                <TextField
                  label={`Back (${languageLabel})`}
                  value={d.back}
                  onChangeText={(v) => updateDraft(d.id, { back: v })}
                />

                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-slate-700">Part of speech</Text>
                  <WordClassPicker
                    value={d.class}
                    onChange={(next) => updateDraft(d.id, { class: next })}
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-slate-700">Gender</Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => updateDraft(d.id, { gender: null })}
                      className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                        d.gender === null
                          ? 'border-primary bg-primary'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          d.gender === null ? 'text-white' : 'text-slate-700'
                        }`}
                      >
                        None
                      </Text>
                    </Pressable>
                    {GENDER_OPTIONS.map((opt) => {
                      const active = d.gender === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => updateDraft(d.id, { gender: opt.value })}
                          className={`flex-1 rounded-md border px-3 py-2 active:opacity-80 ${
                            active ? 'border-primary bg-primary' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <Text
                            className={`text-center text-sm font-semibold ${
                              active ? 'text-white' : 'text-slate-700'
                            }`}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="gap-2">
                  <Text className="text-sm font-medium text-slate-700">Example sentences</Text>
                  {d.examples.map((ex, exIdx) => (
                    <View key={exIdx} className="gap-1.5">
                      <View className="flex-row items-center gap-2">
                        <View className="flex-1">
                          <TextField
                            placeholder="English example"
                            value={ex.front}
                            onChangeText={(v) => updateExample(d.id, exIdx, 'front', v)}
                          />
                        </View>
                        <Pressable
                          onPress={() => removeExample(d.id, exIdx)}
                          hitSlop={8}
                          className="h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white active:opacity-70"
                        >
                          <Text className="text-base text-slate-500">✕</Text>
                        </Pressable>
                      </View>
                      <TextField
                        placeholder={`${languageLabel} translation`}
                        value={ex.back}
                        onChangeText={(v) => updateExample(d.id, exIdx, 'back', v)}
                      />
                    </View>
                  ))}
                  <Pressable
                    onPress={() => addExample(d.id)}
                    className="flex-row items-center gap-2 py-1 active:opacity-70"
                  >
                    <Text className="text-primary text-sm font-medium">+ Add example</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

      </ScrollView>

      {/* Floating action bar — pinned to the bottom of the view so the primary
          action stays reachable without scrolling to the end of the list. */}
      <View
        className="flex-row gap-3 border-t border-slate-200 bg-white px-5 pt-3"
        style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }}
      >
        <View className="flex-1">
          <Button variant="ghost" onPress={() => router.back()}>
            Cancel
          </Button>
        </View>
        {drafts ? (
          <View className="flex-1">
            <Button
              onPress={handleSave}
              loading={createMany.isPending}
              disabled={validCount === 0}
            >
              {`Add ${validCount} card${validCount === 1 ? '' : 's'}`}
            </Button>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}
