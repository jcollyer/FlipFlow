'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Layers,
  Library,
  Users,
  FolderTree,
  Play,
  FolderPlus,
  GripVertical,
  ListPlus,
  MessageSquarePlus,
  ArrowRight,
  ChevronDown,
  X,
  Mail,
} from 'lucide-react';

import {
  BACK_LANGUAGES,
  CategoryCreateInput,
  DECK_FOLDER_COLOR_PALETTE,
  decodeAdvancedDifficultyLevels,
  FolderCreateInput,
  WORD_CLASS_OPTIONS,
} from '@ensemble/types';
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
import { ProgressSnapshotCard } from '@/features/categories/ProgressSnapshotCard';
import { AdvancedRatingFilter } from '@/features/practice/AdvancedRatingFilter';
import { PlayModeToggle, type PlayMode } from '@/features/practice/PlayModeToggle';

// Sentinels because the Radix Select doesn't allow an empty-string value.
// We translate these back to `null` before submitting.
const NO_LANGUAGE = '__none__';
const NO_FOLDER = '__no_folder__';

export function CategoriesDashboard() {
  const router = useRouter();
  const [deckOpen, setDeckOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [playOpen, setPlayOpen] = useState(false);

  // ── Play modal filter state ───────────────────────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedAdvancedRatings, setSelectedAdvancedRatings] = useState<string[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>('in_order');

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
  function togglePlayAdvancedRating(value: string) {
    setSelectedAdvancedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  const hasPlayFilters =
    selectedCategoryIds.length > 0 ||
    selectedClasses.length > 0 ||
    selectedRatings.length > 0 ||
    selectedAdvancedRatings.length > 0;

  function resetPlayFilters() {
    setSelectedCategoryIds([]);
    setSelectedClasses([]);
    setSelectedRatings([]);
    setSelectedAdvancedRatings([]);
    setPlayMode('in_order');
  }

  function buildPracticeHref() {
    const params = new URLSearchParams();
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    if (selectedAdvancedRatings.length > 0)
      params.set('advancedDifficultyLevels', selectedAdvancedRatings.join(','));
    if (playMode === 'shuffle') params.set('shuffle', '1');
    const qs = params.toString();
    return qs ? `/app/all-categories/practice?${qs}` : '/app/all-categories/practice';
  }
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();
  const { data: folders } = trpc.folders.list.useQuery();
  // Groups + pending invites. Both queries run unconditionally so the home
  // page reacts the moment a user creates/joins a group or receives an
  // invite from another window.
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: pendingInvites } = trpc.invites.listMine.useQuery();
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
    if (selectedAdvancedRatings.length > 0) {
      result = result.filter((c) => {
        const raw =
          (c as { advancedDifficultyLevel?: string | null }).advancedDifficultyLevel ?? null;
        const tokens = decodeAdvancedDifficultyLevels(raw);
        if (selectedAdvancedRatings.includes('no_rating') && tokens.length === 0) return true;
        return tokens.some((t) => selectedAdvancedRatings.includes(t));
      });
    }
    return result.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allCards,
    selectedCategoryIds,
    selectedClasses,
    selectedRatings,
    selectedAdvancedRatings,
    hasPlayFilters,
  ]);

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
  // Validation error for the now-required "Language for translation" field.
  // Shown when the user submits while the dropdown is still on "No audio".
  const [languageError, setLanguageError] = useState(false);

  // Persists the chosen language to the user's profile so it becomes the
  // default selection the next time the create/edit deck modal opens.
  const setDefaultLanguage = trpc.auth.setDefaultLanguage.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

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
      color: DECK_FOLDER_COLOR_PALETTE[0],
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

  const hasFolders = (folders?.length ?? 0) > 0;
  const hasGroups = (groups?.length ?? 0) > 0;
  const invitesCount = pendingInvites?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-4">
        <ProgressSnapshotCard
          label="Total cards"
          value={stats?.total ?? 0}
          tone="slate"
          percentageLabel="of total cards"
          valueLabel="Across every deck"
        />
        <ProgressSnapshotCard
          label="Challenging cards"
          value={stats?.difficultyBreakdown.challenging ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.challenging ?? 0, stats?.total ?? 0)}
          tone="amber"
          percentageLabel="of total cards"
          valueLabel="Across every deck"
        />
        <ProgressSnapshotCard
          label="Good cards"
          value={stats?.difficultyBreakdown.good ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.good ?? 0, stats?.total ?? 0)}
          tone="blue"
          percentageLabel="of total cards"
          valueLabel="Across every deck"
        />
        <ProgressSnapshotCard
          label="Easy cards"
          value={stats?.difficultyBreakdown.easy ?? 0}
          percentage={getPercentage(stats?.difficultyBreakdown.easy ?? 0, stats?.total ?? 0)}
          tone="green"
          percentageLabel="of total cards"
          valueLabel="Across every deck"
        />
      </div>

      {/* Empty state — no folders yet */}
      {!hasFolders && !isLoading && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            <FolderPlus className="h-7 w-7 text-gray-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-800">Create your first Folder</h3>
            <p className="text-sm text-gray-500">
              Folders help you organise your decks by topic, subject, or any structure that works
              for you.
            </p>
          </div>
          <Button variant="outline" onClick={() => setFolderOpen(true)} className="mt-1">
            <FolderPlus className="h-4 w-4" />
            New folder
          </Button>
        </div>
      )}

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

      {/* Folder sections — collapsible, full-width */}
      {hasFolders && !isLoading && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderTree className="text-muted-foreground h-4 w-4" />
              <h2 className="text-sm font-semibold uppercase tracking-tight text-gray-700">
                Folders
              </h2>
            </div>
            <Link
              href="/app/folders"
              className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <span>All folders</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {(folders ?? []).map((folder) => {
            // Build folderDecks in the order the API returned in
            // `includedCategoryIds`. The folders.list query already applies
            // this viewer's saved drag-and-drop order (via FolderDeckOrder),
            // so we walk that array — not the categories list, which is
            // sorted by createdAt — to honor the user's arrangement.
            const categoriesById = new Map((categories ?? []).map((c) => [c.id, c]));
            const folderDecks = folder.includedCategoryIds
              .map((id) => categoriesById.get(id))
              .filter((c): c is NonNullable<typeof c> => Boolean(c));
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

      {/* ── Groups: header + pending-invite shortcut + expandables ─────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-semibold uppercase tracking-tight text-gray-700">Groups</h2>
          </div>
          <Link
            href="/app/groups"
            className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 text-sm font-medium"
          >
            {invitesCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                {invitesCount} pending invitation{invitesCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span>All groups</span>
            )}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {hasGroups ? (
          <div className="space-y-2">
            {(groups ?? []).map((group) => (
              <GroupSection key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-muted-foreground text-sm">
                Groups let you share decks with other people.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/groups">
                  <Plus className="h-4 w-4" />
                  Create a group
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

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
                <p className="text-muted-foreground text-xs">Deck</p>
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
              <p className="text-muted-foreground text-xs">Category</p>
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

            {/* Advanced Rating — mirrors the coarse Rating filter above but
                lets the user slice by the seven advancedDifficultyLevel
                tokens. Selecting multiple chips is an "any of" match (the
                card's CSV column needs to contain at least one of the
                selected tokens). "No rating" matches cards that have no
                advanced selection yet. Markup lives in
                @/features/practice/AdvancedRatingFilter so the deck-detail
                Play modal renders the identical UI without duplication. */}
            <AdvancedRatingFilter
              selected={selectedAdvancedRatings}
              onToggle={togglePlayAdvancedRating}
            />
          </div>

          <DialogFooter className="sm:items-center sm:justify-between">
            <PlayModeToggle value={playMode} onChange={setPlayMode} />
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
              color: DECK_FOLDER_COLOR_PALETTE[0],
              // Restore the user's global defaults so the next open is correct.
              backLanguage: (me?.defaultLanguage as never) ?? null,
              private: me?.defaultDeckPrivate ?? true,
            });
            setPendingFolderId(null);
            setFolderError(false);
            setLanguageError(false);
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
              // "Language for translation" is required when the TTS feature
              // is available — otherwise the user can't create a deck at all
              // since the picker is hidden.
              if (ttsAvailable && !values.backLanguage) {
                setLanguageError(true);
                return;
              }
              setLanguageError(false);
              create.mutate(values, {
                onSuccess: (deck) => {
                  setDeckFolders.mutate(
                    { categoryId: deck.id, folderIds: [pendingFolderId] },
                    { onSettled: () => setPendingFolderId(null) },
                  );
                  // Remember the chosen language as the user's new default so
                  // it's preselected the next time a deck modal opens.
                  if (values.backLanguage && values.backLanguage !== me?.defaultLanguage) {
                    setDefaultLanguage.mutate({ defaultLanguage: values.backLanguage });
                  }
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
              <Input id="name" placeholder="e.g. French verbs" {...form.register('name')} />
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
                {DECK_FOLDER_COLOR_PALETTE.map((color) => {
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
                <Label htmlFor="back-language">
                  Language for translation <span className="text-destructive">*</span>
                </Label>
                <Select
                  // The Radix Select can't bind to `null`, so we use a
                  // sentinel for "no language" and translate at the edges.
                  value={form.watch('backLanguage') ?? NO_LANGUAGE}
                  onValueChange={(v) => {
                    const next = v === NO_LANGUAGE ? null : (v as never);
                    form.setValue('backLanguage', next, { shouldDirty: true });
                    // Clear the validation error as soon as the user picks a
                    // real language so the error disappears immediately.
                    if (next) setLanguageError(false);
                  }}
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
                {languageError ? (
                  <p className="text-destructive text-sm">
                    Language for translation cannot be blank.
                  </p>
                ) : null}
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

function getPercentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

const GETTING_STARTED_KEY = 'flipflow_getting_started_dismissed';
const LEARNING_TOGETHER_KEY = 'flipflow_learning_together_dismissed';

function GettingStartedSection() {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(true);

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
          <h2 className="text-base font-semibold uppercase tracking-tight text-blue-900">
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

      {expanded ? (
        <div className="space-y-4 px-6 py-5 text-sm text-gray-700">
          <p>
            <strong>Step 1: Create your first folder.</strong>{' '}
            <em>
              (ie Level 1, or Nouns) This will hold your decks of cards, which you can reorganize
              anytime. Do you want to create a deck each week of class, or add new cards to existing
              decks each week of class? Your vision may change as you go, just get started.
            </em>
          </p>
          <p>
            <strong>Step 2: Create your first deck.</strong>{' '}
            <em>
              (ie Week 1, or Nouns) Reminder, cards and decks can move around anytime so simply
              begin.
            </em>
          </p>
          <p>
            <strong>Step 3: Create your first flashcards.</strong> Or see the Learning together /
            Apprendre ensemble box at the bottom of the page to duplicate a public deck and make it
            your own.
          </p>
          <p>
            <strong>Step 4: Play (practice) your deck.</strong>
          </p>
          <ul className="space-y-1 pl-1">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
                •
              </span>
              <span>Rate each card&apos;s difficulty for you right now.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
                •
              </span>
              <span>Continue playing a deck to increase memorization.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
                •
              </span>
              <span>
                Challenge yourself as your decks grow, playing from a larger number of cards across
                all decks.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
                •
              </span>
              <span>
                Decide your goals as you go such as celebrating when you&apos;ve rated as Easy 25%
                of your first deck or 100 cards across all decks.
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      {/* Footer */}
      <div className="border-t border-blue-200 bg-blue-50/60 px-6 py-4">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
        >
          <div>
            Ready to get started? Close this box and let&apos;s begin (<em>English</em>) / Commençons&nbsp;! (<em>French</em>)
          </div>
          <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </section>
  );
}

function LearningTogetherSection() {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem(LEARNING_TOGETHER_KEY);
    setVisible(dismissed !== 'true');
  }, []);

  function dismiss() {
    localStorage.setItem(LEARNING_TOGETHER_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-100/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600">
            <Users className="size-5 shrink-0" />
          </div>
          <h2 className="text-base font-semibold uppercase tracking-tight text-blue-900">
            Learning together (English) / Apprendre ensemble (French)
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss learning together section"
          className="rounded-md p-1 text-blue-400 transition hover:bg-blue-200/60 hover:text-blue-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Stacked sections separated by borders */}
      <div className="space-y-4 px-6 py-5 text-sm text-gray-700">
        <ul className="space-y-1">
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
              •
            </span>
            <span>Create or join a group with a friend or classmates</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
              •
            </span>
            <span>
              Collaborate to create a new deck [coming soon], or share decks you’ve created
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
              •
            </span>
            <span>Duplicate a shared deck to springboard off of and edit to make it your own</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 shrink-0 font-bold text-blue-400">
              •
            </span>
            <span>Play a shared deck to practice sample sentences new to you</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

// Prefix for the per-folder expand/collapse flag in localStorage. Each
// folder gets its own key (`${FOLDER_OPEN_KEY_PREFIX}${folder.id}`) so the
// dashboard restores the exact open/closed state on reload and across
// sessions.
const FOLDER_OPEN_KEY_PREFIX = 'ensemble_folder_open_';

// Shape of a single deck within a folder section. Hoisted so the
// SortableDeckCard child can share the same type without redefining it.
type FolderDeck = {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  cardCount: number;
};

/**
 * One draggable deck tile in the folder's expanded grid. The card is wrapped
 * in a Link so a normal click still navigates to the deck — the drag handle
 * (GripVertical) on the left is the only element wired to dnd-kit's
 * pointer/keyboard listeners. That separation is important: if the whole
 * card were the drag handle, click-to-navigate and drag-to-reorder would
 * race against each other.
 */
function SortableDeckCard({ deck }: { deck: FolderDeck }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deck.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    // Lift the dragged item above siblings so it isn't clipped by the
    // grid's overflow / hover borders during the gesture.
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="hover:border-primary/40 group/card relative h-full transition hover:shadow-md">
        {/* Drag handle — absolute-positioned in the top-right corner so it
            doesn't shift the card layout. Stops click events so it never
            triggers the parent Link's navigation. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label={`Drag ${deck.name} to reorder`}
          className="text-muted-foreground/50 hover:text-muted-foreground absolute right-2 top-2 z-10 cursor-grab touch-none rounded p-1 opacity-0 transition active:cursor-grabbing group-hover/card:opacity-100"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Link href={`/app/categories/${deck.id}`} className="group block">
          <CardHeader className="flex flex-row items-center gap-3">
            <div
              aria-hidden
              className="h-10 w-10 shrink-0 rounded-md"
              style={{ backgroundColor: deck.color ?? '#94a3b8' }}
            />
            <div className="min-w-0">
              <CardTitle className="group-hover:text-primary truncate text-sm">
                {deck.name}
              </CardTitle>
              {deck.description ? (
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs font-normal">
                  {deck.description}
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
            </span>
          </CardContent>
        </Link>
      </Card>
    </div>
  );
}

/**
 * Collapsible full-width section for a single folder on the homepage.
 * The header row shows the folder's colour swatch, name and deck count.
 * Expanding reveals a 4-column deck grid where decks can be reordered by
 * dragging the handle in the top-right of each tile. The new order is
 * persisted per-viewer via the folders.reorderDecks tRPC mutation.
 *
 * The open/collapsed state is persisted to localStorage per folder so it
 * survives page reloads and new sessions.
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
  decks: FolderDeck[];
  onCreateDeck: () => void;
}) {
  // Lazy initializer reads the previously persisted state on mount. This is
  // a client-only component (parent is `'use client'` and only renders after
  // the tRPC folders query resolves), so reading localStorage here is safe
  // and avoids a flash of "collapsed" before an effect would re-open it.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(`${FOLDER_OPEN_KEY_PREFIX}${folder.id}`) === 'true';
    } catch {
      return false;
    }
  });

  // Persist every change. Using an effect (rather than writing inside the
  // toggle handler) keeps the storage write in sync with the rendered
  // state even if `open` is changed by some other code path later.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`${FOLDER_OPEN_KEY_PREFIX}${folder.id}`, String(open));
    } catch {
      // Storage may be unavailable (private mode, quota, etc.); failing to
      // persist is non-fatal — the UI keeps working in-memory.
    }
  }, [open, folder.id]);

  // Local mirror of the deck order for optimistic drag-and-drop. Seeded
  // from the server-provided `decks` prop and re-synced whenever the
  // server data changes (new deck added, folder edit, etc.).
  const [orderedDecks, setOrderedDecks] = useState<FolderDeck[]>(decks);
  useEffect(() => {
    setOrderedDecks(decks);
  }, [decks]);

  const utils = trpc.useUtils();
  const reorder = trpc.folders.reorderDecks.useMutation({
    // Don't refetch on success — that would clobber the local order with the
    // server's (now-identical) order and cause a no-op re-render. The next
    // organic refetch will reconcile any drift.
    onError: () => {
      // Roll back to the last server-confirmed order on failure.
      setOrderedDecks(decks);
      utils.folders.list.invalidate();
    },
  });

  const sensors = useSensors(
    // The 5px activation distance lets a plain click on the drag handle
    // pass through without starting a drag, which keeps the handle
    // feeling like a normal button when the user just taps it.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedDecks((prev) => {
      const oldIndex = prev.findIndex((d) => d.id === active.id);
      const newIndex = prev.findIndex((d) => d.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      reorder.mutate({
        folderId: folder.id,
        orderedCategoryIds: next.map((d) => d.id),
      });
      return next;
    });
  }

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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={orderedDecks.map((d) => d.id)} strategy={rectSortingStrategy}>
                {orderedDecks.map((d) => (
                  <SortableDeckCard key={d.id} deck={d} />
                ))}
              </SortableContext>
            </DndContext>
            {/* "Add deck" tile is intentionally outside the SortableContext
                so it isn't draggable and always stays at the end. */}
            <button
              type="button"
              onClick={onCreateDeck}
              className="hover:border-primary/50 hover:bg-muted/30 group flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition"
            >
              <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full">
                <Plus className="h-4 w-4" />
              </div>
              <p className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition">
                {`Add your ${orderedDecks.length === 0 ? 'first' : 'next'} deck`}
              </p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Prefix mirrors the folder pattern so the two sets of expandables remember
// their open/closed state independently.
const GROUP_OPEN_KEY_PREFIX = 'ensemble_group_open_';

/**
 * Home-page expandable for one Group the user belongs to. Renders the same
 * way as FolderSection: chevron header that toggles a 4-column deck grid.
 *
 * Differences from FolderSection:
 *   - Deck list comes straight from `groups.list` (one batched query) rather
 *     than the local intersection of folders × categories, because group
 *     decks may be owned by other members and wouldn't appear in the
 *     viewer's own `categories.list`.
 *   - Click on the header navigates to the group detail page; the inline
 *     grid is read-only here (no drag-and-drop / no "+ Add deck" tile). The
 *     full management surface lives on /app/groups/[id].
 */
function GroupSection({
  group,
}: {
  group: {
    id: string;
    name: string;
    color: string | null;
    isOwner: boolean;
    deckCount: number;
    includedDecks: {
      id: string;
      name: string;
      color: string | null;
      description?: string | null;
      cardCount: number;
      isYours: boolean;
    }[];
  };
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(`${GROUP_OPEN_KEY_PREFIX}${group.id}`) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`${GROUP_OPEN_KEY_PREFIX}${group.id}`, String(open));
    } catch {
      // Storage may be unavailable; non-fatal.
    }
  }, [open, group.id]);

  return (
    <div className="overflow-hidden rounded-xl border transition-shadow hover:shadow-sm">
      {/* ── Header row ── */}
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="hover:bg-muted/40 flex flex-1 items-center gap-3 px-5 py-4 text-left transition"
          aria-expanded={open}
        >
          <div
            aria-hidden
            className="h-5 w-5 shrink-0 rounded-md"
            style={{ backgroundColor: group.color ?? '#94a3b8' }}
          />
          <span className="min-w-0 flex-1 truncate text-base font-semibold">
            {group.name}
            {group.isOwner ? (
              <span className="text-muted-foreground ml-2 text-xs font-normal">(owner)</span>
            ) : null}
          </span>
          <span className="text-muted-foreground shrink-0 text-sm">
            {group.deckCount} {group.deckCount === 1 ? 'deck' : 'decks'}
          </span>
          <ChevronDown
            className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {/* Quick-jump to the group detail page — kept separate from the
            collapse header so a click on this link doesn't also toggle. */}
        <Link
          href={`/app/groups/${group.id}`}
          className="text-muted-foreground hover:text-primary mr-3 shrink-0 text-xs font-medium"
        >
          Manage
        </Link>
      </div>

      {/* ── Expanded deck grid ── */}
      {open ? (
        <div className="border-t px-5 py-5">
          {group.includedDecks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No decks in this group yet.{' '}
              <Link
                href={`/app/groups/${group.id}`}
                className="text-primary font-medium hover:underline"
              >
                Add one →
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {group.includedDecks.map((d) => (
                <Link key={d.id} href={`/app/categories/${d.id}`} className="group block">
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
                      {!d.isYours ? <span className="text-muted-foreground/70">Shared</span> : null}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
