'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';

import {
  BACK_LANGUAGES,
  type BackLanguageValue,
  FlashcardCreateInput,
  FlashcardUpdateInput,
} from '@flipflow/types';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { useDebouncedValue } from '@/lib/hooks';
import { formatRelative } from '@/lib/utils';

/** Languages exposed in the translation dropdown. Must match the server enum. */
const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

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

      <DeckAudioLanguage
        categoryId={categoryId}
        backLanguage={category?.backLanguage ?? null}
      />

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
      <CreateCardDialog
        categoryId={categoryId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

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
          <p className="text-xs text-muted-foreground">
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

/**
 * Per-deck localStorage shape for translation preferences. Bumped to v1 so we
 * have an obvious migration handle if we ever change it.
 */
interface TranslatePrefs {
  v: 1;
  enabled: boolean;
  target: TranslateTargetValue;
}

function readTranslatePrefs(categoryId: string): TranslatePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`flipflow:translate:${categoryId}`);
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
    // Ignore corrupt entries — the user just gets defaults.
  }
  return null;
}

function writeTranslatePrefs(categoryId: string, prefs: TranslatePrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`flipflow:translate:${categoryId}`, JSON.stringify(prefs));
  } catch {
    // localStorage can throw in private mode / quota — non-fatal.
  }
}

/**
 * New-card dialog with optional translation mode.
 *
 * When the server has a Google Translate key configured, the user can flip a
 * toggle to translate the front (assumed English) into the chosen target
 * language as they type. The toggle and language are remembered per deck so a
 * "French Vocab" deck always opens in French mode without nagging the user.
 *
 * Auto-fill behavior: every debounced change to the front overwrites the back
 * with the latest translation, even if the user manually edited it. The user
 * opted into this trade-off (simple + predictable) over the more complex
 * "remember my manual edit" model.
 */
function CreateCardDialog({
  categoryId,
  open,
  onOpenChange,
}: {
  categoryId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const utils = trpc.useUtils();

  const { data: availability } = trpc.translate.isAvailable.useQuery(undefined, {
    // Availability is purely an env-var check; no need to refetch on focus.
    staleTime: Infinity,
  });
  const translateAvailable = !!availability?.available;

  const [translateOn, setTranslateOn] = useState(false);
  const [target, setTarget] = useState<TranslateTargetValue>('fr');

  // Hydrate per-deck prefs on mount.
  useEffect(() => {
    const stored = readTranslatePrefs(categoryId);
    if (stored) {
      setTranslateOn(stored.enabled);
      setTarget(stored.target);
    }
  }, [categoryId]);

  // Persist whenever they change.
  useEffect(() => {
    writeTranslatePrefs(categoryId, { v: 1, enabled: translateOn, target });
  }, [categoryId, translateOn, target]);

  const form = useForm<FlashcardCreateInput>({
    resolver: zodResolver(FlashcardCreateInput),
    defaultValues: { categoryId, front: '', back: '' },
  });

  const create = trpc.flashcards.create.useMutation({
    onSuccess: () => {
      utils.flashcards.listByCategory.invalidate({ categoryId });
      utils.practice.stats.invalidate({ categoryId });
      utils.categories.list.invalidate();
      onOpenChange(false);
    },
  });

  const translate = trpc.translate.translate.useMutation();

  // Memoizes the most recent (text, target) we sent to Google so flipping the
  // toggle / re-rendering doesn't re-fire identical requests.
  const lastTranslatedRef = useRef<{ text: string; target: string } | null>(null);

  // Reset form state when the dialog closes so the next "+ New card" starts
  // clean. We deliberately do NOT reset translateOn / target — those are the
  // sticky per-deck preferences.
  useEffect(() => {
    if (!open) {
      form.reset({ categoryId, front: '', back: '' });
      translate.reset();
      lastTranslatedRef.current = null;
    }
    // form / translate are stable refs from their hooks — don't include them
    // here or this would loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categoryId]);

  // Debounced translation on front-text change.
  const front = useWatch({ control: form.control, name: 'front' }) ?? '';
  const debouncedFront = useDebouncedValue(front.trim(), 500);

  useEffect(() => {
    if (!translateOn || !translateAvailable) return;

    if (!debouncedFront) {
      // Front is empty — clear any auto-fill and reset memoization.
      form.setValue('back', '');
      lastTranslatedRef.current = null;
      return;
    }

    // Skip if we already translated this exact (text, target) pair — prevents
    // a burst of duplicate calls when the toggle/lang changes triggers the
    // effect with unchanged input.
    const last = lastTranslatedRef.current;
    if (last && last.text === debouncedFront && last.target === target) return;

    // Stamp this request as the latest. We use the *object identity* of
    // `request` (not its contents) to detect stale responses — useMutation
    // doesn't cancel in-flight calls, so if the user types again before the
    // first response lands, the older response would otherwise overwrite the
    // back with a stale translation. The closure's `request` ref will no
    // longer equal `lastTranslatedRef.current` once a newer mutate has run.
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
    // form / translate are stable refs from their hooks; including them would
    // re-run this effect on every render and re-fire the same mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFront, target, translateOn, translateAvailable]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New card</DialogTitle>
          <DialogDescription>The front is the prompt, the back is the answer.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="space-y-3"
        >
          {translateAvailable ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="translate-toggle" className="cursor-pointer">
                    Translation card
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-translate the front into the chosen language.
                  </p>
                </div>
                <Switch
                  id="translate-toggle"
                  checked={translateOn}
                  onCheckedChange={setTranslateOn}
                />
              </div>
              {translateOn ? (
                <div className="space-y-2">
                  <Label htmlFor="translate-target">Target language</Label>
                  <Select
                    value={target}
                    onValueChange={(v) => setTarget(v as TranslateTargetValue)}
                  >
                    <SelectTrigger id="translate-target">
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
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="back">Back</Label>
              {translateOn && translate.isPending ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Translating…
                </span>
              ) : null}
            </div>
            <Textarea id="back" rows={3} {...form.register('back')} />
            {translate.error ? (
              <p className="text-xs text-destructive">{translate.error.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
