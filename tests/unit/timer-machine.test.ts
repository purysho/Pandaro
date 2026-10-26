import { describe, expect, it } from 'vitest';
import {
  AWAY_THRESHOLD_MS,
  applyConfig,
  complete,
  createInitialState,
  dismissNotice,
  pause,
  progressAt,
  remainingAt,
  reset,
  resume,
  setTask,
  shiftClock,
  skip,
  start,
  switchKind,
  tick,
} from '../../src/domain/timer/machine';
import type {
  SessionRecord,
  TimerConfig,
  TimerEffect,
  TimerState,
} from '../../src/domain/timer/types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 26, 9, 0, 0);

const config: TimerConfig = {
  focusMs: 25 * MIN,
  shortMs: 5 * MIN,
  longMs: 15 * MIN,
  cycleLength: 4,
  autoProgress: true,
  autoStartFocus: false,
  autoStartBreaks: false,
};

const init = (c: TimerConfig = config) => createInitialState('dev', c, T0);

function records(effects: TimerEffect[]): SessionRecord[] {
  return effects.map((e) => e.record);
}

/** Run the current session to completion with a tick exactly at the deadline. */
function finish(
  state: TimerState,
  c: TimerConfig = config,
): { state: TimerState; effects: TimerEffect[] } {
  const started = state.status === 'running' ? state : start(state, state.checkpoint).state;
  return tick(started, c, started.deadline as number);
}

describe('initial state', () => {
  it('starts idle on a full focus session', () => {
    const s = init();
    expect(s.status).toBe('idle');
    expect(s.kind).toBe('focus');
    expect(remainingAt(s, T0 + 10 * MIN)).toBe(25 * MIN);
    expect(progressAt(s, T0)).toBe(0);
    expect(s.sessionId).toBe('dev-1');
  });
});

describe('start / pause / resume', () => {
  it('computes remaining time from the deadline, not from ticks', () => {
    const s = start(init(), T0).state;
    expect(s.status).toBe('running');
    expect(s.deadline).toBe(T0 + 25 * MIN);
    expect(remainingAt(s, T0 + 10 * MIN + 500)).toBe(15 * MIN - 500);
    expect(progressAt(s, T0 + 12.5 * MIN)).toBeCloseTo(0.5);
  });

  it('is a no-op to start twice', () => {
    const s = start(init(), T0).state;
    expect(start(s, T0 + 1000).state).toBe(s);
  });

  it('pauses and resumes preserving remaining time', () => {
    let s = start(init(), T0).state;
    s = pause(s, config, T0 + 10 * MIN).state;
    expect(s.status).toBe('paused');
    expect(remainingAt(s, T0 + 60 * MIN)).toBe(15 * MIN);
    s = resume(s, T0 + 30 * MIN).state;
    expect(s.deadline).toBe(T0 + 45 * MIN);
    expect(s.segments).toEqual([{ start: T0, end: T0 + 10 * MIN }, { start: T0 + 30 * MIN }]);
  });

  it('pause is a no-op when not running', () => {
    const s = init();
    expect(pause(s, config, T0).state).toBe(s);
  });

  it('pause after the deadline completes instead', () => {
    const s = start(init(), T0).state;
    const r = pause(s, config, T0 + 26 * MIN);
    expect(r.effects[0]?.type).toBe('completed');
  });

  it('never shows negative time', () => {
    const s = start(init(), T0).state;
    expect(remainingAt(s, T0 + 99 * MIN)).toBe(0);
    expect(progressAt(s, T0 + 99 * MIN)).toBe(1);
  });
});

