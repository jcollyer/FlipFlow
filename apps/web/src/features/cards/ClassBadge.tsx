'use client';

import { Tag } from 'lucide-react';

import { WORD_CLASS_OPTIONS } from '@flipflow/types';
import { cn } from '@/lib/utils';

/** Lookup of canonical value → human label. Built once at module load. */
const LABEL_BY_VALUE = new Map(WORD_CLASS_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Small inline pill rendering a flashcard's word class (noun, verb, …) with
 * a tag icon. Renders nothing when `value` is null/undefined/empty so callers
 * can drop it in unconditionally.
 *
 * Two visual sizes:
 *   - "sm" (default) — fits inside list-row footers next to other muted chips.
 *   - "md" — slightly larger, for the practice card front face.
 */
export interface ClassBadgeProps {
  value: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

export function ClassBadge({ value, size = 'sm', className }: ClassBadgeProps) {
  if (!value) return null;

  // Fall back to the raw value if a future class shows up in the db that the
  // client doesn't know about yet — better than rendering nothing.
  const label = LABEL_BY_VALUE.get(value) ?? value;

  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-sm',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-sm',
        className,
      )}
    >
      <Tag className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
      {label}
    </span>
  );
}
