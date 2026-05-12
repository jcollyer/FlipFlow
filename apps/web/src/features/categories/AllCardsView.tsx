'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Library,
  Pencil,
  Play,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

import { WORD_CLASS_OPTIONS } from '@ensemble/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { EditCardDialog } from '@/features/cards/EditCardDialog';
import { ClassBadge } from '@/features/cards/ClassBadge';
import { FlashcardPreviewModal, type PreviewCard } from '@/features/practice/FlashcardPreviewModal';

/**
 * Full list of every card the user owns — across all decks plus
 * uncategorized. Mirrors the per-deck CategoryDetail view but skips the
 * deck-only bits (audio language, deck delete, practice queue) since those
 * don't apply to the aggregate.
 */
export function AllCardsView() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: cards, isLoading } = trpc.flashcards.listAll.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(true);

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleClass(value: string) {
    setSelectedClasses((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function toggleRating(value: string) {
    setSelectedRatings((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  const hasActiveFilters =
    selectedCategoryIds.length > 0 || selectedClasses.length > 0 || selectedRatings.length > 0;

  function buildPracticeHref() {
    const params = new URLSearchParams();
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    const qs = params.toString();
    return qs ? `/app/all-categories/practice?${qs}` : '/app/all-categories/practice';
  }

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listAll.invalidate();
      utils.categories.list.invalidate();
    },
  });

  // Quick lookup so each card row can show "from <deck>" and resolve backLanguage.
  const decksById = new Map(
    (categories ?? []).map((c) => [
      c.id,
      { name: c.name, color: c.color, backLanguage: c.backLanguage },
    ]),
  );

  const decks = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));

  // Apply client-side filters to the displayed list.
  const allCards = cards ?? [];
  const filteredCards = useMemo(() => {
    let result = allCards;
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
    return result;
  }, [allCards, selectedCategoryIds, selectedClasses, selectedRatings]);

  // The Play button shows the size of the upcoming session: filtered card
  // count when filters are active, otherwise the total across all decks.
  const practiceCountLabel = hasActiveFilters
    ? filteredCards.length > 0
      ? ` (${filteredCards.length})`
      : ''
    : allCards.length > 0
      ? ` (${allCards.length})`
      : '';

  // Build the card array for the preview modal, including backLanguage from
  // the card's deck (null for uncategorized cards).
  const previewCards: PreviewCard[] = filteredCards.map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    frontExamples: card.frontExamples,
    backExamples: card.backExamples,
    class: card.class ?? null,
    pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
    backLanguage: (card.categoryId
      ? (decksById.get(card.categoryId)?.backLanguage ?? null)
      : null) as import('@ensemble/types').BackLanguageValue | null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
            >
              <Library className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Play Flashcards</h1>
          </div>
          <p className="text-muted-foreground pl-12 text-sm">
            Choose none, one or multiple filter option to play a subset of your cards, or leave
            blank to play all.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setFilterOpen((o) => !o)}
            className={hasActiveFilters ? 'border-primary text-primary' : ''}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {hasActiveFilters
              ? ` (${selectedCategoryIds.length + selectedClasses.length + selectedRatings.length || ''})`.replace(
                  ' ()',
                  '',
                )
              : ''}
          </Button>
          <Button onClick={() => router.push(buildPracticeHref())}>
            <Play className="h-4 w-4" />
            Play{practiceCountLabel}
          </Button>
        </div>
      </div>

      {/* ── Play filter panel ──────────────────────────────────────────── */}
      {filterOpen && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Play filters</span>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryIds([]);
                      setSelectedClasses([]);
                      setSelectedRatings([]);
                    }}
                    className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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
                        onClick={() => toggleCategory(cat.id)}
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
                      onClick={() => toggleClass(cls.value)}
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
                      onClick={() => toggleRating(opt.value)}
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
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : filteredCards.length > 0 ? (
        <div className="space-y-3">
          {filteredCards.map((card, cardIdx) => {
            const deck = card.categoryId ? decksById.get(card.categoryId) : null;
            return (
              <Card
                key={card.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setPreviewIndex(cardIdx)}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="line-clamp-2 font-medium">{card.front}</div>
                    <div className="text-muted-foreground line-clamp-2 text-sm">{card.back}</div>
                    {card.frontExamples.length > 0 || card.backExamples.length > 0 ? (
                      <div className="divide-border/50 mt-2 divide-y px-3 py-1">
                        {Array.from({
                          length: Math.max(card.frontExamples.length, card.backExamples.length),
                        }).map((_, i) => (
                          <div key={i} className="flex items-baseline gap-3 py-1 text-xs">
                            <span className="flex min-w-0 items-baseline gap-1">
                              <span className="text-foreground font-semibold">
                                {card.frontExamples[i] ?? ''}
                              </span>
                            </span>
                            <span className="flex min-w-0 items-baseline gap-1">
                              <span className="text-muted-foreground">
                                {card.backExamples[i] ?? ''}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
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
                        <span className="bg-muted rounded-sm px-1.5 py-0.5">No deck</span>
                      )}
                      {((card as { difficultyLevel?: string | null }).difficultyLevel ?? null) ? (
                        <>
                          <span>·</span>
                          <span className="capitalize">
                            {(card as { difficultyLevel?: string | null }).difficultyLevel}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {/* Stop propagation so edit/delete don't also open the preview */}
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
        hasActiveFilters && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="text-lg font-semibold">No matching cards</div>
              <p className="text-muted-foreground max-w-sm text-sm">
                No cards match the current filters. Try adjusting your selection above.
              </p>
            </CardContent>
          </Card>
        )
      )}

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

      {/* Flashcard preview modal — opens when a card row is clicked */}
      <FlashcardPreviewModal
        cards={previewCards}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null);
        }}
        canRate
        onRated={() => {
          utils.flashcards.listAll.invalidate();
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
