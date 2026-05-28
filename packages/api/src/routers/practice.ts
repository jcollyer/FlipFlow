import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  encodeAdvancedDifficultyLevels,
  SetFavoriteInput,
  SubmitReviewInput,
} from '@ensemble/types';

import { resolveDeckVisibility } from '../lib/groupAuth';
import { protectedProcedure, publicProcedure, router } from '../trpc';

/**
 * Practice procedures.
 *
 * After the Groups + CardProgress migration:
 *   - The per-user difficulty rating lives in CardProgress, keyed on
 *     (userId, cardId). Submitting a review upserts into that table; the
 *     queue/stats endpoints read from it (joining back to the user's own
 *     row, so other members of a group can't see your rating).
 *   - Deck visibility uses resolveDeckVisibility so group members can
 *     practice a shared deck the same way they would their own.
 */

export const practiceRouter = router({
  /**
   * Returns every practiceable card in the requested scope. The practice UI
   * walks through the full list locally; the server doesn't paginate or
   * filter by any scheduling concept.
   *
   * Ordering mirrors the on-screen list the user just came from so in-order
   * practice walks cards in the visual top-to-bottom order they expect:
   *   - Deck practice (categoryId set): `sortOrder asc, createdAt asc`, same
   *     as `flashcards.listByCategory`. Honors the user's drag-and-drop
   *     reordering and falls back to "oldest first" for unsorted cards.
   *   - All-cards / multi-deck practice: `createdAt desc`, same as
   *     `flashcards.listAll` — newest first.
   *
   * The client applies its own shuffle on top of this ordering for
   * "Shuffle" mode, so the server is only responsible for the in-order case.
   */
  queue: publicProcedure
    .input(
      z.object({
        categoryId: z.string().cuid().optional(),
        /** Filter to multiple categories. Ignored when `categoryId` is set. */
        categoryIds: z.string().cuid().array().optional(),
        /** Filter by word class (e.g. 'noun', 'verb'). Empty = all classes. */
        classes: z.string().array().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const viewerId = ctx.session?.user?.id ?? null;

      // Guests can only practice a specific public deck. The "all cards"
      // and multi-deck queue modes both depend on a signed-in user owning
      // cards, so we reject the unscoped variant up front.
      if (!viewerId && !input.categoryId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Sign in to practice across all your cards.',
        });
      }

      const category = input.categoryId
        ? await ctx.prisma.category.findFirst({
            where: { id: input.categoryId },
            select: {
              id: true,
              name: true,
              color: true,
              backLanguage: true,
              private: true,
              userId: true,
              user: { select: { private: true } },
            },
          })
        : null;
      if (input.categoryId && !category) throw new TRPCError({ code: 'NOT_FOUND' });

      let categoryIsOwner = false;
      if (category) {
        const v = await resolveDeckVisibility(ctx.prisma, viewerId, category);
        if (!v.canRead) throw new TRPCError({ code: 'NOT_FOUND' });
        categoryIsOwner = v.isOwner;
      }

      // Build category filter: single categoryId takes priority over the array.
      const categoryFilter = input.categoryId
        ? { categoryId: input.categoryId }
        : input.categoryIds?.length
          ? { categoryId: { in: input.categoryIds } }
          : {};

      // Build word-class filter.
      const classFilter = input.classes?.length ? { class: { in: input.classes } } : {};

      const cards = await ctx.prisma.flashcard.findMany({
        where: {
          // For deck-scoped queries we don't filter by userId — group-shared
          // decks contain cards authored by multiple members and the viewer
          // can practice all of them. For unscoped ("all cards") queries we
          // still scope to the viewer's own cards, matching the All-cards
          // page's intent. (Guests never reach the unscoped branch — see
          // the early-return above.)
          ...(input.categoryId ? {} : { userId: viewerId! }),
          ...categoryFilter,
          ...classFilter,
        },
        include: {
          category: {
            select: {
              backLanguage: true,
            },
          },
        },
        orderBy: input.categoryId
          ? [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }]
          : { createdAt: 'desc' },
      });

      // Attach the viewer's own per-card difficulty rating from CardProgress.
      // Guests have no rows in CardProgress, so we skip the query entirely
      // and every card comes back with `difficultyLevel: null`. We also
      // surface the matching `advancedDifficultyLevel` so the rating panel
      // can pre-tick the user's previous selection on re-rate.
      const progressRows =
        viewerId && cards.length
          ? await ctx.prisma.cardProgress.findMany({
              where: { userId: viewerId, cardId: { in: cards.map((c) => c.id) } },
              select: {
                cardId: true,
                difficultyLevel: true,
                advancedDifficultyLevel: true,
                favorite: true,
              },
            })
          : [];
      const progressByCardId = new Map(progressRows.map((p) => [p.cardId, p]));

      return {
        category: category
          ? {
              id: category.id,
              name: category.name,
              color: category.color,
              backLanguage: category.backLanguage,
              isOwner: categoryIsOwner,
            }
          : null,
        cards: cards.map((card) => {
          const p = progressByCardId.get(card.id);
          return {
            ...card,
            difficultyLevel: p?.difficultyLevel ?? null,
            advancedDifficultyLevel: p?.advancedDifficultyLevel ?? null,
            // Guests never have CardProgress rows, so they always see
            // `favorite: false` — which matches the UI's "you must be
            // signed in to favorite a card" behavior.
            favorite: p?.favorite ?? false,
          };
        }),
      };
    }),

  /**
   * Persists this viewer's difficulty rating for a card via a CardProgress
   * upsert. The viewer may rate any card they can see — i.e. one they
   * authored, one in a deck they own, or one in a group-shared deck they
   * have access to.
   */
  submitReview: protectedProcedure.input(SubmitReviewInput).mutation(async ({ ctx, input }) => {
    // Load the card + its deck so we can run the same visibility check used
    // everywhere else. Practicing a card you can't see shouldn't be allowed.
    const card = await ctx.prisma.flashcard.findUnique({
      where: { id: input.cardId },
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

    let canRate = card.userId === ctx.userId;
    if (!canRate && card.category) {
      const v = await resolveDeckVisibility(ctx.prisma, ctx.userId, card.category);
      canRate = v.canRead;
    }
    if (!canRate) throw new TRPCError({ code: 'NOT_FOUND' });

    // The advanced selection is optional: `undefined` means "the client used
    // the simple picker, leave the advanced column untouched"; `null` or an
    // empty array explicitly clears any prior selection; an array writes the
    // canonical CSV form. We never read the column back here — encoding +
    // upsert is enough to keep the next queue/list response in sync.
    const advancedColumnUpdate =
      input.advancedDifficultyLevel === undefined
        ? {}
        : {
            advancedDifficultyLevel:
              input.advancedDifficultyLevel === null || input.advancedDifficultyLevel.length === 0
                ? null
                : encodeAdvancedDifficultyLevels(input.advancedDifficultyLevel),
          };

    return ctx.prisma.cardProgress.upsert({
      where: { userId_cardId: { userId: ctx.userId, cardId: card.id } },
      create: {
        userId: ctx.userId,
        cardId: card.id,
        difficultyLevel: input.difficultyLevel,
        ...advancedColumnUpdate,
      },
      update: {
        difficultyLevel: input.difficultyLevel,
        ...advancedColumnUpdate,
      },
    });
  }),

  /**
   * Toggle the per-user `favorite` flag on a card. Independent of the
   * rating — calling this never reads or writes difficultyLevel /
   * advancedDifficultyLevel, so favoriting from a list row doesn't have to
   * fabricate a rating and re-rating doesn't accidentally clear a favorite.
   *
   * Same visibility check as `submitReview`: you can favorite any card you
   * can see (one you authored, one in a deck you own, or one in a group-
   * shared deck you have access to).
   *
   * Returns the resulting CardProgress row's favorite + difficulty fields so
   * the client can write the response straight into its query cache without
   * an extra round-trip.
   */
  setFavorite: protectedProcedure.input(SetFavoriteInput).mutation(async ({ ctx, input }) => {
    const card = await ctx.prisma.flashcard.findUnique({
      where: { id: input.cardId },
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

    let canFavorite = card.userId === ctx.userId;
    if (!canFavorite && card.category) {
      const v = await resolveDeckVisibility(ctx.prisma, ctx.userId, card.category);
      canFavorite = v.canRead;
    }
    if (!canFavorite) throw new TRPCError({ code: 'NOT_FOUND' });

    const row = await ctx.prisma.cardProgress.upsert({
      where: { userId_cardId: { userId: ctx.userId, cardId: card.id } },
      // On first-favorite we may create the row with no rating at all —
      // that's intentional and matches "the user favorited a card they've
      // never practiced." difficultyLevel stays null and the list views
      // already render that as "No rating."
      create: {
        userId: ctx.userId,
        cardId: card.id,
        favorite: input.favorite,
      },
      update: {
        favorite: input.favorite,
      },
      select: {
        cardId: true,
        favorite: true,
        difficultyLevel: true,
        advancedDifficultyLevel: true,
      },
    });

    return row;
  }),

  /**
   * Lightweight stats for the deck detail view.
   *
   * Counts always reflect the *viewer's* per-card progress: in a group
   * deck, the breakdown shown to each member is computed against their
   * own CardProgress rows. "Total cards" is the deck's total (or every
   * card the viewer owns, when no categoryId is supplied).
   */
  stats: protectedProcedure
    .input(z.object({ categoryId: z.string().cuid().optional() }))
    .query(async ({ ctx, input }) => {
      // Total counts come from Flashcard. Scoped by categoryId when given,
      // otherwise by direct ownership so uncategorized cards stay included.
      const totalWhere = input.categoryId
        ? { categoryId: input.categoryId }
        : { userId: ctx.userId };

      const [total, progressBreakdown] = await Promise.all([
        ctx.prisma.flashcard.count({ where: totalWhere }),
        // Count this viewer's CardProgress rows in the same scope. We join
        // through `card` so we can apply the same scope filter directly.
        ctx.prisma.cardProgress.groupBy({
          by: ['difficultyLevel'],
          where: {
            userId: ctx.userId,
            card: input.categoryId ? { categoryId: input.categoryId } : { userId: ctx.userId },
          },
          _count: { _all: true },
        }),
      ]);

      const challenging =
        progressBreakdown.find((r) => r.difficultyLevel === 'challenging')?._count?._all ?? 0;
      const good = progressBreakdown.find((r) => r.difficultyLevel === 'good')?._count?._all ?? 0;
      const easy = progressBreakdown.find((r) => r.difficultyLevel === 'easy')?._count?._all ?? 0;

      return {
        total,
        difficultyBreakdown: {
          challenging,
          good,
          easy,
        },
      };
    }),
});
