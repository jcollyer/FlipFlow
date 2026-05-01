'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react';

import { BACK_LANGUAGES, type BackLanguageValue, FlashcardUpdateInput, GENDER_OPTIONS, type GenderValue, VERB_TYPE_OPTIONS, type VerbTypeValue } from '@flipflow/types';
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
import { MARKDOWN_INPUT_HINT, MarkdownText } from '@/components/ui/markdown-text';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc/client';
import { formatRelative } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/hooks';
import { CreateCardDialog } from '@/features/cards/CreateCardDialog';
import { ClassSelect } from '@/features/cards/ClassSelect';
import { ClassBadge } from '@/features/cards/ClassBadge';

const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

const NO_GENDER = '__no_gender__';
const NO_VERB_TYPE = '__no_verb_type__';

interface TranslatePrefs {
  v: 1;
  enabled: boolean;
  target: TranslateTargetValue;
}

function readTranslatePrefs(scope: string): TranslatePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`flipflow:translate:${scope}`);
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
    window.localStorage.setItem(`flipflow:translate:${scope}`, JSON.stringify(prefs));
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
  const { data: stats } = trpc.practice.stats.useQuery({ categoryId });

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
            <h1 className="text-3xl font-semibold tracking-tight">
              {category?.name ?? 'Loading…'}
            </h1>
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

      <DeckAudioLanguage categoryId={categoryId} backLanguage={category?.backLanguage ?? null} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : cards && cards.length > 0 ? (
        <div className="space-y-3">
          {cards.map((card) => (
            <Card key={card.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <MarkdownText markdown={card.front} variant="preview" className="line-clamp-2 font-medium" />
                  <MarkdownText
                    markdown={card.back}
                    variant="preview"
                    className="text-muted-foreground line-clamp-2 text-sm"
                  />
                  {card.frontExamples.length > 0 || card.backExamples.length > 0 ? (
                    <div className="divide-border/50 mt-2 divide-y px-3 py-1">
                      {Array.from({
                        length: Math.max(card.frontExamples.length, card.backExamples.length),
                      }).map((_, i) => (
                        <div key={i} className="flex items-baseline gap-3 py-1 text-xs">
                          <span className="flex min-w-0 items-baseline gap-1">
                            <MarkdownText
                              markdown={card.frontExamples[i] ?? ''}
                              variant="preview"
                              className="text-foreground font-semibold"
                            />
                          </span>
                          <span className="flex min-w-0 items-baseline gap-1">
                            <MarkdownText
                              markdown={card.backExamples[i] ?? ''}
                              variant="preview"
                              className="text-muted-foreground"
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
                    {card.class ? <ClassBadge value={card.class} /> : null}
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
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-lg font-semibold">No cards yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
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

      {/* Create card dialog (deck is fixed to this category). */}
      <CreateCardDialog
        mode="fixed"
        categoryId={categoryId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {/* Edit card dialog */}
      {editingId ? (
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

  const NO_LANGUAGE = '__none__';
  const current = (backLanguage ?? NO_LANGUAGE) as string;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-0.5">
          <Label htmlFor="deck-audio-language" className="cursor-pointer">
            Audio language (back of card)
          </Label>
          <p className="text-muted-foreground text-xs">
            Pick a language to enable a speaker button on the back of cards during practice.
          </p>
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

  useEffect(() => {
    const stored = readTranslatePrefs(categoryId);
    if (stored) {
      setTranslateOn(stored.enabled);
      setTarget(stored.target);
    } else {
      setTranslateOn(false);
      setTarget('fr');
    }
  }, [categoryId]);

  useEffect(() => {
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

  // Sync form + example state when the card data loads.
  useEffect(() => {
    if (card) {
      setFrontExamples(card.frontExamples);
      setBackExamples(card.backExamples);
      setWordClass(card.class ?? null);
      setGender(((card as { gender?: string | null }).gender as GenderValue | null) ?? null);
      setVerbType(((card as { verb_type?: string | null }).verb_type as VerbTypeValue | null) ?? null);
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

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="overflow-auto max-h-[80dvh]">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) =>
            update.mutate({ ...values, frontExamples, backExamples, class: wordClass, gender, verb_type: verbType }),
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
            <Label htmlFor="edit-card-class">Class (optional)</Label>
            <ClassSelect id="edit-card-class" value={wordClass} onChange={setWordClass} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-card-gender">Gender (optional)</Label>
            <Select
              value={gender ?? NO_GENDER}
              onValueChange={(v) => setGender(v === NO_GENDER ? null : v as GenderValue)}
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

          <div className="space-y-2">
            <Label htmlFor="edit-card-verb-type">Verb type (optional)</Label>
            <Select
              value={verbType ?? NO_VERB_TYPE}
              onValueChange={(v) => setVerbType(v === NO_VERB_TYPE ? null : v as VerbTypeValue)}
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

          <div className="space-y-2">
            <Label htmlFor="front">Front</Label>
            <Textarea id="front" rows={2} {...form.register('front')} />
            <p className="text-muted-foreground text-xs">{MARKDOWN_INPUT_HINT}</p>
            {frontExamples.length > 0 ? (
              <div className="space-y-2">
                {frontExamples.map((val, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Example sentence (Markdown supported)…"
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
            <p className="text-muted-foreground text-xs">{MARKDOWN_INPUT_HINT}</p>
            {backExamples.length > 0 ? (
              <div className="space-y-2">
                {backExamples.map((val, i) => (
                  <Input
                    key={i}
                    placeholder="Example sentence (Markdown supported)…"
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
