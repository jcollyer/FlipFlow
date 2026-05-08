import type { Metadata } from 'next';
import { Alex_Brush } from 'next/font/google';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

const alexBrush = Alex_Brush({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ensemble',
  description: 'Flashcards with spaced repetition that actually sticks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={alexBrush.variable}>
      <body className="bg-background min-h-dvh font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
