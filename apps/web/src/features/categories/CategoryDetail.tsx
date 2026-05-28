'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  ChevronRight,
  FolderInput,
  Grid2x2,
  GripVertical,
  LayersPlus,
  Library,
  List,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import {
  BACK_LANGUAGES,
  DECK_FOLDER_COLOR_PALETTE,
  type BackLanguageValue,
  CategoryUpdateInput,
  decodeAdvancedDifficultyLevels,
  FlashcardUpdateInput,
  GENDER_OPTIONS,
  genderLabel,
  type GenderValue,
  VERB_TYPE_OPTIONS,
  type VerbTypeValue,
  WORD_CLASS_OPTIONS,
} from '@ensemble/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc/client';
import { useDebouncedValue } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { ClassSelect } from '@/features/cards/ClassSelect';
import { ClassBadge } from '@/features/cards/ClassBadge';
import { ProgressSnapshotCard } from '@/features/categories/ProgressSnapshotCard';
import { AdvancedRatingFilter } from '@/features/practice/AdvancedRatingFilter';
import { FlashcardPreviewModal, type PreviewCard } from '@/features/practice/FlashcardPreviewModal';
import { PlayModeToggle, type PlayMode } from '@/features/practice/PlayModeToggle';

const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

const NO_GENDER = '__no_gender__';
const NO_VERB_TYPE = '__no_verb_type__';

// Sentinels because the Radix Select doesn't allow an empty-string value;
// we translate these back to `null` before submitting.
const NO_LANGUAGE = '__none__';
const NO_FOLDER = '__no_folder__';

interface TranslatePrefs {
  v: 1;
  enabled: boolean;
  target: TranslateTargetValue;
}

