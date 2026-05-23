import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { BackLanguageValue, CategoryCreateInput, CategoryUpdateInput } from '@ensemble/types';

import { resolveDeckVisibility } from '../lib/groupAuth';
import { protectedProcedure, publicProcedure, router } from '../trpc';

export const categoriesRouter = router({
  /** All categories owned by the current user, with card counts. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const categories = await ctx.prisma.category.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cards: true } },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      backLanguage: c.backLanguage,
      private: c.private,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      cardCount: c._count.cards,
    }));
  }),

  /**
   * Public users and their public decks for the "Public decks" explorer.
   *
   * Open to unauthenticated callers (guest browse mode) — this is the
   * landing surface the App Store reviewer expects to be reachable without
   * sign-in per guideline 5.1.1(v). Signed-in users have their own account
   * excluded from the list so they don't see themselves in the explorer.
   */
  publicLibrary: publicProcedure.query(async ({ ctx }) => {
    const adminUserId = process.env.ADMIN_USER_ID;
    const viewerId = ctx.session?.user?.id ?? null;

    const users = await ctx.prisma.user.findMany({
      where: {
        private: false,
        // Only exclude the viewer when there is one. Guests should see every
        // public profile, including the admin's seed content.
        ...(viewerId ? { id: { not: viewerId } } : {}),
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        image: true,
        _count: {
          select: {
            categories: {
              where: { private: false },
            },
          },
        },
        categories: {
          where: { private: false },
          orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            _count: { select: { cards: true } },
          },
        },
      },
    });

    const mapped = users.map((user) => ({
      id: user.id,
      name: user.name?.trim() || 'Unnamed user',
      image: user.image ?? null,
      isAdmin: adminUserId ? user.id === adminUserId : false,
      deckCount: user._count.categories,
      decks: user.categories.map((deck) => ({
        id: deck.id,
        name: deck.name,
        description: deck.description,
        color: deck.color,
        cardCount: deck._count.cards,
      })),
    }));

    // Admin user always appears first, rest remain alphabetically sorted
    return mapped.sort((a, b) => {
      if (a.isAdmin) return -1;
      if (b.isAdmin) return 1;
      return 0;
    });
  }),

  /**
   * Single category (with visibility check).
   *
   * Open to guests so they can browse and practice public decks without
   * signing in. Visibility falls back to "is the deck public?" when there's
   * no session — group membership and ownership both require a user.
   */
  byId: publicProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user?.id ?? null;
    const category = await ctx.prisma.category.findFirst({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        backLanguage: true,
        private: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { private: true } },
      },
    });
    if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

    const visibility = await resolveDeckVisibility(ctx.prisma, viewerId, category);
    if (!visibility.canRead) throw new TRPCError({ code: 'NOT_FOUND' });

    return {
      id: category.id,
      name: category.name,
      description: category.description,
      color: category.color,
      backLanguage: category.backLanguage,
      private: category.private,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      isOwner: visibility.isOwner,
      // New: tells the UI to enable "create card" / "reorder" affordances
      // for non-owners who happen to be in a group containing the deck.
      isGroupMember: visibility.isGroupMember,
    };
  }),

  create: protectedProcedure.input(CategoryCreateInput).mutation(async ({ ctx, input }) => {
    // If the caller didn't specify a backLanguage, fall back to the user's
    // configured default language so new decks inherit it automatically.
    let resolvedBackLanguage = input.backLanguage ?? null;
    if (resolvedBackLanguage === null || resolvedBackLanguage === undefined) {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { defaultLanguage: true },
      });
      resolvedBackLanguage = (user?.defaultLanguage ?? null) as BackLanguageValue | null;
    }

    return ctx.prisma.category.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        backLanguage: resolvedBackLanguage,
        // Default to private when the client doesn't specify; the schema
        // also defaults to true at the DB level so this is belt-and-braces.
        private: input.private ?? true,
        userId: ctx.userId,
      },
    });
  }),

  update: protectedProcedure.input(CategoryUpdateInput).mutation(async ({ ctx, input }) => {
    // Ensure the category belongs to the caller before we touch it.
    const existing = await ctx.prisma.category.findFirst({
      where: { id: input.id, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    return ctx.prisma.category.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
        ...(input.backLanguage !== undefined ? { backLanguage: input.backLanguage ?? null } : {}),
        ...(input.private !== undefined ? { private: input.private } : {}),
      },
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.category.findFirst({
        where: { id: input.id, userId: ctx.userId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.category.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * Copy another user's public deck (and all of its cards) into the current
   * user's account, then place the new deck into one of their folders.
   *
   * Used by the "Import" button on /app/more. The whole operation runs inside
   * a single transaction so we never leave the user with a half-copied deck.
   *
   * Notes:
   *  - Source visibility is re-checked at copy time — the client's view of
   *    "this is public" may be stale.
   *  - The copy is created `private: true` regardless of the source.
   *  - Per-user fields (`difficultyLevel`) are intentionally NOT copied.
   *  - The new deck's name is `"<source name> (copy)"`.
   */
  importPublic: protectedProcedure
    .input(
      z.object({
        sourceCategoryId: z.string().cuid(),
        folderId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Load source + verify it's publicly visible. We require both the
      //    deck and its owner to be public so we mirror the same rule used by
      //    `categories.byId` / `flashcards.listByCategory` for non-owners.
      const source = await ctx.prisma.category.findFirst({
        where: { id: input.sourceCategoryId },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          backLanguage: true,
          private: true,
          userId: true,
          user: { select: { private: true } },
        },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' });

      const isOwner = source.userId === ctx.userId;
      const isPubliclyVisible = source.private === false && source.user.private === false;
      // Importing your own deck doesn't make sense from the public library,
      // and would let a user duplicate their own private decks via this path.
      if (isOwner) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot import your own deck',
        });
      }
      if (!isPubliclyVisible) throw new TRPCError({ code: 'NOT_FOUND' });

      // 2. Verify the target folder belongs to the caller.
      const folder = await ctx.prisma.folder.findFirst({
        where: { id: input.folderId, userId: ctx.userId },
        select: { id: true, includedCategoryIds: true },
      });
      if (!folder) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      }

      // 3. Load every card to copy. We snapshot the list before the
      //    transaction so we can pass it straight into createMany. Skipping
      //    `difficultyLevel` is deliberate — that's per-user practice state.
      const sourceCards = await ctx.prisma.flashcard.findMany({
        where: { categoryId: source.id },
        select: {
          front: true,
          back: true,
          frontExamples: true,
          backExamples: true,
          class: true,
          gender: true,
          verb_type: true,
          pronunciation: true,
          sortOrder: true,
        },
      });

      // 4. Run the copy + folder update atomically so a failure midway never
      //    leaves the user with a deck but no cards, or a folder pointing at
      //    a deck that doesn't exist.
      const created = await ctx.prisma.$transaction(async (tx) => {
        const newCategory = await tx.category.create({
          data: {
            name: `${source.name} (copy)`,
            description: source.description,
            color: source.color,
            backLanguage: source.backLanguage,
            // Always private — importing is for personal use, not redistribution.
            private: true,
            userId: ctx.userId,
          },
        });

        if (sourceCards.length > 0) {
          await tx.flashcard.createMany({
            data: sourceCards.map((card) => ({
              front: card.front,
              back: card.back,
              frontExamples: card.frontExamples,
              backExamples: card.backExamples,
              class: card.class,
              gender: card.gender,
              verb_type: card.verb_type,
              pronunciation: card.pronunciation,
              sortOrder: card.sortOrder,
              categoryId: newCategory.id,
              userId: ctx.userId,
            })),
          });
        }

        // Add to the folder. We re-read inside the transaction would be safer
        // against concurrent edits, but the membership array is owner-only
        // and a single user racing themselves isn't worth the extra round
        // trip — we append to the snapshot we already loaded.
        await tx.folder.update({
          where: { id: folder.id },
          data: {
            includedCategoryIds: folder.includedCategoryIds.includes(newCategory.id)
              ? folder.includedCategoryIds
              : [...folder.includedCategoryIds, newCategory.id],
          },
        });

        return newCategory;
      });

      return { id: created.id, name: created.name };
    }),
});
