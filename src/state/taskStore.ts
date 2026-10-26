import { create } from 'zustand';
import {
  normalizeEstimate,
  normalizeNotes,
  normalizeTitle,
  orderAtEnd,
  reorder,
  setDone,
} from '../domain/tasks/rules';
import type { Task, TaskFilter } from '../domain/tasks/types';
import { repo } from './repo';

export interface TaskDraft {
  title: string;
  notes?: string;
  estimate?: number | null;
}

interface TaskState {
  tasks: Task[];
  filter: TaskFilter;
  setFilter(filter: TaskFilter): void;
  replace(tasks: Task[]): void;
  add(draft: TaskDraft, now: number): Task | null;
  update(id: string, patch: Partial<TaskDraft>): void;
  setDone(id: string, done: boolean, now: number): void;
  remove(id: string): Task | null;
  restore(tasks: Task[]): void;
  clearDone(): Task[];
  move(id: string, toIndex: number, ordered: readonly Task[]): void;
  creditPomodoro(id: string): void;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(tasks: readonly Task[]): void {
  void repo()
    .putTasks(tasks)
    .catch(() => undefined);
}

export const useTasks = create<TaskState>((set, get) => ({
  tasks: [],
  filter: 'active',
  setFilter: (filter) => set({ filter }),
  replace: (tasks) => set({ tasks }),

  add: (draft, now) => {
    const title = normalizeTitle(draft.title);
    if (!title) return null;
    const task: Task = {
      id: newId(),
      title,
      notes: normalizeNotes(draft.notes ?? ''),
      estimate: normalizeEstimate(draft.estimate ?? null),
      completedPomodoros: 0,
      done: false,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
      order: orderAtEnd(get().tasks),
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    persist([task]);
    return task;
  },

  update: (id, patch) => {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const title = patch.title === undefined ? existing.title : normalizeTitle(patch.title);
    if (!title) return;
    const next: Task = {
      ...existing,
      updatedAt: Date.now(),
      title,
      notes: patch.notes === undefined ? existing.notes : normalizeNotes(patch.notes),
      estimate:
        patch.estimate === undefined ? existing.estimate : normalizeEstimate(patch.estimate),
    };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    persist([next]);
  },

  setDone: (id, done, now) => {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const changed = setDone(existing, done, now);
    if (changed === existing) return;
    const next = { ...changed, updatedAt: now };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    persist([next]);
  },

  remove: (id) => {
    const existing = get().tasks.find((t) => t.id === id) ?? null;
    if (!existing) return null;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    void repo()
      .deleteTasks([id])
      .catch(() => undefined);
    return existing;
  },

  restore: (tasks) => {
    const ids = new Set(get().tasks.map((t) => t.id));
    const at = Date.now();
    // Restored tasks are newer than their deletion, so sync keeps them.
    const missing = tasks.filter((t) => !ids.has(t.id)).map((t) => ({ ...t, updatedAt: at }));
    if (missing.length === 0) return;
    set((s) => ({ tasks: [...s.tasks, ...missing] }));
    persist(missing);
  },

  clearDone: () => {
    const done = get().tasks.filter((t) => t.done);
    if (done.length === 0) return [];
    set((s) => ({ tasks: s.tasks.filter((t) => !t.done) }));
    void repo()
      .deleteTasks(done.map((t) => t.id))
      .catch(() => undefined);
    return done;
  },

  move: (id, toIndex, ordered) => {
    const at = Date.now();
    const changed = reorder(ordered, id, toIndex).map((t) => ({ ...t, updatedAt: at }));
    if (changed.length === 0) return;
    const byId = new Map(changed.map((t) => [t.id, t]));
    set((s) => ({ tasks: s.tasks.map((t) => byId.get(t.id) ?? t) }));
    persist(changed);
  },

  creditPomodoro: (id) => {
    const existing = get().tasks.find((t) => t.id === id);
    if (!existing) return;
    const next = {
      ...existing,
      completedPomodoros: existing.completedPomodoros + 1,
      updatedAt: Date.now(),
    };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    persist([next]);
  },
}));
