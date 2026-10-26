import { describe, expect, it } from 'vitest';
import {
  normalizeEstimate,
  normalizeNotes,
  normalizeTitle,
  orderAtEnd,
  reorder,
  setDone,
  sortTasks,
  visibleTasks,
} from '../../src/domain/tasks/rules';
import type { Task } from '../../src/domain/tasks/types';
import {
  deriveGarden,
  MAX_STALKS,
  SEGMENTS_PER_STALK,
  UNLOCKS,
} from '../../src/domain/garden/garden';

const t = (id: string, order: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  notes: '',
  estimate: null,
  completedPomodoros: 0,
  done: false,
  doneAt: null,
  createdAt: order,
  order,
  ...extra,
});

describe('task normalisation', () => {
  it('collapses whitespace and limits length', () => {
    expect(normalizeTitle('  write   the  report \n')).toBe('write the report');
    expect(normalizeTitle('x'.repeat(500))).toHaveLength(200);
    expect(normalizeNotes('  hi  ')).toBe('hi');
  });

  it('clamps estimates', () => {
    expect(normalizeEstimate(null)).toBeNull();
    expect(normalizeEstimate(Number.NaN)).toBeNull();
    expect(normalizeEstimate(0)).toBeNull();
    expect(normalizeEstimate(2.6)).toBe(3);
    expect(normalizeEstimate(99)).toBe(20);
  });
});

describe('ordering and filtering', () => {
  const tasks = [
    t('c', 3),
    t('a', 1),
    t('b', 2, { done: true, doneAt: 5 }),
    t('d', 4, { done: true, doneAt: 9 }),
  ];

  it('sorts by rank', () => {
    expect(sortTasks(tasks).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters active, done and all', () => {
    expect(visibleTasks(tasks, 'active').map((x) => x.id)).toEqual(['a', 'c']);
    expect(visibleTasks(tasks, 'done').map((x) => x.id)).toEqual(['d', 'b']);
    expect(visibleTasks(tasks, 'all').map((x) => x.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('appends at the end', () => {
    expect(orderAtEnd(tasks)).toBe(5);
    expect(orderAtEnd([])).toBe(1);
  });

  it('moves a task with a single rank change', () => {
    const list = [t('a', 1), t('b', 2), t('c', 3)];
    expect(reorder(list, 'c', 0)).toEqual([{ ...list[2], order: 0 }]);
    expect(reorder(list, 'a', 2)).toEqual([{ ...list[0], order: 4 }]);
    expect(reorder(list, 'a', 1)).toEqual([{ ...list[0], order: 2.5 }]);
    expect(reorder(list, 'a', 0)).toEqual([]);
    expect(reorder(list, 'zzz', 1)).toEqual([]);
  });

  it('renumbers when ranks get too close', () => {
    const list = [t('a', 1), t('b', 1 + 1e-7), t('c', 3)];
    const changed = reorder(list, 'c', 1);
    const merged = list.map((x) => changed.find((c) => c.id === x.id) ?? x);
    expect(sortTasks(merged).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('records completion time and clears it on reopen', () => {
    const done = setDone(t('a', 1), true, 42);
    expect(done).toMatchObject({ done: true, doneAt: 42 });
    expect(setDone(done, true, 99)).toBe(done);
    expect(setDone(done, false, 50)).toMatchObject({ done: false, doneAt: null });
  });
});

describe('panda garden', () => {
  it('is empty before any session', () => {
    const g = deriveGarden(0);
    expect(g.stalks).toEqual([]);
    expect(g.unlocked).toEqual([]);
    expect(g.next?.id).toBe('sprout');
  });

  it('sprouts on the first session and grows deterministically', () => {
    expect(deriveGarden(1).stalks).toEqual([{ index: 0, segments: 0 }]);
    expect(deriveGarden(2).stalks).toEqual([{ index: 0, segments: 1 }]);
    const g = deriveGarden(26);
    expect(g.stalks.map((s) => s.segments)).toEqual([6, 6, 1]);
    expect(g.unlocked.map((u) => u.id)).toEqual(['sprout', 'pose-stretch', 'lantern', 'stones']);
    expect(g.untilNextSegment).toBe(2);
  });

  it('caps growth', () => {
    const g = deriveGarden(10_000);
    expect(g.stalks).toHaveLength(MAX_STALKS);
    expect(g.stalks.every((s) => s.segments === SEGMENTS_PER_STALK)).toBe(true);
    expect(g.unlocked).toHaveLength(UNLOCKS.length);
    expect(g.next).toBeNull();
    expect(g.untilNextSegment).toBe(0);
  });

  it('treats invalid counts as zero', () => {
    expect(deriveGarden(-5).sessions).toBe(0);
  });
});
