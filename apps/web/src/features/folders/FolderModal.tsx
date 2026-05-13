'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DECK_FOLDER_COLOR_PALETTE, FolderCreateInput, FolderUpdateInput } from '@ensemble/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type FolderModalMode =
  | {
      kind: 'create';
      onSubmit: (values: FolderCreateInput) => void;
      isPending: boolean;
    }
  | {
      kind: 'edit';
      folder: {
        id: string;
        name: string;
        color: string | null;
        description: string | null;
      };
      onSubmit: (values: FolderUpdateInput) => void;
      isPending: boolean;
    };

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: FolderModalMode;
}

/**
 * Shared modal for creating and editing a folder. Handles the form state and
 * the color picker; the parent passes in onSubmit so it can wire up the
 * appropriate trpc mutation and any post-save side effects (navigation,
 * cache invalidation, toast, etc.).
 */
export function FolderModal({ open, onOpenChange, mode }: Props) {
  const isEdit = mode.kind === 'edit';

  // We use the create schema for both flows: edit just sends the optional
  // `id` along with the same fields. Reusing one form keeps the UI logic in
  // one place; we map the values to the right input shape on submit.
  const form = useForm<FolderCreateInput>({
    resolver: zodResolver(FolderCreateInput),
    defaultValues: {
      name: '',
      color: DECK_FOLDER_COLOR_PALETTE[0],
      description: '',
    },
  });

  // When the dialog opens (or switches between create/edit), reset the form
  // to the right defaults so we never show stale state.
  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      form.reset({
        name: mode.folder.name,
        color: mode.folder.color ?? DECK_FOLDER_COLOR_PALETTE[0],
        description: mode.folder.description ?? '',
      });
    } else {
      form.reset({
        name: '',
        color: DECK_FOLDER_COLOR_PALETTE[0],
        description: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode.kind, isEdit ? mode.folder.id : null]);

  const selectedColor = form.watch('color') ?? DECK_FOLDER_COLOR_PALETTE[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit folder' : 'Create a folder'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the folder name, color, or description.'
              : 'Group decks together for better organization.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            const description = values.description?.trim() ? values.description.trim() : null;
            if (mode.kind === 'edit') {
              mode.onSubmit({
                id: mode.folder.id,
                name: values.name,
                color: values.color ?? null,
                description,
              });
            } else {
              mode.onSubmit({
                name: values.name,
                color: values.color ?? null,
                description,
              });
            }
          })}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input id="folder-name" placeholder="e.g. Languages" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {DECK_FOLDER_COLOR_PALETTE.map((color) => {
                const selected = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => form.setValue('color', color, { shouldDirty: true })}
                    className={`h-8 w-8 rounded-md ring-offset-2 transition ${selected ? 'ring-ring ring-2' : ''}`}
                    style={{ backgroundColor: color }}
                    aria-label={`Color ${color}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-description">Description (optional)</Label>
            <Textarea
              id="folder-description"
              rows={3}
              placeholder="What's in this folder?"
              {...form.register('description')}
            />
            {form.formState.errors.description ? (
              <p className="text-destructive text-sm">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mode.isPending}>
              {mode.isPending
                ? isEdit
                  ? 'Saving…'
                  : 'Creating…'
                : isEdit
                  ? 'Save'
                  : 'Create folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
