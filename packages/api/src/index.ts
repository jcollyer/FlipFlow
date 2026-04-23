import { router } from './trpc';
import { authRouter } from './routers/auth';
import { categoriesRouter } from './routers/categories';
import { flashcardsRouter } from './routers/flashcards';
import { practiceRouter } from './routers/practice';

export const appRouter = router({
  auth: authRouter,
  categories: categoriesRouter,
  flashcards: flashcardsRouter,
  practice: practiceRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
