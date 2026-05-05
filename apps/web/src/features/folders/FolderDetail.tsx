'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, FolderTree, Layers, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc/client';
import { FolderModal } from '@/features/folders/FolderModal';

interface Props {
  folderId: string;
}

export function FolderDetail({ folderId }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: folder, isLoading } = trpc.folders.byId.useQuery({ id: folderId });
  // We also need the user's full deck list for the "+ Add deck" dropdown so
  // they can toggle decks in/out of the folder.
  const { data: allCategories } = trpc.categories.list.useQuery();

  const [editOpen, setEditOpen] = useState(false);

  const updateFolder = trpc.folders.update.useMutation({
    onSuccess: () => {
      utils.folders.byId.invalidate({ id: folderId });
      utils.folders.list.invalidate();
      setEditOpen(false);
    },
  });

  const deleteFolder = trpc.folders.delete.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      router.push('/app/folders');
    },
  });

  const toggleDeck = trpc.folders.toggleDeck.useMutation({
    // Optimistic-ish: invalidate after success so the count and list refresh.
    onSuccess: () => {
      utils.folders.byId.invalidate({ id: folderId });
      utils.folders.list.invalidate();
    },
  });

  const includedSet = new Set(folder?.includedCategoryIds ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app/folders">
              <ArrowLeft className="h-4 w-4" />
              All folders
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="h-9 w-9 rounded-md"
              style={{ backgroundColor: folder?.color ?? '#94a3b8' }}
            />
            <h1 className="text-3xl font-semibold tracking-tight">
              {folder?.name ?? 'Loading…'}
            </h1>
          </div>
          {folder?.description ? (
            <p className="text-muted-foreground pl-12 text-sm">{folder.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!folder || !allCategories}>
                <Plus className="h-4 w-4" />
                Add deck
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel>Toggle decks</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(allCategories ?? []).length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  You don&apos;t have any decks yet.
                </p>
              ) : (
                (allCategories ?? []).map((c) => {
                  const checked = includedSet.has(c.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={checked}
                      // Stay open between toggles so users can pick several.
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(next) =>
                        toggleDeck.mutate({
                          folderId,
                          categoryId: c.id,
                          included: !!next,
                        })
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: c.color ?? '#94a3b8' }}
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : folder && folder.includedDecks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {folder.includedDecks.map((d) => (
            <Link key={d.id} href={`/app/categories/${d.id}`} className="group">
              <Card className="hover:border-primary/40 transition hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div
                    aria-hidden
                    className="h-10 w-10 rounded-md"
                    style={{ backgroundColor: d.color ?? '#94a3b8' }}
                  />
                  <CardTitle className="group-hover:text-primary truncate">{d.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    {d.cardCount} {d.cardCount === 1 ? 'card' : 'cards'}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
              <FolderTree className="h-6 w-6" />
            </div>
            <div className="text-lg font-semibold">No decks in this folder yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Use the <span className="font-medium">Add deck</span> dropdown above to add some of
              your decks to this folder.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-6">
        <Button variant="ghost" onClick={() => setEditOpen(true)} disabled={!folder}>
          <Pencil className="h-4 w-4" />
          Edit folder
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (
              confirm(
                `Delete "${folder?.name}"? This won't delete the decks inside, just the folder itself.`,
              )
            ) {
              deleteFolder.mutate({ id: folderId });
            }
          }}
          disabled={!folder}
        >
          <Trash2 className="h-4 w-4" />
          Delete folder
        </Button>
      </div>

      {editOpen && folder ? (
        <FolderModal
          open
          onOpenChange={(o) => (o ? null : setEditOpen(false))}
          mode={{
            kind: 'edit',
            folder: {
              id: folder.id,
              name: folder.name,
              color: folder.color ?? null,
              description: folder.description ?? null,
            },
            isPending: updateFolder.isPending,
            onSubmit: (values) => updateFolder.mutate(values),
          }}
        />
      ) : null}
    </div>
  );
}
