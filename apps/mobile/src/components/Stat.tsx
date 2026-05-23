import { Text } from 'react-native';

import { Card } from './Card';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export type StatTone = 'slate' | 'amber' | 'blue' | 'green';

/**
 * Background and text colors mirror the web ProgressSnapshotCard palette.
 * Dark-mode variants are omitted (not applicable on mobile).
 *
 *   slate  → Total
 *   amber  → Challenging
 *   blue   → Good
 *   green  → Easy
 */
const STAT_PALETTE: Record<StatTone, { bg: string; text: string; labelColor: string }> = {
  slate: { bg: 'rgba(100, 116, 139, 0.10)', text: '#334155', labelColor: '#64748b' },
  amber: { bg: 'rgba(214, 211, 95,  0.25)', text: '#6F6B22', labelColor: '#9A9535' },
  blue: { bg: 'rgba(209, 202, 234, 0.35)', text: '#5C527D', labelColor: '#7A6F9A' },
  green: { bg: 'rgba(128, 176, 232, 0.30)', text: '#24538E', labelColor: '#4A7AAF' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  label: string;
  value: number;
  tone: StatTone;
}

/**
 * Single stat box used on the home screen (global stats) and the deck detail
 * page (per-deck stats). Label sits at the top, number anchored to the
 * bottom, card background tinted with the web palette colour for that stat.
 */
export function Stat({ label, value, tone }: Props) {
  const { bg, text, labelColor } = STAT_PALETTE[tone];
  return (
    <Card className="flex-1 justify-between p-3" style={{ backgroundColor: bg, minHeight: 80 }}>
      <Text
        style={{
          color: labelColor,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: text, fontSize: 24, fontWeight: 'bold', lineHeight: 30 }}>{value}</Text>
    </Card>
  );
}
