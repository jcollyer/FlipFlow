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
      description: c.description,
      color: c.color,
      backLanguage: c.backLanguage,
      private: c.private,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      cardCount: c._count.cards,
      dueCount: dueByCategory.get(c.id) ?? 0,
    }));
  }),

  /** Public users and their public decks for the "More decks" explorer. */
  publicLibrary: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      where: {
        private: false,
        id: { not: ctx.userId },
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
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
            color: true,
            _count: { select: { cards: true } },
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name?.trim() || 'Unnamed user',
      deckCount: user._count.categories,
      decks: user.categories.map((deck) => ({
        id: deck.id,
        name: deck.name,
        color: deck.color,
        cardCount: deck._count.cards,
      })),
    }));
  }),

  /** Single category (with ownership check). */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
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

      const isOwner = category.userId === ctx.userId;
      const isPubliclyVisible = category.private === false && category.user.private === false;
      if (!isOwner && !isPubliclyVisible) throw new TRPCError({ code: 'NOT_FOUND' });

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        backLanguage: category.backLanguage,
        private: category.private,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
        isOwner,
      };
    }),

  create: protectedProcedure.input(CategoryCreateInput).mutation(async ({ ctx, input }) =>
    ctx.prisma.category.create({
      data: {
        name: input.name,
        description: input.description ?? null,
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
});
