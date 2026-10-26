import { type DaySummary } from '../../domain/stats/metrics';
import { formatDay } from '../format';

export function WeekChart({ days }: { days: DaySummary[] }) {
  const maxMin = Math.max(30, ...days.map((d) => d.focusMs / 60_000));
  const step = maxMin > 180 ? 60 : maxMin > 90 ? 30 : 15;
  const top = Math.ceil(maxMin / step) * step;
  const W = 320;
  const H = 150;
  const left = 30;
  const bottom = 22;
  const plotH = H - bottom - 8;
  const barW = (W - left) / days.length;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  return (
    <figure className="rounded-2xl bg-surface-2 p-4">
      <figcaption className="text-lg font-bold">Focus minutes, last 7 days</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={days
          .map((d) => `${formatDay(d.date, 'long')}: ${Math.round(d.focusMs / 60_000)} minutes`)
          .join('; ')}
      >
        {ticks.map((t) => {
          const y = 8 + plotH - (t / top) * plotH;
          return (
            <g key={t}>
              <line
                x1={left}
                x2={W}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth={0.75}
                strokeDasharray={t === 0 ? undefined : '2 3'}
              />
              <text x={left - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
                {t}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const min = d.focusMs / 60_000;
          const h = (min / top) * plotH;
          const x = left + i * barW + barW * 0.2;
          const isToday = i === days.length - 1;
          return (
            <g key={d.date}>
              {h > 0 && (
                <rect
                  x={x}
                  y={8 + plotH - h}
                  width={barW * 0.6}
                  height={h}
                  rx={4}
                  fill={isToday ? 'var(--focus)' : 'var(--bamboo)'}
                />
              )}
              <text
                x={x + barW * 0.3}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-muted)"
                fontWeight={isToday ? 700 : 400}
              >
                {formatDay(d.date)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
