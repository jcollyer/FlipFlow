import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';

import { appRouter, createTRPCContext } from '@flipflow/api';
import { auth } from '@/server/auth';

const handler = async (req: NextRequest) => {
  const session = await auth();

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        session: session
          ? {
              user: session.user
                ? {
                    id: session.user.id,
                    email: session.user.email,
                    name: session.user.name,
                    image: session.user.image,
                  }
                : null,
              expires: session.expires,
            }
          : null,
        headers: req.headers,
      }),
    onError({ error, path }) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`tRPC error on ${path ?? '<unknown>'}:`, error);
      }
    },
  });
};

export { handler as GET, handler as POST };
