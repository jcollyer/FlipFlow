import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { GroupCreateInput, GroupUpdateInput } from '@ensemble/types';

import { protectedProcedure, router } from '../trpc';

/**
 * Groups are multi-user collections of decks. The shape mirrors Folder
 * (membership stored as a `String[]` of Category ids) but adds members and
 * invites. The owner of a group has a `GroupMember` row with role = "owner"
 * — there's always exactly one, and the leave/transfer logic enforces that.
 *
 * Decks (Category) and cards (Flashcard) stay singly-owned by their
 * original creator. The Group only records "this deck is shared into this
 * group"; authorization checks in the flashcards/categories routers expand
 * from "did you create it?" to "did you create it OR is it in a group
 * you're a member of?". This means personal-deck code keeps working without
 * any branching.
 *
 * Permission summary (all enforced in the procedures below):
 *   - Anyone in the group can view it, see members and decks, and reorder
 *     decks (per-viewer ordering, doesn't affect other members).
 *   - Adding a deck to the group is restricted to that deck's owner.
 *   - Removing a deck is allowed for the group's owner (any deck) or the
 *     deck's owner (only their own decks).
 *   - The group's owner can update group metadata, remove other members,
 *     and delete the group entirely.
 *   - The owner must transfer ownership before leaving — `leave` rejects
 *     them and `transferOwnership` swaps the role atomically.
 *   - Any member can duplicate a group-shared deck into their own account
 *     (a full copy of the deck + cards, owned by the caller). The original
 *     stays in place.
 */

/**
 * Combine the canonical membership set with the viewer's saved drag-and-drop
 * order. Mirror of the helper in folders.ts — see that file for the full
 * docstring. Lifted into a private function here rather than imported to
 * keep the two routers loosely coupled.
 */
