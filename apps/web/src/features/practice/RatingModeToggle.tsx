'use client';

import { cn } from '@/lib/utils';

export type RatingMode = 'basic' | 'advanced';

interface Props {
  value: RatingMode;
  onChange: (next: RatingMode) => void;
  className?: string;
}

const OPTIONS: { value: RatingMode; label: string }[] = [
  { value: 'basic', label: 'Rating' },
  { value: 'advanced', label: 'Advanced Rating' },
];

export function RatingModeToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Rating filter mode"
      className={cn(
        'bg-muted inline-flex items-center gap-0.5 rounded-full p-0.5 text-sm',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 font-medium transition',
              checked
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
