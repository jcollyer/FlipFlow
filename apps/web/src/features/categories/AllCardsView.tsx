'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Library,
  Loader2,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import {
  FlashcardUpdateInput,
  WORD_CLASS_OPTIONS,
  GENDER_OPTIONS,
  type GenderValue,
  VERB_TYPE_OPTIONS,
  type VerbTypeValue,
} from '@ensemble/types';
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
import { cn, formatRelative } from '@/lib/utils';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { ClassSelect } from '@/features/cards/ClassSelect';
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
  const { data: stats } = trpc.practice.stats.useQuery({});
  const { data: categories } = trpc.categories.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [practiceLimit, setPracticeLimit] = useState(20);
  const [filterOpen, setFilterOpen] = useState(false);

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

  const hasActiveFilters =
    selectedCategoryIds.length > 0 || selectedClasses.length > 0 || practiceLimit !== 20;

  function buildPracticeHref() {
    const params = new URLSearchParams();
    params.set('limit', String(practiceLimit));
    if (selectedCategoryIds.length > 0) params.set('categoryIds', selectedCategoryIds.join(','));
    if (selectedClasses.length > 0) params.set('classes', selectedClasses.join(','));
    return `/app/all-categories/practice?${params.toString()}`;
  }

  const remove = trpc.flashcards.delete.useMutation({
    onSuccess: () => {
      utils.flashcards.listAll.invalidate();
      utils.practice.stats.invalidate({});
      utils.categories.list.invalidate();
    },
  });

  // Quick lookup so each card row can show "from <deck>" and resolve backLanguage.
  const decksById = new Map(
    (categories ?? []).map((c) => [c.id, { name: c.name, color: c.color, backLanguage: c.backLanguage }]),
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
    return result;
  }, [allCards, selectedCategoryIds, selectedClasses]);

  const practiceCountLabel = hasActiveFilters
    ? ` (${Math.min(filteredCards.length, practiceLimit)})`
    : stats?.due
      ? ` (${stats.due})`
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
              Your decks
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
            >
              <Library className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">All decks</h1>
          </div>
          <p className="text-muted-foreground pl-12 text-sm">
            Every card you've created, including uncategorized ones.
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
              ? ` (${selectedCategoryIds.length + selectedClasses.length || ''})`.replace(' ()', '')
              : ''}
          </Button>
          <Button onClick={() => router.push(buildPracticeHref())}>
            <Play className="h-4 w-4" />
            Practice{practiceCountLabel}
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New card
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total" value={stats?.total ?? allCards.length} />
        <Stat label="Due now" value={stats?.due ?? 0} />
        <Stat label="Mastered" value={stats?.mastered ?? 0} />
      </div>

      {/* ── Practice filter panel ──────────────────────────────────────────── */}
      {filterOpen && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Practice filters</span>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryIds([]);
                      setSelectedClasses([]);
                      setPracticeLimit(20);
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

            {/* Card count */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Number of cards</p>
              <div className="flex gap-2">
                {[10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPracticeLimit(n)}
                    className={cn(
                      'rounded-full px-4 py-1 text-sm font-medium transition',
                      practiceLimit === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70',
                    )}
                  >
                    {n}
                  </button>
                ))}
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
                      <span>·</span>
                      <span>Next review: {formatRelative(card.nextReview)}</span>
                      <span>·</span>
                      <span>{card.repetitions} reps</span>
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
      ) : hasActiveFilters ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No matching cards</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              No cards match the current filters. Try adjusting your selection above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No cards yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
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

      {/* Flashcard preview modal — opens when a card row is clicked */}
      <FlashcardPreviewModal
        cards={previewCards}
        initialIndex={previewIndex ?? 0}
        open={previewIndex !== null}
        onOpenChange={(open) => { if (!open) setPreviewIndex(null); }}
        canRate
        onRated={() => {
          utils.flashcards.listAll.invalidate();
          utils.practice.stats.invalidate({});
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

// Sentinel for "leave the card uncategorized" — Radix Select can't bind to
// an empty string or null, so we map at the edges.
const KEEP_UNCATEGORIZED = '__none__';
const NO_GENDER = '__no_gender__';
const NO_VERB_TYPE = '__no_verb_type__';

/**
 * Read the translation target the user most recently picked for this scope
 * (the deck's id, or `__dashboard__` for uncategorized cards). We use it as
 * the dictionary lookup language so "Get gender" / "Get pronunciation" hit
 * the same language the user is working in. Falls back to English when no
 * pref is set, which is a safe default for plain vocab cards.
 */
function readDictionaryTarget(categoryId: string | null): 'en' | 'fr' | 'es' | 'de' {
  if (typeof window === 'undefined') return 'en';
  try {
    const scope = categoryId ?? '__dashboard__';
    const raw = window.localStorage.getItem(`ensemble:translate:${scope}`);
    if (!raw) return 'en';
    const parsed = JSON.parse(raw) as { target?: string };
    if (parsed.target === 'fr' || parsed.target === 'es' || parsed.target === 'de') {
      return parsed.target;
    }
  } catch {
    // Corrupt/quota — fall through to English.
  }
  return 'en';
}

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
  const utils = trpc.useUtils();
  const { data: card } = trpc.flashcards.byId.useQuery({ id: cardId });
  const update = trpc.flashcards.update.useMutation({
    onSuccess: (updatedCard) => {
      utils.flashcards.byId.setData({ id: updatedCard.id }, updatedCard);
      void utils.flashcards.byId.invalidate({ id: updatedCard.id });
      onSaved();
    },
  });

  // Tracked separately from the form: we need a tri-state (no card loaded
  // yet / explicitly uncategorized / specific deck) for the dropdown.
  // The dialog conditionally renders on `editingId`, so opening a different
  // card unmounts and remounts this — state resets naturally.
  const [assignDeck, setAssignDeck] = useState<string>(KEEP_UNCATEGORIZED);

  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);
  // Word class — optional. `null` = clear it on save.
  const [wordClass, setWordClass] = useState<string | null>(null);
  // Gender and verb type — optional.
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [verbType, setVerbType] = useState<VerbTypeValue | null>(null);
  // Optional pronunciation hint.
  const [pronunciation, setPronunciation] = useState('');

  // Sync example state when the card data loads.
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

  // Show the deck assigner only for uncategorized cards. Cards already in a
  // deck don't get a re-assign UI — that wasn't asked for, and it's safer
  // to keep that flow as a separate, explicit action.
  const showAssign = card && !card.categoryId && decks.length > 0;

  // Free Dictionary lookup buttons. This view doesn't have its own translate
  // toggle, so we read the user's last-used target for the card's deck (or
  // the dashboard scope) and fall back to English.
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

  const back = useWatch({ control: form.control, name: 'back' }) ?? '';
  const trimmedBack = back.trim();
  const canLookup = trimmedBack.length > 0;
  const dictionaryTarget = readDictionaryTarget(card?.categoryId ?? null);

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
            const categoryId =
              showAssign && assignDeck !== KEEP_UNCATEGORIZED ? assignDeck : undefined;
            update.mutate({
              ...values,
              categoryId,
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
          <div className="space-y-2">
            <Label htmlFor="front">Front</Label>
            <Textarea id="front" rows={2} {...form.register('front')} />
            {frontExamples.length > 0 ? (
              <div className="space-y-2">
                {frontExamples.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Example…"
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
            <Label htmlFor="back">Back</Label>
            <Textarea id="back" rows={3} {...form.register('back')} />
            {backExamples.length > 0 ? (
              <div className="space-y-2">
                {backExamples.map((val, i) => (
                  <Input
                    key={i}
                    placeholder="Example…"
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
                onValueChange={(v) =>
                  setVerbType(v === NO_VERB_TYPE ? null : (v as VerbTypeValue))
                }
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
              <p className="text-muted-foreground text-xs">
                Move this card into one of your decks. You can&#39;t move it back to uncategorized
                once assigned.
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
