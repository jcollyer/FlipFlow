'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import { FlashcardCreateInput, FlashcardUpdateInput } from '@flipflow/types';
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
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { formatRelative } from '@/lib/utils';

interface Props {
  categoryId: string;
}

export function CategoryDetail({ categoryId }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: category } = trpc.categories.byId.useQuery({ id: categoryId });
  const { data: cards, isLoading } = trpc.flashcards.listByCategory.useQuery({ categoryId });
  const { data: stats } = trpc.practice.stats.useQuery({ categoryId });

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = trpc.flashcards.create.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      utils.practice.stats.invalidate({ categoryId });
      utils.categories.list.invalidate();
      setCreateOpen(false);
    },
  });

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      utils.practice.stats.invalidate({ categoryId });
      utils.categories.list.invalidate();
    },
  });

  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      router.push('/app');
    },
  });

  const createForm = useForm<FlashcardCreateInput>({
    resolver: zodResolver(FlashcardCreateInput),
    defaultValues: { categoryId, front: '', back: '' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
              All decks
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-9 w-9 rounded-md"
              style={{ backgroundColor: category?.color ?? '#94a3b8' }}
            />
            <h1 className="text-3xl font-semibold tracking-tight">{category?.name ?? 'Loading…'}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/categories/${categoryId}/practice`}>
              <Play className="h-4 w-4" />
              Practice {stats?.due ? `(${stats.due})` : ''}
            </Link>
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New card
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={stats?.total ?? cards?.length ?? 0} />
        <Stat label="Due now" value={stats?.due ?? 0} />
        <Stat label="Mastered" value={stats?.mastered ?? 0} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/50" />
          ))}
        </div>
      ) : cards && cards.length > 0 ? (
        <div className="space-y-3">
          {cards.map((card) => (
            <Card key={card.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="line-clamp-2 font-medium">{card.front}</div>
                  <div className="line-clamp-2 text-sm text-muted-foreground">{card.back}</div>
                  <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
                    <span>Next review: {formatRelative(card.nextReview)}</span>
                    <span>·</span>
                    <span>{card.repetitions} reps</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(card.id)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm('Delete this card?')) remove.mutate({ id: card.id });
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No cards yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first card to start practicing this deck.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add a card
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-6">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Delete "${category?.name}" and all its cards? This can't be undone.`)) {
              deleteCategory.mutate({ id: categoryId });
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete deck
        </Button>
      </div>

      {/* Create card dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New card</DialogTitle>
            <DialogDescription>The front is the prompt, the back is the answer.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((values) => create.mutate(values))}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="front">Front</Label>
              <Textarea id="front" rows={2} {...createForm.register('front')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="back">Back</Label>
              <Textarea id="back" rows={3} {...createForm.register('back')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Adding…' : 'Add card'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit card dialog */}
      {editingId ? (
        <EditCardDialog
          cardId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            utils.flashcards.listByCategory.invalidate({ categoryId });
            setEditingId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EditCardDialog({
  cardId,
  onClose,
  onSaved,
}: {
  cardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: card } = trpc.flashcards.byId.useQuery({ id: cardId });
  const update = trpc.flashcards.update.useMutation({ onSuccess: onSaved });

  const form = useForm<FlashcardUpdateInput>({
    resolver: zodResolver(FlashcardUpdateInput),
    values: { id: cardId, front: card?.front ?? '', back: card?.back ?? '' },
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => update.mutate(values))} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="front">Front</Label>
            <Textarea id="front" rows={2} {...form.register('front')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="back">Back</Label>
            <Textarea id="back" rows={3} {...form.register('back')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
