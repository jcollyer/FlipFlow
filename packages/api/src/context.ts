import { prisma } from '@flipflow/db';

/**
 * Minimal session shape that the API expects from the consumer (the Next.js
 * web app passes in the Auth.js session). Keeping this loose lets us evolve
 * Auth.js without retyping the API.
 */
export interface SessionLike {
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  } | null;
  expires?: string;
}

export interface CreateContextOptions {
  session: SessionLike | null;
  headers?: Headers;
}

export function createTRPCContext(opts: CreateContextOptions) {
  return {
    session: opts.session,
    headers: opts.headers,
    prisma,
  };
}

export type Context = ReturnType<typeof createTRPCContext>;
