import { useSettings } from './settingsStore';
import * as M from '../domain/timer/machine';
import type { SessionRecord } from '../domain/timer/types';
import { isNative, notifications } from '../platform';
import { completionMessage } from './timerEffects';
import { config, useTimer } from './timerStore';

let syncChain: Promise<void> = Promise.resolve();

let appliedNotification: string | null = null;

/**
 * Native apps: keep exactly one notification scheduled for the running session while the app
 * is in the background, and none while it is in the foreground (the in-app chime covers that).
 * Calls are serialised and a state that is already applied is skipped, so bursts of state
 * changes never schedule twice.
 */
export function syncNotification(): Promise<void> {
  if (!isNative) return Promise.resolve();
  syncChain = syncChain.then(applyNotification, applyNotification);
  return syncChain;
}

async function applyNotification(): Promise<void> {
  const port = await notifications();
  const { timer, active } = useTimer.getState();
  const settings = useSettings.getState().settings;
  const wanted =
    !active && settings.notifications && timer.status === 'running' && timer.deadline
      ? `${timer.sessionId}@${timer.deadline}`
      : 'none';
  if (wanted === appliedNotification) return;
  try {
    if (wanted !== 'none' && timer.deadline) {
      const cfg = config();
      const completedInCycle =
        timer.kind === 'focus' ? timer.completedInCycle + 1 : timer.completedInCycle;
      const next = M.nextKindAfter(timer.kind, 'completed', completedInCycle, cfg);
      const fake: SessionRecord = {
        id: timer.sessionId,
        kind: timer.kind,
        outcome: 'completed',
        plannedMs: timer.plannedMs,
        actualMs: timer.plannedMs,
        segments: [],
        startedAt: timer.deadline,
        endedAt: timer.deadline,
        taskId: timer.taskId,
        cycleIndex: timer.completedInCycle,
      };
      const msg = completionMessage(fake, next, M.durationFor(next, cfg));
      await port.schedule({ key: timer.sessionId, at: timer.deadline, ...msg });
    } else {
      await port.cancelAll();
    }
    appliedNotification = wanted;
  } catch {
    // Scheduling failed (permission revoked); the app still completes sessions when reopened.
    appliedNotification = null;
  }
}
