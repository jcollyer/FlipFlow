import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Bodoni_Moda, Cormorant_Garamond, Inter } from 'next/font/google';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

const bodoniModa = Bodoni_Moda({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-brand',
  display: 'swap',
});

const cormorantGaramond = Cormorant_Garamond({
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-accent',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ensemble',
  description: 'Flashcards with spaced repetition that actually sticks.',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodoniModa.variable} ${cormorantGaramond.variable} ${inter.variable}`}
    >
      <body className="bg-background min-h-dvh font-sans text-gray-700">
        <TRPCProvider>{children}</TRPCProvider>
        <Analytics />
      </body>
    </html>
  );
}