describe('completion', () => {
  it('completes exactly once at the deadline and moves to a short break', () => {
    const s = start(init(), T0).state;
    expect(tick(s, config, T0 + 25 * MIN - 1).effects).toEqual([]);
    const r = tick(s, config, T0 + 25 * MIN);
    expect(r.effects).toHaveLength(1);
    const eff = r.effects[0];
    expect(eff?.type).toBe('completed');
    if (eff?.type !== 'completed') throw new Error('expected completion');
    expect(eff.record).toMatchObject({
      id: 'dev-1',
      kind: 'focus',
      outcome: 'completed',
      actualMs: 25 * MIN,
      plannedMs: 25 * MIN,
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      cycleIndex: 0,
    });
    expect(eff.away).toBe(false);
    expect(eff.next).toBe('short');
    expect(r.state).toMatchObject({
      kind: 'short',
      status: 'idle',
      completedInCycle: 1,
      sessionId: 'dev-2',
    });
    // A second tick on the new state produces nothing.
    expect(tick(r.state, config, T0 + 25 * MIN + 1000).effects).toEqual([]);
  });

  it('complete() on a non-running state is a no-op', () => {
    const s = init();
    expect(complete(s, T0, config).effects).toEqual([]);
  });

  it('a stale copy of the same running state yields the same deterministic record id', () => {
    const s = start(init(), T0).state;
    const a = tick(s, config, T0 + 25 * MIN);
    const b = tick(s, config, T0 + 25 * MIN + 2000);
    expect(records(a.effects)[0]?.id).toBe(records(b.effects)[0]?.id);
    expect(a.state.sessionId).toBe(b.state.sessionId);
  });

  it('credits only up to the deadline and flags away when observed late', () => {
    const s = start(init(), T0).state;
    const late = T0 + 3 * 60 * MIN;
    const r = tick(s, config, late);
    const eff = r.effects[0];
    if (eff?.type !== 'completed') throw new Error('expected completion');
    expect(eff.record.actualMs).toBe(25 * MIN);
    expect(eff.record.endedAt).toBe(T0 + 25 * MIN);
    expect(eff.away).toBe(true);
    expect(r.state.notice).toEqual({ kind: 'focus', finishedAt: T0 + 25 * MIN });
    expect(dismissNotice(r.state).notice).toBeNull();
  });

  it('auto-starts the next session when enabled and present', () => {
    const c = { ...config, autoStartBreaks: true };
    const s = start(init(c), T0).state;
    const r = tick(s, c, T0 + 25 * MIN + 100);
    expect(r.state.status).toBe('running');
    expect(r.state.kind).toBe('short');
    expect(r.state.deadline).toBe(T0 + 25 * MIN + 100 + 5 * MIN);
  });

  it('does not chain sessions while away, even with auto-start', () => {
    const c = { ...config, autoStartBreaks: true, autoStartFocus: true };
    const s = start(init(c), T0).state;
    const r = tick(s, c, T0 + 25 * MIN + AWAY_THRESHOLD_MS + 1);
    expect(r.state.status).toBe('idle');
    expect(r.effects).toHaveLength(1);
  });

  it('auto-starts focus after a break only when focus auto-start is on', () => {
    const c = { ...config, autoStartFocus: true };
    let s = finish(init(c), c).state; // now short break idle
    expect(s.status).toBe('idle');
    s = finish(s, c).state;
    expect(s.kind).toBe('focus');
    expect(s.status).toBe('running');
  });

  it('repeats the same kind when auto-progression is off', () => {
    const c = { ...config, autoProgress: false };
    const r = finish(init(c), c);
    expect(r.state.kind).toBe('focus');
    expect(r.state.completedInCycle).toBe(1);
  });
});

describe('four-session cycle', () => {
  it('goes F S F S F S F L and then resets the dots', () => {
    let s = init();
    const kinds: string[] = [];
    const dots: number[] = [];
    for (let i = 0; i < 9; i++) {
      kinds.push(s.kind);
      dots.push(s.completedInCycle);
      s = finish(s).state;
    }
    expect(kinds).toEqual([
      'focus',
      'short',
      'focus',
      'short',
      'focus',
      'short',
      'focus',
      'long',
      'focus',
    ]);
    expect(dots).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 0]);
  });

  it('honours a configurable cycle length', () => {
    const c = { ...config, cycleLength: 2 };
    let s = init(c);
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) {
      kinds.push(s.kind);
      s = finish(s, c).state;
    }
    expect(kinds).toEqual(['focus', 'short', 'focus', 'long', 'focus']);
  });

  it('uses configured durations', () => {
    const c = { ...config, focusMs: 50 * MIN, shortMs: 10 * MIN };
    const s = start(init(c), T0).state;
    expect(s.deadline).toBe(T0 + 50 * MIN);
    const next = finish(s, c).state;
    expect(next.plannedMs).toBe(10 * MIN);
  });
});

