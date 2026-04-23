import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { FlashcardCreateInput, FlashcardUpdateInput } from '@flipflow/types';

import { protectedProcedure, router } from '../trpc';

export const flashcardsRouter = router({
  /** All cards in a category, newest first. */
  listByCategory: protectedProcedure
    .input(z.object({ categoryId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Confirm the user owns the category before returning its cards.
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.categoryId, userId: ctx.userId },
        select: { id: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      return ctx.prisma.flashcard.findMany({
        where: { categoryId: input.categoryId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const card = await ctx.prisma.flashcard.findFirst({
        where: { id: input.id, category: { userId: ctx.userId } },
      });
      if (!card) throw new TRPCError({ code: 'NOT_FOUND' });
      return card;
    }),

  create: protectedProcedure.input(FlashcardCreateInput).mutation(async ({ ctx, input }) => {
    const category = await ctx.prisma.category.findFirst({
      where: { id: input.categoryId, userId: ctx.userId },
      select: { id: true },
    });
    if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

    return ctx.prisma.flashcard.create({
      data: {
        front: input.front,
        back: input.back,
        categoryId: input.categoryId,
      },
    });
  }),

  update: protectedProcedure.input(FlashcardUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.flashcard.findFirst({
      where: { id: input.id, category: { userId: ctx.userId } },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    return ctx.prisma.flashcard.update({
      where: { id: input.id },
      data: {
        ...(input.front !== undefined ? { front: input.front } : {}),
        ...(input.back !== undefined ? { back: input.back } : {}),
      },
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.flashcard.findFirst({
        where: { id: input.id, category: { userId: ctx.userId } },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.flashcard.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
