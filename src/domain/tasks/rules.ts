import { ESTIMATE_MAX, NOTES_MAX, TITLE_MAX, type Task, type TaskFilter } from './types';

export function normalizeTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

export function normalizeNotes(raw: string): string {
  return raw.trim().slice(0, NOTES_MAX);
}

export function normalizeEstimate(raw: number | null): number | null {
  if (raw === null || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < 1) return null;
  return Math.min(ESTIMATE_MAX, n);
}

export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Open tasks first in user order, then done tasks with the most recently finished first. */
export function visibleTasks(tasks: readonly Task[], filter: TaskFilter): Task[] {
  const sorted = sortTasks(tasks);
  const open = sorted.filter((t) => !t.done);
  const done = sorted.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  if (filter === 'active') return open;
  if (filter === 'done') return done;
  return [...open, ...done];
}

/** Rank for appending after every existing task. */
export function orderAtEnd(tasks: readonly Task[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.order), 0) + 1;
}

/**
 * Compute new ranks after moving `id` to index `toIndex` within `ordered` (the list as displayed).
 * Returns only the tasks whose rank changed, so a typical move writes one record.
 */
export function reorder(ordered: readonly Task[], id: string, toIndex: number): Task[] {
  const from = ordered.findIndex((t) => t.id === id);
  if (from < 0) return [];
  const clamped = Math.max(0, Math.min(ordered.length - 1, toIndex));
  if (from === clamped) return [];
  const without = ordered.filter((t) => t.id !== id);
  const moving = ordered[from] as Task;
  const before = without[clamped - 1];
  const after = without[clamped];
  let rank: number;
  if (!before && after) rank = after.order - 1;
  else if (before && !after) rank = before.order + 1;
  else if (before && after) rank = (before.order + after.order) / 2;
  else rank = moving.order;

  const tooClose =
    (before && Math.abs(rank - before.order) < 1e-6) ||
    (after && Math.abs(rank - after.order) < 1e-6);
  if (!tooClose) return [{ ...moving, order: rank }];

  const next = [...without];
  next.splice(clamped, 0, moving);
  return next
    .map((t, i) => ({ task: t, order: i + 1 }))
    .filter(({ task, order }) => task.order !== order)
    .map(({ task, order }) => ({ ...task, order }));
}

export function setDone(task: Task, done: boolean, now: number): Task {
  if (task.done === done) return task;
  return { ...task, done, doneAt: done ? now : null };
}
