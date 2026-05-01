'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, X } from 'lucide-react';

import { FlashcardCreateInput, GENDER_OPTIONS, type GenderValue, VERB_TYPE_OPTIONS, type VerbTypeValue } from '@flipflow/types';
import { Button } from '@/components/ui/button';
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
import { MARKDOWN_INPUT_HINT } from '@/components/ui/markdown-text';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { useDebouncedValue } from '@/lib/hooks';
import { ClassSelect } from '@/features/cards/ClassSelect';

/** Languages exposed in the translation dropdown. Must match the server enum. */
const TRANSLATE_TARGETS = [
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
] as const;
type TranslateTargetValue = (typeof TRANSLATE_TARGETS)[number]['value'];

// Sentinel for "no deck" in the optional deck selector — Radix Select can't
// bind to empty strings or null.
const NO_DECK = '__none__';
const NO_GENDER = '__no_gender__';
const NO_VERB_TYPE = '__no_verb_type__';

/**
 * Per-scope localStorage shape for translation preferences. The "scope" is
 * either a categoryId (fixed-deck dialog) or `__none__` (uncategorized dialog
 * launched from the dashboard).
 */
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
    // Ignore corrupt entries — the user just gets defaults.
  }
  return null;
}

function writeTranslatePrefs(scope: string, prefs: TranslatePrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`flipflow:translate:${scope}`, JSON.stringify(prefs));
  } catch {
    // localStorage can throw in private mode / quota — non-fatal.
  }
}

/**
 * Shared "New card" dialog. Two modes:
 *
 *   - mode: 'fixed'
 *     The card is always created in a known categoryId. No deck selector is
 *     shown. Used by the deck detail view.
 *
 *   - mode: 'selectable'
 *     The user can optionally pick a deck (or leave it as "No deck", which
 *     creates an uncategorized card). Used by the dashboard's New card button.
 *
 * Translation preferences are persisted per-scope in localStorage, so the
 * "French Vocab" deck always opens in French mode and the dashboard dialog
 * has its own remembered defaults.
 */
export type CreateCardDialogProps =
  | {
      mode: 'fixed';
      categoryId: string;
      open: boolean;
      onOpenChange: (next: boolean) => void;
      /** Called after the card is successfully created. */
      onCreated?: () => void;
    }
  | {
      mode: 'selectable';
      open: boolean;
      onOpenChange: (next: boolean) => void;
      /** Decks the user can choose between. Empty array hides the selector. */
      decks: Array<{ id: string; name: string }>;
      /** Optional pre-selected deck. Defaults to "No deck". */
      defaultCategoryId?: string | null;
      /** Called after the card is successfully created. */
      onCreated?: () => void;
    };