describe('reset, skip and switching', () => {
  it('reset records an interrupted session without credit and keeps cycle position', () => {
    let s = finish(init()).state; // short break, 1 done
    s = finish(s).state; // focus, 1 done
    s = start(s, T0 + 100 * MIN).state;
    const r = reset(s, config, T0 + 110 * MIN);
    expect(records(r.effects)[0]).toMatchObject({
      outcome: 'interrupted',
      actualMs: 10 * MIN,
      kind: 'focus',
    });
    expect(r.state).toMatchObject({ kind: 'focus', status: 'idle', completedInCycle: 1 });
    expect(remainingAt(r.state, T0 + 200 * MIN)).toBe(25 * MIN);
  });

  it('reset of an untouched session records nothing', () => {
    const r = reset(init(), config, T0);
    expect(r.effects).toEqual([]);
    expect(r.state.status).toBe('idle');
  });

  it('reset after the deadline completes instead of discarding the session', () => {
    const s = start(init(), T0).state;
    expect(reset(s, config, T0 + 30 * MIN).effects[0]?.type).toBe('completed');
  });

  it('skipping focus records skipped, grants no credit and goes to a short break', () => {
    const s = start(init(), T0).state;
    const r = skip(s, config, T0 + 5 * MIN);
    expect(records(r.effects)[0]).toMatchObject({ outcome: 'skipped', actualMs: 5 * MIN });
    expect(r.state).toMatchObject({ kind: 'short', completedInCycle: 0 });
  });

  it('skip after the deadline completes instead', () => {
    const s = start(init(), T0).state;
    expect(skip(s, config, T0 + 26 * MIN).effects[0]?.type).toBe('completed');
  });

  it('skipping an untouched break returns to focus without a record', () => {
    const s = finish(init()).state;
    const r = skip(s, config, T0 + 30 * MIN);
    expect(r.effects).toEqual([]);
    expect(r.state.kind).toBe('focus');
  });

  it('skipping a long break starts a new cycle', () => {
    let s = init();
    for (let i = 0; i < 7; i++) s = finish(s).state;
    expect(s.kind).toBe('long');
    expect(s.completedInCycle).toBe(4);
    const r = skip(s, config, T0);
    expect(r.state).toMatchObject({ kind: 'focus', completedInCycle: 0 });
  });

  it('switching kind mid-run records interrupted and switches', () => {
    const s = start(init(), T0).state;
    const r = switchKind(s, 'long', config, T0 + 2 * MIN);
    expect(records(r.effects)[0]?.outcome).toBe('interrupted');
    expect(r.state).toMatchObject({ kind: 'long', status: 'idle', plannedMs: 15 * MIN });
  });

  it('switching to the current idle kind is a no-op', () => {
    const s = init();
    expect(switchKind(s, 'focus', config, T0).state).toBe(s);
  });

  it('switching to focus after the cycle is full resets the dots', () => {
    let s = init();
    for (let i = 0; i < 7; i++) s = finish(s).state;
    const r = switchKind(s, 'focus', config, T0);
    expect(r.state.completedInCycle).toBe(0);
  });
});

describe('clock anomalies and restoration', () => {
  it('a wall clock moved backwards by a lot preserves remaining time', () => {
    let s = start(init(), T0).state;
    s = tick(s, config, T0 + 10 * MIN).state; // checkpoint at +10
    const back = T0 + 10 * MIN - 2 * 60 * MIN; // clock jumped back 2 hours
    const r = tick(s, config, back);
    expect(r.effects).toEqual([]);
    expect(remainingAt(r.state, back)).toBe(15 * MIN);
    expect(r.state.checkpoint).toBe(back);
  });

  it('small backwards adjustments are tolerated without rebasing', () => {
    let s = start(init(), T0).state;
    s = tick(s, config, T0 + 10 * MIN).state;
    const r = tick(s, config, T0 + 9 * MIN);
    expect(r.state.deadline).toBe(T0 + 25 * MIN);
  });

  it('shiftClock moves the deadline and open segment together', () => {
    let s = start(init(), T0).state;
    s = shiftClock(s, 60 * MIN);
    expect(s.deadline).toBe(T0 + 85 * MIN);
    expect(s.segments[0]).toEqual({ start: T0 + 60 * MIN });
    expect(remainingAt(s, T0 + 60 * MIN)).toBe(25 * MIN);
  });

  it('shiftClock on an idle timer only moves the checkpoint', () => {
    const s = shiftClock(init(), 5000);
    expect(s.checkpoint).toBe(T0 + 5000);
    expect(shiftClock(s, 0)).toBe(s);
  });

  it('restoring a serialized running state days later completes once with away flag', () => {
    const s = start(init(), T0).state;
    const restored = JSON.parse(JSON.stringify(s)) as TimerState;
    const r = tick(restored, config, T0 + 3 * 24 * 60 * MIN);
    expect(r.effects).toHaveLength(1);
    expect(r.state.notice).not.toBeNull();
    expect(tick(r.state, config, T0 + 3 * 24 * 60 * MIN + 1).effects).toEqual([]);
  });

  it('tick without time passing returns the same object', () => {
    const s = init();
    expect(tick(s, config, T0).state).toBe(s);
  });
});

describe('task association and config', () => {
  it('carries the active task into the session record', () => {
    let s = setTask(init(), 'task-1');
    s = start(s, T0).state;
    const r = tick(s, config, T0 + 25 * MIN);
    expect(records(r.effects)[0]?.taskId).toBe('task-1');
    expect(r.state.taskId).toBe('task-1');
  });

  it('applyConfig updates idle durations but not a running plan', () => {
    const c2 = { ...config, focusMs: 40 * MIN, cycleLength: 2 };
    expect(applyConfig(init(), c2).remainingMs).toBe(40 * MIN);
    const running = start(init(), T0).state;
    expect(applyConfig(running, c2).deadline).toBe(T0 + 25 * MIN);
    let s = init();
    for (let i = 0; i < 6; i++) s = finish(s).state;
    expect(applyConfig(s, c2).completedInCycle).toBe(2);
  });

  it('cannot start a session with no remaining time', () => {
    const s = { ...init(), remainingMs: 0 };
    expect(start(s, T0).state).toBe(s);
  });
});
