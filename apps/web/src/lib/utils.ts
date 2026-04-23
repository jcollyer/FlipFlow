import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
