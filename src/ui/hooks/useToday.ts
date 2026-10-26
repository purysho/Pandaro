import { useMemo } from 'react';
import { closeSegments } from '../../domain/timer/machine';
import { todaySummary, type TodaySummary } from '../../domain/stats/metrics';
import type { Interval } from '../../domain/stats/allocate';
import { useHistory } from '../../state/historyStore';
import { useTasks } from '../../state/taskStore';
import { useTimer } from '../../state/timerStore';

/** Current time rounded down to the second, so consumers re-render at most once per second. */
export function useSecond(): number {
  return useTimer((s) => Math.floor(s.now / 1000) * 1000);
}

/** Focus intervals of the session in progress (not yet in history), closed at the current second. */
export function useLiveFocus(): Interval[] {
  const timer = useTimer((s) => s.timer);
  const second = useSecond();
  return useMemo(
    () => (timer.kind === 'focus' ? closeSegments(timer, second) : []),
    [timer, second],
  );
}

export function useToday(): TodaySummary {
  const sessions = useHistory((s) => s.sessions);
  const tasks = useTasks((s) => s.tasks);
  const live = useLiveFocus();
  const second = useSecond();
  return useMemo(
    () => todaySummary(sessions, tasks, second, live),
    [sessions, tasks, live, second],
  );
}
