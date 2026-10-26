import { create } from 'zustand';
import { toTimerConfig, useSettings } from './settingsStore';
import { useUi } from './uiStore';
import * as M from '../domain/timer/machine';
import type { SessionKind, TimerState, TransitionResult } from '../domain/timer/types';
import { migrateTimer } from '../persistence/migrations';
import { KEYS, readJSON, writeJSON } from '../persistence/storage';
import { hapticTap } from '../platform';
import { chime } from '../platform/audio/chime';
import { systemClock, type Clock } from '../platform/clock';
import { syncNotification } from './notificationSync';
import { handleEffects } from './timerEffects';

export const KIND_LABEL: Record<SessionKind, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

export interface TimerStore {
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

export function config() {
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
