import { z } from 'zod';

import { BackLanguageSchema } from './languages';
import { WordClassSchema } from './wordClass';

// ----------------------------------------------------------------------------
// Category
// ----------------------------------------------------------------------------

export const CategoryColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #5584bb')
  .nullish();

/**
 * Optional BCP-47 language tag for the back of cards in this deck. Used by
 * the Google Cloud Text-to-Speech feature on the practice screen.
 *
 * `null` clears the previously-stored value (turns off audio playback for
 * the deck); `undefined` leaves it unchanged on update.
 */
export const CategoryBackLanguageSchema = BackLanguageSchema.nullish();

/**
 * Optional free-form description for a deck. `null` clears a previously
 * saved value; `undefined` leaves it unchanged on update.
 */
export const CategoryDescriptionSchema = z.string().trim().max(2000).nullish();

export const CategoryCreateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: CategoryDescriptionSchema,
  color: CategoryColorSchema,
  backLanguage: CategoryBackLanguageSchema,
  /**
   * Whether the deck is private to its owner. Defaults to true so newly
   * created decks aren't accidentally exposed — the UI flips this with a
   * "Deck public" toggle (off by default → private=true).
   */
  private: z.boolean().optional(),
});
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;

export const CategoryUpdateInput = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80).optional(),
  description: CategoryDescriptionSchema,
  color: CategoryColorSchema,
  backLanguage: CategoryBackLanguageSchema,
  /**
   * Toggle the deck's privacy. `undefined` leaves it unchanged.
   */
  private: z.boolean().optional(),
});
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateInput>;

// ----------------------------------------------------------------------------
// Folder
// ----------------------------------------------------------------------------

/**
 * A user-defined grouping of decks. Same hex-color rule as Category so the
 * two share a palette. `description` is free-form text capped at a sensible
 * length so the modal stays a single textarea.
 */
export const FolderColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #5584bb')
  .nullish();

export const FolderDescriptionSchema = z.string().trim().max(2000).nullish();

const IncludedCategoryIds = z.array(z.string().cuid()).max(500);

export const FolderCreateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: FolderColorSchema,
  description: FolderDescriptionSchema,
  /**
   * Pre-populate the folder with these deck ids. Optional — usually omitted
   * at create time and filled in via the folder detail page.
   */
  includedCategoryIds: IncludedCategoryIds.optional(),
});
export type FolderCreateInput = z.infer<typeof FolderCreateInput>;

export const FolderUpdateInput = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: FolderColorSchema,
  description: FolderDescriptionSchema,
  /**
   * Replaces the entire array when provided. `undefined` leaves it unchanged.
   * (We keep it as a full replace because the UI always knows the desired set.)
   */
  includedCategoryIds: IncludedCategoryIds.optional(),
});
export type FolderUpdateInput = z.infer<typeof FolderUpdateInput>;

// ----------------------------------------------------------------------------
// Flashcard
// ----------------------------------------------------------------------------

/**
 * `categoryId` is optional. When omitted (or null), the card is "uncategorized"
 * — it doesn't belong to any deck and only shows up in the All decks view.
 */
const ExampleSentence = z.string().trim().min(1).max(500);
const ExamplesArray = z.array(ExampleSentence).max(20);

/** Gender options for a flashcard's front word. */
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Masculine' },
  { value: 'female', label: 'Feminine' },
] as const;
export type GenderValue = (typeof GENDER_OPTIONS)[number]['value'];

/**
 * Display label for a gender value. Falls back to '' for unset/unknown values.
 * Use this in UI rather than capitalizing the raw value so we have one source
 * of truth for label text.
 */
export function genderLabel(value: string | null | undefined): string {
  if (!value) return '';
  const opt = GENDER_OPTIONS.find((o) => o.value === value);
  return opt?.label ?? '';
}

/**
 * Optional gender for a flashcard's front word. `null`/`undefined`/`''` = none.
 */
export const GenderSchema = z.union([z.enum(['male', 'female']), z.literal('')]).nullish();

/** Verb-type options for a flashcard's front word. */
export const VERB_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'irregular', label: 'Irregular' },
] as const;
export type VerbTypeValue = (typeof VERB_TYPE_OPTIONS)[number]['value'];

