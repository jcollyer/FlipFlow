'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlignLeft, AlignRight, ArrowLeft, Library, Pencil, Plus, Trash2, X } from 'lucide-react';

import { FlashcardUpdateInput } from '@flipflow/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { formatRelative } from '@/lib/utils';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { ClassSelect } from '@/features/cards/ClassSelect';
import { ClassBadge } from '@/features/cards/ClassBadge';

/**
 * Full list of every card the user owns — across all decks plus
 * uncategorized. Mirrors the per-deck CategoryDetail view but skips the
 * deck-only bits (audio language, deck delete, practice queue) since those
 * don't apply to the aggregate.
 */
export function AllCardsView() {
  const utils = trpc.useUtils();

  const { data: cards, isLoading } = trpc.flashcards.listAll.useQuery();
  const { data: stats } = trpc.practice.stats.useQuery({});
  const { data: categories } = trpc.categories.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listAll.invalidate();
      utils.practice.stats.invalidate({});
      utils.categories.list.invalidate();
    },
  });

  // Quick lookup so each card row can show "from <deck>" without N+1 queries.
  const decksById = new Map(
    (categories ?? []).map((c) => [c.id, { name: c.name, color: c.color }]),
  );

  const decks = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
              Your decks
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <Library className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">All decks</h1>
          </div>
          <p className="pl-12 text-sm text-muted-foreground">
            Every card you've created, including uncategorized ones.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          {cards.map((card) => {
            const deck = card.categoryId ? decksById.get(card.categoryId) : null;
            return (
              <Card key={card.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="line-clamp-2 font-medium">{card.front}</div>
                    <div className="line-clamp-2 text-sm text-muted-foreground">{card.back}</div>
                    {(card.frontExamples.length > 0 || card.backExamples.length > 0) ? (
                      <div className="divide-y divide-border/50 rounded-md border bg-muted/30 px-3 py-1 mt-2">
                        {Array.from({
                          length: Math.max(card.frontExamples.length, card.backExamples.length),
                        }).map((_, i) => (
                          <div key={i} className="flex items-baseline gap-3 py-1 text-xs">
                            <span className="flex min-w-0 flex-1 items-baseline gap-1">
                              <AlignLeft className="mt-0.5 h-3 w-3 shrink-0 text-foreground/50" />
                              <span className="font-semibold text-foreground">
                                {card.frontExamples[i] ?? ''}
                              </span>
                            </span>
                            <span className="flex min-w-0 flex-1 items-baseline gap-1">
                              <AlignRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                {card.backExamples[i] ?? ''}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                      {card.class ? <ClassBadge value={card.class} /> : null}
                      {deck ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                          />
                          {deck.name}
                        </span>
                      ) : (
                        <span className="rounded-sm bg-muted px-1.5 py-0.5">No deck</span>
                      )}
                      <span>·</span>
                      <span>Next review: {formatRelative(card.nextReview)}</span>
                      <span>·</span>
                      <span>{card.repetitions} reps</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(card.id)}
                      aria-label="Edit"
                    >
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
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No cards yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first card here, or create one inside a specific deck.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add a card
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create card dialog with optional deck selector. Defaults to no deck. */}
      <CreateCardDialog
        mode="selectable"
        decks={decks}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit card dialog. Passes the deck list so uncategorized cards get
          a "Move to deck" selector — already-categorized cards see the plain
          edit form. */}
      {editingId ? (
        <EditCardDialog
          cardId={editingId}
          decks={decks}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            utils.flashcards.listAll.invalidate();
            utils.categories.list.invalidate();
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

// Sentinel for "leave the card uncategorized" — Radix Select can't bind to
// an empty string or null, so we map at the edges.
const KEEP_UNCATEGORIZED = '__none__';

function EditCardDialog({
  cardId,
  decks,
  onClose,
  onSaved,
}: {
  cardId: string;
  decks: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: card } = trpc.flashcards.byId.useQuery({ id: cardId });
  const update = trpc.flashcards.update.useMutation({ onSuccess: onSaved });

  // Tracked separately from the form: we need a tri-state (no card loaded
  // yet / explicitly uncategorized / specific deck) for the dropdown.
  // The dialog conditionally renders on `editingId`, so opening a different
  // card unmounts and remounts this — state resets naturally.
  const [assignDeck, setAssignDeck] = useState<string>(KEEP_UNCATEGORIZED);

  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);
  // Word class — optional. `null` = clear it on save.
  const [wordClass, setWordClass] = useState<string | null>(null);

  // Sync example state when the card data loads.
  useEffect(() => {
    if (card) {
      setFrontExamples(card.frontExamples);
      setBackExamples(card.backExamples);
      setWordClass(card.class ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  const form = useForm<FlashcardUpdateInput>({
    resolver: zodResolver(FlashcardUpdateInput),
    values: { id: cardId, front: card?.front ?? '', back: card?.back ?? '' },
  });

  // Show the deck assigner only for uncategorized cards. Cards already in a
  // deck don't get a re-assign UI — that wasn't asked for, and it's safer
  // to keep that flow as a separate, explicit action.
  const showAssign = card && !card.categoryId && decks.length > 0;

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            const categoryId =
              showAssign && assignDeck !== KEEP_UNCATEGORIZED ? assignDeck : undefined;
            update.mutate({
              ...values,
              categoryId,
              frontExamples,
              backExamples,
              class: wordClass,
            });
          })}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Label htmlFor="front">Front</Label>
            <Textarea id="front" rows={2} {...form.register('front')} />
            {frontExamples.length > 0 ? (
              <div className="space-y-2">
                {frontExamples.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Example sentence…"
                      value={val}
                      onChange={(e) =>
                        setFrontExamples((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setFrontExamples((prev) => prev.filter((_, j) => j !== i));
                        setBackExamples((prev) => prev.filter((_, j) => j !== i));
                      }}
                      aria-label="Remove example"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {frontExamples.length < 20 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-1 h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setFrontExamples((prev) => [...prev, '']);
                  setBackExamples((prev) => [...prev, '']);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add example
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-card-class">Class (optional)</Label>
            <ClassSelect id="edit-card-class" value={wordClass} onChange={setWordClass} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="back">Back</Label>
            <Textarea id="back" rows={3} {...form.register('back')} />
            {backExamples.length > 0 ? (
              <div className="space-y-2">
                {backExamples.map((val, i) => (
                  <Input
                    key={i}
                    placeholder="Example sentence…"
                    value={val}
                    onChange={(e) =>
                      setBackExamples((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
          {showAssign ? (
            <div className="space-y-2">
              <Label htmlFor="assign-deck">Assign to deck</Label>
              <Select value={assignDeck} onValueChange={setAssignDeck}>
                <SelectTrigger id="assign-deck">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP_UNCATEGORIZED}>Leave uncategorized</SelectItem>
                  {decks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Move this card into one of your decks. You can&#39;t move it back to
                uncategorized once assigned.
              </p>
            </div>
          ) : null}
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
