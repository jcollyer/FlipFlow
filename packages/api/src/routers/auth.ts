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
});
