import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { CategoryCreateInput, CategoryUpdateInput } from '@ensemble/types';

import { protectedProcedure, router } from '../trpc';

export const categoriesRouter = router({
  /** All categories owned by the current user, with card + due counts. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const categories = await ctx.prisma.category.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { cards: true } },
      },
    });

    // Tally how many cards in each category are due (or never reviewed).
    const dueCounts = await ctx.prisma.flashcard.groupBy({
      by: ['categoryId'],
      where: {
        category: { userId: ctx.userId },
        OR: [{ nextReview: null }, { nextReview: { lte: now } }],
      },
      _count: { _all: true },
    });
    const dueByCategory = new Map(dueCounts.map((d) => [d.categoryId, d._count._all]));

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      backLanguage: c.backLanguage,
      private: c.private,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      cardCount: c._count.cards,
      dueCount: dueByCategory.get(c.id) ?? 0,
    }));
  }),

  /** Single category (with ownership check). */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });
      return category;
    }),

  create: protectedProcedure.input(CategoryCreateInput).mutation(async ({ ctx, input }) =>
    ctx.prisma.category.create({
      data: {
        name: input.name,
        color: input.color ?? null,
        backLanguage: input.backLanguage ?? null,
        // Default to private when the client doesn't specify; the schema
        // also defaults to true at the DB level so this is belt-and-braces.
        private: input.private ?? true,
        userId: ctx.userId,
      },
    }),
  ),

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
});
