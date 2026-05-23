'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DECK_FOLDER_COLOR_PALETTE, GroupCreateInput, GroupUpdateInput } from '@ensemble/types';
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

/**
 * Create/edit dialog for a Group. Structurally identical to FolderModal —
 * a Group and a Folder have the same `name / color / description` shape on
 * the surface; the difference is server-side (members, invites, etc.).
 *
 * We deliberately don't try to share a component with FolderModal because
 * the two will probably diverge over time (e.g., a Group might grow
 * default-role or invite-policy fields later), and a shared wrapper would
 * make adding those harder.
 */
export type GroupModalMode =
  | {
      kind: 'create';
      onSubmit: (values: GroupCreateInput) => void;
      isPending: boolean;
    }
  | {
      kind: 'edit';
      group: {
        id: string;
        name: string;
        color: string | null;
        description: string | null;
      };
      onSubmit: (values: GroupUpdateInput) => void;
      isPending: boolean;
    };

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode: GroupModalMode;
}

export function GroupModal({ open, onOpenChange, mode }: Props) {
  const isEdit = mode.kind === 'edit';

  const form = useForm<GroupCreateInput>({
    resolver: zodResolver(GroupCreateInput),
    defaultValues: {
      name: '',
      color: DECK_FOLDER_COLOR_PALETTE[0],
      description: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      form.reset({
        name: mode.group.name,
        color: mode.group.color ?? DECK_FOLDER_COLOR_PALETTE[0],
        description: mode.group.description ?? '',
      });
    } else {
      form.reset({
        name: '',
        color: DECK_FOLDER_COLOR_PALETTE[0],
        description: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode.kind, isEdit ? mode.group.id : null]);

  const selectedColor = form.watch('color') ?? DECK_FOLDER_COLOR_PALETTE[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit group' : 'Create a group'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the group name, color, or description.'
              : 'Groups let you share decks with other people. Members can add their own decks and cards.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            const description = values.description?.trim() ? values.description.trim() : null;
            if (mode.kind === 'edit') {
              mode.onSubmit({
                id: mode.group.id,
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
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              placeholder="e.g. French class — Spring '26"
              {...form.register('name')}
            />
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
            <Label htmlFor="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              rows={3}
              placeholder="What's this group for?"
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
                  : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
