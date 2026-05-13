'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus,
  Layers,
  Library,
  Users,
  Play,
  FolderPlus,
  ListPlus,
  MessageSquarePlus,
  ArrowRight,
  ChevronDown,
  X,
} from 'lucide-react';

import { BACK_LANGUAGES, CategoryCreateInput, FolderCreateInput, WORD_CLASS_OPTIONS } from '@ensemble/types';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { FolderModal } from '@/features/folders/FolderModal';

// Sentinels because the Radix Select doesn't allow an empty-string value.
// We translate these back to `null` before submitting.
const NO_LANGUAGE = '__none__';
const NO_FOLDER = '__no_folder__';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function CategoriesDashboard() {
  const router = useRouter();
  const [deckOpen, setDeckOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);

  // ── Play modal filter state ───────────────────────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);

  function togglePlayCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function togglePlayClass(value: string) {
    setSelectedClasses((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }
  function togglePlayRating(value: string) {
    setSelectedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  const hasPlayFilters =
    selectedCategoryIds.length > 0 || selectedClasses.length > 0 || selectedRatings.length > 0;

  function resetPlayFilters() {
    setSelectedCategoryIds([]);
    setSelectedClasses([]);
    setSelectedRatings([]);
  }

  function buildPracticeHref() {
    const params = new URLSearchParams();
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    const qs = params.toString();
    return qs ? `/app/all-categories/practice?${qs}` : '/app/all-categories/practice';
  }
  const [quickFolderNameVisible, setQuickFolderNameVisible] = useState(false);
  const quickFolderInputRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();
  const { data: folders } = trpc.folders.list.useQuery();
  // Aggregate counts across every card the user owns. Drives the four
  // ProgressSnapshotCard tiles below the header.
  const { data: stats } = trpc.practice.stats.useQuery({});
  // All cards — used in the Play modal to compute the filtered count.
  const { data: allCards } = trpc.flashcards.listAll.useQuery();

  const playFilteredCount = useMemo(() => {
    const cards = allCards ?? [];
    if (!hasPlayFilters) return cards.length;
    let result = cards;
    if (selectedCategoryIds.length > 0) {
      result = result.filter((c) => c.categoryId && selectedCategoryIds.includes(c.categoryId));
    }
    if (selectedClasses.length > 0) {
      result = result.filter((c) => c.class && selectedClasses.includes(c.class));
    }
    if (selectedRatings.length > 0) {
      result = result.filter((c) => {
        const level = (c as { difficultyLevel?: string | null }).difficultyLevel ?? null;
        if (selectedRatings.includes('no_rating') && level === null) return true;
        return level !== null && selectedRatings.includes(level);
      });
    }
    return result.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, selectedCategoryIds, selectedClasses, selectedRatings, hasPlayFilters]);

  const create = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      setDeckOpen(false);
    },
  });

  // After the deck is created we may also need to attach it to one or more
  // folders. We track the desired set in modal-local state and call
  // setDeckFolders once the deck mutation returns its id.
  const setDeckFolders = trpc.folders.setDeckFolders.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
    },
  });
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState(false);

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      setFolderOpen(false);
      quickFolderForm.reset();
    },
  });

  // Only show the audio-language picker if the server can actually call
  // Google Cloud TTS — otherwise the option would be a dead end.
  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const ttsAvailable = !!ttsAvailability?.available;

  const form = useForm<CategoryCreateInput>({
    resolver: zodResolver(CategoryCreateInput),
    // The toggle is labeled "Deck public" and is off by default — that maps
    // to `private = true` on the model.
    defaultValues: {
      name: '',
      description: null,
      color: PALETTE[0],
      backLanguage: null,
      private: true,
    },
  });

  const quickFolderForm = useForm<FolderCreateInput>({
    resolver: zodResolver(FolderCreateInput),
    defaultValues: {
      name: '',
      color: null,
      description: null,
    },
  });
  const quickFolderName = quickFolderForm.watch('name')?.trim() ?? '';

  useEffect(() => {
    if (quickFolderNameVisible) {
      quickFolderInputRef.current?.focus();
    }
  }, [quickFolderNameVisible]);

  const decks = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));
  const hasFolders = (folders?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-700">
            Willkommen, bienvenue, welcome!
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setFolderOpen(true);
            }}
          >
            <FolderPlus className="h-4 w-4" />
            New folder
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              form.setValue('private', me?.defaultDeckPrivate ?? true);
              form.setValue('backLanguage', (me?.defaultLanguage as never) ?? null);
              setDeckOpen(true);
            }}
          >
            <ListPlus className="h-4 w-4" />
            New deck
          </Button>
          <Button onClick={() => setPlayOpen(true)}>
            <Play className="h-4 w-4" />
            Play
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <ProgressSnapshotCard label="Total cards" value={stats?.total ?? 0} tone="slate" />
        <ProgressSnapshotCard
          label="Challenging cards"
          value={stats?.difficultyBreakdown.challenging ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.challenging ?? 0, stats?.total ?? 0)}
          tone="amber"
        />
        <ProgressSnapshotCard
          label="Good cards"
          value={stats?.difficultyBreakdown.good ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.good ?? 0, stats?.total ?? 0)}
          tone="blue"
        />
        <ProgressSnapshotCard
          label="Easy cards"
          value={stats?.difficultyBreakdown.easy ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.easy ?? 0, stats?.total ?? 0)}
          tone="green"
        />
      </div>

      {/* Folder sections loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-muted/50 flex animate-pulse items-center gap-3 rounded-xl p-5"
            >
              <div className="bg-muted h-5 w-5 shrink-0 rounded-md" />
              <div className="bg-muted h-5 w-1/4 rounded-md" />
              <div className="bg-muted h-4 w-16 rounded-md" />
            </div>
          ))}
        </div>
      )}

      {/* no folder section yet */}
      {!hasFolders && !isLoading && (
        <div className="overflow-hidden rounded-xl border border-dashed p-5 transition-shadow hover:shadow-sm">
          <form
            onSubmit={quickFolderForm.handleSubmit((values) => {
              createFolder.mutate({
                name: values.name,
                color: null,
                description: null,
              });
            })}
            className="space-y-2"
          >
            <div className="flex gap-2">
              <div className="space-y-2">
                {!quickFolderNameVisible && (
                  <button
                    type="button"
                    className="text-lg text-gray-700"
                    onClick={() => setQuickFolderNameVisible(true)}
                  >
                    My First Folder: <span className="italic">click to change name</span>
                  </button>
                )}
                {quickFolderNameVisible ? (
                  <Input
                    id="quick-folder-name"
                    type="text"
                    className="text-lg"
                    placeholder="My first folder"
                    {...quickFolderForm.register('name')}
                    ref={(element) => {
                      quickFolderForm.register('name').ref(element);
                      quickFolderInputRef.current = element;
                    }}
                  />
                ) : null}
              </div>
              {quickFolderForm.formState.errors.name ? (
                <p className="text-destructive text-sm">
                  {quickFolderForm.formState.errors.name.message}
                </p>
              ) : null}
              {quickFolderName ? (
                <Button type="submit" disabled={createFolder.isPending}>
                  <FolderPlus className="h-4 w-4" />
                  {createFolder.isPending ? 'Creating...' : 'Create your first folder'}
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      )}

      {/* Folder sections — collapsible, full-width */}
      {hasFolders && !isLoading && (
        <div className="space-y-2">
          {(folders ?? []).map((folder) => {
            const folderDecks = (categories ?? []).filter((c) =>
              folder.includedCategoryIds.includes(c.id),
            );
            return (
              <FolderSection
                key={folder.id}
                folder={folder}
                decks={folderDecks}
                onCreateDeck={() => {
                  form.setValue('private', me?.defaultDeckPrivate ?? true);
                  form.setValue('backLanguage', (me?.defaultLanguage as never) ?? null);
                  setPendingFolderId(folder.id);
                  setDeckOpen(true);
                }}
              />
            );
          })}
        </div>
      )}

      <GettingStartedSection />

      <LearningTogetherSection />

      {/* ── Play Flashcards modal ─────────────────────────────────────────── */}
      <Dialog
        open={playOpen}
        onOpenChange={(o) => {
          setPlayOpen(o);
          if (!o) resetPlayFilters();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
              >
                <Library className="h-5 w-5" />
              </div>
              <DialogTitle className="text-xl">Play Flashcards</DialogTitle>
            </div>
            <DialogDescription className="pt-1">
              Choose none, one or multiple filter option to play a subset of your cards, or leave
              blank to play all.
            </DialogDescription>
          </DialogHeader>

          {/* ── Filter body ── */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Play filters</span>
              {hasPlayFilters && (
                <button
                  type="button"
                  onClick={resetPlayFilters}
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Categories */}
            {(categories?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {categories!.map((cat) => {
                    const selected = selectedCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => togglePlayCategory(cat.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition',
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: cat.color ?? '#94a3b8' }}
                        />
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Word class */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Word class</p>
              <div className="flex flex-wrap gap-2">
                {WORD_CLASS_OPTIONS.map((cls) => {
                  const selected = selectedClasses.includes(cls.value);
                  return (
                    <button
                      key={cls.value}
                      type="button"
                      onClick={() => togglePlayClass(cls.value)}
                      className={cn(
                        'rounded-full px-3 py-1 text-sm font-medium transition',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70',
                      )}
                    >
                      {cls.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rating */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Rating</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: 'easy', label: 'Easy' },
                    { value: 'good', label: 'Good' },
                    { value: 'challenging', label: 'Challenging' },
                    { value: 'no_rating', label: 'No rating' },
                  ] as const
                ).map((opt) => {
                  const selected = selectedRatings.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => togglePlayRating(opt.value)}
                      className={cn(
                        'rounded-full px-3 py-1 text-sm font-medium transition',
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setPlayOpen(false);
                resetPlayFilters();
                router.push(buildPracticeHref());
              }}
            >
              <Play className="h-4 w-4" />
              Play{playFilteredCount > 0 ? ` (${playFilteredCount})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deckOpen}
        onOpenChange={(o) => {
          setDeckOpen(o);
          if (!o) {
            // Reset modal-local state on close so the next open is clean.
            form.reset({
              name: '',
              description: null,
              color: PALETTE[0],
              // Restore the user's global defaults so the next open is correct.
              backLanguage: (me?.defaultLanguage as never) ?? null,
              private: me?.defaultDeckPrivate ?? true,
            });
            setPendingFolderId(null);
            setFolderError(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a deck</DialogTitle>
            <DialogDescription>Group related flashcards together.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((values) => {
              if (!pendingFolderId) {
                setFolderError(true);
                return;
              }
              setFolderError(false);
              create.mutate(values, {
                onSuccess: (deck) => {
                  setDeckFolders.mutate(
                    { categoryId: deck.id, folderIds: [pendingFolderId] },
                    { onSettled: () => setPendingFolderId(null) },
                  );
                },
              });
            })}
            className="space-y-4"
          >
            {/* Folder — required, shown first */}
            <div className="space-y-2">
              <Label htmlFor="new-deck-folder">
                Folder <span className="text-destructive">*</span>
              </Label>
              {!hasFolders ? (
                <p className="text-muted-foreground text-sm">
                  No folders yet —{' '}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      setDeckOpen(false);
                      setFolderOpen(true);
                    }}
                  >
                    create a folder first
                  </button>
                  .
                </p>
              ) : (
                <Select
                  value={pendingFolderId ?? NO_FOLDER}
                  onValueChange={(v) => {
                    setPendingFolderId(v === NO_FOLDER ? null : v);
                    if (v !== NO_FOLDER) setFolderError(false);
                  }}
                >
                  <SelectTrigger id="new-deck-folder">
                    <SelectValue placeholder="Select a folder…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FOLDER} disabled>
                      Select a folder…
                    </SelectItem>
                    {(folders ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {folderError ? (
                <p className="text-destructive text-sm">Please select a folder.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Spanish verbs" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-deck-description">Description (optional)</Label>
              <Textarea
                id="new-deck-description"
                placeholder="What is this deck about?"
                rows={3}
                {...form.register('description')}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((color) => {
                  const selected = form.watch('color') === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => form.setValue('color', color, { shouldDirty: true })}
                      className={`h-8 w-8 rounded-md ring-offset-2 transition ${selected ? 'ring-ring ring-2' : ''}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Color ${color}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="new-deck-public" className="cursor-pointer">
                  Deck public
                </Label>
                <p className="text-muted-foreground text-xs">
                  Off keeps the deck private to you. On makes it public.
                </p>
              </div>
              <Switch
                id="new-deck-public"
                // The form stores `private`. The toggle shows the opposite —
                // "Deck public" is on when private is false. Off by default
                // because `private` defaults to true.
                checked={form.watch('private') === false}
                onCheckedChange={(checked) =>
                  form.setValue('private', !checked, { shouldDirty: true })
                }
              />
            </div>
            {ttsAvailable ? (
              <div className="space-y-2">
                <Label htmlFor="back-language">Language for translation</Label>
                <Select
                  // The Radix Select can't bind to `null`, so we use a
                  // sentinel for "no language" and translate at the edges.
                  value={form.watch('backLanguage') ?? NO_LANGUAGE}
                  onValueChange={(v) =>
                    form.setValue('backLanguage', v === NO_LANGUAGE ? null : (v as never), {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger id="back-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LANGUAGE}>No audio</SelectItem>
                    {BACK_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDeckOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create deck'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New folder dialog. Saving navigates to the folder's detail page. */}
      <FolderModal
        open={folderOpen}
        onOpenChange={setFolderOpen}
        mode={{
          kind: 'create',
          isPending: createFolder.isPending,
          onSubmit: (values) => createFolder.mutate(values),
        }}
      />
    </div>
  );
}

function ProgressSnapshotCard({
  label,
  value,
  percentage,
  tone,
}: {
  label: string;
  value: number;
  percentage?: number;
  tone: 'slate' | 'amber' | 'blue' | 'green';
}) {
  const accentClass = {
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-200',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-200',
    green: 'bg-green-500/10 text-green-700 dark:text-green-200',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {percentage !== undefined ? (
            <p className="text-muted-foreground text-sm">{percentage}% of total cards</p>
          ) : (
            <p className="text-muted-foreground text-sm">Across every deck</p>
          )}
        </div>
        <div
          aria-hidden
          className={`flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold ${accentClass}`}
        >
          {percentage !== undefined ? `${percentage}%` : 'All'}
        </div>
      </CardContent>
    </Card>
  );
}

function getPercentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

const GETTING_STARTED_KEY = 'flipflow_getting_started_dismissed';

function GettingStartedSection() {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(GETTING_STARTED_KEY);
    setVisible(dismissed !== 'true');
  }, []);

  function dismiss() {
    localStorage.setItem(GETTING_STARTED_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-100/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600">
            <MessageSquarePlus className="h-4 w-4" />
          </div>
          <h2 className="text-base font-semibold tracking-tight uppercase text-blue-900">
            How to Get Started
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started section"
          className="rounded-md p-1 text-blue-400 transition hover:bg-blue-200/60 hover:text-blue-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-4 px-6 py-5 text-sm text-gray-700">
        <p>
          <strong>Step 1: Create your first folder to house your decks.</strong>{' '}
          (ie Level 1, or Nouns) You can move decks and cards anytime, so don&apos;t overthink it.
          Which instinctively feels right to you: Do you want to create a deck each week of class?
          Or add new cards to existing decks each week of class? Your feelings may change as you
          start to create and use the cards, so just get started.
        </p>
        <p>
          <strong>Step 2: Create your first deck to house your cards.</strong>{' '}
          (ie Week 1, or Nouns) Cards can move decks any time so start creating, and how you
          personally learn best will become clearer.
        </p>
        <p>
          <strong>Step 3: Create your first flashcards.</strong>{' '}
          OR see the Learning together / Apprendre ensemble box at the bottom of the page to
          duplicate a public deck and make it your own.
        </p>
        <p>
          <strong>Step 4: Play (practice) your deck,</strong>{' '}
          rating each card&apos;s difficulty for you right now.
        </p>
        <ul className="space-y-1 pl-1">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">•</span>
            <span>Continue playing each deck to increase memorization.</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">•</span>
            <span>
              Challenge yourself as your decks grow, playing from a larger number of cards across
              all decks.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">•</span>
            <span>
              Decide your goals as you go such as celebrating when your first deck gets to 25%
              rated easy or 100%, or when 100 cards across all decks are rated easy.
            </span>
          </li>
        </ul>
      </div>

      {/* Footer */}
      <div className="border-t border-blue-200 bg-blue-50/60 px-6 py-4">
        <button
          type="button"
          onClick={dismiss}
          className="group inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
        >
          Ready to get started? Close this box and let&apos;s begin (English) / Commençons&nbsp;! (French)
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </section>
  );
}

function LearningTogetherSection() {
  return (
    <section className="from-primary/5 to-card border-primary/20 overflow-hidden rounded-2xl border bg-gradient-to-br p-0 shadow-sm">
      {/* Header */}
      <div className="bg-primary/8 border-primary/15 flex items-center gap-3 border-b px-6 py-4">
        <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
          <Users className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold tracking-tight">Learning together (English) / Apprendre ensemble (French)</h2>
      </div>

      {/* Stacked sections separated by borders */}
      <div className="divide-border/60 divide-y">
        {/* Section 1 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">
                •
              </span>
              <span>See the Ensemble pinned deck for inspiration on how to create cards</span>
            </li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">
                •
              </span>
              <span>
                Duplicate a public deck to springboard off of and edit to make it your own
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">
                •
              </span>
              <span>Play a public deck to practice sample sentences new to you</span>
            </li>
          </ul>
        </div>

        {/* Section 3 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">
                •
              </span>
              <span>
                Make your decks public or private under your profile in the upper right hand corner
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">
                •
              </span>
              <span>
                Share permission with another user to collaborate on a deck together{' '}
                <span className="text-muted-foreground/50 text-xs">[coming soon]</span>
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Footer link */}
      <div className="border-primary/15 bg-primary/5 border-t px-6 py-4">
        <Link
          href="/app/more"
          className="text-primary hover:text-primary/80 group inline-flex items-center gap-2 text-base font-semibold transition-colors"
        >
          Explore public decks
          <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Collapsible full-width section for a single folder on the homepage.
 * The header row shows the folder's colour swatch, name and deck count.
 * Expanding reveals a 4-column deck grid; an empty folder shows a dashed
 * "Add your first deck" prompt card instead.
 */
function FolderSection({
  folder,
  decks,
  onCreateDeck,
}: {
  folder: {
    id: string;
    name: string;
    color: string | null;
    deckCount: number;
  };
  decks: {
    id: string;
    name: string;
    color: string | null;
    description?: string | null;
    cardCount: number;
  }[];
  onCreateDeck: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border transition-shadow hover:shadow-sm">
      {/* ── Header row ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-5 py-4 text-left transition"
        aria-expanded={open}
      >
        {/* Folder colour swatch */}
        <div
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-md"
          style={{ backgroundColor: folder.color ?? '#94a3b8' }}
        />

        {/* Folder name */}
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{folder.name}</span>

        {/* Deck count badge */}
        <span className="text-muted-foreground shrink-0 text-sm">
          {folder.deckCount} {folder.deckCount === 1 ? 'deck' : 'decks'}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Expanded deck grid ── */}
      {open && (
        <div className="border-t px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {decks.map((d) => (
              <Link key={d.id} href={`/app/categories/${d.id}`} className="group">
                <Card className="hover:border-primary/40 h-full transition hover:shadow-md">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <div
                      aria-hidden
                      className="h-10 w-10 shrink-0 rounded-md"
                      style={{ backgroundColor: d.color ?? '#94a3b8' }}
                    />
                    <div className="min-w-0">
                      <CardTitle className="group-hover:text-primary truncate text-sm">
                        {d.name}
                      </CardTitle>
                      {d.description ? (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs font-normal">
                          {d.description}
                        </p>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      {d.cardCount} {d.cardCount === 1 ? 'card' : 'cards'}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {/* Empty folder — dashed prompt card */}
            <button
              type="button"
              onClick={onCreateDeck}
              className="hover:border-primary/50 hover:bg-muted/30 group flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition"
            >
              <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full">
                <Plus className="h-4 w-4" />
              </div>
              <p className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition">
                {`Add your ${decks.length === 0 ? 'first' : 'next'} deck`}
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
