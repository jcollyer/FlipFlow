'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Layers, Clock, Library, FolderTree, Users, Play, FolderPlus, ListPlus, MessageSquarePlus, ArrowRight } from 'lucide-react';

import { BACK_LANGUAGES, CategoryCreateInput } from '@ensemble/types';
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
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { FolderModal } from '@/features/folders/FolderModal';
import { FoldersChecklist } from '@/features/folders/FoldersChecklist';

// Sentinel because the Radix Select doesn't allow an empty-string value.
// We translate this back to `null` before submitting.
const NO_LANGUAGE = '__none__';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function CategoriesDashboard() {
  const router = useRouter();
  const [deckOpen, setDeckOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();
  const { data: folders } = trpc.folders.list.useQuery();
  const { data: stats } = trpc.practice.stats.useQuery({});

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
  const [pendingFolderIds, setPendingFolderIds] = useState<string[]>([]);

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: (folder) => {
      utils.folders.list.invalidate();
      setFolderOpen(false);
      // Match the spec: creating a folder takes you to its detail page.
      router.push(`/app/folders/${folder.id}`);
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

  const decks = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));
  const hasDecks = (categories?.length ?? 0) > 0;
  const hasFolders = (folders?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Willkommen, bienvenue, welcome!</h1>
          <p className="text-muted-foreground text-sm">
            Play/practice cards by your rating of difficulty, type (nouns), or deck (level 2, week 2)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPendingFolderIds([]);
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
              setDeckOpen(true);
            }}
          >
            <ListPlus className="h-4 w-4" />
            New deck
          </Button>
          <Button variant="outline" onClick={() => setCardOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            New card
          </Button>
          <Button onClick={() => router.push('/app/all-categories')}>
            <Play className="h-4 w-4" />
            Play
          </Button>

        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <ProgressSnapshotCard label="Total cards" value={stats?.total ?? 0} tone="slate" />
        <ProgressSnapshotCard
          label="Challenging cards"
          value={stats?.confidenceBreakdown.challenging ?? 0}
          percentage={getPercentage(stats?.confidenceBreakdown.challenging ?? 0, stats?.total ?? 0)}
          tone="amber"
        />
        <ProgressSnapshotCard
          label="Good cards"
          value={stats?.confidenceBreakdown.good ?? 0}
          percentage={getPercentage(stats?.confidenceBreakdown.good ?? 0, stats?.total ?? 0)}
          tone="blue"
        />
        <ProgressSnapshotCard
          label="Easy cards"
          value={stats?.confidenceBreakdown.easy ?? 0}
          percentage={getPercentage(stats?.confidenceBreakdown.easy ?? 0, stats?.total ?? 0)}
          tone="green"
        />
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : hasDecks ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AllFoldersCard count={folders?.length ?? 0} />
          <AllDecksCard />
          {(categories ?? []).map((c) => (
            <Link key={c.id} href={`/app/categories/${c.id}`} className="group">
              <Card className="hover:border-primary/40 transition hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div
                    aria-hidden
                    className="h-10 w-10 shrink-0 rounded-md"
                    style={{ backgroundColor: c.color ?? '#94a3b8' }}
                  />
                  <div className="min-w-0">
                    <CardTitle className="group-hover:text-primary truncate">{c.name}</CardTitle>
                    {c.description ? (
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs font-normal">
                        {c.description}
                      </p>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    {c.cardCount} {c.cardCount === 1 ? 'card' : 'cards'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {c.dueCount} due
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EmptyState
            onCreate={() => {
              form.setValue('private', me?.defaultDeckPrivate ?? true);
              setDeckOpen(true);
            }}
          />
        </div>
      )}

      <LearningTogetherSection />

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
              backLanguage: null,
              // Restore the user's global default so the next open is correct.
              private: me?.defaultDeckPrivate ?? true,
            });
            setPendingFolderIds([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a deck</DialogTitle>
            <DialogDescription>Group related flashcards together.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((values) =>
              create.mutate(values, {
                onSuccess: (deck) => {
                  // Apply the folder picks (if any) to the freshly-created deck.
                  if (pendingFolderIds.length > 0) {
                    setDeckFolders.mutate(
                      { categoryId: deck.id, folderIds: pendingFolderIds },
                      { onSettled: () => setPendingFolderIds([]) },
                    );
                  } else {
                    setPendingFolderIds([]);
                  }
                },
              }),
            )}
            className="space-y-4"
          >
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
            {hasFolders ? (
              <FoldersChecklist
                folders={folders ?? []}
                selected={pendingFolderIds}
                onChange={setPendingFolderIds}
              />
            ) : null}
            {ttsAvailable ? (
              <div className="space-y-2">
                <Label htmlFor="back-language">Audio language (back of card)</Label>
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
                <p className="text-muted-foreground text-xs">
                  Pick a language to enable a speaker button on the back of cards during practice.
                </p>
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

      {/* New card dialog with optional deck selector. */}
      <CreateCardDialog
        mode="selectable"
        decks={decks}
        open={cardOpen}
        onOpenChange={setCardOpen}
      />

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

/**
 * Pseudo-deck card that links to the All decks view at /app/all-categories.
 * Visually distinct from real decks (dashed border, library icon, bold label)
 * so it reads as a meta-entry rather than a deck named "All decks".
 */
function AllDecksCard() {
  const { data: stats } = trpc.practice.stats.useQuery({});
  return (
    <Link href="/app/all-categories" className="group">
      <Card className="hover:border-primary/60 border-dashed transition hover:shadow-md">
        <CardHeader className="flex flex-row items-center gap-3">
          <div
            aria-hidden
            className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-md"
          >
            <Library className="h-5 w-5" />
          </div>
          <CardTitle className="group-hover:text-primary truncate font-bold">All decks</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            {stats?.total ?? 0} {stats?.total === 1 ? 'card' : 'cards'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {stats?.due ?? 0} due
          </span>
        </CardContent>
      </Card>
    </Link>
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

/**
 * Sister tile that sits to the left of "All decks" and links to the folders
 * list view. We keep it visually consistent with AllDecksCard (dashed border,
 * bold title) so users read both as meta-entries.
 */
function AllFoldersCard({ count }: { count: number }) {
  return (
    <Link href="/app/folders" className="group">
      <Card className="hover:border-primary/60 border-dashed transition hover:shadow-md">
        <CardHeader className="flex flex-row items-center gap-3">
          <div
            aria-hidden
            className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-md"
          >
            <FolderTree className="h-5 w-5" />
          </div>
          <CardTitle className="group-hover:text-primary truncate font-bold">All folders</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <FolderTree className="h-4 w-4" />
            {count} {count === 1 ? 'folder' : 'folders'}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function LearningTogetherSection() {
  return (
    <section className="from-primary/5 to-card rounded-2xl border border-primary/20 bg-gradient-to-br p-0 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-primary/8 border-primary/15 flex items-center gap-3 border-b px-6 py-4">
        <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
          <Users className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold tracking-tight">Learning together / ensemble</h2>
      </div>

      {/* Stacked sections separated by borders */}
      <div className="divide-border/60 divide-y">
        {/* Section 1 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">•</span>
              <span>See the Ensemble pinned deck for inspiration on how to create cards</span>
            </li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">•</span>
              <span>Duplicate a public deck to springboard off of and edit to make it your own</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">•</span>
              <span>Play a public deck to practice sample sentences new to you</span>
            </li>
          </ul>
        </div>

        {/* Section 3 */}
        <div className="px-6 py-4">
          <ul className="text-muted-foreground space-y-1.5 text-sm">
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">•</span>
              <span>Make your decks public or private under your profile in the upper right hand corner</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="text-primary/60 shrink-0 font-bold">•</span>
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed sm:col-span-1 lg:col-span-3">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <Layers className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">No decks yet</div>
        <p className="text-muted-foreground max-w-sm text-sm">
          Create your first deck to start adding flashcards. Each deck has its own practice queue.
        </p>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4" />
          Create your first deck
        </Button>
      </CardContent>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-muted/50 h-32 animate-pulse rounded-xl border" />
      ))}
    </div>
  );
}
