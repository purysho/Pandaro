export interface Task {
  id: string;
  title: string;
  notes: string;
  /** Estimated number of focus sessions, or null when not estimated. */
  estimate: number | null;
  /** Focus sessions completed while this task was active. */
  completedPomodoros: number;
  done: boolean;
  /** Epoch ms when the task was last marked done; null when open. */
  doneAt: number | null;
  createdAt: number;
  /** Sort rank; lower comes first. */
  order: number;
}

export type TaskFilter = 'active' | 'done' | 'all';

export const TITLE_MAX = 200;
export const NOTES_MAX = 2000;
export const ESTIMATE_MAX = 20;
