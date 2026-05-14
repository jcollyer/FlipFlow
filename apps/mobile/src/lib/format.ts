/**
 * Shared formatting helpers. Kept minimal so the mobile app doesn't pull in
 * date-fns just for one relative-time string.
 */

/**
 * Fisher–Yates shuffle. Returns a new array — does not mutate the input.
 * Used by the practice flow when the user picks "Shuffle" mode.
 */
export function shuffleArray<T>(input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return 'Never reviewed';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60_000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffMin) < 60) {
    if (diffMin === 0) return 'now';
    return diffMin > 0 ? `in ${diffMin}m` : `${-diffMin}m ago`;
  }
  if (Math.abs(diffHr) < 24) {
    return diffHr > 0 ? `in ${diffHr}h` : `${-diffHr}h ago`;
  }
  return diffDay > 0 ? `in ${diffDay}d` : `${-diffDay}d ago`;
}
