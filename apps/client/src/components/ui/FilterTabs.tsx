import { cn } from '@/lib/cn';

export interface FilterTabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  tone?: 'default' | 'danger';
}

interface FilterTabsProps<T extends string> {
  options: FilterTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Segmented filter control: scrolls horizontally on narrow screens instead of wrapping. */
export function FilterTabs<T extends string>({ options, value, onChange, ariaLabel, className }: FilterTabsProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex max-w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-lg bg-slate-100 p-1 text-xs font-semibold', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        const danger = o.tone === 'danger';
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors',
              active
                ? danger
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white text-indigo-700 shadow-sm'
                : danger
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1 tabular-nums opacity-75">({o.count.toLocaleString()})</span>}
          </button>
        );
      })}
    </div>
  );
}
