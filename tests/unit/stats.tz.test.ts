import { describe, expect, it } from 'vitest';
import { allocateByDate } from '../../src/domain/stats/allocate';
import {
  dateKey,
  lastNDateKeys,
  nextLocalMidnight,
  startOfLocalDay,
} from '../../src/domain/stats/dates';
import {
  activeDays,
  dailySeries,
  focusOutcomes,
  longestFocus,
  monthFocusMs,
  recentSessions,
  tasksDoneInRange,
  todaySummary,
  totalCompletedFocus,
} from '../../src/domain/stats/metrics';
import type { SessionRecord } from '../../src/domain/timer/types';
import type { Task } from '../../src/domain/tasks/types';

const MIN = 60_000;
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

function focus(
  id: string,
  start: number,
  end: number,
  outcome: SessionRecord['outcome'] = 'completed',
): SessionRecord {
  return {
    id,
    kind: 'focus',
    outcome,
    plannedMs: 25 * MIN,
    actualMs: end - start,
    segments: [{ start, end }],
    startedAt: start,
    endedAt: end,
    taskId: null,
    cycleIndex: 0,
  };
}

function task(id: string, doneAt: number | null): Task {
  return {
    id,
    title: id,
    notes: '',
    estimate: null,
    completedPomodoros: 0,
    done: doneAt !== null,
    doneAt,
    createdAt: 0,
    updatedAt: 0,
    order: 1,
  };
}

describe(`date helpers in ${process.env.TZ}`, () => {
  it('keys a local time to its local date', () => {
    expect(dateKey(local(2026, 3, 9, 23, 59))).toBe('2026-03-09');
    expect(dateKey(local(2026, 3, 10, 0, 0))).toBe('2026-03-10');
  });

  it('finds local midnight boundaries', () => {
    const t = local(2026, 7, 4, 15);
    expect(startOfLocalDay(t)).toBe(local(2026, 7, 4));
    expect(nextLocalMidnight(t)).toBe(local(2026, 7, 5));
  });

  it('lists consecutive dates across month ends', () => {
    expect(lastNDateKeys(local(2026, 3, 2, 12), 3)).toEqual([
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});

describe(`midnight and DST allocation in ${process.env.TZ}`, () => {
  it('splits a session spanning midnight across both dates', () => {
    const start = local(2026, 10, 25, 23, 50);
    const end = local(2026, 10, 26, 0, 15);
    const map = allocateByDate([{ start, end }]);
    expect(map.get('2026-10-25')).toBe(10 * MIN);
    expect(map.get('2026-10-26')).toBe(15 * MIN);
  });

  it('counts the completed session on its completion date', () => {
    const s = focus('a', local(2026, 10, 25, 23, 50), local(2026, 10, 26, 0, 15));
    const today = todaySummary([s], [], local(2026, 10, 26, 9));
    expect(today.completed).toBe(1);
    expect(today.focusMs).toBe(15 * MIN);
    const yesterday = todaySummary([s], [], local(2026, 10, 25, 9));
    expect(yesterday.completed).toBe(0);
    expect(yesterday.focusMs).toBe(10 * MIN);
  });

  it('allocates whole days around daylight-saving transitions without loss', () => {
    // Covers the northern (March, November) and southern (April, October) transitions.
    for (const [m, d] of [
      [3, 8],
      [11, 1],
      [4, 5],
      [10, 4],
    ] as const) {
      const start = local(2026, m, d, 0);
      const end = local(2026, m, d + 1, 0);
      const map = allocateByDate([{ start, end }]);
      expect(map.size).toBe(1);
      expect(map.get(dateKey(start))).toBe(end - start);
    }
  });

  it('allocates a multi-day interval completely', () => {
    const start = local(2026, 1, 1, 12);
    const end = local(2026, 1, 4, 12);
    const map = allocateByDate([{ start, end }]);
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(end - start);
    expect(map.size).toBe(4);
  });

  it('ignores empty and inverted intervals', () => {
    expect(
      allocateByDate([
        { start: 10, end: 10 },
        { start: 20, end: 5 },
      ]).size,
    ).toBe(0);
  });
});

describe(`metrics in ${process.env.TZ}`, () => {
  const day = (d: number, h: number) => local(2026, 10, d, h);
  const sessions: SessionRecord[] = [
    focus('a', day(20, 9), day(20, 9) + 25 * MIN),
    focus('b', day(22, 9), day(22, 9) + 25 * MIN),
    focus('c', day(22, 10), day(22, 10) + 10 * MIN, 'interrupted'),
    focus('d', day(26, 9), day(26, 9) + 50 * MIN),
    focus('e', day(26, 11), day(26, 11) + 3 * MIN, 'skipped'),
    {
      ...focus('f', day(26, 12), day(26, 12) + 5 * MIN),
      kind: 'short',
    },
  ];
  const now = day(26, 18);

  it('summarises today including a live interval', () => {
    const t = todaySummary(
      sessions,
      [task('x', day(26, 8)), task('y', day(25, 8)), task('z', null)],
      now,
      [{ start: day(26, 17), end: day(26, 17) + 5 * MIN }],
    );
    expect(t).toEqual({ completed: 1, focusMs: 58 * MIN, tasksDone: 1 });
  });

  it('builds a 7-day series oldest first', () => {
    const series = dailySeries(sessions, now, 7);
    expect(series.map((d) => d.date)).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
    expect(series[2]).toEqual({ date: '2026-10-22', focusMs: 35 * MIN, completed: 1 });
    expect(series[1]?.focusMs).toBe(0);
  });

  it('totals the calendar month', () => {
    expect(monthFocusMs(sessions, now)).toBe(25 * MIN + 35 * MIN + 53 * MIN);
    expect(monthFocusMs(sessions, local(2026, 11, 2, 9))).toBe(0);
  });

  it('distinguishes outcomes and planned versus actual', () => {
    const dates = new Set(lastNDateKeys(now, 7));
    expect(focusOutcomes(sessions, dates)).toEqual({
      completed: 3,
      interrupted: 1,
      skipped: 1,
      plannedMs: 75 * MIN,
      actualMs: 113 * MIN,
    });
  });

  it('finds the longest focus, active days, totals and recent sessions', () => {
    expect(longestFocus(sessions)?.id).toBe('d');
    expect(longestFocus([])).toBeNull();
    expect(activeDays(sessions, now, 7)).toBe(3);
    expect(totalCompletedFocus(sessions)).toBe(3);
    expect(recentSessions(sessions, 2).map((s) => s.id)).toEqual(['f', 'e']);
    expect(
      tasksDoneInRange([task('x', day(26, 8)), task('y', day(1, 8))], new Set(['2026-10-26'])),
    ).toBe(1);
  });

  it('keeps history after the date changes', () => {
    const tomorrow = local(2026, 10, 27, 9);
    expect(todaySummary(sessions, [], tomorrow).completed).toBe(0);
    // The window 21–27 October no longer includes the session on the 20th.
    expect(dailySeries(sessions, tomorrow, 7).reduce((a, d) => a + d.completed, 0)).toBe(2);
    expect(dailySeries(sessions, tomorrow, 8).reduce((a, d) => a + d.completed, 0)).toBe(3);
  });
});
