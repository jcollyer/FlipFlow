import { randomBytes } from 'crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { GroupInviteTokenSchema, GroupInviteUserInput } from '@ensemble/types';

import { protectedProcedure, router } from '../trpc';

/**
 * Invites for joining a Group.
 *
 * Two flavors share the GroupInvite table:
 *   - Link invites — `token` is set, `invitedUserId` is null. Reusable,
 *     optionally expiring, revocable. Shared as a URL: /app/groups/join/<token>.
 *   - Direct invites — `invitedUserId` is set, `token` is null. The invited
 *     user sees them in their pending-invites UI and can accept or decline.
 *
 * Per the agreed permission matrix, ANY member of the group can issue
 * either kind of invite. The group owner is the only one who can revoke
 * arbitrary invites; the inviter can revoke their own.
 *
 * Acceptance is idempotent — if the user is already a member, accepting
 * the invite is a no-op success rather than an error. That makes link
 * invites safe to share liberally.
 */

/**
 * Generate a URL-safe random token for link invites.
 *
 * 24 random bytes → 32 base64url chars, which gives us >190 bits of entropy
 * — far more than guessing is feasible against. We don't use cuid for this
 * because cuids are timestamp-prefixed and partially predictable; a leak of
 * a few link tokens shouldn't help an attacker guess others.
 */
