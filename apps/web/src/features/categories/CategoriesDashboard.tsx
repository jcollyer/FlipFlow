'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Layers, Clock } from 'lucide-react';

import { CategoryCreateInput } from '@flipflow/types';
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
import { trpc } from '@/lib/trpc/client';

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function CategoriesDashboard() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();

  const create = trpc.categories.create.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      setOpen(false);
    },
  });

  const form = useForm<CategoryCreateInput>({
    resolver: zodResolver(CategoryCreateInput),
    defaultValues: { name: '', color: PALETTE[0] },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your decks</h1>
          <p className="text-sm text-muted-foreground">
            Organize cards into decks and practice them with spaced repetition.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New deck
        </Button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : categories && categories.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link key={c.id} href={`/app/categories/${c.id}`} className="group">
              <Card className="transition hover:border-primary/40 hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div
                    aria-hidden
                    className="h-10 w-10 rounded-md"
                    style={{ backgroundColor: c.color ?? '#94a3b8' }}
                  />
                  <CardTitle className="truncate group-hover:text-primary">{c.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4 text-sm text-muted-foreground">
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
        <EmptyState onCreate={() => setOpen(true)} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
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
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
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
                      className={`h-8 w-8 rounded-md ring-offset-2 transition ${selected ? 'ring-2 ring-ring' : ''}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Color ${color}`}
                    />
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create deck'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Layers className="h-6 w-6" />
        </div>
        <div className="text-lg font-semibold">No decks yet</div>
        <p className="max-w-sm text-sm text-muted-foreground">
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
        <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/50" />
      ))}
    </div>
  );
}