export function CreateCardDialog(props: CreateCardDialogProps) {
  const utils = trpc.useUtils();

  const { data: availability } = trpc.translate.isAvailable.useQuery(undefined, {
    // Availability is purely an env-var check; no need to refetch on focus.
    staleTime: Infinity,
  });
  const translateAvailable = !!availability?.available;

  // For "selectable" mode, the deck selection lives in component state because
  // we want it independent of the form's validation (it's optional and we map
  // it to null when set to NO_DECK before submission).
  const [selectedDeck, setSelectedDeck] = useState<string>(() => {
    if (props.mode === 'selectable') return props.defaultCategoryId ?? NO_DECK;
    return props.categoryId;
  });

  // Reset the selector each time the dialog opens, so users don't see a
  // stale selection from the previous open.
  useEffect(() => {
    if (props.mode === 'selectable' && props.open) {
      setSelectedDeck(props.defaultCategoryId ?? NO_DECK);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  // Translation prefs are scoped: fixed-deck dialogs scope to the deck id;
  // selectable dialogs always use a single shared scope so prefs don't churn
  // every time the user changes the dropdown.
  const translateScope = props.mode === 'fixed' ? props.categoryId : '__dashboard__';

  const [translateOn, setTranslateOn] = useState(false);
  const [target, setTarget] = useState<TranslateTargetValue>('fr');

  // Hydrate prefs on mount / scope change.
  useEffect(() => {
    const stored = readTranslatePrefs(translateScope);
    if (stored) {
      setTranslateOn(stored.enabled);
      setTarget(stored.target);
    } else {
      setTranslateOn(false);
      setTarget('fr');
    }
  }, [translateScope]);

  // Persist whenever they change.
  useEffect(() => {
    writeTranslatePrefs(translateScope, { v: 1, enabled: translateOn, target });
  }, [translateScope, translateOn, target]);

  const form = useForm<FlashcardCreateInput>({
    resolver: zodResolver(FlashcardCreateInput),
    defaultValues: {
      categoryId: props.mode === 'fixed' ? props.categoryId : null,
      front: '',
      back: '',
    },
  });

  const create = trpc.flashcards.create.useMutation({
    onSuccess: (_card, variables) => {
      // Invalidate the queries that could be displaying this card.
      utils.flashcards.listAll.invalidate();
      utils.categories.list.invalidate();
      utils.practice.stats.invalidate({}); // dashboard / All view stats
      if (variables.categoryId) {
        utils.flashcards.listByCategory.invalidate({ categoryId: variables.categoryId });
        utils.practice.stats.invalidate({ categoryId: variables.categoryId });
      }
      props.onOpenChange(false);
      props.onCreated?.();
    },
  });

  const translate = trpc.translate.translate.useMutation();

  // Memoizes the most recent (text, target) we sent to Google so flipping the
  // toggle / re-rendering doesn't re-fire identical requests.
  const lastTranslatedRef = useRef<{ text: string; target: string } | null>(null);
  // Per-slot memoization for example translations (keyed by array index).
  const lastTranslatedExamplesRef = useRef(new Map<number, { text: string; target: string }>());

  // Example sentences are managed outside RHF so we avoid the useFieldArray
  // object-array wrapper; they are merged into the mutation payload on submit.
  const [frontExamples, setFrontExamples] = useState<string[]>([]);
  const [backExamples, setBackExamples] = useState<string[]>([]);

  // Word class (part of speech) — optional. Tracked outside RHF so the dialog
  // can map between `null` and the Radix sentinel without RHF type gymnastics.
  const [wordClass, setWordClass] = useState<string | null>(null);
  // Gender and verb type — optional.
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [verbType, setVerbType] = useState<VerbTypeValue | null>(null);

  // Reset form state when the dialog closes so the next open starts clean.
  // We deliberately do NOT reset translateOn / target — those are sticky.
  useEffect(() => {
    if (!props.open) {
      form.reset({
        categoryId: props.mode === 'fixed' ? props.categoryId : null,
        front: '',
        back: '',
      });
      translate.reset();
      lastTranslatedRef.current = null;
      setFrontExamples([]);
      setBackExamples([]);
      setWordClass(null);
      setGender(null);
      setVerbType(null);
      lastTranslatedExamplesRef.current.clear();
    }
    // form / translate are stable refs from their hooks — don't include them
    // here or this would loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

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

    // Skip if we already translated this exact (text, target) pair.
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
    // form / translate are stable refs from their hooks; including them would
    // re-run this effect on every render and re-fire the same mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFront, target, translateOn, translateAvailable]);

  // Debounced translation for each front example → corresponding back example.
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

  const showDeckSelector = props.mode === 'selectable' && props.decks.length > 0;

  const onSubmit = form.handleSubmit((values) => {
    const categoryId =
      props.mode === 'fixed' ? props.categoryId : selectedDeck === NO_DECK ? null : selectedDeck;
    create.mutate({
      ...values,
      categoryId,
      frontExamples,
      backExamples,
      class: wordClass,
      gender: gender,
      verb_type: verbType,
    });
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="overflow-auto max-h-[80dvh]">
        <DialogHeader>
          <DialogTitle>New card</DialogTitle>
          <DialogDescription>The front is the prompt, the back is the answer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {showDeckSelector ? (
            <div className="space-y-2">
              <Label htmlFor="card-deck">Deck (optional)</Label>
              <Select value={selectedDeck} onValueChange={setSelectedDeck}>
                <SelectTrigger id="card-deck">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DECK}>No deck</SelectItem>
                  {props.mode === 'selectable'
                    ? props.decks.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Cards without a deck still show up in the All decks view.
              </p>
            </div>
          ) : null}

          {translateAvailable ? (
            <div className="bg-muted/30 space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="translate-toggle" className="cursor-pointer">
                    Translation card
                  </Label>
                  <p className="text-muted-foreground text-xs">
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
            <Label htmlFor="card-class">Category (optional)</Label>
            <ClassSelect id="card-class" value={wordClass} onChange={setWordClass} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="card-gender">Gender (optional)</Label>
            <Select
              value={gender ?? NO_GENDER}
              onValueChange={(v) => setGender(v === NO_GENDER ? null : v as GenderValue)}
            >
              <SelectTrigger id="card-gender">
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
            <Label htmlFor="card-verb-type">Verb type (optional)</Label>
            <Select
              value={verbType ?? NO_VERB_TYPE}
              onValueChange={(v) => setVerbType(v === NO_VERB_TYPE ? null : v as VerbTypeValue)}
            >
              <SelectTrigger id="card-verb-type">
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
            {translate.error ? (
              <p className="text-destructive text-xs">{translate.error.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
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
