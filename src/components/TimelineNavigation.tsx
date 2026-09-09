import { useMemo } from 'react';

export type MonthGroup = {
  key: string;
  label: string;
  year: number;
  month: number;
  itemCount: number;
};

export function groupByMonth<T extends { displayDate: number }>(items: T[]): MonthGroup[] {
  const groups = new Map<string, { key: string; label: string; year: number; month: number; itemCount: number }>();
  for (const item of items) {
    const d = new Date(item.displayDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = groups.get(key) ?? {
      key,
      label: `${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      year: d.getFullYear(),
      month: d.getMonth(),
      itemCount: 0,
    };
    existing.itemCount += 1;
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function TimelineNavigation({
  months,
  activeMonth,
  onSelect,
}: {
  months: MonthGroup[];
  activeMonth: string | undefined;
  onSelect: (key: string) => void;
}) {
  const yearLabels = useMemo(() => {
    const years = [...new Set(months.map(m => m.year))];
    return years.sort((a, b) => b - a);
  }, [months]);

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav aria-label="Timeline navigation" className="hidden lg:block">
        <div className="space-y-1">
          {yearLabels.map(year => (
            <div key={year}>
              <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {year}
              </p>
              {months
                .filter(m => m.year === year)
                .map(month => (
                  <button
                    key={month.key}
                    onClick={() => onSelect(month.key)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                      activeMonth === month.key
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeMonth === month.key ? 'bg-primary' : 'bg-border'}`}
                    />
                    {month.label}
                  </button>
                ))}
            </div>
          ))}
          {months.length === 0 && <p className="px-2 text-xs text-muted-foreground">No items</p>}
        </div>
      </nav>

      {/* Mobile/Tablet: horizontal pill strip */}
      <nav aria-label="Timeline navigation" className="lg:hidden">
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {months.map(month => (
            <button
              key={month.key}
              onClick={() => onSelect(month.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors whitespace-nowrap ${
                activeMonth === month.key
                  ? 'bg-primary text-primary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              {month.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
