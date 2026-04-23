import { z } from 'zod';

// ----------------------------------------------------------------------------
// Category
// ----------------------------------------------------------------------------

export const CategoryColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #3b82f6')
  .nullish();

export const CategoryCreateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: CategoryColorSchema,
});
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;

export const CategoryUpdateInput = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: CategoryColorSchema,
});
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;

// ----------------------------------------------------------------------------
// Flashcard
// ----------------------------------------------------------------------------

export const FlashcardCreateInput = z.object({
  categoryId: z.string().cuid(),
  front: z.string().trim().min(1, 'Front is required').max(2000),
  back: z.string().trim().min(1, 'Back is required').max(4000),
});
export type FlashcardCreateInput = z.infer<typeof FlashcardCreateInput>;

export const FlashcardUpdateInput = z.object({
  id: z.string().cuid(),
  front: z.string().trim().min(1).max(2000).optional(),
  back: z.string().trim().min(1).max(4000).optional(),
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
