'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FolderPlus, FolderTree, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { FolderModal } from '@/features/folders/FolderModal';

interface Props {
  /** Source deck the user is importing from the public library. */
  deck: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

/**
 * "Import deck" dialog launched from the public library on /app/more.
 *
 * Shows the current user's folders as a single-select radio list and copies
 * the source deck (with all of its cards) into the chosen folder via
 * `categories.importPublic`. On success, navigates the user to the new deck.
 *
 * If the user has no folders yet, renders an empty state with an inline
 * "Create folder" CTA — they shouldn't have to leave the dialog to continue.
 */
export function ImportDeckModal({ deck, open, onOpenChange }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Only fetch the folder list while the dialog is open so we get fresh data
  // each time (and don't hold a stale snapshot if the user creates folders
  // elsewhere). `enabled: open` is the cheap version of refetch-on-open.
  const foldersQuery = trpc.folders.list.useQuery(undefined, { enabled: open });
  const folders = foldersQuery.data ?? [];

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset selection / error whenever the dialog is reopened (or the source
  // deck changes). Keeps stale state from leaking across imports.
  useEffect(() => {
    if (open) {
      setSelectedFolderId(null);
      setErrorMessage(null);
    }
  }, [open, deck?.id]);

  const importMutation = trpc.categories.importPublic.useMutation({
    onSuccess: async (result) => {
      // Refresh every list that now contains the new deck so the user sees
      // it immediately if they navigate back.
      await Promise.all([
        utils.categories.list.invalidate(),
        utils.folders.list.invalidate(),
        selectedFolderId
          ? utils.folders.byId.invalidate({ id: selectedFolderId })
          : Promise.resolve(),
        utils.flashcards.listAll.invalidate(),
      ]);
      onOpenChange(false);
      router.push(`/app/categories/${result.id}`);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to import deck. Please try again.');
    },
  });

  const createFolderMutation = trpc.folders.create.useMutation({
    onSuccess: async (folder) => {
      await utils.folders.list.invalidate();
      setCreateFolderOpen(false);
      // Pre-select the just-created folder so the user can hit Import next.
      setSelectedFolderId(folder.id);
    },
  });

  const isPending = importMutation.isPending;
  const canSubmit = selectedFolderId !== null && deck !== null && !isPending;

  function handleSubmit() {
    if (!deck || !selectedFolderId) return;
    setErrorMessage(null);
    importMutation.mutate({
      sourceCategoryId: deck.id,
      folderId: selectedFolderId,
    });
  }

  return (
    <>
      <Dialog
        open={open}
        // Prevent close-while-importing so we don't navigate away from a
        // pending mutation. Otherwise the user could dismiss the dialog
        // mid-copy and miss the redirect.
        onOpenChange={(next) => {
          if (isPending) return;
          onOpenChange(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import deck</DialogTitle>
            <DialogDescription>
              {deck ? (
                <>
                  Copy <span className="font-medium">{deck.name}</span> into one of your folders.
                  The new deck will be private to you.
                </>
              ) : (
                'Copy this deck into one of your folders.'
              )}
            </DialogDescription>
          </DialogHeader>

          {foldersQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-muted/50 h-12 animate-pulse rounded-md border" />
              ))}
            </div>
          ) : folders.length === 0 ? (
            // Empty state — the user has no folders yet. Surface a primary
            // CTA right inside the dialog so they don't have to bounce out to
            // /app/folders and lose their place.
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
              <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
                <FolderTree className="h-6 w-6" />
              </div>
              <div className="text-base font-semibold">You need a folder first</div>
              <p className="text-muted-foreground max-w-xs text-sm">
                Imported decks are saved into a folder. Create one to continue.
              </p>
              <Button onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Create a folder
              </Button>
            </div>
          ) : (
            // Radio-row list. Constrained height so very long folder lists
            // stay inside the dialog and scroll instead of pushing the
            // footer off-screen.
            <div
              role="radiogroup"
              aria-label="Choose a folder"
              className="max-h-72 space-y-2 overflow-y-auto pr-1"
            >
              {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/40 hover:bg-muted/50'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? 'border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {isSelected ? (
                        <span className="bg-primary h-2 w-2 rounded-full" />
                      ) : null}
                    </span>
                    <span
                      aria-hidden
                      className="h-6 w-6 shrink-0 rounded-md"
                      style={{ backgroundColor: folder.color ?? '#94a3b8' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{folder.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {folder.deckCount} {folder.deckCount === 1 ? 'deck' : 'decks'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {errorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                'Import'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Nested create-folder dialog used only when the user hits the empty-state
        CTA. We keep the import dialog mounted in the background so the user
        returns to it (with the new folder pre-selected) after creating one.
      */}
      <FolderModal
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        mode={{
          kind: 'create',
          isPending: createFolderMutation.isPending,
          onSubmit: (values) => createFolderMutation.mutate(values),
        }}
      />
    </>
  );
}
