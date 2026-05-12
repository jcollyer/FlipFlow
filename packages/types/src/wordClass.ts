/**
 * Part-of-speech ("word class") options for a flashcard's front word.
 *
 * Stored on Flashcard.class as a free-form string so the column doesn't have
 * to be migrated every time we tweak the list. The Zod schema below pins
 * validation to the canonical values defined here, but unknown values that
 * happen to be in the database (e.g. left over from a future change) are
 * simply ignored by the UI's dropdown.
 */
import { z } from 'zod';

export interface WordClassOption {
  /** Canonical value persisted to the database. Lowercase, ASCII. */
  value: string;
  /** Display label shown in the dropdown — e.g. "Noun". */
  label: string;
  /** Smaller gray helper text shown under the label. */
  description: string;
}

export const WORD_CLASS_OPTIONS: readonly WordClassOption[] = [
  {
    value: 'phrase',
    label: 'Expression or Phrase',
    description:
      'A group of words that function as a single unit (e.g., "in the morning", "on the other hand").',
  },
  {
    value: 'note',
    label: 'Teaching Note',
    description: 'A note for teaching purposes (e.g., tips, explanations).',
  },
  {
    value: 'noun',
    label: 'Noun',
    description: 'A person, place, thing, or idea (e.g., dog, school, joy).',
  },
  {
    value: 'verb',
    label: 'Verb',
    description: 'An action or state of being (e.g., run, is, think).',
  },
  {
    value: 'adjective',
    label: 'Adjective',
    description: 'Describes a noun or pronoun (e.g., blue, fast, cold).',
  },
  {
    value: 'adverb',
    label: 'Adverb',
    description: 'Modifies a verb, adjective, or another adverb (e.g., quickly, very).',
  },
  {
    value: 'pronoun',
    label: 'Pronoun',
    description: 'Substitutes for a noun (e.g., she, they, it).',
  },
  {
    value: 'preposition',
    label: 'Preposition',
    description: 'Shows relationships in time or space (e.g., in, on, under).',
  },
  {
    value: 'conjunction',
    label: 'Conjunction',
    description: 'Connects words or phrases (e.g., and, but, so).',
  },
  {
    value: 'interjection',
    label: 'Interjection',
    description: 'Expresses strong emotion (e.g., wow, ouch).',
  },
  {
    value: 'determiner',
    label: 'Determiner/Article',
    description: 'Introduces a noun (e.g., the, a, this).',
  },
] as const;

export const WORD_CLASS_VALUES = WORD_CLASS_OPTIONS.map((o) => o.value) as readonly string[];

/**
 * Validation for the optional `class` field on a flashcard. Accepts one of the
 * canonical values above, or `null`/`undefined`/empty string to clear it.
 *
 * - `undefined` on update = unchanged.
 * - `null` or `''` on create/update = explicitly cleared.
 */
export const WordClassSchema = z
  .union([z.enum(WORD_CLASS_VALUES as [string, ...string[]]), z.literal('')])
  .nullish()
  .transform((v) => (v === '' ? null : v));
