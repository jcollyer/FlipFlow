import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fisher–Yates shuffle. Returns a new array — does not mutate the input.
 * Used by the practice flow when the user selects "Shuffle" mode.
 */
export function shuffleArray<T>(input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Friendly relative date formatter, e.g. "in 3 days", "2 hours ago", "now". */
export function formatRelative(target: Date | null | undefined, now: Date = new Date()) {
  if (!target) return 'new';
  const diffMs = target.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes < 60) return fmt.format(Math.sign(diffMs) * minutes, 'minute');
  if (hours < 48) return fmt.format(Math.sign(diffMs) * hours, 'hour');
  return fmt.format(Math.sign(diffMs) * days, 'day');
}
