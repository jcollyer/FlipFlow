'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, FolderTree, Layers, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequireNameConfirmationDialog } from '@/components/RequireNameConfirmationDialog';
import { trpc } from '@/lib/trpc/client';
import { FolderModal } from '@/features/folders/FolderModal';

/**
 * /app/folders — list view of all the user's folders. Each row links to the
 * folder's detail page; inline pencil/trash buttons let the user edit or
 * delete without leaving the list.
 */
export function FoldersDashboard() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: folders, isLoading } = trpc.folders.list.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<{ id: string; name: string } | null>(null);

  const createFolder = trpc.folders.create.useMutation({
    onSuccess: (folder) => {
      utils.folders.list.invalidate();
      setCreateOpen(false);
      router.push(`/app/folders/${folder.id}`);
    },
  });

  const updateFolder = trpc.folders.update.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      setEditingId(null);
    },
  });

  const deleteFolder = trpc.folders.delete.useMutation({
    onSuccess: () => {
      utils.folders.list.invalidate();
      setDeletingFolder(null);
    },
  });

  const editing = editingId ? ((folders ?? []).find((f) => f.id === editingId) ?? null) : null;
  const hasFolders = (folders?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/app">
              <ArrowLeft className="h-4 w-4" />
              Your decks
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-md"
            >
              <FolderTree className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">All folders</h1>
          </div>
          <p className="text-muted-foreground pl-12 text-sm">
            Group decks together for better organization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New folder
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/50 h-20 animate-pulse rounded-xl border" />
          ))}
        </div>
      ) : hasFolders ? (
        <div className="space-y-3">
          {(folders ?? []).map((f) => (
            <Card key={f.id} className="hover:border-primary/40 transition hover:shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link
                  href={`/app/folders/${f.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3"
                >
                  <div
                    aria-hidden
                    className="h-10 w-10 shrink-0 rounded-md"
                    style={{ backgroundColor: f.color ?? '#94a3b8' }}
                  />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="group-hover:text-primary truncate text-base">
                      {f.name}
                    </CardTitle>
                    {f.description ? (
                      <p className="text-muted-foreground line-clamp-1 text-sm">{f.description}</p>
                    ) : null}
                    <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5 text-xs">
                      <Layers className="h-3.5 w-3.5" />
                      {f.deckCount} {f.deckCount === 1 ? 'deck' : 'decks'}
                    </p>
                  </div>
                </Link>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingId(f.id)}
                    aria-label="Edit folder"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingFolder({ id: f.id, name: f.name })}
                    aria-label="Delete folder"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
              <FolderTree className="h-6 w-6" />
            </div>
            <div className="text-lg font-semibold">No folders yet</div>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create a folder to group related decks together.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create your first folder
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create-folder dialog. */}
      <FolderModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode={{
          kind: 'create',
          isPending: createFolder.isPending,
          onSubmit: (values) => createFolder.mutate(values),
        }}
      />

      {/* Edit-folder dialog (rendered when a row's pencil is clicked). */}
      {editing ? (
        <FolderModal
          open
          onOpenChange={(o) => (o ? null : setEditingId(null))}
          mode={{
            kind: 'edit',
            folder: {
              id: editing.id,
              name: editing.name,
              color: editing.color ?? null,
              description: editing.description ?? null,
            },
            isPending: updateFolder.isPending,
            onSubmit: (values) => updateFolder.mutate(values),
          }}
        />
      ) : null}

      <RequireNameConfirmationDialog
        open={deletingFolder !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingFolder(null);
        }}
        title="Delete this folder?"
        description="Decks inside this folder are not deleted; they will simply stop being grouped here. This action cannot be undone."
        confirmLabel="Folder"
        expectedName={deletingFolder?.name ?? ''}
        confirmActionLabel={deleteFolder.isPending ? 'Deleting...' : 'Delete folder'}
        isPending={deleteFolder.isPending}
        onConfirm={() => {
          if (!deletingFolder) return;
          deleteFolder.mutate({ id: deletingFolder.id });
        }}
      />
    </div>
  );
}
