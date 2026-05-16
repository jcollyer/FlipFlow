import { router } from './trpc';
import { authRouter } from './routers/auth';
import { categoriesRouter } from './routers/categories';
import { dictionaryRouter } from './routers/dictionary';
import { flashcardsRouter } from './routers/flashcards';
import { foldersRouter } from './routers/folders';
import { groupsRouter } from './routers/groups';
import { invitesRouter } from './routers/invites';
import { practiceRouter } from './routers/practice';
import { translateRouter } from './routers/translate';
import { ttsRouter } from './routers/tts';

export const appRouter = router({
  auth: authRouter,
  categories: categoriesRouter,
  dictionary: dictionaryRouter,
  flashcards: flashcardsRouter,
  folders: foldersRouter,
  groups: groupsRouter,
  invites: invitesRouter,
  practice: practiceRouter,
  translate: translateRouter,
  tts: ttsRouter,
});

export type AppRouter = typeof appRouter;

export { createTRPCContext } from './context';
export type { Context, SessionLike, CreateContextOptions } from './context';
export { createCallerFactory } from './trpc';
