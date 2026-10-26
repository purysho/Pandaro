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
} from '../../domain/stats/metrics';
import { useHistory } from '../../state/historyStore';
import { useTasks } from '../../state/taskStore';
import { formatDuration } from '../format';
import { useLiveFocus, useSecond } from '../hooks/useToday';
import { Heatmap } from './Heatmap';
import { RecentRow } from './RecentRow';
import { Outcome, Tile } from './StatTiles';
import { WeekChart } from './WeekChart';

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

      <dl className="stat-tiles grid grid-cols-2 gap-3">
        <Tile icon="timer" label="Focus this week" value={formatDuration(data.weekMs)} />
        <Tile icon="pomodoro" label="Sessions this week" value={String(data.weekSessions)} />
        <Tile icon="chart" label="Focus this month" value={formatDuration(data.monthMs)} />
        <Tile icon="check" label="Tasks done this week" value={String(data.weekTasks)} />
      </dl>

      <div className="two-up grid gap-5">
        <WeekChart days={data.week} />
        <Heatmap days={data.heat} active28={data.active28} />
      </div>

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
