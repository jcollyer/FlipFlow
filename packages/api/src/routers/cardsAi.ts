import { TRPCError } from '@trpc/server';

import { AiCardDraft, GenerateCardsFromImageInput, backLanguageName } from '@ensemble/types';

import { protectedProcedure, router } from '../trpc';

/**
 * OpenAI chat-completions endpoint. We call the REST API with `fetch` rather
 * than pulling in the `openai` SDK, mirroring how `translate.ts` and `tts.ts`
 * talk to Google — no extra dependency, and the request shape is stable.
 */
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Vision-capable model used to read the photo and draft cards. `gpt-4o`
 * resolves to a current snapshot that accepts image inputs and JSON-object
 * response formatting. Override with OPENAI_VISION_MODEL if you want to pin a
 * specific snapshot or use a cheaper model (e.g. `gpt-4o-mini`).
 */
function getVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || 'gpt-4o';
}

/**
 * Builds the instruction prompt for the model. `languageName` is the deck's
 * back-of-card language in plain English (e.g. "French"). The model is told to
 * put English on the front and this language on the back, regardless of which
 * languages happen to appear in the photo.
 */
function buildPrompt(languageName: string): string {
  return `You are a language-learning assistant that turns a photo of vocabulary into flashcards.

You will be given one image. It may be a textbook page, a vocabulary list, a sign, a menu, handwritten notes, or a screenshot. It may contain text in English, in ${languageName}, in both, or in neither.

Your job: extract every distinct vocabulary item (single word or short phrase) that a learner would want to study, and turn each one into a flashcard.

For EACH flashcard, follow these rules exactly:

1. FRONT — always English.
   - The front is the English word or short phrase.
   - If the item in the photo is already English, use it as-is (cleaned up: lowercase unless it is a proper noun, no surrounding articles like "a"/"the" unless essential to meaning).
   - If the item in the photo is in ${languageName} (or any non-English language) and there is no English given, translate it into natural English yourself for the front.
   - Do NOT include the part of speech, gender markers, or articles in the front unless they are part of the English phrase.

2. BACK — always ${languageName}.
   - The back is the ${languageName} translation of the front word/phrase.
   - If the photo already shows the ${languageName} translation, use it (correct obvious typos). If the photo does NOT show a ${languageName} translation, translate it yourself accurately.
   - Include the natural form a native speaker would use. For nouns in gendered languages, include the appropriate article when it is conventional for vocabulary lists (e.g. "un livre", "una casa", "das Buch").

3. EXAMPLE SENTENCES — 2 to 3 per card.
   - Write 2 or 3 short, simple, PRESENT-TENSE sentences in English that naturally use the front word/phrase. Keep them beginner-friendly (short, everyday vocabulary).
   - For each English example, provide the matching ${languageName} translation.
   - "frontExamples" and "backExamples" must be the SAME length and paired by index: backExamples[i] is the translation of frontExamples[i].
   - Example for the word "book": frontExamples = ["She reads a book.", "I read a book every night."], backExamples = ["Elle lit un livre.", "Je lis un livre chaque soir."]

4. CLASS — the part of speech of the front word, as one of EXACTLY these values (lowercase):
   "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "determiner", "phrase".
   Use "phrase" for multi-word expressions. If unsure, use "".

5. GENDER — only for nouns in a gendered language. Use "male" for masculine, "female" for feminine, or "" if not applicable or unknown.

Output rules:
- Respond with a SINGLE JSON object and nothing else.
- Shape: { "cards": [ { "front": string, "back": string, "frontExamples": string[], "backExamples": string[], "class": string, "gender": string } ] }
- Preserve the order items appear in the photo (top to bottom, left to right).
- One card per distinct vocabulary item. Do not invent items that are not implied by the photo. Do not include headings/titles (e.g. a section header like "Everyday objects") as cards.
- If the photo contains no usable vocabulary, return { "cards": [] }.`;
}

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string; code?: string };
}

export const cardsAiRouter = router({
  /**
   * Feature-detect for the client. We don't expose the key, just whether the
   * server can generate cards. The deck UI uses this to conditionally show the
   * "New cards from photo" button so it never appears in a broken state.
   */
  isAvailable: protectedProcedure.query(() => {
    return { available: !!process.env.OPENAI_API_KEY };
  }),

  /**
   * Analyze an uploaded image and return a batch of *unsaved* card drafts for
   * the user to review and edit before saving. English on the front, the
   * deck's back-language on the back, each with 2–3 present-tense examples.
   */
  generateFromImage: protectedProcedure
    .input(GenerateCardsFromImageInput)
    .mutation(async ({ input }) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Photo-to-cards is not configured on this server.',
        });
      }

      const languageName = backLanguageName(input.backLanguage) || input.backLanguage;

      const res = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getVisionModel(),
          temperature: 0.3,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: buildPrompt(languageName),
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Create flashcards from this image. English on the front, ${languageName} on the back.`,
                },
                {
                  type: 'image_url',
                  image_url: { url: input.imageDataUrl, detail: 'high' },
                },
              ],
            },
          ],
        }),
      });

      const body = (await res.json().catch(() => null)) as OpenAiChatResponse | null;

      if (!res.ok || !body || body.error) {
        const message = body?.error?.message ?? `OpenAI request failed (${res.status}).`;
        throw new TRPCError({
          code: res.status === 401 || res.status === 403 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
          message,
        });
      }

      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The model returned an empty response.',
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'The model returned a response we could not parse.',
        });
      }

      const rawCards =
        parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)
          ? (parsed as { cards: unknown[] }).cards
          : [];

      // Validate each card individually and keep only the good ones, pairing
      // the example arrays to equal length so the review UI never crashes on
      // a lopsided result. Invalid/empty drafts are silently dropped.
      const cards: AiCardDraft[] = [];
      for (const raw of rawCards) {
        const result = AiCardDraft.safeParse(raw);
        if (!result.success) continue;
        const card = result.data;
        const pairLen = Math.min(card.frontExamples.length, card.backExamples.length);
        cards.push({
          ...card,
          frontExamples: card.frontExamples.slice(0, pairLen),
          backExamples: card.backExamples.slice(0, pairLen),
        });
      }

      return { cards };
    }),
});
