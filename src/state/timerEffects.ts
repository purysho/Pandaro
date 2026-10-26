import { useHistory } from './historyStore';
import { repo } from './repo';
import { useSettings } from './settingsStore';
import { useTasks } from './taskStore';
import { useUi } from './uiStore';
import type { SessionKind, SessionRecord, TimerEffect } from '../domain/timer/types';
import { hapticTap, isNative, notifications } from '../platform';
import { chime } from '../platform/audio/chime';
import { useTimer } from './timerStore';

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function completionMessage(
  record: SessionRecord,
  next: SessionKind,
  nextMs: number,
): { title: string; body: string } {
  if (record.kind === 'focus') {
    return next === 'long'
      ? {
          title: 'Cycle complete. Time for a long break',
          body: `Four sessions done. Rest for ${minutes(nextMs)} minutes.`,
        }
      : next === 'short'
        ? {
            title: 'Focus complete. Take a short break',
            body: `Stretch and breathe for ${minutes(nextMs)} minutes.`,
          }
        : { title: 'Focus complete', body: 'Nicely done. Ready for another?' };
  }
  return {
    title: 'Break over. Ready to focus?',
    body: `Your next focus session is ${minutes(nextMs)} minutes.`,
  };
}

export async function handleEffects(effects: TimerEffect[]): Promise<void> {
  for (const effect of effects) {
    let stored: boolean;
    try {
      stored = await repo().addSession(effect.record);
    } catch {
      stored = false;
      useUi.getState().setStorageWarning(true);
    }
    // Only the writer that stored the record performs side effects, so duplicate events from
    // a second tab or a late tick cannot double-count, double-chime or double-credit.
    if (!stored) continue;
    useHistory.getState().add(effect.record);
    if (effect.type !== 'completed') continue;

    const { record, next, away } = effect;
    const settings = useSettings.getState().settings;
    if (record.kind === 'focus' && record.taskId) {
      useTasks.getState().creditPomodoro(record.taskId);
    }
    const nextMs = useTimer.getState().timer.plannedMs;
    const message = completionMessage(record, next, nextMs);
    useUi.getState().say(message.title);
    if (!away) {
      if (settings.sound) {
        const variant =
          record.kind === 'focus' || !settings.distinctBreakChime ? 'toBreak' : 'toFocus';
        chime.play(variant, settings.volume / 100, record.id);
      }
      useUi
        .getState()
        .celebrate(
          record.kind === 'focus' ? (next === 'long' ? 'cycle' : 'session') : 'break-over',
        );
      void hapticTap(true);
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!isNative && settings.notifications && hidden) {
      void notifications().then((n) => n.show(message.title, message.body));
    }
  }
}
