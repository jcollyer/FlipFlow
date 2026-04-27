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
