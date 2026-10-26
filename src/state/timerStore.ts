import { create } from 'zustand';
import * as M from '../domain/timer/machine';
import type {
  SessionKind,
  SessionRecord,
  TimerEffect,
  TimerState,
  TransitionResult,
} from '../domain/timer/types';
import { migrateTimer } from '../persistence/migrations';
import { KEYS, readJSON, writeJSON } from '../persistence/storage';
import { chime } from '../platform/audio/chime';
import { systemClock, type Clock } from '../platform/clock';
import { hapticTap, isNative, notifications } from '../platform';
import { useHistory } from './historyStore';
import { repo } from './repo';
import { toTimerConfig, useSettings } from './settingsStore';
import { useTasks } from './taskStore';
import { useUi } from './uiStore';

export const KIND_LABEL: Record<SessionKind, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

interface TimerStore {
  timer: TimerState;
  now: number;
  /** True while the page or app is in the foreground. */
  active: boolean;
  start(): void;
  pause(): void;
  toggle(): void;
  reset(): void;
  skip(): void;
  switchKind(kind: SessionKind): void;
  setTask(taskId: string | null): void;
  dismissNotice(): void;
  /** Observe the clock; completes sessions whose deadline passed. */
  tick(): void;
  applySettings(): void;
  shiftClock(delta: number): void;
  setActive(active: boolean): void;
  /** Adopt state written by another tab. */
  adopt(state: TimerState): void;
  hydrate(state: TimerState | null): void;
}

let clock: Clock = systemClock;
export function setClock(next: Clock): void {
  clock = next;
}

function newPrefix(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand}`;
}

export function loadTimerSnapshot(): TimerState | null {
  return migrateTimer(readJSON(KEYS.timer));
}

function config() {
  return toTimerConfig(useSettings.getState().settings);
}

export const useTimer = create<TimerStore>((set, get) => {
  function commit(result: TransitionResult): void {
    const prev = get().timer;
    const next = result.state;
    if (next !== prev) {
      writeJSON(KEYS.timer, next);
      set({ timer: next, now: clock.now() });
      onStateChange(prev, next);
    } else {
      set({ now: clock.now() });
    }
    if (result.effects.length > 0) void handleEffects(result.effects);
  }

  return {
    timer: M.createInitialState(newPrefix(), config(), clock.now()),
    now: clock.now(),
    active: true,

    start: () => {
      chime.unlock();
      commit(M.start(get().timer, clock.now()));
      void hapticTap();
    },
    pause: () => commit(M.pause(get().timer, config(), clock.now())),
    toggle: () => (get().timer.status === 'running' ? get().pause() : get().start()),
    reset: () => commit(M.reset(get().timer, config(), clock.now())),
    skip: () => {
      chime.unlock();
      commit(M.skip(get().timer, config(), clock.now()));
    },
    switchKind: (kind) => commit(M.switchKind(get().timer, kind, config(), clock.now())),
    setTask: (taskId) => commit({ state: M.setTask(get().timer, taskId), effects: [] }),
    dismissNotice: () => commit({ state: M.dismissNotice(get().timer), effects: [] }),
    tick: () => commit(M.tick(get().timer, config(), clock.now())),
    applySettings: () => commit({ state: M.applyConfig(get().timer, config()), effects: [] }),
    shiftClock: (delta) => commit({ state: M.shiftClock(get().timer, delta), effects: [] }),
    setActive: (active) => {
      set({ active });
      void syncNotification();
    },
    adopt: (state) => {
      const prev = get().timer;
      set({ timer: state, now: clock.now() });
      onStateChange(prev, state);
    },
    hydrate: (state) => {
      const timer = state ?? M.createInitialState(newPrefix(), config(), clock.now());
      writeJSON(KEYS.timer, timer);
      set({ timer, now: clock.now() });
      void syncNotification();
    },
  };
});

function onStateChange(prev: TimerState, next: TimerState): void {
  if (prev.status !== next.status || prev.sessionId !== next.sessionId) {
    void syncNotification();
    const label = KIND_LABEL[next.kind];
    if (next.status === 'running' && prev.status !== 'running') {
      useUi.getState().say(`${label} started.`);
    } else if (next.status === 'paused') {
      useUi.getState().say(`${label} paused.`);
    } else if (
      prev.status !== 'idle' &&
      next.status === 'idle' &&
      prev.sessionId !== next.sessionId
    ) {
      useUi.getState().say(`${label} ready.`);
    }
  }
}

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

async function handleEffects(effects: TimerEffect[]): Promise<void> {
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

/**
 * Native apps: keep exactly one notification scheduled for the running session while the app
 * is in the background, and none while it is in the foreground (the in-app chime covers that).
 */
export async function syncNotification(): Promise<void> {
  if (!isNative) return;
  const port = await notifications();
  const { timer, active } = useTimer.getState();
  const settings = useSettings.getState().settings;
  try {
    if (!active && settings.notifications && timer.status === 'running' && timer.deadline) {
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
  } catch {
    // Scheduling failed (permission revoked); the app still completes sessions when reopened.
  }
}
