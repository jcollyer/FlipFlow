import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { protectedProcedure, router } from '../trpc';

/**
 * Languages we look up. Aligns with the translate router (fr/es/de) plus
 * English as a fallback when the translation toggle is off. Adding a new
 * language is a one-line change here plus an entry in SECTION_HEADINGS.
 */
export const DictionaryLang = z.enum(['en', 'fr', 'es', 'de']);
export type DictionaryLang = z.infer<typeof DictionaryLang>;

const Input = z.object({
  word: z.string().trim().min(1).max(100),
  target: DictionaryLang,
});

/**
 * We use the English Wiktionary because it has the broadest coverage of
 * non-English headwords (e.g. its "French" section for `chemise` is far
 * more complete than fr.wiktionary.org's redirect handling). Each headword
 * page contains separate language sections (== French ==, == Spanish ==,
 * etc.), so a single lookup can serve every supported `target`.
 */
const ENDPOINT = 'https://en.wiktionary.org/w/api.php';

/**
 * Wikimedia asks API clients to identify themselves so they can contact us
 * if a request pattern misbehaves. The contact slug here is intentionally
 * generic — replace with a real URL/email if Anthropic policy ever requires
 * it.
 */
const USER_AGENT = 'FlipFlow/0.1 (https://github.com/flipflow; flashcards app)';

const SECTION_HEADINGS: Record<DictionaryLang, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
};

interface ParsedPage {
  wikitext: string;
  html: string;
}

interface WiktionaryResponse {
  parse?: {
    title?: string;
    wikitext?: string;
    text?: string;
  };
  error?: { code?: string; info?: string };
}

/**
 * Fetch a single Wiktionary page as both wikitext (for reliable template
 * parsing) and rendered HTML (for IPA, since some languages auto-generate
 * pronunciation via templates that don't expand in raw wikitext).
 */
async function fetchWiktionary(word: string): Promise<ParsedPage | null> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', word);
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('prop', 'wikitext|text');
  url.searchParams.set('redirects', 'true');

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
  } catch (err) {
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Could not reach Wiktionary: ${(err as Error).message}`,
    });
  }
  if (!res.ok) {
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Wiktionary lookup failed (${res.status}).`,
    });
  }

  const body = (await res.json().catch(() => null)) as WiktionaryResponse | null;
  if (!body) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Wiktionary returned an unexpected response.',
    });
  }
  // "missingtitle" is the canonical signal that the word doesn't have a
  // Wiktionary page. Surface it as a soft miss rather than an error so the
  // UI can show "no value returned" instead of a red banner.
  if (body.error?.code === 'missingtitle') return null;
  if (body.error) {
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: body.error.info || 'Wiktionary returned an error.',
    });
  }

  const wikitext = body.parse?.wikitext;
  const html = body.parse?.text;
  if (typeof wikitext !== 'string' || typeof html !== 'string') {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Wiktionary returned an unexpected response shape.',
    });
  }
  return { wikitext, html };
}

/**
 * Try the word as the user typed it, then a lowercased fallback. This
 * covers French/Spanish words mistakenly capitalized (e.g. "Chemise") while
 * still resolving German nouns ("Haus") when typed canonically.
 */
async function lookupWord(word: string): Promise<ParsedPage | null> {
  const direct = await fetchWiktionary(word);
  if (direct) return direct;
  const lowered = word.toLowerCase();
  if (lowered !== word) return fetchWiktionary(lowered);
  return null;
}

function isMultipleWords(word: string): boolean {
  return /\s/.test(word.trim());
}

/**
 * Slice the language-specific block out of the page's wikitext. Each
 * Wiktionary entry uses `== Language ==` as a top-level section heading,
 * and we just want everything from that heading until the next one.
 *
 * Note: this regex deliberately does NOT use the `m` flag. Under multiline
 * mode `$` matches end-of-line, which would let the trailing `|$` lookahead
 * succeed at the end of the *first* content line and bail out before we've
 * actually captured anything useful. Using `(?:^|\n)` to anchor the start
 * gives us the same first-of-line behavior without that footgun.
 */
function extractLanguageSection(wikitext: string, heading: string): string | null {
  const re = new RegExp(
    `(?:^|\\n)==\\s*${heading}\\s*==[ \\t]*\\n([\\s\\S]*?)(?=\\n==[^=]|$)`,
  );
  const m = wikitext.match(re);
  return m?.[1] ?? null;
}

/**
 * Pull a male/female gender out of a language section's wikitext.
 *
 * Two patterns cover the vast majority of entries:
 *   1. Language-specific noun templates: {{fr-noun|f}}, {{es-noun|m}},
 *      {{de-noun|f, ...}}. The first positional arg is the gender.
 *   2. Generic headword template: {{head|fr|noun|g=f}}.
 *
 * Neuter (German "n") and ambiguous entries intentionally fall through to
 * `null` — the app's gender field models male/female only, and we'd rather
 * leave the dropdown alone than overwrite it with a guess. The UI surfaces
 * this as "no value returned".
 */
