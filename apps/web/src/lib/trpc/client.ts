import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@flipflow/api';

export const trpc = createTRPCReact<AppRouter>();
