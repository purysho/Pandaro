import { useMemo } from 'react';
import { lastNDateKeys } from '../../domain/stats/dates';
import {
  activeDays,
  dailySeries,
  focusOutcomes,
  longestFocus,
  monthFocusMs,
  recentSessions,
  tasksDoneInRange,
  type DaySummary,
} from '../../domain/stats/metrics';
import type { SessionRecord } from '../../domain/timer/types';
import { useHistory } from '../../state/historyStore';
import { useTasks } from '../../state/taskStore';
import { KIND_LABEL } from '../../state/timerStore';
import { Icon, type IconName } from '../components/Icon';
import { formatDay, formatDuration, formatTime } from '../format';
import { useLiveFocus, useSecond } from '../hooks/useToday';

export function StatsPanel() {
  const sessions = useHistory((s) => s.sessions);
  const tasks = useTasks((s) => s.tasks);
  const live = useLiveFocus();
  const second = useSecond();
  const minute = Math.floor(second / 60_000) * 60_000;

  const data = useMemo(() => {
    const week = dailySeries(sessions, minute, 7, live);
    const weekDates = new Set(week.map((d) => d.date));
    const heat = dailySeries(sessions, minute, 84, live);
    return {
      week,
      heat,
      weekMs: week.reduce((a, d) => a + d.focusMs, 0),
      weekSessions: week.reduce((a, d) => a + d.completed, 0),
      monthMs: monthFocusMs(sessions, minute, live),
      weekTasks: tasksDoneInRange(tasks, weekDates),
      outcomes: focusOutcomes(sessions, new Set(lastNDateKeys(minute, 30))),
      longest: longestFocus(sessions),
      active28: activeDays(sessions, minute, 28),
      recent: recentSessions(sessions, 8),
    };
  }, [sessions, tasks, live, minute]);

  const empty = sessions.length === 0;

  return (
    <section aria-labelledby="stats-heading" className="flex flex-col gap-5">
      <h2 id="stats-heading" className="text-2xl font-bold">
        Statistics
      </h2>
      {empty && (
        <p className="rounded-2xl border-[1.5px] border-dashed border-line px-4 py-6 text-center text-muted">
          Complete your first focus session and your progress will appear here.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Tile icon="timer" label="Focus this week" value={formatDuration(data.weekMs)} />
        <Tile icon="pomodoro" label="Sessions this week" value={String(data.weekSessions)} />
        <Tile icon="chart" label="Focus this month" value={formatDuration(data.monthMs)} />
        <Tile icon="check" label="Tasks done this week" value={String(data.weekTasks)} />
      </dl>

      <WeekChart days={data.week} />
      <Heatmap days={data.heat} active28={data.active28} />

      <div className="rounded-2xl bg-surface-2 p-4">
        <h3 className="text-lg font-bold">Last 30 days</h3>
        <ul className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Outcome label="Completed" value={data.outcomes.completed} shape="●" />
          <Outcome label="Interrupted" value={data.outcomes.interrupted} shape="◐" />
          <Outcome label="Skipped" value={data.outcomes.skipped} shape="○" />
        </ul>
        <p className="mt-3 text-sm text-muted">
          Scheduled focus {formatDuration(data.outcomes.plannedMs)} · actual focus{' '}
          {formatDuration(data.outcomes.actualMs)}
          {data.longest && (
            <>
              <br />
              Longest focus session: {formatDuration(data.longest.actualMs)}
            </>
          )}
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold">Recent sessions</h3>
        {data.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No sessions yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {data.recent.map((s) => (
              <RecentRow key={s.id} session={s} />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted">
        Sessions count on the day they finish. Focus time includes interrupted and skipped focus,
        split at midnight across days.
      </p>
    </section>
  );
}

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3.5">
      <dt className="flex items-center gap-1.5 text-sm text-muted">
        <Icon name={icon} size={16} />
        {label}
      </dt>
      <dd className="tabular font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}

function Outcome({ label, value, shape }: { label: string; value: number; shape: string }) {
  return (
    <li className="rounded-xl bg-surface px-2 py-2">
      <span aria-hidden="true" className="text-focus">
        {shape}
      </span>
      <span className="block tabular font-display text-xl font-bold">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </li>
  );
}

function WeekChart({ days }: { days: DaySummary[] }) {
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

function Heatmap({ days, active28 }: { days: DaySummary[]; active28: number }) {
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

function RecentRow({ session }: { session: SessionRecord }) {
  const label =
    session.outcome === 'completed'
      ? 'Completed'
      : session.outcome === 'skipped'
        ? 'Skipped'
        : 'Interrupted';
  const mark = session.outcome === 'completed' ? '●' : session.outcome === 'skipped' ? '○' : '◐';
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          style={{
            color:
              session.kind === 'focus'
                ? 'var(--focus)'
                : session.kind === 'short'
                  ? 'var(--short)'
                  : 'var(--long)',
          }}
        >
          {mark}
        </span>
        <span className="font-semibold">{KIND_LABEL[session.kind]}</span>
        <span className="text-muted">{label}</span>
      </span>
      <span className="tabular text-muted">
        {formatDuration(session.actualMs)} · {formatTime(session.endedAt)}
      </span>
    </li>
  );
}
