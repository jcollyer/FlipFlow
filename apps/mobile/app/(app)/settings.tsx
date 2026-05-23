import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';

import { trpc } from '../../src/lib/trpc';
import { useAuth } from '../../src/lib/AuthContext';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { TextField } from '../../src/components/TextField';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const MIME_TO_EXT: Record<AllowedMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(value: string | null | undefined) {
  const parts = (value ?? '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (value ?? '').slice(0, 2).toUpperCase();
}

/** Guess MIME type from a URI file extension, defaulting to image/jpeg. */
function mimeFromUri(uri: string): AllowedMimeType {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const utils = trpc.useUtils();
  const { signOut } = useAuth();

  const { data: me, isLoading } = trpc.auth.me.useQuery();

  // ── Local form state ──────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [allowPublicUser, setAllowPublicUser] = useState(false);
  const [defaultDeckPrivate, setDefaultDeckPrivate] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ── Delete account state ──────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState('');

  // ── Avatar state ──────────────────────────────────────────────────────────
  /** Local URI of a newly picked image, shown as an optimistic preview. */
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  /** When true the user has chosen to revert to initials on next save. */
  const [clearAvatar, setClearAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Sync from server (only overwrite when server value changes).
  useEffect(() => {
    if (me?.name != null) setName(me.name);
  }, [me?.name]);

  useEffect(() => {
    setAllowPublicUser(me?.private === false);
  }, [me?.private]);

  useEffect(() => {
    setDefaultDeckPrivate(me?.defaultDeckPrivate ?? true);
  }, [me?.defaultDeckPrivate]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const getUploadUrl = trpc.auth.getAvatarUploadUrl.useMutation();

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setSavedAt(Date.now());
      setPendingUri(null);
      setClearAvatar(false);
    },
    onError: (err) => {
      Alert.alert('Could not save settings', err.message);
    },
  });

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
    },
    onError: (err) => {
      Alert.alert('Could not delete account', err.message);
    },
  });

  function handleDeleteAccount() {
    const typedEmail = deleteEmailInput.trim();
    const accountEmail = (me?.email ?? '').trim();
    if (typedEmail.toLowerCase() !== accountEmail.toLowerCase()) {
      Alert.alert('Email does not match', 'Please type your account email exactly to confirm.');
      return;
    }
    deleteAccount.mutate({ confirmEmail: typedEmail });
  }

  // ── Dirty check ───────────────────────────────────────────────────────────
  const trimmed = name.trim();
  const avatarDirty = pendingUri !== null || (clearAvatar && !!me?.image);
  const dirty =
    trimmed.length > 0 &&
    (trimmed !== (me?.name ?? '') ||
      allowPublicUser !== (me?.private === false) ||
      defaultDeckPrivate !== (me?.defaultDeckPrivate ?? true) ||
      avatarDirty);

  // ── Avatar source to display ──────────────────────────────────────────────
  const displayedAvatar = clearAvatar ? null : (pendingUri ?? me?.image ?? null);
  const initials = getInitials(trimmed || me?.name || me?.email);

  // ── Image picker ──────────────────────────────────────────────────────────
  async function pickImage() {
    setAvatarError(null);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library in Settings to change your profile picture.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];

    // Validate file size if available.
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      setAvatarError('Image must be smaller than 5 MB. Please choose a smaller photo.');
      return;
    }

    setPendingUri(asset.uri);
    setClearAvatar(false);
    setSavedAt(null);
  }

  function handleUseInitials() {
    setPendingUri(null);
    setClearAvatar(true);
    setAvatarError(null);
    setSavedAt(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!trimmed) {
      setNameError('Name cannot be empty.');
      return;
    }
    if (trimmed.length > 80) {
      setNameError('Name must be 80 characters or fewer.');
      return;
    }
    setNameError(null);
    setSavedAt(null);

    // If there's a pending avatar, upload it first.
    let nextImage: string | null | undefined = clearAvatar ? null : undefined;

    if (pendingUri) {
      setIsUploading(true);
      try {
        const mimeType = mimeFromUri(pendingUri);

        // 1. Get presigned POST policy.
        const { url, fields, publicUrl } = await getUploadUrl.mutateAsync({
          contentType: mimeType,
          // Pass a safe upper-bound if actual size is unavailable.
          contentLength: MAX_BYTES,
        });

        // 2. Build multipart form — all policy fields first, then the file.
        //    React Native's FormData accepts { uri, name, type } for files.
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
        formData.append('file', {
          uri: pendingUri,
          name: `avatar.${MIME_TO_EXT[mimeType]}`,
          type: mimeType,
        } as unknown as Blob);

        // 3. POST directly to S3.
        const res = await fetch(url, { method: 'POST', body: formData });

        if (!res.ok) {
          throw new Error(`Upload failed (${res.status}). Please try again.`);
        }

        nextImage = publicUrl;
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // 4. Persist name, privacy settings, and (optionally) the new avatar URL.
    updateSettings.mutate({
      name: trimmed,
      private: !allowPublicUser,
      defaultDeckPrivate,
      ...(nextImage !== undefined ? { image: nextImage } : {}),
    });
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading && !me) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#5584bb" />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Profile card ─────────────────────────────────────────────────── */}
      <Card className="mb-4 gap-5 p-4">
        <Text className="text-base font-semibold text-slate-900">Profile</Text>

        {/* Avatar row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* Tappable avatar circle */}
          <Pressable onPress={pickImage} disabled={isUploading}>
            {({ pressed }) => (
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  opacity: pressed || isUploading ? 0.7 : 1,
                }}
              >
                {isUploading ? (
                  <ActivityIndicator color="#5584bb" />
                ) : displayedAvatar ? (
                  <>
                    <Image
                      source={{ uri: displayedAvatar }}
                      style={{ width: 72, height: 72, borderRadius: 36 }}
                    />
                    {/* Camera overlay hint */}
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 24,
                        backgroundColor: 'rgba(0,0,0,0.45)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Camera size={13} color="#ffffff" />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: '#475569' }}>
                      {initials}
                    </Text>
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 24,
                        backgroundColor: 'rgba(0,0,0,0.35)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Camera size={13} color="#ffffff" />
                    </View>
                  </>
                )}
              </View>
            )}
          </Pressable>

          {/* Buttons + hints */}
          <View style={{ flex: 1, gap: 8 }}>
            <Pressable onPress={pickImage} disabled={isUploading}>
              {({ pressed }) => (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    backgroundColor: pressed ? '#f1f5f9' : '#ffffff',
                    alignSelf: 'flex-start',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a' }}>
                    {displayedAvatar ? 'Change photo' : 'Upload photo'}
                  </Text>
                </View>
              )}
            </Pressable>

            {(displayedAvatar || pendingUri) && !clearAvatar ? (
              <Pressable onPress={handleUseInitials} disabled={isUploading}>
                {({ pressed }) => (
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '500',
                      color: pressed ? '#94a3b8' : '#64748b',
                    }}
                  >
                    Use initials instead
                  </Text>
                )}
              </Pressable>
            ) : null}

            <Text style={{ fontSize: 11, color: '#94a3b8' }}>
              JPEG, PNG, WebP or GIF · max 5 MB
            </Text>

            {avatarError ? (
              <Text style={{ fontSize: 12, color: '#ef4444' }}>{avatarError}</Text>
            ) : pendingUri && !isUploading ? (
              <Text style={{ fontSize: 11, color: '#64748b' }}>
                Photo ready — tap "Save changes" to apply.
              </Text>
            ) : clearAvatar ? (
              <Text style={{ fontSize: 11, color: '#64748b' }}>
                Initials will be used — tap "Save changes" to apply.
              </Text>
            ) : null}
          </View>
        </View>

        {/* Name field */}
        <TextField
          label="Name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setNameError(null);
            setSavedAt(null);
          }}
          placeholder="Your name"
          autoComplete="name"
          autoCorrect={false}
          maxLength={80}
          error={nameError ?? undefined}
        />

        {/* Email (read-only) */}
        <TextField
          label="Email"
          value={me?.email ?? ''}
          editable={false}
          hint="Your email is tied to your sign-in and can't be changed here."
          style={{ opacity: 0.6 }}
        />

        {savedAt && !dirty ? <Text className="text-xs text-slate-500">Settings saved.</Text> : null}
      </Card>

      {/* ── Privacy card ─────────────────────────────────────────────────── */}
      <Card className="mb-4 gap-4 p-4">
        <Text className="text-base font-semibold text-slate-900">Privacy &amp; Defaults</Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text className="text-sm font-medium text-slate-800">Public profile</Text>
            <Text className="mt-0.5 text-xs text-slate-500">
              Allow others to see your profile and public decks.
            </Text>
          </View>
          <Switch
            value={allowPublicUser}
            onValueChange={(v) => {
              setAllowPublicUser(v);
              setSavedAt(null);
            }}
            trackColor={{ false: '#cbd5e1', true: '#5584bb' }}
            thumbColor="#ffffff"
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text className="text-sm font-medium text-slate-800">New decks public by default</Text>
            <Text className="mt-0.5 text-xs text-slate-500">
              When on, newly created decks start as public.
            </Text>
          </View>
          <Switch
            value={!defaultDeckPrivate}
            onValueChange={(v) => {
              setDefaultDeckPrivate(!v);
              setSavedAt(null);
            }}
            trackColor={{ false: '#cbd5e1', true: '#5584bb' }}
            thumbColor="#ffffff"
          />
        </View>
      </Card>

      {/* ── Save button ───────────────────────────────────────────────────── */}
      <Button
        onPress={handleSave}
        disabled={!dirty || updateSettings.isPending || isUploading}
        loading={updateSettings.isPending || isUploading}
      >
        Save changes
      </Button>

      {/* ── Account card ─────────────────────────────────────────────────── */}
      <Card className="mt-4 gap-3 p-4">
        <Text className="text-base font-semibold text-slate-900">Account</Text>

        {!showDeleteConfirm ? (
          <Pressable onPress={() => setShowDeleteConfirm(true)} disabled={deleteAccount.isPending}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: '#fca5a5',
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: pressed ? '#fef2f2' : '#fff5f5',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626' }}>
                    Delete account
                  </Text>
                  <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                    Permanently removes all your data.
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: '#fca5a5', marginLeft: 8 }}>→</Text>
              </View>
            )}
          </Pressable>
        ) : (
          <View style={{ gap: 12 }}>
            <View
              style={{
                backgroundColor: '#fef2f2',
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#dc2626', marginBottom: 4 }}>
                This cannot be undone
              </Text>
              <Text style={{ fontSize: 12, color: '#ef4444', lineHeight: 18 }}>
                All your decks, cards, practice history, and account data will be permanently
                deleted. Type your account email below to confirm.
              </Text>
            </View>

            <TextField
              label={`Type "${me?.email ?? 'your email'}" to confirm`}
              value={deleteEmailInput}
              onChangeText={setDeleteEmailInput}
              placeholder={me?.email ?? 'your@email.com'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!deleteAccount.isPending}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setDeleteEmailInput('');
                }}
                disabled={deleteAccount.isPending}
                style={{ flex: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 11,
                      alignItems: 'center',
                      backgroundColor: pressed ? '#f1f5f9' : '#ffffff',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>
                      Cancel
                    </Text>
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={handleDeleteAccount}
                disabled={deleteAccount.isPending || !deleteEmailInput.trim()}
                style={{ flex: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      borderRadius: 8,
                      paddingVertical: 11,
                      alignItems: 'center',
                      backgroundColor:
                        deleteAccount.isPending || !deleteEmailInput.trim()
                          ? '#fca5a5'
                          : pressed
                            ? '#b91c1c'
                            : '#dc2626',
                    }}
                  >
                    {deleteAccount.isPending ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>
                        Delete permanently
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
