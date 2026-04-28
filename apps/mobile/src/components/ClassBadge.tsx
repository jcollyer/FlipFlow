import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { WORD_CLASS_OPTIONS } from '@flipflow/types';

/** Lookup of canonical value → human label. Built once at module load. */
const LABEL_BY_VALUE = new Map(WORD_CLASS_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Mobile counterpart of the web `ClassBadge` — small inline pill rendering a
 * flashcard's word class with a tag icon. Returns `null` when `value` is
 * empty so callers can drop it in unconditionally.
 *
 * Two visual sizes:
 *   - "sm" (default) — fits inside list-row meta footers.
 *   - "md" — slightly larger, for the practice card.
 */
export interface ClassBadgeProps {
  value: string | null | undefined;
  size?: 'sm' | 'md';
}

export function ClassBadge({ value, size = 'sm' }: ClassBadgeProps) {
  if (!value) return null;

  // Fall back to the raw value if a future class shows up that the client
  // doesn't know about — better than rendering nothing.
  const label = LABEL_BY_VALUE.get(value) ?? value;

  const isMd = size === 'md';
  const iconSize = isMd ? 14 : 11;
  // Match the web's muted gray. Slate-500 reads well on the slate-100 chip
  // and on the lighter card backgrounds used in practice mode.
  const color = '#64748b';

  return (
    <View
      className={
        isMd
          ? 'flex-row items-center gap-1 self-center rounded-sm bg-slate-100 px-2 py-0.5'
          : 'flex-row items-center gap-1 rounded-sm bg-slate-100 px-1.5 py-0.5'
      }
    >
      <Feather name="tag" size={iconSize} color={color} />
      <Text className={isMd ? 'text-sm text-slate-500' : 'text-xs text-slate-500'}>{label}</Text>
    </View>
  );
}
