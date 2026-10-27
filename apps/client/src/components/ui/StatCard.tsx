import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type Tone = 'default' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet';

const ICON_TONE: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Short definition of the number (denominator, source) */
  hint?: ReactNode;
  icon?: ElementType;
  tone?: Tone;
  /** Draws attention when the number needs action (e.g. failures > 0) */
  highlight?: boolean;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', highlight, loading, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white px-4 py-4 min-w-0',
        highlight ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {Icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums break-words', highlight ? 'text-rose-700' : 'text-slate-900')}>
        {loading ? <div className="h-7 w-16 skeleton" aria-label="Loading" /> : value}
      </div>
      {hint && <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}