/**
 * Optional verb type for a flashcard's front word. `null`/`undefined`/`''` = none.
 */
export const VerbTypeSchema = z.union([z.enum(['regular', 'irregular']), z.literal('')]).nullish();

/**
 * Optional pronunciation hint for the front word (e.g. IPA, romanization).
 * Free-form text. `null`/`undefined`/`''` = none.
 */
export const PronunciationSchema = z.string().trim().max(500).nullish();

export const FlashcardCreateInput = z.object({
  categoryId: z.string().cuid().nullish(),
  front: z.string().trim().min(1, 'Front is required').max(2000),
  back: z.string().trim().min(1, 'Back is required').max(4000),
  frontExamples: ExamplesArray.default([]),
  backExamples: ExamplesArray.default([]),
  /** Optional part-of-speech of the front word — see WORD_CLASS_OPTIONS. */
  class: WordClassSchema,
  /** Optional gender of the front word — 'male', 'female', or null/undefined for none. */
  gender: GenderSchema,
  /** Optional verb type — 'regular', 'irregular', or null/undefined for none. */
  verb_type: VerbTypeSchema,
  /** Optional pronunciation hint for the front word. */
  pronunciation: PronunciationSchema,
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
  /** Optional gender. `null` clears the value, `undefined` leaves it unchanged. */
  gender: GenderSchema,
  /** Optional verb type. `null` clears the value, `undefined` leaves it unchanged. */
  verb_type: VerbTypeSchema,
  /**
   * Optional pronunciation hint. `null` clears the value, `undefined` leaves
   * it unchanged.
   */
  pronunciation: PronunciationSchema,
});
export type FlashcardUpdateInput = z.infer<typeof FlashcardUpdateInput>;

// ----------------------------------------------------------------------------
// Group
// ----------------------------------------------------------------------------

/**
 * A multi-user grouping of decks. Shares the deck/folder color palette and
 * the same description length cap so the modals can be visually identical.
 *
 * Membership of decks in the group is managed via separate `addDeck` /
 * `removeDeck` mutations rather than a full-array replacement, because a
 * group is multi-user and the client's view of "the canonical set" may be
 * stale at any moment.
 */
export const GroupColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex value like #5584bb')
  .nullish();

export const GroupDescriptionSchema = z.string().trim().max(2000).nullish();

export const GroupCreateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  color: GroupColorSchema,
  description: GroupDescriptionSchema,
});
export type GroupCreateInput = z.infer<typeof GroupCreateInput>;

export const GroupUpdateInput = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(80).optional(),
  color: GroupColorSchema,
  description: GroupDescriptionSchema,
});
export type GroupUpdateInput = z.infer<typeof GroupUpdateInput>;

// ----------------------------------------------------------------------------
// Group invites
// ----------------------------------------------------------------------------

/**
 * Tokens for share-by-link invites are URL-safe random strings. The format
 * comes from the API layer (crypto.randomBytes → base64url) — this schema
 * just enforces "looks like a token" so accept-invite endpoints can do a
 * cheap shape check before hitting the database.
 */
export const GroupInviteTokenSchema = z
  .string()
  .trim()
  .min(16, 'Invalid invite link')
  .max(128, 'Invalid invite link');

/**
 * Direct invite payload. The UI passes an email; the API resolves it to a
 * userId before storing (an existing-user check is deliberate — v1 doesn't
 * support pending invites for accounts that don't exist yet).
 */
export const GroupInviteUserInput = z.object({
  groupId: z.string().cuid(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});
export type GroupInviteUserInput = z.infer<typeof GroupInviteUserInput>;

// ----------------------------------------------------------------------------
// Practice
// ----------------------------------------------------------------------------

/**
 * Difficulty rating the user assigns to a card after flipping it. There is
 * intentionally no ordering between values — these are flat labels, not a
 * numeric scale. Persisted as a free-form string column so we can add new
 * options later without a migration; validation is enforced here at the API
 * edge.
 */
export const DIFFICULTY_LEVEL_VALUES = ['challenging', 'good', 'easy'] as const;
export const DifficultyLevelSchema = z.enum(DIFFICULTY_LEVEL_VALUES);
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

export const SubmitReviewInput = z.object({
  cardId: z.string().cuid(),
  difficultyLevel: DifficultyLevelSchema,
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewInput>;
