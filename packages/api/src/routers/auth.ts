import { TRPCError } from '@trpc/server';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { z } from 'zod';

import { protectedProcedure, publicProcedure, router } from '../trpc';

// ---------------------------------------------------------------------------
// S3 client — lazily initialised so missing env vars don't crash the API at
// start-up; we surface a clear PRECONDITION_FAILED to the caller instead.
// ---------------------------------------------------------------------------

function getS3Client(): S3Client {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Avatar uploads are not configured on this server (missing AWS env vars).',
    });
  }

  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
}

function getS3Bucket(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Avatar uploads are not configured on this server (missing AWS_S3_BUCKET_NAME).',
    });
  }
  return bucket;
}

// ---------------------------------------------------------------------------
// Allowed MIME types & upload size cap
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMimeType = (typeof ALLOWED_TYPES)[number];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const authRouter = router({
  /** Returns the current session, or null if signed out. */
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),

  /** Returns the full user record for the signed-in user. */
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        bio: true,
        private: true,
        defaultDeckPrivate: true,
        defaultLanguage: true,
        email: true,
        image: true,
        createdAt: true,
      },
    }),
  ),

  /**
   * Returns a short-lived S3 POST policy the browser can use to upload an
   * avatar image directly — no file bytes pass through the API server.
   *
   * We use createPresignedPost (multipart form POST) rather than a presigned
   * PUT URL because AWS SDK v3's PutObjectCommand automatically injects a
   * CRC32 checksum placeholder into presigned PUT URLs. The browser upload
   * can't satisfy that checksum, causing a 400. The POST policy approach
   * avoids the checksum middleware entirely.
   *
   * Flow:
   *   1. Call this mutation to get { url, fields, publicUrl }.
   *   2. Build a FormData: spread `fields` in first, then append the file
   *      last under the key "file".
   *   3. POST the FormData to `url` (no Content-Type header — let the
   *      browser set the multipart boundary automatically).
   *   4. On HTTP 204, call updateSettings({ image: publicUrl, ... }).
   *
   * Required env vars:
   *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME
   *
   * The S3 bucket must have a CORS rule allowing POST from your web origin.
   */
  getAvatarUploadUrl: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(ALLOWED_TYPES, {
          errorMap: () => ({ message: 'Only JPEG, PNG, WebP, or GIF images are allowed.' }),
        }),
        contentLength: z
          .number()
          .int()
          .min(1)
          .max(MAX_BYTES, 'Avatar images must be smaller than 5 MB.'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const s3 = getS3Client();
      const bucket = getS3Bucket();
      const region = process.env.AWS_REGION!;

      const extMap: Record<AllowedMimeType, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      };
      const ext = extMap[input.contentType];

      // Scoped to the user + timestamp for cache-busting
      const key = `avatars/${ctx.userId}/${Date.now()}.${ext}`;

      const { url, fields } = await createPresignedPost(s3, {
        Bucket: bucket,
        Key: key,
        Expires: 300, // 5 min
        Conditions: [
          { 'Content-Type': input.contentType },
          ['content-length-range', 1, MAX_BYTES],
          // No acl condition — public read is granted via bucket policy on
          // avatars/* instead, which works with Block Public ACLs enabled.
        ],
        Fields: {
          'Content-Type': input.contentType,
        },
      });

      // Virtual-hosted-style public URL for the saved image
      const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

      return { url, fields, publicUrl };
    }),

  /** Update the signed-in user's profile settings. */
  updateSettings: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, 'Name cannot be empty').max(80, 'Name is too long'),
        bio: z
          .string()
          .trim()
          .max(300, 'Bio must be 300 characters or fewer')
          .optional()
          .nullable(),
        private: z.boolean(),
        /** Whether new decks should default to private. Defaults to true when omitted. */
        defaultDeckPrivate: z.boolean().optional(),
        /**
         * BCP-47 language tag to use as the default backLanguage for newly
         * created decks. Pass null to clear the preference; omit to leave
         * it unchanged.
         */
        defaultLanguage: z.string().optional().nullable(),
        /** Pass the public S3 URL after a successful avatar upload, or null to clear. */
        image: z.string().url().optional().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: {
          name: input.name,
          private: input.private,
          // Only touch bio/image/defaultDeckPrivate/defaultLanguage when the caller explicitly passes a value
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.image !== undefined ? { image: input.image } : {}),
          ...(input.defaultDeckPrivate !== undefined
            ? { defaultDeckPrivate: input.defaultDeckPrivate }
            : {}),
          ...(input.defaultLanguage !== undefined
            ? { defaultLanguage: input.defaultLanguage ?? null }
            : {}),
        },
        select: {
          id: true,
          name: true,
          bio: true,
          private: true,
          defaultDeckPrivate: true,
          defaultLanguage: true,
          email: true,
          image: true,
          createdAt: true,
        },
      }),
    ),
});
