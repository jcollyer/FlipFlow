import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { reviewCard, SubmitReviewInput } from '@flipflow/types';

import { protectedProcedure, router } from '../trpc';

export const practiceRouter = router({
  /**
   * Returns the next batch of cards to study in a category.
   * Cards never reviewed (nextReview = null) come first, then overdue cards
   * sorted by how long they've been overdue.
   *
   * When `includeAll` is true, the nextReview filter is skipped and every
   * card in the category is eligible — this powers "Practice anyway" when
   * the user is already caught up on their schedule.
   */
  queue: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().cuid(),
        limit: z.number().int().min(1).max(100).default(20),
        includeAll: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.categoryId, userId: ctx.userId },
        // backLanguage powers the per-card audio button; the practice UI
        // hides the button entirely when it's null.
        select: { id: true, name: true, color: true, backLanguage: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      const now = new Date();
      const cards = await ctx.prisma.flashcard.findMany({
        where: {
          categoryId: input.categoryId,
          ...(input.includeAll ? {} : { OR: [{ nextReview: null }, { nextReview: { lte: now } }] }),
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
      where: { id: input.cardId, userId: ctx.userId },
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

  /**
   * Lightweight stats for the dashboard / streak widgets.
   *
   * When `categoryId` is supplied, stats are scoped to that deck. Otherwise
   * we count every card the user owns — including uncategorized ones — which
   * is what the "All decks" view needs.
   */
  stats: protectedProcedure
    .input(z.object({ categoryId: z.string().cuid().optional() }))
    .query(async ({ ctx, input }) => {
      // Filter by direct ownership so uncategorized cards (categoryId = null)
      // are still counted when no categoryId is supplied.
      const where = {
        userId: ctx.userId,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
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
