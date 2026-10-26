import { type DaySummary } from '../../domain/stats/metrics';

export function Heatmap({ days, active28 }: { days: DaySummary[]; active28: number }) {
  // 12 columns (weeks) × 7 rows, oldest first.
  const max = Math.max(1, ...days.map((d) => d.completed));
  const cell = 14;
  const gap = 3;
  const levels = [
    'var(--surface)',
    'color-mix(in oklab, var(--bamboo) 35%, var(--surface))',
    'color-mix(in oklab, var(--bamboo) 65%, var(--surface))',
    'var(--bamboo)',
    'var(--focus)',
  ];
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <figure className="rounded-2xl bg-surface-2 p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-lg font-bold">Consistency, 12 weeks</span>
        <span className="text-sm text-muted">Active on {active28} of the last 28 days</span>
      </figcaption>
      <div className="mt-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${12 * (cell + gap)} ${7 * (cell + gap)}`}
          className="w-full max-w-md"
          role="img"
          aria-label={`Completed focus sessions per day for the last 12 weeks. ${days.filter((d) => d.completed > 0).length} active days.`}
        >
          {days.map((d, i) => (
            <rect
              key={d.date}
              x={Math.floor(i / 7) * (cell + gap)}
              y={(i % 7) * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={levels[level(d.completed)]}
              stroke="var(--line)"
              strokeWidth={d.completed === 0 ? 0.75 : 0}
            >
              <title>{`${d.date}: ${d.completed} session${d.completed === 1 ? '' : 's'}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </figure>
  );
}
