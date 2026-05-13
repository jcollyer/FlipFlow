'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Download, Globe, Loader2 } from 'lucide-react';

import { BACK_LANGUAGES } from '@ensemble/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';

// Sentinel because Radix Select doesn't allow an empty-string value.
const NO_LANGUAGE = '__none__';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — must match the server-side cap

function getInitials(value: string | null | undefined) {
  return (
    value
      ?.split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

/**
 * /app/settings — read-only profile info plus an inline editor for the user's
 * display name. The session.user.name on the layout will pick up the change
 * on the next refresh; we router.refresh() after a successful save so the
 * header initials/label update immediately.
 */
export function SettingsView() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: me, isLoading } = trpc.auth.me.useQuery();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [allowPublicUser, setAllowPublicUser] = useState(false);
  const [defaultDeckPrivate, setDefaultDeckPrivate] = useState(true);
  // `undefined`  = user hasn't changed this yet; fall back to the server value
  // `null`       = user explicitly cleared the language
  // `string`     = user explicitly selected a language
  const [pendingLanguage, setPendingLanguage] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ── Avatar upload state ──────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Local object URL shown as a preview before the upload completes. */
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  /** The file the user just picked, waiting to be uploaded on Save. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** Undefined means unchanged; 'initials' means clear the saved photo on save. */
  const [pendingAvatarMode, setPendingAvatarMode] = useState<'initials' | undefined>(undefined);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Sync inputs from the server. Only overwrite when the server value changes
  // so a slow refetch doesn't clobber mid-edit text.
  useEffect(() => {
    if (me?.name != null) setName(me.name);
  }, [me?.name]);

  useEffect(() => {
    setBio(me?.bio ?? '');
  }, [me?.bio]);

  useEffect(() => {
    setAllowPublicUser(me?.private === false);
  }, [me?.private]);

  useEffect(() => {
    setDefaultDeckPrivate(me?.defaultDeckPrivate ?? true);
  }, [me?.defaultDeckPrivate]);

  const getUploadUrl = trpc.auth.getAvatarUploadUrl.useMutation();

  const updateSettings = trpc.auth.updateSettings.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      utils.auth.getSession.invalidate();
      setSavedAt(Date.now());
      setPendingFile(null);
      setAvatarPreview(null);
      setPendingAvatarMode(undefined);
      setPendingLanguage(undefined);
      // Refresh the server component layout so the header dropdown picks up
      // the new name / avatar without a full page reload.
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const trimmed = name.trim();
  const trimmedBio = bio.trim();
  const avatarDirty = pendingFile !== null || (pendingAvatarMode === 'initials' && !!me?.image);
  // Derive the value to show/save: fall back to the server value until the
  // user explicitly touches the dropdown (pendingLanguage !== undefined).
  const effectiveLanguage =
    pendingLanguage !== undefined ? pendingLanguage : (me?.defaultLanguage ?? null);
  const avatarInitials = getInitials(trimmed || me?.name || me?.email);
  const dirty =
    trimmed.length > 0 &&
    (trimmed !== (me?.name ?? '') ||
      trimmedBio !== (me?.bio ?? '') ||
      allowPublicUser !== (me?.private === false) ||
      defaultDeckPrivate !== (me?.defaultDeckPrivate ?? true) ||
      (pendingLanguage !== undefined && pendingLanguage !== (me?.defaultLanguage ?? null)) ||
      avatarDirty);

  // ── File picker handler ──────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target.files) return;
    // Reset so the same file can be re-selected after an error
    e.target.value = '';

    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
      setAvatarError('Please choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setAvatarError('Image must be smaller than 5 MB.');
      return;
    }

    // Revoke any previous object URL to avoid memory leaks
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);

    setAvatarError(null);
    setPendingFile(file);
    setPendingAvatarMode(undefined);
    setAvatarPreview(URL.createObjectURL(file));
    setSavedAt(null);
  }

  function handleUseInitials() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingFile(null);
    setAvatarPreview(null);
    setPendingAvatarMode('initials');
    setAvatarError(null);
    setSavedAt(null);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dirty) return;

    let nextImage: string | null | undefined = pendingAvatarMode === 'initials' ? null : undefined;

    if (pendingFile) {
      setIsUploading(true);
      try {
        // 1. Get a presigned POST policy from the server
        const { url, fields, publicUrl } = await getUploadUrl.mutateAsync({
          contentType: pendingFile.type as (typeof ACCEPTED_TYPES)[number],
          contentLength: pendingFile.size,
        });

        // 2. Upload directly to S3 via multipart form POST.
        //    All policy fields must come before the file, and we must NOT
        //    set a Content-Type header — the browser sets it automatically
        //    with the correct multipart boundary.
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
        formData.append('file', pendingFile);

        const res = await fetch(url, { method: 'POST', body: formData });

        // S3 returns 204 No Content on success for POST uploads
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

    // 3. Persist name, bio, privacy, default deck privacy, default language, and (optionally) the new avatar URL
    updateSettings.mutate({
      name: trimmed,
      bio: trimmedBio || null,
      private: !allowPublicUser,
      defaultDeckPrivate,
      defaultLanguage: effectiveLanguage,
      ...(nextImage !== undefined ? { image: nextImage } : {}),
    });
  }

  // ── Displayed avatar src: prefer the local preview, fall back to server ──
  const displayedAvatar = pendingAvatarMode === 'initials' ? null : (avatarPreview ?? me?.image ?? null);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your avatar and how your name appears across the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ── Avatar ── */}
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="sr-only"
                  onChange={handleFileChange}
                  aria-label="Upload avatar image"
                />

                {/* Clickable avatar circle */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="border-border bg-muted hover:border-primary focus-visible:ring-ring group relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
                  aria-label="Change avatar"
                >
                  {isUploading ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                    </div>
                  ) : displayedAvatar ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayedAvatar}
                        alt="Your avatar"
                        className="h-full w-full object-cover"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="h-5 w-5 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="bg-primary/10 text-primary flex h-full w-full items-center justify-center text-2xl font-semibold">
                      {avatarInitials}
                    </div>
                  )}
                </button>

                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {displayedAvatar ? 'Change photo' : 'Upload photo'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleUseInitials}
                      disabled={isUploading || (pendingAvatarMode === 'initials' ? !me?.image && !pendingFile : !displayedAvatar)}
                    >
                      Use initials
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">JPEG, PNG, WebP or GIF · max 5 MB</p>
                  {avatarError ? <p className="text-destructive text-sm">{avatarError}</p> : null}
                  {pendingAvatarMode === 'initials' && avatarDirty && !isUploading ? (
                    <p className="text-muted-foreground text-xs">
                      Initials avatar ready — click &quot;Save changes&quot; to apply.
                    </p>
                  ) : null}
                  {pendingFile && !isUploading ? (
                    <p className="text-muted-foreground text-xs">
                      Photo ready — click &quot;Save changes&quot; to apply.
                    </p>
                  ) : null}
                </div>
              </div>

              {/* ── Name ── */}
              <div className="space-y-2">
                <Label htmlFor="settings-name">Name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError(null);
                    setSavedAt(null);
                  }}
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={80}
                />
                {error ? <p className="text-destructive text-sm">{error}</p> : null}
                {savedAt && !dirty ? <p className="text-muted-foreground text-sm">Saved.</p> : null}
              </div>

              {/* ── Bio ── */}
              <div className="space-y-2">
                <Label htmlFor="settings-bio">Bio</Label>
                <Textarea
                  id="settings-bio"
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    setError(null);
                    setSavedAt(null);
                  }}
                  placeholder="Tell others a little about yourself…"
                  maxLength={300}
                  rows={3}
                />
                <p className="text-muted-foreground text-right text-xs">
                  {bio.trim().length} / 300
                </p>
              </div>

              {/* ── Email (read-only) ── */}
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  value={me?.email ?? ''}
                  disabled
                  readOnly
                  className="opacity-70"
                />
                <p className="text-muted-foreground text-xs">
                  Your email is tied to your sign-in and can&apos;t be changed here.
                </p>
              </div>

              {/* ── Default language ── */}
              <div className="bg-muted/30 space-y-3 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor="settings-default-language">Default language</Label>
                  <p className="text-muted-foreground text-sm">
                    New decks will use this as their default language for audio playback. You can
                    still change it per deck.
                  </p>
                </div>
                <Select
                  value={effectiveLanguage ?? NO_LANGUAGE}
                  onValueChange={(v) => {
                    setPendingLanguage(v === NO_LANGUAGE ? null : v);
                    setError(null);
                    setSavedAt(null);
                  }}
                >
                  <SelectTrigger id="settings-default-language">
                    <SelectValue placeholder="No default language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LANGUAGE}>No default language</SelectItem>
                    {BACK_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Public profile toggle ── */}
              <div className="bg-muted/30 flex items-start justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor="settings-public" className="cursor-pointer">
                    Allow public user
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    If this switch is turned on, your profile will be public for other users to see.
                  </p>
                </div>
                <Switch
                  id="settings-public"
                  checked={allowPublicUser}
                  onCheckedChange={(checked) => {
                    setAllowPublicUser(checked);
                    setError(null);
                    setSavedAt(null);
                  }}
                />
              </div>

              {/* ── Default deck privacy toggle ── */}
              <div className="bg-muted/30 flex items-start justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor="settings-default-deck-private" className="cursor-pointer">
                    New decks private by default
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    When on, new decks will start as private. You can change this for individual
                    decks by clicking edit on that deck.
                  </p>
                </div>
                <Switch
                  id="settings-default-deck-private"
                  checked={defaultDeckPrivate}
                  onCheckedChange={(checked) => {
                    setDefaultDeckPrivate(checked);
                    setError(null);
                    setSavedAt(null);
                  }}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!dirty || updateSettings.isPending || isUploading}>
                  {isUploading || updateSettings.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* ── Coming-soon actions card ── */}
      <Card>
        <CardHeader>
          <CardTitle>Data &amp; Account</CardTitle>
          <CardDescription>Manage your public presence and export your data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* View public decks */}
          <div className="bg-muted/30 flex items-start justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Public decks</p>
              <p className="text-muted-foreground text-sm">
                View your profile to see which of your decks are public.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              <Button variant="outline" size="sm" disabled className="gap-2 opacity-60">
                <Globe className="h-4 w-4" />
                View profile
              </Button>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Coming soon
              </span>
            </div>
          </div>

          {/* Export CSV */}
          <div className="bg-muted/30 flex items-start justify-between gap-4 rounded-md border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">Export cards</p>
              <p className="text-muted-foreground text-sm">
                Download all your cards as a CSV file if you want to use a different platform.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              <Button variant="outline" size="sm" disabled className="gap-2 opacity-60">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Coming soon
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
