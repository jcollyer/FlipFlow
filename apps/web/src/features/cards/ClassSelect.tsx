'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { WORD_CLASS_OPTIONS } from '@flipflow/types';
import { cn } from '@/lib/utils';

/**
 * Sentinel for "no class selected" — Radix Select can't bind to empty
 * strings or null. Map to/from `null` at the edges.
 */
export const NO_CLASS = '__none__';

/**
 * Dropdown for picking a word class (noun, verb, etc.) on a flashcard.
 *
 * Each option in the open menu shows the label on the first line and a
 * smaller, gray description beneath it. The trigger only shows the label
 * (via Radix's `ItemText`), so the description doesn't bleed into the
 * collapsed control.
 *
 * Selecting a class is optional — the menu always includes a "None" entry,
 * which the parent can map back to `null` before submitting.
 */
export interface ClassSelectProps {
  /** The currently-selected class value, or `null` for "none". */
  value: string | null;
  onChange: (next: string | null) => void;
  id?: string;
  /** When true, renders the trigger in a disabled / read-only style. */
  disabled?: boolean;
}

export function ClassSelect({ value, onChange, id, disabled }: ClassSelectProps) {
  return (
    <SelectPrimitive.Root
      value={value ?? NO_CLASS}
      onValueChange={(v) => onChange(v === NO_CLASS ? null : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        )}
      >
        <SelectPrimitive.Value placeholder="None" />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          )}
        >
          <SelectPrimitive.Viewport className="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] p-1">
            <ClassSelectItem value={NO_CLASS} label="None" description="No part of speech." />
            {WORD_CLASS_OPTIONS.map((opt) => (
              <ClassSelectItem
                key={opt.value}
                value={opt.value}
                label={opt.label}
                description={opt.description}
              />
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/**
 * Single dropdown row. We use Radix's `ItemText` only for the bold label so
 * the trigger / collapsed value stays compact; the description sits as a
 * sibling node and is shown only inside the open menu.
 */
function ClassSelectItem({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        'relative flex w-full cursor-default select-none flex-col items-start rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      )}
    >
      <span className="absolute left-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
      <span className="text-xs text-muted-foreground">{description}</span>
    </SelectPrimitive.Item>
  );
}
