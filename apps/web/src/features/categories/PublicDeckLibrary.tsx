'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Folders,
  Layers,
  Library,
  Play,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';
import { ImportDeckModal } from '@/features/categories/ImportDeckModal';

export function PublicDeckLibrary() {
  const { data: users, isLoading } = trpc.categories.publicLibrary.useQuery();
  const [openUserId, setOpenUserId] = useState<string | null | undefined>(undefined);
  const activeUserId = openUserId ?? users?.find((user) => user.isAdmin)?.id ?? null;

  // The deck the user is currently trying to import (drives the modal). We
  // track the source deck rather than just an id so the modal can show the
  // deck name in its description without an extra lookup.
  const [importTarget, setImportTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Public decks</h1>
        <p className="text-muted-foreground text-sm">
          Duplicate a deck to springboard off of and edit to make it your own, or play a deck to practice sample sentences new to you.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-muted/50 h-24 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : users && users.length > 0 ? (
        <div className="space-y-3">
          {users.map((user) => {
            const isOpen = activeUserId === user.id;

            return (
              <Card
                key={user.id}
                className={user.isAdmin ? 'border-primary/40 bg-primary/[0.02]' : ''}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenUserId((current) => (activeUserId === user.id ? null : user.id))
                  }
                  className="w-full text-left"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name}
                          className={`h-10 w-10 shrink-0 rounded-full object-cover${user.isAdmin ? 'ring-primary/50 ring-2 ring-offset-1' : ''}`}
                        />
                      ) : (
                        <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                          {user.name
                            .split(' ')
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join('')}
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="flex items-center gap-2 truncate">
                          {user.name}
                          {user.isAdmin && (
                            <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                              <BadgeCheck className="h-3 w-3" />
                              Official
                            </span>
                          )}
                        </CardTitle>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <Library className="h-4 w-4" />
                            {user.deckCount} {user.deckCount === 1 ? 'deck' : 'decks'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {isOpen ? 'Hide decks' : 'Show decks'}
                    </span>
                  </CardHeader>
                </button>

                {isOpen ? (
                  <CardContent className="space-y-3 pt-0">
                    {user.decks.length > 0 ? (
                      user.decks.map((deck) => (
                        // Row is no longer a Link — only the deck name and the
                        // explicit Play / Import buttons are interactive. The
                        // name itself acts as a Play fallback so users who
                        // instinctively click the title still get the expected
                        // navigation.
                        <div
                          key={deck.id}
                          className="hover:border-primary/40 block rounded-xl border transition hover:shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                aria-hidden
                                className="h-10 w-10 shrink-0 rounded-md"
                                style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                              />
                              <div className="min-w-0">
                                <Link
                                  href={`/app/categories/${deck.id}`}
                                  className="hover:text-primary block truncate font-medium"
                                >
                                  {deck.name}
                                </Link>
                                <div className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                                  <Layers className="h-3.5 w-3.5" />
                                  {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-2">
                              <Button asChild size="sm">
                                <Link href={`/app/categories/${deck.id}`}>
                                  <Play className="h-4 w-4" />
                                  Play
                                </Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setImportTarget({ id: deck.id, name: deck.name })}
                              >
                                <Folders className="h-4 w-4" />
                                Duplicate Deck
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                        This user does not have any public decks yet.
                      </div>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
              <Users className="h-6 w-6" />
            </div>
            <div className="text-lg font-semibold">No public users yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              When other users make their profile and decks public, they will show up here.
            </p>
          </CardContent>
        </Card>
      )}

      <ImportDeckModal
        deck={importTarget}
        open={importTarget !== null}
        onOpenChange={(next) => {
          if (!next) setImportTarget(null);
        }}
      />
    </div>
  );
}
