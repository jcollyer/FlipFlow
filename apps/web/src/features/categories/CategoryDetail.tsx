'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, LayersPlus, Loader2, Pencil, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';

import {
  BACK_LANGUAGES,
  type BackLanguageValue,
  CategoryUpdateInput,
  FlashcardUpdateInput,
  GENDER_OPTIONS,
  type GenderValue,
  VERB_TYPE_OPTIONS,
  type VerbTypeValue,
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
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { ClassSelect } from '@/features/cards/ClassSelect';
import { ClassBadge } from '@/features/cards/ClassBadge';
import { FlashcardPreviewModal, type PreviewCard } from '@/features/practice/FlashcardPreviewModal';

const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

const NO_GENDER = '__no_gender__';
const NO_VERB_TYPE = '__no_verb_type__';

// Same palette as the create-deck dialog so editing matches creating.
const DECK_COLOR_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

interface Props {
  categoryId: string;
}

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
  const [editDeckOpen, setEditDeckOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

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
  const previewCards: PreviewCard[] = (cards ?? []).map((card) => ({
    id: card.id,
    front: card.front,
    back: card.back,
    frontExamples: card.frontExamples,
    backExamples: card.backExamples,
    class: card.class ?? null,
    pronunciation: (card as { pronunciation?: string | null }).pronunciation ?? null,
    backLanguage: (category?.backLanguage ?? null) as BackLanguageValue | null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={isOwner ? '/app' : '/app/more'}>
              <ArrowLeft className="h-4 w-4" />
              {isOwner ? 'All decks' : 'Public decks'}
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
          <Button asChild>
            <Link href={`/app/categories/${categoryId}/practice`}>
              <Play className="h-4 w-4" />
              {/* Show the total card count as the parenthetical so the user
                  knows how big a session they're about to start. */}
              Play {isOwner && (cards?.length ?? 0) > 0 ? `(${cards?.length})` : ''}
            </Link>
          </Button>
        </div>
      </div>

      {isOwner ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <ProgressSnapshotCard
            label="Total cards"
            value={stats?.total ?? cards?.length ?? 0}
            tone="slate"
          />
          <ProgressSnapshotCard
            label="Challenging cards"
            value={stats?.difficultyBreakdown?.challenging ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.challenging ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="amber"
          />
          <ProgressSnapshotCard
            label="Good cards"
            value={stats?.difficultyBreakdown?.good ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.good ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="blue"
          />
          <ProgressSnapshotCard
            label="Easy cards"
            value={stats?.difficultyBreakdown?.easy ?? 0}
            percentage={getPercentage(
              stats?.difficultyBreakdown?.easy ?? 0,
              stats?.total ?? cards?.length ?? 0,
            )}
            tone="green"
          />
        </div>
      ) : null}

      {isOwner ? (
        <DeckAudioLanguage categoryId={categoryId} backLanguage={category?.backLanguage ?? null} />
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : cards && cards.length > 0 ? (
        <div className="space-y-3">
          {cards.map((card, cardIdx) => (
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
                    {isOwner && card.difficultyLevel ? (
                      <span className="capitalize">{card.difficultyLevel}</span>
                    ) : null}
                  </div>
                </div>
                {/* Stop propagation so edit/delete don't also open the preview */}
                {isOwner ? (
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
                ) : null}
              </CardContent>
            </Card>
          ))}
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

/**
 * Inline editor for the deck's back-of-card audio language. Hidden entirely
 * if the server can't reach Google Cloud TTS (no API key) so the user
 * doesn't see a setting that wouldn't do anything. Saves on every change —
 * it's a single dropdown so there's nothing to "submit".
 */
function DeckAudioLanguage({
  categoryId,
  backLanguage,
}: {
  categoryId: string;
  backLanguage: BackLanguageValue | string | null;
}) {
  const utils = trpc.useUtils();

  const { data: ttsAvailability } = trpc.tts.isAvailable.useQuery(undefined, {
    staleTime: Infinity,
  });
  const ttsAvailable = !!ttsAvailability?.available;

  const update = trpc.categories.update.useMutation({
    onSuccess: () => {
      utils.categories.byId.invalidate({ id: categoryId });
      utils.categories.list.invalidate();
    },
  });

  if (!ttsAvailable) return null;

  const current = (backLanguage ?? NO_LANGUAGE) as string;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-0.5">
          <Label htmlFor="deck-audio-language" className="cursor-pointer">
            Language for translation
          </Label>
        </div>
        <div className="min-w-[200px]">
          <Select
            value={current}
            disabled={update.isPending}
            onValueChange={(v) => {
              const next = v === NO_LANGUAGE ? null : (v as BackLanguageValue);
              // No-op if the value didn't actually change.
              if ((next ?? null) === (backLanguage ?? null)) return;
              update.mutate({ id: categoryId, backLanguage: next });
            }}
          >
            <SelectTrigger id="deck-audio-language">
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
      </CardContent>
    </Card>
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
            <p className="text-muted-foreground text-sm">In this deck</p>
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
          onSubmit={form.handleSubmit((values) =>
            update.mutate({
              ...values,
              frontExamples,
              backExamples,
              class: wordClass,
              gender,
              verb_type: wordClass === 'verb' ? verbType : null,
              pronunciation: pronunciation.trim() ? pronunciation.trim() : null,
            }),
          )}
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
                        lastTranslatedExamplesRef.current.clear();
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
      color: category.color ?? DECK_COLOR_PALETTE[0],
      backLanguage: category.backLanguage,
      private: category.private,
    },
  });

  const selectedColor = form.watch('color') ?? DECK_COLOR_PALETTE[0];
  const selectedBackLanguage = form.watch('backLanguage');
  const isPrivate = form.watch('private') ?? true;
  const hasFolders = (folders?.length ?? 0) > 0;

  function handleSubmit(values: CategoryUpdateInput) {
    if (!selectedFolderId) {
      setFolderError(true);
      return;
    }
    setFolderError(false);
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
            <Input
              id="edit-deck-name"
              placeholder="e.g. Spanish verbs"
              {...form.register('name')}
            />
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
              {DECK_COLOR_PALETTE.map((color) => {
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
              <Label htmlFor="edit-deck-back-language">Language for translation</Label>
              <Select
                value={selectedBackLanguage ?? NO_LANGUAGE}
                onValueChange={(v) =>
                  form.setValue(
                    'backLanguage',
                    v === NO_LANGUAGE ? null : (v as BackLanguageValue),
                    { shouldDirty: true },
                  )
                }
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
