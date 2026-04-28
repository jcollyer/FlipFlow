import { z } from 'zod';

import { BackLanguageSchema } from './languages';
import { WordClassSchema } from './wordClass';

// ----------------------------------------------------------------------------
// Category
// ----------------------------------------------------------------------------

export const CategoryColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #3b82f6')
  .nullish();

/**
 * Optional BCP-47 language tag for the back of cards in this deck. Used by
 * the Google Cloud Text-to-Speech feature on the practice screen.
 *
 * `null` clears the previously-stored value (turns off audio playback for
 * the deck); `undefined` leaves it unchanged on update.
 */
export const CategoryBackLanguageSchema = BackLanguageSchema.nullish();

export const CategoryCreateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: CategoryColorSchema,
  backLanguage: CategoryBackLanguageSchema,
});
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;

export const CategoryUpdateInput = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: CategoryColorSchema,
  backLanguage: CategoryBackLanguageSchema,
});
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;

// ----------------------------------------------------------------------------
// Flashcard
// ----------------------------------------------------------------------------

/**
 * `categoryId` is optional. When omitted (or null), the card is "uncategorized"
 * — it doesn't belong to any deck and only shows up in the All decks view.
 */
const ExampleSentence = z.string().trim().min(1).max(500);
const ExamplesArray = z.array(ExampleSentence).max(20);

export const FlashcardCreateInput = z.object({
  categoryId: z.string().cuid().nullish(),
  front: z.string().trim().min(1, 'Front is required').max(2000),
  back: z.string().trim().min(1, 'Back is required').max(4000),
  frontExamples: ExamplesArray.default([]),
  backExamples: ExamplesArray.default([]),
  /** Optional part-of-speech of the front word — see WORD_CLASS_OPTIONS. */
  class: WordClassSchema,
});
export type FlashcardCreateInput = z.infer<typeof FlashcardCreateInput>;

/**
 * `categoryId`: when provided, moves the card into that deck. We deliberately
 * don't allow `null` here — the UI only exposes assigning an *uncategorized*
 * card to a deck, not the other way around. `undefined` leaves it unchanged.
 */
export const FlashcardUpdateInput = z.object({
  id: z.string().cuid(),
  front: z.string().trim().min(1).max(2000).optional(),
  back: z.string().trim().min(1).max(4000).optional(),
  categoryId: z.string().cuid().optional(),
  frontExamples: ExamplesArray.optional(),
  backExamples: ExamplesArray.optional(),
  /**
   * Optional part-of-speech for the front word. `null` clears the value,
   * `undefined` leaves it unchanged.
   */
  class: WordClassSchema,
});
export type FlashcardUpdateInput = z.infer<typeof FlashcardUpdateInput>;

// ----------------------------------------------------------------------------
// Practice
// ----------------------------------------------------------------------------

/** SM-2 quality of recall (0 = total blackout, 5 = perfect). */
export const ConfidenceRating = z
  .number()
  .int()
  .min(0)
  .max(5);
export type ConfidenceRating = z.infer<typeof ConfidenceRating>;

export const SubmitReviewInput = z.object({
  cardId: z.string().cuid(),
  confidence: ConfidenceRating,
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewInput>;