function resolveOrderedDeckIds(
  membership: string[],
  savedOrder: string[] | null,
  validIds: Set<string>,
): string[] {
  const membershipSet = new Set(membership.filter((id) => validIds.has(id)));
  const seen = new Set<string>();
  const out: string[] = [];
  if (savedOrder) {
    for (const id of savedOrder) {
      if (membershipSet.has(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of membership) {
    if (membershipSet.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  return out;
}

export const groupsRouter = router({
  /**
   * All groups the current user is a member of, oldest-membership first.
   * Each row reports a deckCount (with dangling ids filtered out), so the
   * Groups list page doesn't need a second round-trip.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.groupMember.findMany({
      where: { userId: ctx.userId },
      orderBy: { joinedAt: 'asc' },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            ownerId: true,
            includedCategoryIds: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const groupIds = memberships.map((m) => m.groupId);
    const allCategoryIds = Array.from(
      new Set(memberships.flatMap((m) => m.group.includedCategoryIds)),
    );

    // One batched query for every shared deck the user can see across all
    // groups. We need name/color/cardCount for the home-page expandables
    // — these decks aren't in `categories.list` because that returns only
    // the user's own decks, but group-shared decks may belong to anyone.
    const sharedCategories = allCategoryIds.length
      ? await ctx.prisma.category.findMany({
          where: { id: { in: allCategoryIds } },
          select: {
            id: true,
            name: true,
            color: true,
            description: true,
            userId: true,
            _count: { select: { cards: true } },
          },
        })
      : [];
    const validIds = new Set(sharedCategories.map((c) => c.id));
    const categoryById = new Map(sharedCategories.map((c) => [c.id, c]));

    // Pull this viewer's saved orderings for every group at once.
    const savedOrders = groupIds.length
      ? await ctx.prisma.groupDeckOrder.findMany({
          where: { userId: ctx.userId, groupId: { in: groupIds } },
          select: { groupId: true, orderedCategoryIds: true },
        })
      : [];
    const orderByGroupId = new Map(
      savedOrders.map((o) => [o.groupId, o.orderedCategoryIds]),
    );

    return memberships.map((m) => {
      const ordered = resolveOrderedDeckIds(
        m.group.includedCategoryIds,
        orderByGroupId.get(m.group.id) ?? null,
        validIds,
      );
      // Inline deck details so the home-page Group expandable can render
      // without a second round-trip. We deliberately don't include the
      // deck owner's name/image here — the home page just shows name +
      // color + card count, same as Folder expandables.
      const includedDecks = ordered
        .map((id) => categoryById.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          description: c.description,
          cardCount: c._count.cards,
          isYours: c.userId === ctx.userId,
        }));
      return {
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        color: m.group.color,
        ownerId: m.group.ownerId,
        isOwner: m.role === 'owner',
        role: m.role,
        includedCategoryIds: ordered,
        includedDecks,
        deckCount: ordered.length,
        createdAt: m.group.createdAt,
        updatedAt: m.group.updatedAt,
        joinedAt: m.joinedAt,
      };
    });
  }),

  /**
   * Single group with members + decks. Members-only — non-members get a 404
   * so we don't leak the existence of private group ids.
   */
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      // Membership check + fetch in one go. If there's no membership row, the
      // caller isn't in this group (or the group doesn't exist) — same NOT_FOUND.
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.id, userId: ctx.userId } },
        include: {
          group: {
            include: {
              members: {
                include: {
                  user: {
                    select: { id: true, name: true, email: true, image: true },
                  },
                },
                orderBy: { joinedAt: 'asc' },
              },
            },
          },
        },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

      const group = membership.group;

      // Load the referenced decks in one query (including any cards-count
      // for the included-decks list). We don't restrict by deck ownership
      // here — group-shared decks may belong to many different members.
      const categories = group.includedCategoryIds.length
        ? await ctx.prisma.category.findMany({
            where: { id: { in: group.includedCategoryIds } },
            select: {
              id: true,
              name: true,
              color: true,
              description: true,
              userId: true,
              _count: { select: { cards: true } },
            },
          })
        : [];

      // Map deck ownerId → display name/image so the UI can show
      // "Created by <name>" on each shared deck without a second round-trip.
      const ownerIds = Array.from(new Set(categories.map((c) => c.userId)));
      const owners = ownerIds.length
        ? await ctx.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, name: true, image: true },
          })
        : [];
      const ownerById = new Map(owners.map((o) => [o.id, o]));

      // Apply this viewer's saved drag-and-drop order.
      const savedOrder = await ctx.prisma.groupDeckOrder.findUnique({
        where: { userId_groupId: { userId: ctx.userId, groupId: group.id } },
        select: { orderedCategoryIds: true },
      });
      const validIds = new Set(categories.map((c) => c.id));
      const orderedIds = resolveOrderedDeckIds(
        group.includedCategoryIds,
        savedOrder?.orderedCategoryIds ?? null,
        validIds,
      );

      const byId = new Map(categories.map((c) => [c.id, c]));
      const includedDecks = orderedIds
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => {
          const owner = ownerById.get(c.userId) ?? null;
          return {
            id: c.id,
            name: c.name,
            description: c.description,
            color: c.color,
            cardCount: c._count.cards,
            ownerId: c.userId,
            ownerName: owner?.name ?? null,
            ownerImage: owner?.image ?? null,
            isYours: c.userId === ctx.userId,
          };
        });

      // Active pending invites — visible to all members so anyone can see
      // who's been invited. Link invites are filtered out here and surfaced
      // separately on the invites router (they don't have an invited user
      // to display alongside the members list).
      const pendingDirectInvites = await ctx.prisma.groupInvite.findMany({
        where: {
          groupId: group.id,
          status: 'pending',
          invitedUserId: { not: null },
        },
        include: {
          invitedUser: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        ownerId: group.ownerId,
        isOwner: membership.role === 'owner',
        role: membership.role,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: group.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          isYou: m.userId === ctx.userId,
        })),
        includedCategoryIds: orderedIds,
        includedDecks,
        pendingDirectInvites: pendingDirectInvites.map((inv) => ({
          id: inv.id,
          invitedUserId: inv.invitedUserId!,
          invitedUserName: inv.invitedUser?.name ?? null,
          invitedUserEmail: inv.invitedUser?.email ?? null,
          invitedUserImage: inv.invitedUser?.image ?? null,
          createdAt: inv.createdAt,
        })),
      };
    }),

  /**
   * Create a new group. The caller is the owner and gets a matching
   * GroupMember row with role = "owner" — both writes go through a
   * transaction so the invariant "every group has exactly one owner row"
   * is preserved.
   */
  create: protectedProcedure.input(GroupCreateInput).mutation(async ({ ctx, input }) => {
    return ctx.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: input.name,
          color: input.color ?? null,
          description: input.description ?? null,
          ownerId: ctx.userId,
        },
      });
      await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId: ctx.userId,
          role: 'owner',
        },
      });
      return group;
    });
  }),

  /** Update group metadata. Owner only. */
  update: protectedProcedure.input(GroupUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.group.findFirst({
      where: { id: input.id, ownerId: ctx.userId },
      select: { id: true },
    });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    return ctx.prisma.group.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      },
    });
  }),

  /**
   * Delete the group. Owner only.
   *
   * Cascading FKs clean up GroupMember / GroupInvite / GroupDeckOrder rows
   * automatically. Decks and cards are untouched — they go back to being
   * personal decks for their owners.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.group.findFirst({
        where: { id: input.id, ownerId: ctx.userId },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.group.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * Leave the group. Owners are blocked — they must transfer ownership
   * (or delete the group entirely) before they can leave.
   */
  leave: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.id, userId: ctx.userId } },
        select: { id: true, role: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });
      if (membership.role === 'owner') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Transfer ownership to another member before leaving, or delete the group.',
        });
      }

      // Clean up this viewer's per-group ordering at the same time so we
      // don't leave orphan rows lying around (FK already cascades, but the
      // explicit delete makes the intent obvious from the call site).
      await ctx.prisma.$transaction([
        ctx.prisma.groupMember.delete({ where: { id: membership.id } }),
        ctx.prisma.groupDeckOrder.deleteMany({
          where: { groupId: input.id, userId: ctx.userId },
        }),
      ]);
      return { ok: true };
    }),

  /**
   * Hand ownership to another member. Caller must currently be the owner;
   * `newOwnerUserId` must be a member of the same group. The two role
   * updates run in a transaction so the group is never momentarily
   * ownerless or has two owners.
   */
  transferOwnership: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        newOwnerUserId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.newOwnerUserId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You are already the owner.',
        });
      }

      const group = await ctx.prisma.group.findFirst({
        where: { id: input.groupId, ownerId: ctx.userId },
        select: { id: true },
      });
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });

      const target = await ctx.prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: input.groupId, userId: input.newOwnerUserId },
        },
        select: { id: true },
      });
      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'That user is not a member of this group.',
        });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.group.update({
          where: { id: input.groupId },
          data: { ownerId: input.newOwnerUserId },
        }),
        ctx.prisma.groupMember.updateMany({
          where: { groupId: input.groupId, userId: ctx.userId },
          data: { role: 'member' },
        }),
        ctx.prisma.groupMember.updateMany({
          where: { groupId: input.groupId, userId: input.newOwnerUserId },
          data: { role: 'owner' },
        }),
      ]);
      return { ok: true };
    }),

  /** Remove another member. Owner only — refuses to remove yourself
   * (use `leave` for that, or `transferOwnership` if you're the owner). */
  removeMember: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        userId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Use leaveGroup to remove yourself.',
        });
      }
      const group = await ctx.prisma.group.findFirst({
        where: { id: input.groupId, ownerId: ctx.userId },
        select: { id: true },
      });
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.prisma.$transaction([
        ctx.prisma.groupMember.deleteMany({
          where: { groupId: input.groupId, userId: input.userId },
        }),
        ctx.prisma.groupDeckOrder.deleteMany({
          where: { groupId: input.groupId, userId: input.userId },
        }),
      ]);
      return { ok: true };
    }),

  /**
   * Add a deck the caller owns to the group. Caller must be a member of
   * the group; the deck must belong to the caller. Idempotent — adding a
   * deck that's already in the group is a no-op.
   */
  addDeck: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        categoryId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [membership, category] = await Promise.all([
        ctx.prisma.groupMember.findUnique({
          where: {
            groupId_userId: { groupId: input.groupId, userId: ctx.userId },
          },
          select: { id: true },
        }),
        ctx.prisma.category.findFirst({
          where: { id: input.categoryId, userId: ctx.userId },
          select: { id: true },
        }),
      ]);
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }
      if (!category) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });
      }

      const group = await ctx.prisma.group.findUnique({
        where: { id: input.groupId },
        select: { includedCategoryIds: true },
      });
      // Defensive — membership row implies group exists, but a delete could
      // race the membership lookup. Treat as not-found.
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });

      if (group.includedCategoryIds.includes(input.categoryId)) {
        return { ok: true, alreadyMember: true as const };
      }

      await ctx.prisma.group.update({
        where: { id: input.groupId },
        data: { includedCategoryIds: [...group.includedCategoryIds, input.categoryId] },
      });
      return { ok: true, alreadyMember: false as const };
    }),

  /**
   * Remove a deck from the group. Allowed for the group's owner (any deck)
   * OR for the deck's owner (their own decks only). Idempotent.
   */
  removeDeck: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        categoryId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [group, category] = await Promise.all([
        ctx.prisma.group.findUnique({
          where: { id: input.groupId },
          select: { id: true, ownerId: true, includedCategoryIds: true },
        }),
        ctx.prisma.category.findUnique({
          where: { id: input.categoryId },
          select: { id: true, userId: true },
        }),
      ]);
      if (!group) throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });

      // Caller must be at least a member to know the group exists.
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.groupId, userId: ctx.userId } },
        select: { role: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

      const isGroupOwner = group.ownerId === ctx.userId;
      const isDeckOwner = category?.userId === ctx.userId;
      if (!isGroupOwner && !isDeckOwner) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: "You can only remove decks you own from a group.",
        });
      }

      if (!group.includedCategoryIds.includes(input.categoryId)) {
        return { ok: true, removed: false as const };
      }

      await ctx.prisma.group.update({
        where: { id: input.groupId },
        data: {
          includedCategoryIds: group.includedCategoryIds.filter(
            (id) => id !== input.categoryId,
          ),
        },
      });
      return { ok: true, removed: true as const };
    }),

  /**
   * Persist this viewer's drag-and-drop order for the decks inside a group.
   * Same validation rules as folders.reorderDecks: must match current
   * membership exactly so the mutation can't be used to sneak ids in/out.
   */
  reorderDecks: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        orderedCategoryIds: z.array(z.string().cuid()).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.groupId, userId: ctx.userId } },
        select: { id: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

      const group = await ctx.prisma.group.findUnique({
        where: { id: input.groupId },
        select: { includedCategoryIds: true },
      });
      if (!group) throw new TRPCError({ code: 'NOT_FOUND' });

      const validIds = new Set(
        (
          await ctx.prisma.category.findMany({
            where: { id: { in: group.includedCategoryIds } },
            select: { id: true },
          })
        ).map((c) => c.id),
      );
      const currentMembership = group.includedCategoryIds.filter((id) => validIds.has(id));

      const incoming = input.orderedCategoryIds;
      const incomingSet = new Set(incoming);
      if (incoming.length !== incomingSet.size) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Duplicate ids in order' });
      }
      if (incoming.length !== currentMembership.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Order must match group membership exactly',
        });
      }
      for (const id of incoming) {
        if (!validIds.has(id)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown deck id in order' });
        }
      }

      await ctx.prisma.groupDeckOrder.upsert({
        where: { userId_groupId: { userId: ctx.userId, groupId: input.groupId } },
        create: {
          userId: ctx.userId,
          groupId: input.groupId,
          orderedCategoryIds: incoming,
        },
        update: { orderedCategoryIds: incoming },
      });
      return { ok: true };
    }),

  /**
   * Duplicate a group-shared deck into the caller's personal account.
   *
   * - Caller must be a member of a group that contains the source deck.
   * - The new deck is owned by the caller, private by default, and named
   *   "<source name> (copy)".
   * - All cards are copied. Per-user state (CardProgress) is intentionally
   *   NOT copied — the duplicated deck is a clean slate for the new owner.
   * - If `folderId` is supplied, the new deck is also added to that folder
   *   (the folder must belong to the caller). Otherwise the deck is loose.
   *
   * The whole operation runs inside one transaction so we never end up with
   * a deck-but-no-cards or a folder pointing at a deck that doesn't exist.
   */
  duplicateDeck: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().cuid(),
        folderId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Find a group the caller is in that contains this deck.
      const sharingMembership = await ctx.prisma.groupMember.findFirst({
        where: {
          userId: ctx.userId,
          group: { includedCategoryIds: { has: input.categoryId } },
        },
        select: { groupId: true },
      });
      if (!sharingMembership) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: "That deck isn't shared in a group you're a member of.",
        });
      }

      // 2. Load source deck + cards.
      const source = await ctx.prisma.category.findUnique({
        where: { id: input.categoryId },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          backLanguage: true,
          userId: true,
        },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' });
      if (source.userId === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "You already own that deck — no need to duplicate it.",
        });
      }

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

      // 3. Resolve the (optional) target folder.
      let folder: { id: string; includedCategoryIds: string[] } | null = null;
      if (input.folderId) {
        folder = await ctx.prisma.folder.findFirst({
          where: { id: input.folderId, userId: ctx.userId },
          select: { id: true, includedCategoryIds: true },
        });
        if (!folder) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Folder not found' });
        }
      }

      // 4. Copy atomically.
      const created = await ctx.prisma.$transaction(async (tx) => {
        const newCategory = await tx.category.create({
          data: {
            name: `${source.name} (copy)`,
            description: source.description,
            color: source.color,
            backLanguage: source.backLanguage,
            // Always private — duplicating into the user's own account
            // creates a personal deck. They can flip the toggle later.
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

        if (folder) {
          await tx.folder.update({
            where: { id: folder.id },
            data: {
              includedCategoryIds: folder.includedCategoryIds.includes(newCategory.id)
                ? folder.includedCategoryIds
                : [...folder.includedCategoryIds, newCategory.id],
            },
          });
        }

        return newCategory;
      });

      return { id: created.id, name: created.name };
    }),
});
