import { PrismaClient } from '../src/generated/client';

const prisma = new PrismaClient();

async function main() {
  // Idempotent demo seed: creates a "Demo" user with one starter category and a
  // handful of cards. Safe to re-run.
  const user = await prisma.user.upsert({
    where: { email: 'demo@flipflow.dev' },
    update: {},
    create: {
      email: 'demo@flipflow.dev',
      name: 'Demo User',
    },
  });

  const existing = await prisma.category.findFirst({
    where: { userId: user.id, name: 'TypeScript Basics' },
  });

  if (!existing) {
    await prisma.category.create({
      data: {
        name: 'TypeScript Basics',
        color: '#3b82f6',
        userId: user.id,
        cards: {
          create: [
            {
              front: 'What does `as const` do?',
              back: 'Treats a literal as a deeply readonly literal type.',
            },
            {
              front: 'Difference between `interface` and `type`?',
              back: 'Interfaces are open and extendable; type aliases are closed but more flexible (unions, intersections, mapped types).',
            },
            {
              front: 'What is `satisfies`?',
              back: 'Validates that an expression matches a type without widening or narrowing the inferred type.',
            },
            {
              front: 'What is a discriminated union?',
              back: 'A union of object types sharing a common literal `kind` field that lets TS narrow the variant.',
            },
            {
              front: 'What does `keyof T` return?',
              back: 'A union of the literal string/number/symbol keys of `T`.',
            },
          ],
        },
      },
    });
  }

  console.log('Seeded FlipFlow demo data.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
