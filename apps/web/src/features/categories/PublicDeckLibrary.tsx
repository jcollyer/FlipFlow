'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Layers, Library, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc/client';

export function PublicDeckLibrary() {
  const { data: users, isLoading } = trpc.categories.publicLibrary.useQuery();
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app">
            <ArrowLeft className="h-4 w-4" />
            Back to your decks
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">More decks</h1>
        <p className="text-muted-foreground text-sm">
          Browse public decks from other users and open any deck in read-only practice mode.
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
            const isOpen = openUserId === user.id;

            return (
              <Card key={user.id}>
                <button
                  type="button"
                  onClick={() => setOpenUserId((current) => (current === user.id ? null : user.id))}
                  className="w-full text-left"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate">{user.name}</CardTitle>
                      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Library className="h-4 w-4" />
                          {user.deckCount} {user.deckCount === 1 ? 'deck' : 'decks'}
                        </span>
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
                        <Link
                          key={deck.id}
                          href={`/app/categories/${deck.id}`}
                          className="hover:border-primary/40 block rounded-xl border transition hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3 p-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                aria-hidden
                                className="h-10 w-10 shrink-0 rounded-md"
                                style={{ backgroundColor: deck.color ?? '#94a3b8' }}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium">{deck.name}</div>
                                <div className="text-muted-foreground text-sm">Read-only deck</div>
                              </div>
                            </div>
                            <div className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                              <Layers className="h-4 w-4" />
                              {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
                            </div>
                          </div>
                        </Link>
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
    </div>
  );
}
