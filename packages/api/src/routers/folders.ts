import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { FolderCreateInput, FolderUpdateInput } from '@ensemble/types';

import { protectedProcedure, router } from '../trpc';

/**
 * Folders are user-defined groupings of decks. The membership list lives on
 * the folder itself as a `String[]` of category ids — we don't model it as a
 * relation. That means a deck can be in many folders at once, and deleting a
 * deck just leaves a dangling id which we filter out at read time.
 */
export const foldersRouter = router({
  /** All folders owned by the current user. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const folders = await ctx.prisma.folder.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
    });

    // Each folder reports a deckCount that excludes any ids whose Category no
    // longer exists / no longer belongs to this user. Cheaper than a join per
    // folder: one query for the user's category ids, then a Set-intersect.
    const validIds = new Set(
      (
        await ctx.prisma.category.findMany({
          where: { userId: ctx.userId },
          select: { id: true },
        })
      ).map((c) => c.id),
    );

    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      description: f.description,
      includedCategoryIds: f.includedCategoryIds.filter((id) => validIds.has(id)),
      deckCount: f.includedCategoryIds.filter((id) => validIds.has(id)).length,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }),

  /** Single folder (with ownership check) plus the included decks inlined. */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const folder = await ctx.prisma.folder.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!folder) throw new TRPCError({ code: 'NOT_FOUND' });

      // Fetch the user's full deck list once and split it into "in this folder"
      // (with card counts) and "not in this folder" so the detail page has
      // everything it needs without a second round-trip.
      const categories = await ctx.prisma.category.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { cards: true } } },
      });

      const includedSet = new Set(folder.includedCategoryIds);
      const includedDecks = categories
        .filter((c) => includedSet.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          cardCount: c._count.cards,
        }));

      const filteredIncludedIds = includedDecks.map((d) => d.id);

      return {
        id: folder.id,
        name: folder.name,
        color: folder.color,
        description: folder.description,
        // Filter out ids whose deck has since been deleted.
        includedCategoryIds: filteredIncludedIds,
        includedDecks,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
    }),

  create: protectedProcedure.input(FolderCreateInput).mutation(async ({ ctx, input }) => {
    // If the caller passed includedCategoryIds, make sure every id actually
    // belongs to them — otherwise the array could be used to enumerate ids.
    if (input.includedCategoryIds && input.includedCategoryIds.length > 0) {
      const owned = await ctx.prisma.category.findMany({
        where: { userId: ctx.userId, id: { in: input.includedCategoryIds } },
        select: { id: true },
      });
      if (owned.length !== input.includedCategoryIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown category id' });
      }
    }

    return ctx.prisma.folder.create({
      data: {
        name: input.name,
        color: input.color ?? null,
        description: input.description ?? null,
        includedCategoryIds: input.includedCategoryIds ?? [],
        userId: ctx.userId,
      },
    });
  }),

  update: protectedProcedure.input(FolderUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.folder.findFirst({
      where: { id: input.id, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    if (input.includedCategoryIds && input.includedCategoryIds.length > 0) {
      const owned = await ctx.prisma.category.findMany({
        where: { userId: ctx.userId, id: { in: input.includedCategoryIds } },
        select: { id: true },
      });
      if (owned.length !== input.includedCategoryIds.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown category id' });
      }
    }

    return ctx.prisma.folder.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.includedCategoryIds !== undefined
          ? { includedCategoryIds: input.includedCategoryIds }
          : {}),
      },
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.folder.findFirst({
        where: { id: input.id, userId: ctx.userId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.folder.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * Toggle a deck's membership in a folder. Used by both the folder-detail
   * page (the "+ Add deck" dropdown) and the deck modals (folders dropdown
   * with checkboxes). The server is the source of truth for whether the id
   * is currently included; the client just sends the desired direction.
   */
  toggleDeck: protectedProcedure
    .input(
      z.object({
        folderId: z.string().cuid(),
        categoryId: z.string().cuid(),
        // true = ensure included, false = ensure removed.
        included: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [folder, category] = await Promise.all([
        ctx.prisma.folder.findFirst({
          where: { id: input.folderId, userId: ctx.userId },
        }),
        ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        }),
      ]);
      if (!folder) throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });

      const current = new Set(folder.includedCategoryIds);
      if (input.included) current.add(input.categoryId);
      else current.delete(input.categoryId);

      return ctx.prisma.folder.update({
        where: { id: input.folderId },
        data: { includedCategoryIds: Array.from(current) },
      });
    }),

  /**
   * Set the full folder-membership for a single deck across all the user's
   * folders in one round trip. Powers the "Folders" checkbox dropdown in the
   * deck create/edit modals — `folderIds` is the set of folders the deck
   * should belong to after this call.
   */
  setDeckFolders: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().cuid(),
        folderIds: z.array(z.string().cuid()).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.categoryId, userId: ctx.userId },
        select: { id: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });

      const target = new Set(input.folderIds);
      const folders = await ctx.prisma.folder.findMany({
        where: { userId: ctx.userId },
      });

      // Verify every requested folder id belongs to this user.
      const ownedIds = new Set(folders.map((f) => f.id));
      for (const id of target) {
        if (!ownedIds.has(id)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown folder id' });
        }
      }

      // Diff per-folder: only update folders whose membership actually changes.
      await ctx.prisma.$transaction(
        folders
          .map((folder) => {
            const has = folder.includedCategoryIds.includes(input.categoryId);
            const want = target.has(folder.id);
            if (has === want) return null;
            const next = want
              ? [...folder.includedCategoryIds, input.categoryId]
              : folder.includedCategoryIds.filter((id) => id !== input.categoryId);
            return ctx.prisma.folder.update({
              where: { id: folder.id },
              data: { includedCategoryIds: next },
            });
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
      );

      return { ok: true };
    }),

  /**
   * Returns the ids of folders that contain a specific deck. Used by the
   * deck edit modal to pre-check the right boxes when it opens.
   */
  forDeck: protectedProcedure
    .input(z.object({ categoryId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const folders = await ctx.prisma.folder.findMany({
        where: { userId: ctx.userId, includedCategoryIds: { has: input.categoryId } },
        select: { id: true },
      });
      return folders.map((f) => f.id);
    }),
});
