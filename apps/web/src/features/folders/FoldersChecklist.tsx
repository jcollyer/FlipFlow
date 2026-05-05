'use client';

import { FolderTree } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';

/**
 * Reusable "Folders" checkbox dropdown for the deck create / edit modals.
 * Pure presentational — parent owns the selected-id state. Rendered as a
 * dropdown so it stays compact even when the user has lots of folders.
 *
 * Caller is responsible for hiding this entirely when there are no folders;
 * we keep this component dumb so the parent can decide whether to show it.
 */
export function FoldersChecklist({
  folders,
  selected,
  onChange,
}: {
  folders: Array<{ id: string; name: string; color: string | null }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const selectedSet = new Set(selected);
  const label =
    selected.length === 0
      ? 'No folders selected'
      : selected.length === 1
        ? '1 folder'
        : `${selected.length} folders`;

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Folders (optional)</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span>{label}</span>
            <FolderTree className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-60 w-[--radix-dropdown-menu-trigger-width] overflow-y-auto"
          align="start"
        >
          <DropdownMenuLabel>Add to folders</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {folders.map((f) => (
            <DropdownMenuCheckboxItem
              key={f.id}
              checked={selectedSet.has(f.id)}
              // Keep the menu open after a click so users can toggle several.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(f.id)}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: f.color ?? '#94a3b8' }}
                />
                <span className="truncate">{f.name}</span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
