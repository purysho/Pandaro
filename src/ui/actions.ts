import { useTasks } from '../state/taskStore';
import { useTimer } from '../state/timerStore';
import { useUi } from '../state/uiStore';

const now = () => Date.now();

export function setTaskDone(id: string, done: boolean): void {
  useTasks.getState().setDone(id, done, now());
  if (done && useTimer.getState().timer.taskId === id) useTimer.getState().setTask(null);
  useUi.getState().say(done ? 'Task completed.' : 'Task reopened.');
}

export function toggleActiveTask(id: string): void {
  const current = useTimer.getState().timer.taskId;
  useTimer.getState().setTask(current === id ? null : id);
}

export function deleteTask(id: string): void {
  const wasActive = useTimer.getState().timer.taskId === id;
  const removed = useTasks.getState().remove(id);
  if (!removed) return;
  if (wasActive) useTimer.getState().setTask(null);
  useUi.getState().toast(`Deleted “${truncate(removed.title)}”`, {
    label: 'Undo',
    run: () => {
      useTasks.getState().restore([removed]);
      if (wasActive) useTimer.getState().setTask(removed.id);
    },
  });
}

export function clearCompleted(): void {
  const removed = useTasks.getState().clearDone();
  if (removed.length === 0) return;
  useUi
    .getState()
    .toast(`Cleared ${removed.length} completed task${removed.length === 1 ? '' : 's'}`, {
      label: 'Undo',
      run: () => useTasks.getState().restore(removed),
    });
}

function truncate(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