function readTranslatePrefs(scope: string): TranslatePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`ensemble:translate:${scope}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TranslatePrefs>;
    if (
      parsed.v === 1 &&
      typeof parsed.enabled === 'boolean' &&
      TRANSLATE_TARGETS.some((t) => t.value === parsed.target)
    ) {
      return parsed as TranslatePrefs;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeTranslatePrefs(scope: string, prefs: TranslatePrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`ensemble:translate:${scope}`, JSON.stringify(prefs));
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// SortableCard — a single draggable card row/tile in the category card list.
// Using a separate component is required because useSortable is a React hook
// and cannot be called inside a plain .map() callback.
// ---------------------------------------------------------------------------

interface SortableCardProps {
  card: {
    id: string;
    front: string;
    back: string;
    frontExamples: string[];
    backExamples: string[];
    class?: string | null;
    gender?: string | null;
    verb_type?: string | null;
    difficultyLevel?: string | null;
  };
  cardIdx: number;
  isOwner: boolean;
  cardListViewMode: 'grid' | 'list';
  onPreview: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}

function SortableCard({
  card,
  cardIdx: _cardIdx,
  isOwner,
  cardListViewMode,
  onPreview,
  onEdit,
  onMove,
  onDelete,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !isOwner,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1 : undefined,
  };

  const gender = card.gender ?? null;
  const verbType = card.verb_type ?? null;
  const difficultyLevel = card.difficultyLevel ?? null;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onPreview}>
        <CardContent
          className={cn(
            'flex justify-between gap-3 p-4',
            cardListViewMode === 'list' ? 'items-center' : 'flex-wrap items-start',
          )}
        >
          {/* Drag handle — only visible to the owner */}
          {isOwner ? (
            <div
              {...attributes}
              {...listeners}
              className="text-muted-foreground/50 hover:text-muted-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
              onClick={(e) => e.stopPropagation()}
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          ) : null}
          <div className={cn('min-w-0 flex-1', cardListViewMode === 'list' ? '' : 'space-y-1')}>
            {cardListViewMode === 'list' ? (
              <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-sm">
                <span className="truncate font-medium">{card.front}</span>
                <span className="text-muted-foreground shrink-0">-</span>
                <span className="text-muted-foreground truncate">{card.back}</span>
                {card.class ? (
                  <>
                    <span className="text-muted-foreground shrink-0">-</span>
                    <span className="text-muted-foreground shrink-0 capitalize">
                      {String(card.class).replace(/_/g, ' ')}
                    </span>
                  </>
                ) : null}
                {gender ? (
                  <>
                    <span className="text-muted-foreground shrink-0">-</span>
                    <span className="text-muted-foreground shrink-0">{genderLabel(gender)}</span>
                  </>
                ) : null}
                {verbType ? (
                  <>
                    <span className="text-muted-foreground shrink-0">-</span>
                    <span className="text-muted-foreground shrink-0 capitalize">
                      {verbType.replace(/_/g, ' ')}
                    </span>
                  </>
                ) : null}
                {isOwner && difficultyLevel ? (
                  <>
                    <span className="text-muted-foreground shrink-0">-</span>
                    <span className="text-muted-foreground shrink-0 capitalize">
                      {difficultyLevel}
                    </span>
                  </>
                ) : null}
              </div>
            ) : (
              <>
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
                  {gender ? <span>{genderLabel(gender)}</span> : null}
                  {isOwner && difficultyLevel ? (
                    <span className="capitalize">{difficultyLevel}</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
          {/* Stop propagation so edit/delete don't also open the preview */}
          {isOwner ? (
            <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onMove} aria-label="Move to deck">
                <FolderInput className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Props {
  categoryId: string;
}

type CardListViewMode = 'grid' | 'list';

export function CategoryDetail({ categoryId }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: category } = trpc.categories.byId.useQuery({ id: categoryId });
  const { data: cards, isLoading } = trpc.flashcards.listByCategory.useQuery({ categoryId });
  const isOwner = category?.isOwner ?? false;
  const { data: stats } = trpc.practice.stats.useQuery(
    { categoryId },
    { enabled: category?.isOwner === true },
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [editDeckOpen, setEditDeckOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [cardListViewMode, setCardListViewMode] = useState<CardListViewMode>('grid');

  // ── Play modal filter state ───────────────────────────────────────────────
  const [playOpen, setPlayOpen] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedRatings, setSelectedRatings] = useState<string[]>([]);
  const [selectedAdvancedRatings, setSelectedAdvancedRatings] = useState<string[]>([]);
  const [playMode, setPlayMode] = useState<PlayMode>('in_order');

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
    selectedClasses.length > 0 || selectedRatings.length > 0 || selectedAdvancedRatings.length > 0;

  function resetPlayFilters() {
    setSelectedClasses([]);
    setSelectedRatings([]);
    setSelectedAdvancedRatings([]);
    setPlayMode('in_order');
  }

  function buildPracticeHref() {
    const params = new URLSearchParams();
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    if (selectedRatings.length > 0) params.set('difficultyLevels', selectedRatings.join(','));
    if (selectedAdvancedRatings.length > 0)
      params.set('advancedDifficultyLevels', selectedAdvancedRatings.join(','));
    if (playMode === 'shuffle') params.set('shuffle', '1');
    const qs = params.toString();
    return qs
      ? `/app/categories/${categoryId}/practice?${qs}`
      : `/app/categories/${categoryId}/practice`;
  }

  const playFilteredCount = useMemo(() => {
    const allCards = cards ?? [];
    if (!hasPlayFilters) return allCards.length;
    let result = allCards;
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
  }, [cards, selectedClasses, selectedRatings, selectedAdvancedRatings, hasPlayFilters]);

  // Local ordering state for drag-and-drop. Seeded from the server query and
  // updated optimistically on drag so the UI doesn't flash before the mutation
  // settles. NonNullable<typeof cards> so the array is always defined (never
  // undefined), matching the [] initial value.
  const [orderedCards, setOrderedCards] = useState<NonNullable<typeof cards>>([]);

  // Keep orderedCards in sync whenever the server data changes (e.g. after a
  // card is added, deleted, or the query refetches).
  useEffect(() => {
    setOrderedCards(cards ?? []);
  }, [cards]);

  const reorder = trpc.flashcards.reorder.useMutation({
    onError: () => {
      // Roll back to the last server-confirmed order on failure.
      setOrderedCards(cards ?? []);
    },
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedCards((prev) => {
      if (!prev) return prev;
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      reorder.mutate({ categoryId, orderedIds: next.map((c: { id: string }) => c.id) });
      return next;
    });
  }

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      // No-arg invalidate so both `{}` (dashboard) and `{ categoryId }`
      // (this view) variants of practice.stats refetch — otherwise the
      // dashboard's ProgressSnapshotCards stay stale until a hard refresh.
      utils.practice.stats.invalidate();
      utils.categories.list.invalidate();
    },
  });

  const deleteCategory = trpc.categories.delete.useMutation({
    onSuccess: () => {
      utils.categories.list.invalidate();
      router.push('/app');
    },
  });

  // Build the ordered card array for the preview modal. backLanguage comes
  // from the deck-level category (same for every card in this view).
  // Use orderedCards so the modal respects the user's drag-and-drop order.
  const previewCards: PreviewCard[] = (orderedCards ?? []).map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    frontExamples: card.frontExamples,
    backExamples: card.backExamples,
    class: card.class ?? null,
    gender: (card as { gender?: string | null }).gender ?? null,
    pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
    backLanguage: (category?.backLanguage ?? null) as BackLanguageValue | null,
    // Forward the existing advanced selection so the rating panel can
    // pre-tick the user's previous choice when they re-rate a card from
    // the deck detail view.
    advancedDifficultyLevel:
      (card as { advancedDifficultyLevel?: string | null }).advancedDifficultyLevel ?? null,
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
              className="h-9 w-9 rounded-md"
              style={{ backgroundColor: category?.color ?? '#94a3b8' }}
            />
            <h1 className="text-3xl font-semibold tracking-tight">
              {category?.name ?? 'Loading…'}
            </h1>
          </div>
          {(category as { description?: string | null } | undefined)?.description ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {(category as { description?: string | null }).description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <LayersPlus className="h-4 w-4" />
              New card
            </Button>
          ) : null}
          <Button onClick={() => setPlayOpen(true)}>
            <Play className="h-4 w-4" />
            Play {isOwner && (cards?.length ?? 0) > 0 ? `(${cards?.length})` : ''}
          </Button>
        </div>
      </div>

      {isOwner ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:grid-cols-4">
          <ProgressSnapshotCard
            label="Total cards in this deck"
            value={stats?.total ?? cards?.length ?? 0}
            tone="slate"
            percentageLabel="of this deck"
            valueLabel="In this deck"
          />
          <ProgressSnapshotCard
            label="Challenging cards in this deck"
            value={stats?.difficultyBreakdown?.challenging ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.challenging ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="amber"
            percentageLabel="of this deck"
            valueLabel="In this deck"
          />
          <ProgressSnapshotCard
            label="Good cards in this deck"
            value={stats?.difficultyBreakdown?.good ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.good ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="blue"
            percentageLabel="of this deck"
            valueLabel="In this deck"
          />
          <ProgressSnapshotCard
            label="Easy cards in this deck"
            value={stats?.difficultyBreakdown?.easy ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.easy ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="green"
            percentageLabel="of this deck"
            valueLabel="In this deck"
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : orderedCards && orderedCards.length > 0 ? (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                cardListViewMode === 'grid' && 'bg-accent text-accent-foreground border-primary',
              )}
              aria-pressed={cardListViewMode === 'grid'}
              aria-label="Grid view"
              onClick={() => setCardListViewMode('grid')}
            >
              <Grid2x2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                cardListViewMode === 'list' && 'bg-accent text-accent-foreground border-primary',
              )}
              aria-pressed={cardListViewMode === 'list'}
              aria-label="List view"
              onClick={() => setCardListViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedCards.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {orderedCards.map((card, cardIdx) => (
                  <SortableCard
                    key={card.id}
                    card={card}
                    cardIdx={cardIdx}
                    isOwner={isOwner}
                    cardListViewMode={cardListViewMode}
                    onPreview={() => setPreviewIndex(cardIdx)}
                    onEdit={() => setEditingId(card.id)}
                    onMove={() => setMovingCardId(card.id)}
                    onDelete={() => {
                      if (confirm('Delete this card?')) remove.mutate({ id: card.id });
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No cards yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              {isOwner
                ? 'Add your first card to start practicing this deck.'
                : 'This public deck does not have any cards yet.'}
            </p>
            {isOwner ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add a card
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {isOwner ? (
        <div className="flex flex-wrap gap-2 border-t pt-6">
          <Button variant="ghost" onClick={() => setEditDeckOpen(true)} disabled={!category}>
            <Pencil className="h-4 w-4" />
            Edit deck
          </Button>
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
      ) : null}

      {/* Play Flashcards modal */}
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

            {/* Advanced Rating — shared with the home dashboard's Play
                modal via @/features/practice/AdvancedRatingFilter so the two
                surfaces can't drift. See that component / CategoriesDashboard
                for the full rationale. */}
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

      {/* Create card dialog (deck is fixed to this category). */}
      {isOwner ? (
        <CreateCardDialog
          mode="fixed"
          categoryId={categoryId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}

      {/* Edit card dialog */}
      {isOwner && editingId ? (
        <EditCardDialog
          cardId={editingId}
          categoryId={categoryId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            utils.flashcards.listByCategory.invalidate({ categoryId });
            setEditingId(null);
          }}
        />
      ) : null}

      {/* Move card to deck dialog */}
      {isOwner && movingCardId ? (
        <MoveCardModal
          cardId={movingCardId}
          currentCategoryId={categoryId}
          onClose={() => setMovingCardId(null)}
          onMoved={() => {
            utils.flashcards.listByCategory.invalidate({ categoryId });
            utils.categories.list.invalidate();
            setMovingCardId(null);
          }}
        />
      ) : null}

      {/* Edit deck dialog */}
      {isOwner && editDeckOpen && category ? (
        <EditCategoryDialog
          category={{
            id: category.id,
            name: category.name,
            description: (category as { description?: string | null }).description ?? null,
            color: category.color ?? null,
            backLanguage: (category.backLanguage as BackLanguageValue | null) ?? null,
            private: (category as { private?: boolean }).private ?? true,
          }}
          onClose={() => setEditDeckOpen(false)}
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
        canRate={isOwner}
        onRated={() => {
          utils.flashcards.listByCategory.invalidate({ categoryId });
          // No-arg invalidate so the dashboard's `practice.stats({})`
          // also refreshes — not just this view's `{ categoryId }` query.
          utils.practice.stats.invalidate();
        }}
      />
    </div>
  );
}

function getPercentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function EditCardDialog({
  cardId,
  categoryId,
  onClose,
  onSaved,
}: {
  cardId: string;
  categoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: card } = trpc.flashcards.byId.useQuery({ id: cardId });
  const update = trpc.flashcards.update.useMutation({
    onSuccess: (updatedCard) => {
      utils.flashcards.byId.setData({ id: updatedCard.id }, updatedCard);
      void utils.flashcards.byId.invalidate({ id: updatedCard.id });
      onSaved();
    },
  });

  const { data: availability } = trpc.translate.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const translateAvailable = !!availability?.available;

  // Translate prefs share the same scope key as the create dialog for this deck.
  const [translateOn, setTranslateOn] = useState(false);
  const [target, setTarget] = useState<TranslateTargetValue>('fr');
  const skipInitialPrefsWriteRef = useRef(true);

  useEffect(() => {
    const stored = readTranslatePrefs(categoryId);
    if (stored) {
      setTranslateOn(false);
      setTarget(stored.target);
    } else {
      setTranslateOn(false);
      setTarget('fr');
    }
    skipInitialPrefsWriteRef.current = true;
  }, [categoryId]);

  useEffect(() => {
    if (skipInitialPrefsWriteRef.current) {
      skipInitialPrefsWriteRef.current = false;
      return;
    }
    writeTranslatePrefs(categoryId, { v: 1, enabled: translateOn, target });
  }, [categoryId, translateOn, target]);

  const translate = trpc.translate.translate.useMutation();
  const lastTranslatedRef = useRef<{ text: string; target: string } | null>(null);
  const lastTranslatedExamplesRef = useRef(new Map<number, { text: string; target: string }>());

  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);
  // Tracks which example indices have a validation error (empty input on submit).
  const [invalidFrontIndices, setInvalidFrontIndices] = useState<Set<number>>(new Set());
  const [invalidBackIndices, setInvalidBackIndices] = useState<Set<number>>(new Set());
  // Word class — optional. `null` = clear it on save.
  const [wordClass, setWordClass] = useState<string | null>(null);
  // Gender and verb type — optional.
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [verbType, setVerbType] = useState<VerbTypeValue | null>(null);
  // Optional pronunciation hint.
  const [pronunciation, setPronunciation] = useState('');

  // Free Dictionary lookups. Mirrors CreateCardDialog so each button has its
  // own independent message slot.
  const [genderLookupMsg, setGenderLookupMsg] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);
  const [pronLookupMsg, setPronLookupMsg] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);
  const [classLookupMsg, setClassLookupMsg] = useState<{
    tone: 'error' | 'info';
    text: string;
  } | null>(null);
  const lookupGender = trpc.dictionary.getGender.useMutation();
  const lookupPronunciation = trpc.dictionary.getPronunciation.useMutation();
  const lookupCategory = trpc.dictionary.getCategory.useMutation();

  // Sync form + example state when the card data loads.
  useEffect(() => {
    if (card) {
      setFrontExamples(card.frontExamples);
      setBackExamples(card.backExamples);
      setWordClass(card.class ?? null);
      setGender(((card as { gender?: string | null }).gender as GenderValue | null) ?? null);
      setVerbType(
        ((card as { verb_type?: string | null }).verb_type as VerbTypeValue | null) ?? null,
      );
      setPronunciation((card as { pronunciation?: string | null }).pronunciation ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  const form = useForm<FlashcardUpdateInput>({
    resolver: zodResolver(FlashcardUpdateInput),
    values: { id: cardId, front: card?.front ?? '', back: card?.back ?? '' },
  });

  // Debounced root back translation.
  const front = useWatch({ control: form.control, name: 'front' }) ?? '';
  const debouncedFront = useDebouncedValue(front.trim(), 500);

  useEffect(() => {
    if (!translateOn || !translateAvailable) return;
    if (!debouncedFront) {
      form.setValue('back', '');
      lastTranslatedRef.current = null;
      return;
    }
    const last = lastTranslatedRef.current;
    if (last && last.text === debouncedFront && last.target === target) return;
    const request = { text: debouncedFront, target };
    lastTranslatedRef.current = request;
    translate.mutate(
      { text: debouncedFront, target },
      {
        onSuccess: ({ translation }) => {
          if (lastTranslatedRef.current !== request) return;
          form.setValue('back', translation, { shouldDirty: true, shouldValidate: true });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFront, target, translateOn, translateAvailable]);

  // Debounced per-example translation.
  const debouncedFrontExamples = useDebouncedValue(frontExamples, 500);

  useEffect(() => {
    if (!translateOn || !translateAvailable) return;
    debouncedFrontExamples.forEach((text, i) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setBackExamples((prev) => {
          const next = [...prev];
          next[i] = '';
          return next;
        });
        lastTranslatedExamplesRef.current.delete(i);
        return;
      }
      const last = lastTranslatedExamplesRef.current.get(i);
      if (last && last.text === trimmed && last.target === target) return;
      const request = { text: trimmed, target };
      lastTranslatedExamplesRef.current.set(i, request);
      translate.mutate(
        { text: trimmed, target },
        {
          onSuccess: ({ translation }) => {
            if (lastTranslatedExamplesRef.current.get(i) !== request) return;
            setBackExamples((prev) => {
              const next = [...prev];
              next[i] = translation;
              return next;
            });
          },
        },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFrontExamples, target, translateOn, translateAvailable]);

  // Watched once for the dictionary lookup buttons so they enable/disable in
  // real time as the user edits the back field.
  const back = useWatch({ control: form.control, name: 'back' }) ?? '';
  const trimmedBack = back.trim();
  const canLookup = trimmedBack.length > 0;
  const dictionaryTarget = translateOn ? target : 'en';

  function describeMiss(kind: 'no_value' | 'not_in_dictionary' | 'multiple_words') {
    if (kind === 'multiple_words') return 'Cannot access multiple words';
    if (kind === 'not_in_dictionary') return 'Word not found in dictionary';
    return 'No value returned';
  }

  function handleGetGender() {
    if (!canLookup) return;
    setGenderLookupMsg(null);
    lookupGender.mutate(
      { word: trimmedBack, target: dictionaryTarget },
      {
        onSuccess: (res) => {
          if (res.kind === 'ok') {
            setGender(res.gender);
            setGenderLookupMsg(null);
          } else {
            setGenderLookupMsg({ tone: 'info', text: describeMiss(res.kind) });
          }
        },
        onError: (err) => setGenderLookupMsg({ tone: 'error', text: err.message }),
      },
    );
  }

  function handleGetCategory() {
    if (!canLookup) return;
    setClassLookupMsg(null);
    lookupCategory.mutate(
      { word: trimmedBack, target: dictionaryTarget },
      {
        onSuccess: (res) => {
          if (res.kind === 'ok') {
            setWordClass(res.category);
            setClassLookupMsg(null);
          } else {
            setClassLookupMsg({ tone: 'info', text: describeMiss(res.kind) });
          }
        },
        onError: (err) => setClassLookupMsg({ tone: 'error', text: err.message }),
      },
    );
  }

  function handleGetPronunciation() {
    if (!canLookup) return;
    setPronLookupMsg(null);
    lookupPronunciation.mutate(
      { word: trimmedBack, target: dictionaryTarget },
      {
        onSuccess: (res) => {
          if (res.kind === 'ok') {
            setPronunciation(res.pronunciation);
            setPronLookupMsg(null);
          } else {
            setPronLookupMsg({ tone: 'info', text: describeMiss(res.kind) });
          }
        },
        onError: (err) => setPronLookupMsg({ tone: 'error', text: err.message }),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[80dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            // Validate examples client-side so the user gets clear feedback
            // instead of a silent 400 from the server's Zod check.
            const badFront = new Set<number>();
            const badBack = new Set<number>();
            frontExamples.forEach((v, i) => {
              if (!v.trim()) badFront.add(i);
            });
            backExamples.forEach((v, i) => {
              if (!v.trim()) badBack.add(i);
            });
            if (badFront.size > 0 || badBack.size > 0) {
              setInvalidFrontIndices(badFront);
              setInvalidBackIndices(badBack);
              return;
            }
            setInvalidFrontIndices(new Set());
            setInvalidBackIndices(new Set());
            update.mutate({
              ...values,
              frontExamples,
              backExamples,
              class: wordClass,
              gender,
              verb_type: wordClass === 'verb' ? verbType : null,
              pronunciation: pronunciation.trim() ? pronunciation.trim() : null,
            });
          })}
          className="space-y-3"
        >
          {translateAvailable ? (
            <div className="bg-muted/30 space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="edit-translate-toggle" className="cursor-pointer">
                    Translation card
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Auto-translate the front into the chosen language.
                  </p>
                </div>
                <Switch
                  id="edit-translate-toggle"
                  checked={translateOn}
                  onCheckedChange={setTranslateOn}
                />
              </div>
              {translateOn ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-translate-target">Target language</Label>
                  <Select
                    value={target}
                    onValueChange={(v) => setTarget(v as TranslateTargetValue)}
                  >
                    <SelectTrigger id="edit-translate-target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSLATE_TARGETS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="front">Front</Label>
            <Textarea id="front" rows={2} {...form.register('front')} />
            {frontExamples.length > 0 ? (
              <div className="space-y-2">
                {frontExamples.map((val, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Example…"
                        value={val}
                        className={
                          invalidFrontIndices.has(i)
                            ? 'border-destructive focus-visible:ring-destructive'
                            : ''
                        }
                        aria-invalid={invalidFrontIndices.has(i)}
                        onChange={(e) => {
                          setFrontExamples((prev) => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          });
                          if (e.target.value.trim()) {
                            setInvalidFrontIndices((prev) => {
                              const next = new Set(prev);
                              next.delete(i);
                              return next;
                            });
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setFrontExamples((prev) => prev.filter((_, j) => j !== i));
                          setBackExamples((prev) => prev.filter((_, j) => j !== i));
                          lastTranslatedExamplesRef.current.clear();
                          // Clear all example errors since indices have shifted.
                          setInvalidFrontIndices(new Set());
                          setInvalidBackIndices(new Set());
                        }}
                        aria-label="Remove example"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {invalidFrontIndices.has(i) ? (
                      <p className="text-destructive text-xs">Fill in or remove this example.</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {frontExamples.length < 20 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ml-1 h-7 text-xs"
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
            <div className="flex items-center justify-between">
              <Label htmlFor="back">Back</Label>
              {translateOn && translate.isPending ? (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Translating…
                </span>
              ) : null}
            </div>
            <Textarea id="back" rows={3} {...form.register('back')} />
            {backExamples.length > 0 ? (
              <div className="space-y-2">
                {backExamples.map((val, i) => (
                  <div key={i} className="space-y-1">
                    <Input
                      placeholder="Example…"
                      value={val}
                      className={
                        invalidBackIndices.has(i)
                          ? 'border-destructive focus-visible:ring-destructive'
                          : ''
                      }
                      aria-invalid={invalidBackIndices.has(i)}
                      onChange={(e) => {
                        setBackExamples((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        });
                        if (e.target.value.trim()) {
                          setInvalidBackIndices((prev) => {
                            const next = new Set(prev);
                            next.delete(i);
                            return next;
                          });
                        }
                      }}
                    />
                    {invalidBackIndices.has(i) ? (
                      <p className="text-destructive text-xs">Fill in or remove this example.</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-card-pronunciation">Pronunciation (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="edit-card-pronunciation"
                value={pronunciation}
                onChange={(e) => setPronunciation(e.target.value)}
                placeholder="e.g. /bɔ̃.ʒuʁ/ or bohn-zhoor"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetPronunciation}
                disabled={!canLookup || lookupPronunciation.isPending}
                title="Look up IPA from the dictionary using the Back word"
              >
                {lookupPronunciation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Get pronunciation
              </Button>
            </div>
            {pronLookupMsg ? (
              <p
                className={
                  pronLookupMsg.tone === 'error'
                    ? 'text-destructive text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {pronLookupMsg.text}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-card-class">Category (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ClassSelect id="edit-card-class" value={wordClass} onChange={setWordClass} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetCategory}
                disabled={!canLookup || lookupCategory.isPending}
                title="Look up part of speech from the dictionary using the Back word"
              >
                {lookupCategory.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Get category
              </Button>
            </div>
            {classLookupMsg ? (
              <p
                className={
                  classLookupMsg.tone === 'error'
                    ? 'text-destructive text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {classLookupMsg.text}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-card-gender">Gender (optional)</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  value={gender ?? NO_GENDER}
                  onValueChange={(v) => setGender(v === NO_GENDER ? null : (v as GenderValue))}
                >
                  <SelectTrigger id="edit-card-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GENDER}>None</SelectItem>
                    {GENDER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGetGender}
                disabled={!canLookup || lookupGender.isPending}
                title="Look up gender from the dictionary using the Back word"
              >
                {lookupGender.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Get gender
              </Button>
            </div>
            {genderLookupMsg ? (
              <p
                className={
                  genderLookupMsg.tone === 'error'
                    ? 'text-destructive text-xs'
                    : 'text-muted-foreground text-xs'
                }
              >
                {genderLookupMsg.text}
              </p>
            ) : null}
          </div>

          {wordClass === 'verb' ? (
            <div className="space-y-2">
              <Label htmlFor="edit-card-verb-type">Verb type (optional)</Label>
              <Select
                value={verbType ?? NO_VERB_TYPE}
                onValueChange={(v) => setVerbType(v === NO_VERB_TYPE ? null : (v as VerbTypeValue))}
              >
                <SelectTrigger id="edit-card-verb-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VERB_TYPE}>None</SelectItem>
                  {VERB_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {update.error ? <p className="text-destructive text-sm">{update.error.message}</p> : null}

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

/**
 * Modal that lets the user move a card to a different deck. Presents all the
 * user's folders as collapsible rows; expanding a folder reveals its decks as
 * selectable items. The card's current deck is pre-selected when the modal
 * opens. Confirming calls `flashcards.update` with the new `categoryId`.
 */
function MoveCardModal({
  cardId,
  currentCategoryId,
  onClose,
  onMoved,
}: {
  cardId: string;
  currentCategoryId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { data: folders } = trpc.folders.list.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(currentCategoryId);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const move = trpc.flashcards.update.useMutation({ onSuccess: onMoved });

  // Build a quick-lookup map from category id → category metadata.
  const categoryMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string | null }>();
    (categories ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  // When folder data arrives, auto-expand the folder that contains the current
  // deck so the pre-selected item is immediately visible.
  useEffect(() => {
    if (!folders) return;
    const containing = folders.find((f) => f.includedCategoryIds.includes(currentCategoryId));
    if (containing) setExpandedFolders(new Set([containing.id]));
  }, [folders, currentCategoryId]);

  function toggleFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // Decks that don't belong to any folder, shown in a trailing "No folder" group.
  const folderCategoryIds = useMemo(
    () => new Set((folders ?? []).flatMap((f) => f.includedCategoryIds)),
    [folders],
  );
  const unfolderedDecks = useMemo(
    () => (categories ?? []).filter((c) => !folderCategoryIds.has(c.id)),
    [categories, folderCategoryIds],
  );

  function handleMove() {
    if (selectedCategoryId === currentCategoryId) {
      onClose();
      return;
    }
    move.mutate({ id: cardId, categoryId: selectedCategoryId });
  }

  const isUnchanged = selectedCategoryId === currentCategoryId;

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="flex max-h-[80dvh] flex-col">
        <DialogHeader>
          <DialogTitle>Move card</DialogTitle>
          <DialogDescription>Select a deck to move this card to.</DialogDescription>
        </DialogHeader>

        {/* Scrollable folder + deck list */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {(folders ?? []).map((folder) => {
            const decks = folder.includedCategoryIds
              .map((id) => categoryMap.get(id))
              .filter((d): d is NonNullable<typeof d> => d !== undefined);
            const isExpanded = expandedFolders.has(folder.id);

            return (
              <div key={folder.id}>
                {/* Folder header row */}
                <button
                  type="button"
                  className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  onClick={() => toggleFolder(folder.id)}
                >
                  <ChevronRight
                    className={`h-4 w-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <span
                    aria-hidden
                    className="h-3 w-3 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: folder.color ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                  <span className="text-muted-foreground ml-auto flex-shrink-0 text-xs">
                    {decks.length}
                  </span>
                </button>

                {/* Deck rows inside the folder */}
                {isExpanded ? (
                  <div className="ml-8 space-y-0.5 pb-1">
                    {decks.length === 0 ? (
                      <p className="text-muted-foreground px-3 py-1.5 text-xs">
                        No decks in this folder
                      </p>
                    ) : (
                      decks.map((deck) => {
                        const isSelected = selectedCategoryId === deck.id;
                        const isCurrent = currentCategoryId === deck.id;
                        return (
                          <button
                            key={deck.id}
                            type="button"
                            className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                              isSelected
                                ? 'bg-primary/10 text-primary font-medium'
                                : 'hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedCategoryId(deck.id)}
                          >
                            <span
                              aria-hidden
                              className="h-3 w-3 flex-shrink-0 rounded-sm"
                              style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                            />
                            <span className="min-w-0 flex-1 truncate text-left">{deck.name}</span>
                            {isCurrent ? (
                              <span className="text-muted-foreground ml-auto flex-shrink-0 text-xs">
                                current
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Decks not in any folder */}
          {unfolderedDecks.length > 0 ? (
            <div className="mt-1">
              <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                No folder
              </p>
              <div className="space-y-0.5">
                {unfolderedDecks.map((deck) => {
                  const isSelected = selectedCategoryId === deck.id;
                  const isCurrent = currentCategoryId === deck.id;
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedCategoryId(deck.id)}
                    >
                      <span
                        aria-hidden
                        className="h-3 w-3 flex-shrink-0 rounded-sm"
                        style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-left">{deck.name}</span>
                      {isCurrent ? (
                        <span className="text-muted-foreground ml-auto flex-shrink-0 text-xs">
                          current
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Empty state — no folders and no unfoldered decks */}
          {(folders ?? []).length === 0 && unfolderedDecks.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No other decks found.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleMove} disabled={move.isPending || isUnchanged}>
            {move.isPending ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modal for editing a deck's name, color, and audio language. The audio
 * language picker is hidden if the server can't reach Google Cloud TTS,
 * mirroring what the create-deck dialog does — there's no point exposing
 * a setting that wouldn't take effect.
 */
function EditCategoryDialog({
  category,
  onClose,
}: {
  category: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    backLanguage: BackLanguageValue | null;
    private: boolean;
  };
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const ttsAvailable = !!ttsAvailability?.available;

  // Folder pick-list — required single selection.
  const { data: folders } = trpc.folders.list.useQuery();
  const { data: folderIdsForDeck } = trpc.folders.forDeck.useQuery({ categoryId: category.id });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState(false);
  // Validation error for the now-required "Language for translation" field.
  const [languageError, setLanguageError] = useState(false);

  // Persists the chosen language as the user's new default so it becomes
  // the preselected value the next time the create/edit deck modal opens.
  const { data: me } = trpc.auth.me.useQuery();
  const setDefaultLanguage = trpc.auth.setDefaultLanguage.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  // Hydrate selection once the server returns the deck's current folder
  // membership; take the first folder if the deck is in multiple.
  useEffect(() => {
    if (selectedFolderId === null && folderIdsForDeck) {
      setSelectedFolderId(folderIdsForDeck[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIdsForDeck]);

  const setDeckFolders = trpc.folders.setDeckFolders.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      utils.folders.forDeck.invalidate({ categoryId: category.id });
    },
  });

  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.byId.invalidate({ id: category.id });
      utils.categories.list.invalidate();
      // Sync folder membership — always call so removals are captured too.
      const folderIds = selectedFolderId ? [selectedFolderId] : [];
      const prevIds = folderIdsForDeck ?? [];
      const changed = [...folderIds].sort().join(',') !== [...prevIds].sort().join(',');
      if (changed) {
        setDeckFolders.mutate(
          { categoryId: category.id, folderIds },
          { onSettled: () => onClose() },
        );
        return;
      }
      onClose();
    },
  });

  const form = useForm<CategoryUpdateInput>({
    resolver: zodResolver(CategoryUpdateInput),
    defaultValues: {
      id: category.id,
      name: category.name,
      description: category.description,
      // Fall back to the first palette color if the deck has no color set,
      // so the swatch UI always has a selected option to render.
      color: category.color ?? DECK_FOLDER_COLOR_PALETTE[0],
      backLanguage: category.backLanguage,
      private: category.private,
    },
  });

  const selectedColor = form.watch('color') ?? DECK_FOLDER_COLOR_PALETTE[0];
  const selectedBackLanguage = form.watch('backLanguage');
  const isPrivate = form.watch('private') ?? true;
  const hasFolders = (folders?.length ?? 0) > 0;

  function handleSubmit(values: CategoryUpdateInput) {
    if (!selectedFolderId) {
      setFolderError(true);
      return;
    }
    setFolderError(false);
    // "Language for translation" is required when the TTS feature is
    // available — otherwise the picker is hidden and there's nothing to
    // validate.
    if (ttsAvailable && !values.backLanguage) {
      setLanguageError(true);
      return;
    }
    setLanguageError(false);
    // Remember the chosen language as the user's new default so it's
    // preselected the next time a deck modal opens.
    if (values.backLanguage && values.backLanguage !== me?.defaultLanguage) {
      setDefaultLanguage.mutate({ defaultLanguage: values.backLanguage });
    }
    update.mutate(values);
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit deck</DialogTitle>
          <DialogDescription>Update the deck name, color, and audio language.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Folder — required, shown first */}
          <div className="space-y-2">
            <Label htmlFor="edit-deck-folder">
              Folder <span className="text-destructive">*</span>
            </Label>
            {!hasFolders ? (
              <p className="text-muted-foreground text-sm">
                No folders yet — create a folder first.
              </p>
            ) : (
              <Select
                value={selectedFolderId ?? NO_FOLDER}
                onValueChange={(v) => {
                  setSelectedFolderId(v === NO_FOLDER ? null : v);
                  if (v !== NO_FOLDER) setFolderError(false);
                }}
              >
                <SelectTrigger id="edit-deck-folder">
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
            <Label htmlFor="edit-deck-name">Name</Label>
            <Input id="edit-deck-name" placeholder="e.g. French verbs" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-deck-description">Description (optional)</Label>
            <Textarea
              id="edit-deck-description"
              placeholder="What is this deck about?"
              rows={3}
              {...form.register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {DECK_FOLDER_COLOR_PALETTE.map((color) => {
                const selected = selectedColor === color;
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
              <Label htmlFor="edit-deck-public" className="cursor-pointer">
                Deck public
              </Label>
              <p className="text-muted-foreground text-xs">
                Off keeps the deck private to you. On makes it public.
              </p>
            </div>
            <Switch
              id="edit-deck-public"
              // Form stores `private`. Toggle shows the opposite — "Deck
              // public" is on when private is false.
              checked={isPrivate === false}
              onCheckedChange={(checked) =>
                form.setValue('private', !checked, { shouldDirty: true })
              }
            />
          </div>

          {ttsAvailable ? (
            <div className="space-y-2">
              <Label htmlFor="edit-deck-back-language">
                Language for translation <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedBackLanguage ?? NO_LANGUAGE}
                onValueChange={(v) => {
                  const next = v === NO_LANGUAGE ? null : (v as BackLanguageValue);
                  form.setValue('backLanguage', next, { shouldDirty: true });
                  // Clear the validation error as soon as a real language
                  // is picked so the error message disappears immediately.
                  if (next) setLanguageError(false);
                }}
              >
                <SelectTrigger id="edit-deck-back-language">
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
