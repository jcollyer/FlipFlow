import type { PrismaClient } from '@ensemble/db';

/**
 * Helpers for "is this user allowed to see / edit this deck or card?" once
 * Groups are in the picture. Pre-Groups the rule was a flat
 * `userId === ctx.userId` filter; now it's "owns it OR is in a group that
 * shares it OR (for reads) it's public".
 *
 * Keeping these in one place means the same rule applies to every place
 * that touches a deck/card — categories.byId, flashcards.listByCategory,
 * flashcards.update, etc. — so adding new procedures later doesn't drift
 * the policy.
 */

/**
 * Set of category ids the user is allowed to *write to* via a group. A
 * deck is in this set if it's in `Group.includedCategoryIds` for any group
 * the user is a member of. Membership is what grants write access; the
 * deck's own ownership stays with the original creator.
 */
export async function getGroupSharedCategoryIds(
  prisma: PrismaClient,
  userId: string,
): Promise<Set<string>> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { group: { select: { includedCategoryIds: true } } },
  });
  const ids = new Set<string>();
  for (const m of memberships) {
    for (const id of m.group.includedCategoryIds) ids.add(id);
  }
  return ids;
}

/**
 * Returns true if `userId` may read/write cards in `categoryId` via group
 * membership. Pass the prefetched shared-id set when you've already loaded
 * it for the request (avoids re-querying for every card in a list).
 */
export async function userIsGroupMemberForCategory(
  prisma: PrismaClient,
  userId: string,
  categoryId: string,
  prefetched?: Set<string>,
): Promise<boolean> {
  if (prefetched) return prefetched.has(categoryId);
  const hit = await prisma.groupMember.findFirst({
    where: {
      userId,
      group: { includedCategoryIds: { has: categoryId } },
    },
    select: { id: true },
  });
  return !!hit;
}

/**
 * The full visibility check for a single deck. `category` already has the
 * fields we need from `categories.byId`-style queries — caller doesn't
 * have to do a second round-trip.
 *
 *   - Owners always see it.
 *   - Members of a group that contains the deck see it.
 *   - Other viewers see it only if it's marked public AND the owner's
 *     profile is public.
 *
 * Returns { canRead, isOwner, isGroupMember, isPublic }. `canRead` is the
 * OR of the three flags; the others are useful for the UI ("you can study
 * this but not edit it"-style affordances).
 */
export async function resolveDeckVisibility(
  prisma: PrismaClient,
  userId: string,
  category: {
    id: string;
    userId: string;
    private: boolean;
    user: { private: boolean };
  },
): Promise<{
  canRead: boolean;
  isOwner: boolean;
  isGroupMember: boolean;
  isPublic: boolean;
}> {
  const isOwner = category.userId === userId;
  const isPublic = category.private === false && category.user.private === false;
  const isGroupMember = isOwner
    ? false // no need to check membership if you already own it
    : await userIsGroupMemberForCategory(prisma, userId, category.id);

  return {
    canRead: isOwner || isPublic || isGroupMember,
    isOwner,
    isGroupMember,
    isPublic,
  };
}
