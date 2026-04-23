import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { reviewCard, SubmitReviewInput } from '@flipflow/types';

import { protectedProcedure, router } from '../trpc';

export const practiceRouter = router({
  /**
   * Returns the next batch of cards to study in a category.
   * Cards never reviewed (nextReview = null) come first, then overdue cards
   * sorted by how long they've been overdue.
   */
  queue: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().cuid(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.categoryId, userId: ctx.userId },
        select: { id: true, name: true, color: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      const now = new Date();
      const cards = await ctx.prisma.flashcard.findMany({
        where: {
          categoryId: input.categoryId,
          OR: [{ nextReview: null }, { nextReview: { lte: now } }],
        },
        orderBy: [{ nextReview: 'asc' }, { createdAt: 'asc' }],
        take: input.limit,
      });

      return { category, cards };
    }),

  /**
   * Records a confidence rating for a card and runs SM-2 to schedule its
   * next review. Returns the updated card.
   */
  submitReview: protectedProcedure.input(SubmitReviewInput).mutation(async ({ ctx, input }) => {
    const card = await ctx.prisma.flashcard.findFirst({
      where: { id: input.cardId, category: { userId: ctx.userId } },
    });
    if (!card) throw new TRPCError({ code: 'NOT_FOUND' });

    const result = reviewCard(
      {
        repetitions: card.repetitions,
        easeFactor: card.easeFactor,
        interval: card.interval,
      },
      input.confidence,
    );

    return ctx.prisma.flashcard.update({
      where: { id: card.id },
      data: {
        confidence: input.confidence,
        repetitions: result.repetitions,
        easeFactor: result.easeFactor,
        interval: result.interval,
        nextReview: result.nextReview,
      },
    });
  }),

  /** Lightweight stats for the dashboard / streak widgets. */
  stats: protectedProcedure
    .input(z.object({ categoryId: z.string().cuid().optional() }))
    .query(async ({ ctx, input }) => {
      const where = {
        category: {
          userId: ctx.userId,
          ...(input.categoryId ? { id: input.categoryId } : {}),
        },
      };
      const now = new Date();

      const [total, due, mastered] = await Promise.all([
        ctx.prisma.flashcard.count({ where }),
        ctx.prisma.flashcard.count({
          where: {
            ...where,
            OR: [{ nextReview: null }, { nextReview: { lte: now } }],
          },
        }),
        // "Mastered" = at least 3 successful reviews in a row.
        ctx.prisma.flashcard.count({
          where: { ...where, repetitions: { gte: 3 } },
        }),
      ]);

      return { total, due, mastered };
    }),
});
