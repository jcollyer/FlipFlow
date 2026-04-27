import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { BackLanguageSchema } from '@flipflow/types';

import { protectedProcedure, publicProcedure, router } from '../trpc';

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * Hard cap on synthesis input length. Google Cloud TTS bills per character
 * and the back of a flashcard is short by design, so 4000 mirrors the back
 * column's `db.Text` length limit and is well under the API's 5000-byte cap
 * for the `text` input.
 */
const MAX_INPUT_LENGTH = 4000;

interface GoogleTtsResponse {
  audioContent?: string;
  error?: { code: number; message: string };
}

/**
 * Pick the API key for TTS. Prefer a dedicated `GOOGLE_TTS_API_KEY` if set,
 * but fall back to the existing `GOOGLE_TRANSLATE_API_KEY` because both APIs
 * are commonly enabled on the same Google Cloud project and a single key
 * works for both. This means the feature "just works" if the user enables
 * Cloud Text-to-Speech on their existing project without forcing them to
 * generate a second key.
 */
function getTtsApiKey(): string | undefined {
  return process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY;
}

export const ttsRouter = router({
  /**
   * Lightweight feature-detect for the client. We don't expose the key, just
   * whether the server can perform synthesis. The practice UI uses this to
   * conditionally render the audio button so it never appears in a broken
   * state.
   */
  isAvailable: publicProcedure.query(() => {
    return { available: !!getTtsApiKey() };
  }),

  /**
   * Synthesize speech from `text` in the given BCP-47 language. Returns the
   * audio as a base64-encoded MP3 string, suitable for playback via
   * `new Audio('data:audio/mp3;base64,' + audioContent)`.
   *
   * We use Google's standard voices and let the API pick the default voice
   * for the language tag rather than pinning a specific `voice.name` —
   * keeps the surface small and lets us upgrade voice quality later without
   * touching this endpoint.
   *
   * Errors map straight onto Google's response so the client can surface the
   * underlying problem (e.g. invalid key, quota exceeded, unsupported
   * language) without us having to bake in an exhaustive translation layer.
   */
  synthesize: protectedProcedure
    .input(
      z.object({
        text: z.string().trim().min(1).max(MAX_INPUT_LENGTH),
        languageCode: BackLanguageSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = getTtsApiKey();
      if (!apiKey) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Text-to-speech is not configured on this server.',
        });
      }

      const url = `${TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { text: input.text },
          voice: { languageCode: input.languageCode },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      });

      const body = (await res.json().catch(() => null)) as GoogleTtsResponse | null;

      if (!res.ok || !body || body.error) {
        const message =
          body?.error?.message ?? `Google Text-to-Speech request failed (${res.status}).`;
        throw new TRPCError({
          // Most Google API errors that affect us are auth/quota/bad-request,
          // which are caller-fixable rather than runtime bugs. Surface them
          // as BAD_REQUEST so the UI can show the message verbatim.
          code: res.status === 401 || res.status === 403 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
          message,
        });
      }

      const audioContent = body.audioContent;
      if (!audioContent) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Google Text-to-Speech returned an empty response.',
        });
      }

      return {
        audioContent, // base64-encoded MP3
        languageCode: input.languageCode,
      };
    }),
});
