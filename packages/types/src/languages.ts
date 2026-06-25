import { z } from 'zod';

/**
 * Languages we support for the back-of-card audio feature.
 *
 * Values are BCP-47 tags accepted directly by Google Cloud Text-to-Speech as
 * a `voice.languageCode`. Each tag maps to one or more standard voices in
 * that language; we let Google pick the default voice for the tag rather
 * than pinning a specific `voice.name`. To add a new language, add an entry
 * here — no other code changes are needed.
 *
 * We use country-qualified tags (e.g. "fr-FR" rather than "fr") because TTS
 * requires them, while the existing translation feature uses the shorter
 * ISO 639-1 codes ("fr", "es", "de"). The two lists are intentionally
 * decoupled — TTS supports many more languages than the curated translation
 * dropdown.
 */
export const BACK_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'French' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-US', label: 'Spanish (Latin America)' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'cmn-CN', label: 'Mandarin (China)' },
  { value: 'cmn-TW', label: 'Mandarin (Taiwan)' },
  { value: 'ar-XA', label: 'Arabic' },
  { value: 'hi-IN', label: 'Hindi' },
] as const;

export type BackLanguageValue = (typeof BACK_LANGUAGES)[number]['value'];

const BACK_LANGUAGE_VALUES = BACK_LANGUAGES.map((l) => l.value) as [
  BackLanguageValue,
  ...BackLanguageValue[],
];

/** Zod enum of the supported back-of-card languages. */
export const BackLanguageSchema = z.enum(BACK_LANGUAGE_VALUES);

/**
 * Plain, prompt-friendly language names keyed by BCP-47 tag. Used when asking
 * an LLM to translate into the deck's language — we want "French", not the
 * UI label "Spanish (Spain)" with its regional qualifier.
 */
const BACK_LANGUAGE_NAMES: Record<BackLanguageValue, string> = {
  'en-US': 'English',
  'en-GB': 'English',
  'fr-FR': 'French',
  'es-ES': 'Spanish',
  'es-US': 'Spanish',
  'de-DE': 'German',
  'it-IT': 'Italian',
  'pt-PT': 'Portuguese',
  'pt-BR': 'Portuguese (Brazilian)',
  'nl-NL': 'Dutch',
  'pl-PL': 'Polish',
  'ru-RU': 'Russian',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'cmn-CN': 'Mandarin Chinese (Simplified)',
  'cmn-TW': 'Mandarin Chinese (Traditional)',
  'ar-XA': 'Arabic',
  'hi-IN': 'Hindi',
};

/**
 * Map a deck's BCP-47 back-language tag to a plain language name suitable for
 * an LLM prompt. Falls back to the raw tag for unknown values.
 */
export function backLanguageName(value: string | null | undefined): string {
  if (!value) return '';
  return BACK_LANGUAGE_NAMES[value as BackLanguageValue] ?? value;
}
