import type { Metadata } from 'next';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

export const metadata: Metadata = {
  title: 'FlipFlow',
  description: 'Flashcards with spaced repetition that actually sticks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
