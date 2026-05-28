import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { FlashcardCreateInput, FlashcardUpdateInput } from '@ensemble/types';

import {
  getGroupSharedCategoryIds,
  resolveDeckVisibility,
  userIsGroupMemberForCategory,
} from '../lib/groupAuth';
import { protectedProcedure, publicProcedure, router } from '../trpc';

/**
 * Authorization model after Groups:
 *
 *   READS  → visible to the deck owner, to any member of a group that
 *            shares the deck, or to anyone if the deck is public.
 *   CREATE → any group member can add a card to a shared deck (card's
 *            `userId` is the creator, NOT the deck owner — this preserves
 *            attribution and means "delete my account" only cascades
 *            cards I actually wrote).
 *   EDIT   → only the card's author may edit or delete the card.
 *            The deck owner can still delete the *deck*, which cascades
 *            and removes every card in it (including ones authored by
 *            other group members).
 *   REORDER → shared. Any group member can reorder cards in a shared
 *            deck and the order is global (last-write-wins) — mirrors
 *            how a shared deck "feels like" one deck.
 *
 * The `private` Boolean on Category is still respected for non-member
 * public visibility, but it's slated for removal — see resolveDeckVisibility
 * for the single place that knows the rule.
 */

export const flashcardsRouter = router({
  /**
   * All cards in a category, oldest first.
   *
   * Open to guests so they can preview and practice cards in public decks
   * without signing in. Per-user progress is omitted for guests and for
   * non-owner/non-member public viewers (the old behaviour).
   */
  listByCategory: publicProcedure
    .input(z.object({ categoryId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user?.id ?? null;
      const category = await ctx.prisma.category.findFirst({
        where: { id: input.categoryId },
        select: {
          id: true,
          userId: true,
          private: true,
          user: { select: { private: true } },
        },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      const visibility = await resolveDeckVisibility(ctx.prisma, viewerId, category);
      if (!visibility.canRead) throw new TRPCError({ code: 'NOT_FOUND' });

      const cards = await ctx.prisma.flashcard.findMany({
        where: { categoryId: input.categoryId },
        orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      });

      // Pull this viewer's per-card progress in one batched query and merge
      // the difficultyLevel back into each card so the UI doesn't have to
      // change shape. Cards the user has never rated come back with
      // `difficultyLevel: null` (the previous behaviour for unrated cards).
      // Skipped entirely for guests since they have no progress to look up.
      const progressRows =
        viewerId && cards.length
          ? await ctx.prisma.cardProgress.findMany({
              where: {
                userId: viewerId,
                cardId: { in: cards.map((c) => c.id) },
              },
              select: {
                cardId: true,
                difficultyLevel: true,
                advancedDifficultyLevel: true,
                favorite: true,
              },
            })
          : [];
      const progressByCardId = new Map(progressRows.map((p) => [p.cardId, p]));

      // For non-owners viewing via the "public deck" code path we keep the
      // old behaviour of hiding the viewer-specific rating, since "public"
      // means "anonymous read." Group-members get their own per-user rating
      // back (it's their own state, not someone else's). Guests always get
      // null progress.
      const exposeProgress = viewerId !== null && (visibility.isOwner || visibility.isGroupMember);

      return cards.map((card) => {
        const p = progressByCardId.get(card.id);
        return {
          ...card,
          difficultyLevel: exposeProgress ? (p?.difficultyLevel ?? null) : null,
          advancedDifficultyLevel: exposeProgress ? (p?.advancedDifficultyLevel ?? null) : null,
          // Favorite is per-user state the viewer owns, so it's safe to
          // surface for both owners and group members. Hidden from
          // public-deck/guest viewers along with the rest of the per-user
          // fields (they shouldn't see another user's favorites).
          favorite: exposeProgress ? (p?.favorite ?? false) : false,
        };
      });
    }),

  /**
   * Every card the user owns, across all decks plus uncategorized cards.
   * Powers the "All decks" view at /app/all-categories.
   *
   * Note: this view is the user's OWN cards. Cards added by other people
   * to decks they don't author don't show up here, which matches the
   * intent of the page (your personal pile of cards).
   */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    const cards = await ctx.prisma.flashcard.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
    });
    if (cards.length === 0) return [];

    const progressRows = await ctx.prisma.cardProgress.findMany({
      where: { userId: ctx.userId, cardId: { in: cards.map((c) => c.id) } },
      select: {
        cardId: true,
        difficultyLevel: true,
        advancedDifficultyLevel: true,
        favorite: true,
      },
    });
    const progressByCardId = new Map(progressRows.map((p) => [p.cardId, p]));

    return cards.map((card) => {
      const p = progressByCardId.get(card.id);
      return {
        ...card,
        difficultyLevel: p?.difficultyLevel ?? null,
        advancedDifficultyLevel: p?.advancedDifficultyLevel ?? null,
        favorite: p?.favorite ?? false,
      };
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Authorship pointer covers owners + uncategorized cards in one shot.
      // For group-shared cards authored by another user we fall through to
      // the membership check below.
      const card = await ctx.prisma.flashcard.findUnique({
        where: { id: input.id },
        include: {
          category: {
            select: {
              id: true,
              userId: true,
              private: true,
              user: { select: { private: true } },
            },
          },
        },
      });
      if (!card) throw new TRPCError({ code: 'NOT_FOUND' });

      const isAuthor = card.userId === ctx.userId;
      let canRead = isAuthor;
      if (!canRead && card.category) {
        const v = await resolveDeckVisibility(ctx.prisma, ctx.userId, card.category);
        canRead = v.canRead;
      }
      if (!canRead) throw new TRPCError({ code: 'NOT_FOUND' });

      const progress = await ctx.prisma.cardProgress.findUnique({
        where: { userId_cardId: { userId: ctx.userId, cardId: card.id } },
        select: { difficultyLevel: true, advancedDifficultyLevel: true, favorite: true },
      });

      // Strip the relation field — the existing callers expect the flat
      // card shape, not `{ ...card, category }`.
      const { category: _omit, ...flat } = card;
      return {
        ...flat,
        difficultyLevel: progress?.difficultyLevel ?? null,
        advancedDifficultyLevel: progress?.advancedDifficultyLevel ?? null,
        favorite: progress?.favorite ?? false,
      };
    }),

  /**
   * Create a card. The caller must either own the target deck OR be a
   * member of a group that shares it. The new card's `userId` is set to
   * the caller — this preserves attribution and is what the edit/delete
   * checks use later. Uncategorized cards (no `categoryId`) are always
   * owned by the caller.
   */
  create: protectedProcedure.input(FlashcardCreateInput).mutation(async ({ ctx, input }) => {
    if (input.categoryId) {
      const category = await ctx.prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true, userId: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      if (category.userId !== ctx.userId) {
        const allowed = await userIsGroupMemberForCategory(
          ctx.prisma,
          ctx.userId,
          input.categoryId,
        );
        if (!allowed) throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }

    return ctx.prisma.flashcard.create({
      data: {
        front: input.front,
        back: input.back,
        frontExamples: input.frontExamples,
        backExamples: input.backExamples,
        class: input.class ?? null,
        gender: input.gender ?? null,
        verb_type: input.verb_type ?? null,
        pronunciation: input.pronunciation ?? null,
        categoryId: input.categoryId ?? null,
        userId: ctx.userId,
      },
    });
  }),

  /**
   * Update a card. Only the card's author may edit it — even in a shared
   * group, you don't edit other people's cards. (If the deck owner wants
   * full control of someone else's card, they can delete the deck or ask
   * the author to update it.)
   *
   * Moving a card into a different deck (`categoryId` change) requires the
   * target deck to either be owned by the caller or be in a group the
   * caller is a member of.
   */
  update: protectedProcedure.input(FlashcardUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.flashcard.findFirst({
      where: { id: input.id, userId: ctx.userId },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    if (input.categoryId !== undefined) {
      const target = await ctx.prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true, userId: true },
      });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
      if (target.userId !== ctx.userId) {
        const allowed = await userIsGroupMemberForCategory(
          ctx.prisma,
          ctx.userId,
          input.categoryId,
        );
        if (!allowed) throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }

    const updated = await ctx.prisma.flashcard.update({
      where: { id: input.id },
      data: {
        ...(input.front !== undefined ? { front: input.front } : {}),
        ...(input.back !== undefined ? { back: input.back } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.frontExamples !== undefined ? { frontExamples: input.frontExamples } : {}),
        ...(input.backExamples !== undefined ? { backExamples: input.backExamples } : {}),
        ...(input.class !== undefined ? { class: input.class } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.verb_type !== undefined ? { verb_type: input.verb_type } : {}),
        ...(input.pronunciation !== undefined ? { pronunciation: input.pronunciation } : {}),
      },
    });

    // Attach the viewer's per-user difficulty rating so the mutation
    // result has the same shape as `byId`. Callers like EditCardDialog
    // pipe this straight into a `setData` cache write, which would
    // otherwise type-error against the enriched `byId` shape.
    const progress = await ctx.prisma.cardProgress.findUnique({
      where: { userId_cardId: { userId: ctx.userId, cardId: updated.id } },
      select: { difficultyLevel: true, advancedDifficultyLevel: true, favorite: true },
    });
    return {
      ...updated,
      difficultyLevel: progress?.difficultyLevel ?? null,
      advancedDifficultyLevel: progress?.advancedDifficultyLevel ?? null,
      favorite: progress?.favorite ?? false,
    };
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      // Author-only — deck owners can delete the deck (cascades) but not
      // individual cards another member contributed.
      const existing = await ctx.prisma.flashcard.findFirst({
        where: { id: input.id, userId: ctx.userId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.flashcard.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * Persist a user-defined card ordering for a deck.
   *
   * Shared decks are intentionally last-write-wins on order: any member of
   * a group containing the deck can reorder, and the new positions are
   * global (not per-viewer). Per-user ordering would be technically
   * possible but mismatches how the rest of the deck reads as "one deck."
   */
  reorder: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().cuid(),
        orderedIds: z.array(z.string().cuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findUnique({
        where: { id: input.categoryId },
        select: { id: true, userId: true },
      });
      if (!category) throw new TRPCError({ code: 'NOT_FOUND' });

      const isOwner = category.userId === ctx.userId;
      if (!isOwner) {
        const allowed = await userIsGroupMemberForCategory(
          ctx.prisma,
          ctx.userId,
          input.categoryId,
        );
        if (!allowed) throw new TRPCError({ code: 'NOT_FOUND' });
      }

      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.flashcard.updateMany({
            // Drop the userId filter here: the deck is shared, so we're
            // allowed to reorder any card inside it. We still constrain
            // by categoryId so we never touch a card outside this deck.
            where: { id, categoryId: input.categoryId },
            data: { sortOrder: index },
          }),
        ),
      );

      return { ok: true };
    }),
});

// Re-export helper so the practice router doesn't duplicate the logic.
export { getGroupSharedCategoryIds };