function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export const invitesRouter = router({
  /**
   * Pending invites addressed directly to the current user. Powers the
   * "Invitations (N)" section on the Groups page and the pending-invites
   * badge in nav. Link invites don't appear here — they're not addressed
   * to anyone in particular.
   */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const invites = await ctx.prisma.groupInvite.findMany({
      where: {
        invitedUserId: ctx.userId,
        status: 'pending',
        // Filter out expired invites at read time. We could also have a
        // background job sweep them to "expired", but filtering is cheaper
        // and avoids the moving-parts of a scheduled task.
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            color: true,
            description: true,
            _count: { select: { members: true } },
          },
        },
        invitedBy: { select: { id: true, name: true, image: true } },
      },
    });

    return invites.map((inv) => ({
      id: inv.id,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      group: {
        id: inv.group.id,
        name: inv.group.name,
        color: inv.group.color,
        description: inv.group.description,
        memberCount: inv.group._count.members,
      },
      invitedBy: {
        id: inv.invitedBy.id,
        name: inv.invitedBy.name,
        image: inv.invitedBy.image,
      },
    }));
  }),

  /**
   * Active link invites for a group. Visible to any member so they can
   * grab the URL to share. Status defaults to pending and link invites
   * stay "pending" through their lifetime; "revoked" rows are filtered out.
   */
  listLinks: protectedProcedure
    .input(z.object({ groupId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.groupId, userId: ctx.userId } },
        select: { id: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

      const links = await ctx.prisma.groupInvite.findMany({
        where: {
          groupId: input.groupId,
          token: { not: null },
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          invitedBy: { select: { id: true, name: true } },
        },
      });

      return links.map((inv) => ({
        id: inv.id,
        token: inv.token!,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        invitedBy: inv.invitedBy,
      }));
    }),

  /**
   * Mint a new link invite for the group. Any member can call this; the
   * caller is recorded as `invitedBy`. Tokens are cryptographically random
   * — see generateInviteToken above.
   *
   * `expiresInDays` is optional; null/undefined creates a non-expiring link.
   */
  createLink: protectedProcedure
    .input(
      z.object({
        groupId: z.string().cuid(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.groupId, userId: ctx.userId } },
        select: { id: true },
      });
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      // Retry once if we hit the (vanishingly unlikely) token collision.
      let token = generateInviteToken();
      try {
        const created = await ctx.prisma.groupInvite.create({
          data: {
            groupId: input.groupId,
            invitedById: ctx.userId,
            token,
            expiresAt,
            status: 'pending',
          },
        });
        return { id: created.id, token: created.token!, expiresAt: created.expiresAt };
      } catch (err) {
        // Prisma's unique-violation error code is "P2002". Regenerate and
        // try once more; if that also fails we bubble up as INTERNAL_SERVER.
        if ((err as { code?: string }).code === 'P2002') {
          token = generateInviteToken();
          const created = await ctx.prisma.groupInvite.create({
            data: {
              groupId: input.groupId,
              invitedById: ctx.userId,
              token,
              expiresAt,
              status: 'pending',
            },
          });
          return { id: created.id, token: created.token!, expiresAt: created.expiresAt };
        }
        throw err;
      }
    }),

  /**
   * Send a direct invite to another existing user by email. The recipient
   * is resolved to a userId before the row is stored (we don't support
   * pending invites to non-users in v1). If the email matches a user
   * who's already a member, we return an idempotent "already a member"
   * response rather than erroring.
   */
  inviteUser: protectedProcedure.input(GroupInviteUserInput).mutation(async ({ ctx, input }) => {
    const membership = await ctx.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: ctx.userId } },
      select: { id: true },
    });
    if (!membership) throw new TRPCError({ code: 'NOT_FOUND' });

    // Email lookup is case-insensitive (the schema lowercases on input).
    const target = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true, image: true },
    });
    if (!target) {
      // Surfacing "no such user" is intentional — the user will want to
      // know if they typo'd an email. The API is gated by being a member,
      // so this isn't a useful enumeration vector.
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No account found for that email. Ask them to sign up first, then try again.',
      });
    }
    if (target.id === ctx.userId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "You're already in this group.",
      });
    }

    const existingMembership = await ctx.prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId: input.groupId, userId: target.id },
      },
      select: { id: true },
    });
    if (existingMembership) {
      return {
        ok: true as const,
        status: 'already_member' as const,
        target: { id: target.id, name: target.name, email: target.email, image: target.image },
      };
    }

    // Re-use an existing pending invite to the same user rather than
    // creating duplicates. Cleaner UI (one row per pending recipient).
    const existingInvite = await ctx.prisma.groupInvite.findFirst({
      where: {
        groupId: input.groupId,
        invitedUserId: target.id,
        status: 'pending',
      },
      select: { id: true, createdAt: true },
    });
    if (existingInvite) {
      return {
        ok: true as const,
        status: 'already_invited' as const,
        inviteId: existingInvite.id,
        target: { id: target.id, name: target.name, email: target.email, image: target.image },
      };
    }

    const created = await ctx.prisma.groupInvite.create({
      data: {
        groupId: input.groupId,
        invitedById: ctx.userId,
        invitedUserId: target.id,
        status: 'pending',
      },
    });
    return {
      ok: true as const,
      status: 'invited' as const,
      inviteId: created.id,
      target: { id: target.id, name: target.name, email: target.email, image: target.image },
    };
  }),

  /**
   * Accept an invite. Two call shapes:
   *   - { token: '...' } — landed on /app/groups/join/<token>
   *   - { inviteId: '...' } — clicked Accept on a direct invite in-app
   *
   * The mutation is idempotent: if the user is already a member of the
   * referenced group, we mark the invite accepted (if it was pending) and
   * return the groupId so the client can navigate there.
   */
  accept: protectedProcedure
    .input(
      z.union([
        z.object({ token: GroupInviteTokenSchema }),
        z.object({ inviteId: z.string().cuid() }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const invite =
        'token' in input
          ? await ctx.prisma.groupInvite.findUnique({
              where: { token: input.token },
              select: {
                id: true,
                groupId: true,
                invitedUserId: true,
                status: true,
                expiresAt: true,
                token: true,
              },
            })
          : await ctx.prisma.groupInvite.findUnique({
              where: { id: input.inviteId },
              select: {
                id: true,
                groupId: true,
                invitedUserId: true,
                status: true,
                expiresAt: true,
                token: true,
              },
            });

      if (!invite) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found.' });
      }

      // For direct invites, only the addressed user can accept.
      if (invite.invitedUserId && invite.invitedUserId !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This invite was sent to someone else.',
        });
      }

      // Revoked / declined invites can't be accepted. Already-accepted
      // direct invites short-circuit through the "already a member" path
      // below (the user should have been added when they originally
      // accepted — we double-check the membership row exists).
      if (invite.status === 'revoked') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invite has been revoked.',
        });
      }
      if (invite.status === 'declined') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invite was declined. Ask the inviter to send a new one.',
        });
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invite has expired.',
        });
      }

      // Already a member? Idempotent success — just return the groupId.
      const existing = await ctx.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: invite.groupId, userId: ctx.userId } },
        select: { id: true },
      });
      if (existing) {
        // Mark direct invites accepted as a tidy-up if they were still
        // pending; link invites stay pending so others can keep using them.
        if (invite.status === 'pending' && invite.invitedUserId === ctx.userId) {
          await ctx.prisma.groupInvite.update({
            where: { id: invite.id },
            data: { status: 'accepted', acceptedAt: new Date() },
          });
        }
        return {
          ok: true as const,
          groupId: invite.groupId,
          alreadyMember: true as const,
        };
      }

      // Create the membership + accept the invite (for direct invites
      // only — link invites stay reusable) in a single transaction.
      await ctx.prisma.$transaction(async (tx) => {
        await tx.groupMember.create({
          data: {
            groupId: invite.groupId,
            userId: ctx.userId,
            role: 'member',
          },
        });
        if (invite.invitedUserId === ctx.userId) {
          await tx.groupInvite.update({
            where: { id: invite.id },
            data: { status: 'accepted', acceptedAt: new Date() },
          });
        }
      });

      return {
        ok: true as const,
        groupId: invite.groupId,
        alreadyMember: false as const,
      };
    }),

  /**
   * Decline a direct invite addressed to the caller. Link invites can't be
   * declined — they're not addressed to anyone in particular; the caller
   * just doesn't have to click them.
   */
  decline: protectedProcedure
    .input(z.object({ inviteId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.groupInvite.findUnique({
        where: { id: input.inviteId },
        select: { invitedUserId: true, status: true },
      });
      if (!invite || invite.invitedUserId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (invite.status !== 'pending') {
        return { ok: true as const, alreadySettled: true as const };
      }
      await ctx.prisma.groupInvite.update({
        where: { id: input.inviteId },
        data: { status: 'declined' },
      });
      return { ok: true as const, alreadySettled: false as const };
    }),

  /**
   * Revoke an invite. The group's owner can revoke any invite for that
   * group; the inviter can revoke invites they themselves sent. Either way
   * the row is flipped to `status = 'revoked'` rather than deleted so the
   * audit trail survives.
   */
  revoke: protectedProcedure
    .input(z.object({ inviteId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.prisma.groupInvite.findUnique({
        where: { id: input.inviteId },
        select: { id: true, groupId: true, invitedById: true, status: true },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND' });

      const isInviter = invite.invitedById === ctx.userId;
      const isGroupOwner =
        !isInviter &&
        !!(await ctx.prisma.group.findFirst({
          where: { id: invite.groupId, ownerId: ctx.userId },
          select: { id: true },
        }));
      if (!isInviter && !isGroupOwner) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      if (invite.status !== 'pending') {
        return { ok: true as const, alreadySettled: true as const };
      }
      await ctx.prisma.groupInvite.update({
        where: { id: input.inviteId },
        data: { status: 'revoked' },
      });
      return { ok: true as const, alreadySettled: false as const };
    }),

  /**
   * Resolve a link-invite token to a small preview so the accept page can
   * say "You've been invited to <Group name>" before the user clicks
   * Accept. Available to authenticated users; the actual accept call
   * does the real authorization.
   */
  previewByToken: protectedProcedure
    .input(z.object({ token: GroupInviteTokenSchema }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.prisma.groupInvite.findUnique({
        where: { token: input.token },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true,
              _count: { select: { members: true } },
            },
          },
          invitedBy: { select: { id: true, name: true, image: true } },
        },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND' });

      const expired = invite.expiresAt ? invite.expiresAt < new Date() : false;
      const usable = invite.status === 'pending' && !expired;

      // Is the caller already in this group? Useful for the accept page
      // to show "You're already a member — go to group" instead of an
      // accept button.
      const existingMembership = await ctx.prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: invite.group.id, userId: ctx.userId },
        },
        select: { id: true },
      });

      return {
        inviteId: invite.id,
        status: invite.status,
        expired,
        usable,
        alreadyMember: !!existingMembership,
        group: {
          id: invite.group.id,
          name: invite.group.name,
          description: invite.group.description,
          color: invite.group.color,
          memberCount: invite.group._count.members,
        },
        invitedBy: invite.invitedBy,
      };
    }),
});
