import { PrismaClient } from './generated/client';

// Reuse a single PrismaClient instance across hot-reloads in dev so we don't
// exhaust the database connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __flipflow_prisma__: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__flipflow_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__flipflow_prisma__ = prisma;
}

export * from './generated/client';
