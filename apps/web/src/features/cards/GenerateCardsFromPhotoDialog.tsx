'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';

import {
  type AiCardDraft,
  type BackLanguageValue,
  backLanguageName,
  GENDER_OPTIONS,
  type GenderValue,
} from '@ensemble/types';
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
import { ClassSelect } from '@/features/cards/ClassSelect';
import { trpc } from '@/lib/trpc/client';

const NO_GENDER = '__no_gender__';

/** Longest edge (px) we downscale uploads to before sending to the server.
 *  Keeps the base64 payload small while leaving enough detail for OCR. */
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * An editable draft in the review list. Mirrors `AiCardDraft` but with the
 * example arrays kept paired (frontExamples[i] ↔ backExamples[i]) and a stable
 * local id so React keys survive reorders/removals.
 */
interface EditableDraft {
  id: string;
  front: string;
  back: string;
  examples: Array<{ front: string; back: string }>;
  class: string | null;
  gender: GenderValue | null;
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `draft_${localIdCounter}`;
}

function toEditable(draft: AiCardDraft): EditableDraft {
  const pairs: Array<{ front: string; back: string }> = [];
  const len = Math.min(draft.frontExamples.length, draft.backExamples.length);
  for (let i = 0; i < len; i += 1) {
    pairs.push({ front: draft.frontExamples[i] ?? '', back: draft.backExamples[i] ?? '' });
  }
  return {
    id: nextLocalId(),
    front: draft.front,
    back: draft.back,
    examples: pairs,
    class: draft.class ?? null,
    gender: (draft.gender as GenderValue | null) ?? null,
  };
}

/**
 * Read a File, downscale it on a canvas to keep the longest edge under
 * MAX_IMAGE_EDGE, and return a JPEG data URL. Falls back to the original data
 * URL if the browser can't decode the image for some reason.
 */
async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not decode the image.'));
      image.src = originalDataUrl;
    });

    const longest = Math.max(img.width, img.height);
    const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return originalDataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return originalDataUrl;
  }
}

export interface GenerateCardsFromPhotoDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  categoryId: string;
  /** The deck's back-of-card language. Drives the translation target. */
  backLanguage: BackLanguageValue | null;
  /** Called after cards are successfully created. */
  onCreated?: () => void;
}

/**
 * "New cards from photo" flow. The user uploads an image; GPT-4o reads it and
 * drafts flashcards (English front, deck-language back, with example
 * sentences). The drafts are shown in an editable review list and only saved
 * to the deck when the user confirms.
 */
