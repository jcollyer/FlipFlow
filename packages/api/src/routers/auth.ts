import { z } from 'zod';

import { protectedProcedure, publicProcedure, router } from '../trpc';

export const authRouter = router({
  /** Returns the current session, or null if signed out. */
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),

  /** Returns the full user record for the signed-in user. */
  me: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
    }),
  ),

  /** Update the signed-in user's display name. */
  updateName: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, 'Name cannot be empty').max(80, 'Name is too long'),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { name: input.name },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      }),
    ),
});
