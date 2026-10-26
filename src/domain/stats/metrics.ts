import type { SessionRecord } from '../timer/types';
import type { Task } from '../tasks/types';
import { allocateByDate, type Interval } from './allocate';
import { dateKey, lastNDateKeys, monthKey } from './dates';

/*
 * Metric definitions (documented in ARCHITECTURE.md):
 * - Focus session: a focus record with outcome "completed", counted on the local date it ended.
 * - Focus time: actual running time of every focus record (completed, interrupted, skipped),
 *   split across local dates at midnight, plus the live session when supplied.
 * - Tasks completed: tasks whose `doneAt` falls on the local date. Reopening clears it.
 */

export interface DaySummary {
  date: string;
  focusMs: number;
  completed: number;
}

export interface TodaySummary {
  completed: number;
  focusMs: number;
  tasksDone: number;
}

function focusIntervals(sessions: readonly SessionRecord[], live: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const s of sessions) if (s.kind === 'focus') out.push(...s.segments);
  out.push(...live);
  return out;
}

function completedByDate(sessions: readonly SessionRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (s.kind !== 'focus' || s.outcome !== 'completed') continue;
    const key = dateKey(s.endedAt);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

export function todaySummary(
  sessions: readonly SessionRecord[],
  tasks: readonly Task[],
  now: number,
  live: readonly Interval[] = [],
): TodaySummary {
  const today = dateKey(now);
  const focus = allocateByDate(focusIntervals(sessions, live));
  return {
    completed: completedByDate(sessions).get(today) ?? 0,
    focusMs: focus.get(today) ?? 0,
    tasksDone: tasks.filter((t) => t.done && t.doneAt !== null && dateKey(t.doneAt) === today)
      .length,
  };
}

export function dailySeries(
  sessions: readonly SessionRecord[],
  now: number,
  days: number,
  live: readonly Interval[] = [],
): DaySummary[] {
  const focus = allocateByDate(focusIntervals(sessions, live));
  const completed = completedByDate(sessions);
  return lastNDateKeys(now, days).map((date) => ({
    date,
    focusMs: focus.get(date) ?? 0,
    completed: completed.get(date) ?? 0,
  }));
}

export function monthFocusMs(
  sessions: readonly SessionRecord[],
  now: number,
  live: readonly Interval[] = [],
): number {
  const month = monthKey(now);
  let total = 0;
  for (const [date, ms] of allocateByDate(focusIntervals(sessions, live))) {
    if (date.startsWith(month)) total += ms;
  }
  return total;
}

export function tasksDoneInRange(tasks: readonly Task[], dates: ReadonlySet<string>): number {
  return tasks.filter((t) => t.done && t.doneAt !== null && dates.has(dateKey(t.doneAt))).length;
}

export function longestFocus(sessions: readonly SessionRecord[]): SessionRecord | null {
  let best: SessionRecord | null = null;
  for (const s of sessions) {
    if (s.kind !== 'focus') continue;
    if (!best || s.actualMs > best.actualMs) best = s;
  }
  return best;
}

export interface OutcomeBreakdown {
  completed: number;
  interrupted: number;
  skipped: number;
  plannedMs: number;
  actualMs: number;
}

/** Focus outcomes for records that ended on one of `dates`. */
export function focusOutcomes(
  sessions: readonly SessionRecord[],
  dates: ReadonlySet<string>,
): OutcomeBreakdown {
  const out: OutcomeBreakdown = {
    completed: 0,
    interrupted: 0,
    skipped: 0,
    plannedMs: 0,
    actualMs: 0,
  };
  for (const s of sessions) {
    if (s.kind !== 'focus' || !dates.has(dateKey(s.endedAt))) continue;
    out[s.outcome] += 1;
    out.actualMs += s.actualMs;
    if (s.outcome === 'completed') out.plannedMs += s.plannedMs;
  }
  return out;
}

/** Days in the window with at least one completed focus session. */
export function activeDays(sessions: readonly SessionRecord[], now: number, days: number): number {
  const completed = completedByDate(sessions);
  return lastNDateKeys(now, days).filter((d) => (completed.get(d) ?? 0) > 0).length;
}

export function totalCompletedFocus(sessions: readonly SessionRecord[]): number {
  return sessions.filter((s) => s.kind === 'focus' && s.outcome === 'completed').length;
}

export function recentSessions(sessions: readonly SessionRecord[], limit: number): SessionRecord[] {
  return [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
}