export function GenerateCardsFromPhotoDialog(props: GenerateCardsFromPhotoDialogProps) {
  const { open, onOpenChange, categoryId, backLanguage, onCreated } = props;
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const languageLabel = backLanguageName(backLanguage) || 'the deck language';

  const generate = trpc.cardsAi.generateFromImage.useMutation();
  const createMany = trpc.flashcards.createMany.useMutation();

  // Reset everything whenever the dialog closes so the next open is clean.
  useEffect(() => {
    if (!open) {
      setImageDataUrl(null);
      setDrafts(null);
      setError(null);
      setPreparing(false);
      generate.reset();
      createMany.reset();
    }
    // mutations are stable refs from their hooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDrafts(null);
    generate.reset();
    setPreparing(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setImageDataUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not process that image.');
      setImageDataUrl(null);
    } finally {
      setPreparing(false);
    }
  }

  function handleGenerate() {
    if (!imageDataUrl || !backLanguage) return;
    setError(null);
    generate.mutate(
      { imageDataUrl, backLanguage },
      {
        onSuccess: ({ cards }) => {
          if (cards.length === 0) {
            setError(
              'No vocabulary was found in that image. Try a clearer photo or a different page.',
            );
            setDrafts(null);
            return;
          }
          setDrafts(cards.map(toEditable));
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  function updateDraft(id: string, patch: Partial<EditableDraft>) {
    setDrafts((prev) => (prev ? prev.map((d) => (d.id === id ? { ...d, ...patch } : d)) : prev));
  }

  function removeDraft(id: string) {
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
  }

  function addExample(id: string) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id ? { ...d, examples: [...d.examples, { front: '', back: '' }] } : d,
          )
        : prev,
    );
  }

  function updateExample(id: string, idx: number, side: 'front' | 'back', value: string) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  examples: d.examples.map((ex, i) => (i === idx ? { ...ex, [side]: value } : ex)),
                }
              : d,
          )
        : prev,
    );
  }

  function removeExample(id: string, idx: number) {
    setDrafts((prev) =>
      prev
        ? prev.map((d) =>
            d.id === id ? { ...d, examples: d.examples.filter((_, i) => i !== idx) } : d,
          )
        : prev,
    );
  }

  function handleSave() {
    if (!drafts) return;
    setError(null);

    // Keep only cards with both a front and back; drop empty example pairs.
    const payload = drafts
      .map((d) => {
        const examples = d.examples
          .map((ex) => ({ front: ex.front.trim(), back: ex.back.trim() }))
          .filter((ex) => ex.front && ex.back);
        return {
          front: d.front.trim(),
          back: d.back.trim(),
          frontExamples: examples.map((e) => e.front),
          backExamples: examples.map((e) => e.back),
          class: d.class,
          gender: d.gender,
          verb_type: null,
          pronunciation: null,
        };
      })
      .filter((c) => c.front && c.back);

    if (payload.length === 0) {
      setError('Every card needs a front and a back before saving.');
      return;
    }

    createMany.mutate(
      { categoryId, cards: payload },
      {
        onSuccess: () => {
          utils.flashcards.listByCategory.invalidate({ categoryId });
          utils.flashcards.listAll.invalidate();
          utils.categories.list.invalidate();
          utils.practice.stats.invalidate();
          onOpenChange(false);
          onCreated?.();
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  const hasLanguage = !!backLanguage;
  const validCount = drafts ? drafts.filter((d) => d.front.trim() && d.back.trim()).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New cards from photo</DialogTitle>
          <DialogDescription>
            Upload a photo of a vocabulary list. We&apos;ll read it and draft cards with English on
            the front and {languageLabel} on the back. Review and edit before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          {!hasLanguage ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              This deck doesn&apos;t have a back-of-card language set yet. Add one in{' '}
              <span className="font-medium">Edit deck</span> so we know which language to translate
              into.
            </div>
          ) : null}

          {/* Upload + preview */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void handleFileSelected(e.target.files?.[0]);
                // Reset so re-selecting the same file fires onChange again.
                e.target.value = '';
              }}
            />
            {imageDataUrl ? (
              <div className="relative w-full overflow-hidden rounded-md border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="Upload preview"
                  className="max-h-56 w-full object-contain"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2 h-7 w-7"
                  onClick={() => {
                    setImageDataUrl(null);
                    setDrafts(null);
                    setError(null);
                    generate.reset();
                  }}
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!hasLanguage || preparing}
                onClick={() => fileInputRef.current?.click()}
                className="border-input hover:bg-muted/40 flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {preparing ? (
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                ) : (
                  <ImagePlus className="text-muted-foreground h-6 w-6" />
                )}
                <span className="text-muted-foreground">
                  {preparing ? 'Preparing image…' : 'Click to upload a photo'}
                </span>
              </button>
            )}

            {imageDataUrl && !drafts ? (
              <Button
                type="button"
                className="w-full"
                onClick={handleGenerate}
                disabled={generate.isPending || !hasLanguage}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading photo…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate cards
                  </>
                )}
              </Button>
            ) : null}
          </div>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          {/* Review list */}
          {drafts ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {validCount} card{validCount === 1 ? '' : 's'} ready
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-7 text-xs"
                  onClick={() => {
                    setDrafts(null);
                    setImageDataUrl(null);
                    generate.reset();
                  }}
                >
                  Start over
                </Button>
              </div>

              {drafts.map((d, idx) => (
                <div key={d.id} className="bg-muted/20 space-y-3 rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      Card {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive h-7 w-7"
                      onClick={() => removeDraft(d.id)}
                      aria-label="Remove card"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Front (English)</Label>
                      <Input
                        value={d.front}
                        onChange={(e) => updateDraft(d.id, { front: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Back ({languageLabel})</Label>
                      <Input
                        value={d.back}
                        onChange={(e) => updateDraft(d.id, { back: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Part of speech</Label>
                      <ClassSelect
                        value={d.class}
                        onChange={(next) => updateDraft(d.id, { class: next })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gender</Label>
                      <Select
                        value={d.gender ?? NO_GENDER}
                        onValueChange={(v) =>
                          updateDraft(d.id, {
                            gender: v === NO_GENDER ? null : (v as GenderValue),
                          })
                        }
                      >
                        <SelectTrigger>
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
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Example sentences</Label>
                    {d.examples.map((ex, exIdx) => (
                      <div key={exIdx} className="flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <Input
                            placeholder="English example…"
                            value={ex.front}
                            onChange={(e) => updateExample(d.id, exIdx, 'front', e.target.value)}
                          />
                          <Input
                            placeholder={`${languageLabel} translation…`}
                            value={ex.back}
                            onChange={(e) => updateExample(d.id, exIdx, 'back', e.target.value)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeExample(d.id, exIdx)}
                          aria-label="Remove example"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground -ml-1 h-7 text-xs"
                      onClick={() => addExample(d.id)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add example
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {drafts ? (
            <Button
              type="button"
              onClick={handleSave}
              disabled={createMany.isPending || validCount === 0}
            >
              {createMany.isPending
                ? 'Adding…'
                : `Add ${validCount} card${validCount === 1 ? '' : 's'}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