function extractGender(section: string, lang: DictionaryLang): 'male' | 'female' | null {
  const langNounRe = new RegExp(
    `\\{\\{${lang}-(?:noun|proper noun|proper-noun)\\|([^}|]+)`,
    'i',
  );
  const nounMatch = section.match(langNounRe);
  if (nounMatch?.[1]) {
    // First positional arg, stripped of any sub-form suffix like "f-p".
    const head = nounMatch[1].toLowerCase().trim().split(/[,\s]/)[0]?.[0];
    if (head === 'm') return 'male';
    if (head === 'f') return 'female';
    // head === 'n' (neuter) and anything else fall through.
  }

  const headRe = new RegExp(`\\{\\{head\\|${lang}\\|[^}]*?\\bg=([mfn])\\b`, 'i');
  const headMatch = section.match(headRe);
  if (headMatch?.[1]) {
    const g = headMatch[1].toLowerCase();
    if (g === 'm') return 'male';
    if (g === 'f') return 'female';
  }

  return null;
}

/**
 * Pull the first IPA string out of the rendered HTML for a given language
 * section. Wiktionary renders IPA inside `<span class="IPA">…</span>`
 * regardless of whether the wikitext used `{{IPA|fr|…}}` or an auto-IPA
 * template like `{{es-IPA}}`, so reading from HTML side-steps the template
 * expansion problem.
 */
function extractIpaFromHtml(html: string, heading: string): string | null {
  // Modern Wiktionary HTML:
  //   <div class="mw-heading mw-heading2"><h2 id="French">French</h2>…</div>
  // Older HTML:
  //   <h2><span class="mw-headline" id="French">French</span></h2>
  // The `id` attribute is the stable anchor we match against in either case.
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRe = new RegExp(
    `<h2[^>]*\\bid=["']${escaped}["'][^>]*>|<span[^>]+\\bid=["']${escaped}["'][^>]*>`,
    'i',
  );
  const startMatch = html.match(startRe);
  if (!startMatch || startMatch.index === undefined) return null;
  const sectionHtml = html.slice(startMatch.index + startMatch[0].length);
  // End the slice at the next h2 — that's where the next language section
  // (or page footer) begins.
  const endIdx = sectionHtml.search(/<h2\b/i);
  const region = endIdx === -1 ? sectionHtml : sectionHtml.slice(0, endIdx);

  const ipaRe = /<span[^>]*\bclass=["'][^"']*\bIPA\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i;
  const ipaMatch = region.match(ipaRe);
  if (!ipaMatch?.[1]) return null;
  // The IPA span sometimes wraps an anchor tag; drop any inner markup so we
  // return the raw glyphs.
  const text = ipaMatch[1].replace(/<[^>]+>/g, '').trim();
  return text || null;
}

export const dictionaryRouter = router({
  getGender: protectedProcedure.input(Input).mutation(async ({ input }) => {
    if (isMultipleWords(input.word)) return { kind: 'multiple_words' as const };
    const page = await lookupWord(input.word);
    if (!page) return { kind: 'not_in_dictionary' as const };
    const heading = SECTION_HEADINGS[input.target];
    const section = extractLanguageSection(page.wikitext, heading);
    if (!section) return { kind: 'no_value' as const };
    const gender = extractGender(section, input.target);
    if (!gender) return { kind: 'no_value' as const };
    return { kind: 'ok' as const, gender };
  }),

  getPronunciation: protectedProcedure.input(Input).mutation(async ({ input }) => {
    if (isMultipleWords(input.word)) return { kind: 'multiple_words' as const };
    const page = await lookupWord(input.word);
    if (!page) return { kind: 'not_in_dictionary' as const };
    const heading = SECTION_HEADINGS[input.target];
    const ipa = extractIpaFromHtml(page.html, heading);
    if (ipa) return { kind: 'ok' as const, pronunciation: ipa };

    // Fallback: pull a literal {{IPA|<lang>|/.../}} template out of the
    // language section's wikitext. Catches the rare case where the rendered
    // HTML doesn't surface a `<span class="IPA">` we could match.
    const section = extractLanguageSection(page.wikitext, heading);
    if (section) {
      const re = new RegExp(`\\{\\{IPA\\|${input.target}\\|([^|}]+)`, 'i');
      const m = section.match(re);
      if (m?.[1]) {
        const value = m[1].trim();
        if (value) return { kind: 'ok' as const, pronunciation: value };
      }
    }
    return { kind: 'no_value' as const };
  }),
});
