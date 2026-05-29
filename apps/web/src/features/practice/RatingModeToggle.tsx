'use client';

import { cn } from '@/lib/utils';
import { List } from 'lucide-react';

export type RatingMode = 'all' | 'basic' | 'advanced';

interface Props {
  value: RatingMode;
  onChange: (next: RatingMode) => void;
  className?: string;
}

const OPTIONS: { value: RatingMode; label: string; Icon?: typeof List }[] = [
  { value: 'all', label: 'All cards', Icon: List },
  { value: 'basic', label: 'Basic Rating' },
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
        const { Icon } = opt;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition',
              checked
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              checked && opt.value === 'all' && 'text-primary',
            )}
          >
            {Icon && <Icon className={cn('h-3.5 w-3.5', checked && 'fill-current')} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
