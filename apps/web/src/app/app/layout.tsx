import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RefreshCw, Settings } from 'lucide-react';

import MobileAppBanner from '@/components/MobileAppBanner';

import { auth, signOut } from '@/server/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/signin');

  const initials =
    (session.user.name ?? session.user.email ?? '?')
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/app" className="flex items-center gap-2">
            <div className="bg-primary inline-flex size-8 items-center justify-center rounded-full">
              <p className="font-brand h-11 text-4xl font-semibold leading-none text-white">e</p>
            </div>
            <span className="font-brand text-primary text-xl font-semibold leading-none">
              ensemble
            </span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2">
                <span className="bg-primary/15 text-primary relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-xs font-semibold">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt={session.user.name ?? session.user.email ?? 'User avatar'}
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <span aria-hidden={!!session.user.image}>{initials}</span>
                </span>
                <span className="hidden text-sm sm:inline">
                  {session.user.name ?? session.user.email}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{session.user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/settings" className="w-full cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full text-left">
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <MobileAppBanner />

      <main className="container flex-1 py-6">{children}</main>

      <footer className="mt-16 border-t bg-gray-50">
        <div className="container mx-auto max-w-2xl py-10 text-center">
          <p className="text-sm leading-relaxed text-gray-600">
            Bonjour! We’re Jeremy and Hilary, an American couple learning French ahead of a move to
            France. We wanted software more specific than we found, so we’re building it for
            ourselves and happy to share. We will email periodically to highlight new features as we
            add them. Notes of bugs and suggestions are welcome!
          </p>
          <a
            href="mailto:hello@ensemblelanguage.com"
            className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
          >
            hello@ensemblelanguage.com
          </a>
        </div>
      </footer>
    </div>
  );
}
