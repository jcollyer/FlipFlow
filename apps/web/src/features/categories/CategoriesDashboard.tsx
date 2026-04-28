'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Layers, Clock, Library } from 'lucide-react';

import { BACK_LANGUAGES, CategoryCreateInput } from '@flipflow/types';
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
import { trpc } from '@/lib/trpc/client';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';

// Sentinel because the Radix Select doesn't allow an empty-string value.
// We translate this back to `null` before submitting.
const NO_LANGUAGE = '__none__';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function CategoriesDashboard() {
  const [deckOpen, setDeckOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();

  const create = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      setDeckOpen(false);
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
    defaultValues: { name: '', color: PALETTE[0], backLanguage: null },
  });

  const decks = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your decks</h1>
          <p className="text-muted-foreground text-sm">
            Organize cards into decks and practice them with spaced repetition.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCardOpen(true)}>
            <Plus className="h-4 w-4" />
            New card
          </Button>
          <Button onClick={() => setDeckOpen(true)}>
            <Plus className="h-4 w-4" />
            New deck
          </Button>
        </div>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AllDecksCard />
          {categories.map((c) => (
            <Link key={c.id} href={`/app/categories/${c.id}`} className="group">
              <Card className="hover:border-primary/40 transition hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div
                    aria-hidden
                    className="h-10 w-10 rounded-md"
                    style={{ backgroundColor: c.color ?? '#94a3b8' }}
                  />
                  <CardTitle className="group-hover:text-primary truncate">{c.name}</CardTitle>
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
          <AllDecksCard />
          <EmptyState onCreate={() => setDeckOpen(true)} />
        </div>
      )}

      <Dialog open={deckOpen} onOpenChange={setDeckOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a deck</DialogTitle>
            <DialogDescription>Group related flashcards together.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((values) => create.mutate(values))}
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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed sm:col-span-1 lg:col-span-2">
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
