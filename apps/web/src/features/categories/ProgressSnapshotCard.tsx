import { Card, CardContent } from '@/components/ui/card';

export function ProgressSnapshotCard({
  label,
  value,
  percentage,
  tone,
  percentageLabel,
  valueLabel,
}: {
  label: string;
  value: number;
  percentage?: number;
  tone: 'slate' | 'amber' | 'blue' | 'green';
  percentageLabel: string;
  valueLabel: string;
}) {
  const accentClass = {
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-200',
    amber: 'bg-[#D6D35F]/25 text-[#6F6B22] dark:text-[#F1EEA4]',
    blue: 'bg-[#D1CAEA]/35 text-[#5C527D] dark:text-[#EEEAF9]',
    green: 'bg-[#80B0E8]/30 text-[#24538E] dark:text-[#DCEBFB]',
  }[tone];

  return (
    <Card>
      <CardContent className="flex h-full items-start justify-between gap-4 p-5">
        <div className="flex h-full flex-col">
          <p className="text-muted-foreground text-sm">{label}</p>
          <div className="mt-auto flex flex-col">
            <p className="text-3xl font-semibold tracking-tight">{value}</p>
            {percentage !== undefined ? (
              <p className="text-muted-foreground text-sm">
                {percentage}% {percentageLabel}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">{valueLabel}</p>
            )}
          </div>
        </div>
        <div
          aria-hidden
          className={`flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold ${accentClass}`}
        >
          {percentage !== undefined ? `${percentage}%` : 'All'}
        </div>
      </CardContent>
    </Card>
  );
}
