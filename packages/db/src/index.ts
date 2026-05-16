import { Prisma, PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient instance across hot-reloads in dev so we don't
// exhaust the database connection pool.
declare global {
  // eslint-disable-next-line no-var
  var __ensemble_prisma__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

function modelNameToDelegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function canReusePrismaClient(client: PrismaClient | undefined): boolean {
  if (!client) return false;

  // In dev, Next.js hot reload can keep a PrismaClient instance that was
  // created before `prisma generate` ran for new models. Reuse it only when
  // it still exposes every delegate from the current generated client.
  return Object.values(Prisma.ModelName).every((modelName) => {
    const delegateName = modelNameToDelegateName(modelName);
    return typeof (client as unknown as Record<string, unknown>)[delegateName] !== 'undefined';
  });
}

const cachedPrisma = globalThis.__ensemble_prisma__;

if (cachedPrisma && !canReusePrismaClient(cachedPrisma)) {
  void cachedPrisma.$disconnect().catch(() => undefined);
  globalThis.__ensemble_prisma__ = undefined;
}

export const prisma: PrismaClient =
  globalThis.__ensemble_prisma__ ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__ensemble_prisma__ = prisma;
}

export * from '@prisma/client';
