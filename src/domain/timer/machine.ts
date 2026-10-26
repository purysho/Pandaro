import type {
  ClosedSegment,
  SessionKind,
  SessionOutcome,
  SessionRecord,
  TimerConfig,
  TimerState,
  TransitionResult,
} from './types';

/**
 * A completion observed later than this after its deadline counts as "while you were away".
 * Background tabs may run timers only once a minute, so the margin covers that throttling.
 */
export const AWAY_THRESHOLD_MS = 90_000;
/** A wall clock that moved backwards by more than this since the last checkpoint is treated as a clock change. */
export const BACKWARDS_TOLERANCE_MS = 5 * 60_000;

export function durationFor(kind: SessionKind, config: TimerConfig): number {
  switch (kind) {
    case 'focus':
      return config.focusMs;
    case 'short':
      return config.shortMs;
    case 'long':
      return config.longMs;
  }
}

export function isBreak(kind: SessionKind): boolean {
  return kind !== 'focus';
}

export function createInitialState(idPrefix: string, config: TimerConfig, now: number): TimerState {
  return {
    v: 1,
    idPrefix,
    seq: 1,
    sessionId: `${idPrefix}-1`,
    kind: 'focus',
    status: 'idle',
    plannedMs: config.focusMs,
    deadline: null,
    remainingMs: config.focusMs,
    segments: [],
    completedInCycle: 0,
    taskId: null,
    checkpoint: now,
    notice: null,
  };
}

/** Remaining milliseconds at `now`, never negative. */
export function remainingAt(state: TimerState, now: number): number {
  if (state.status === 'running' && state.deadline !== null) {
    return Math.max(0, state.deadline - now);
  }
  return Math.max(0, state.remainingMs);
}

/** Fraction of the session elapsed at `now`, clamped to [0, 1]. */
export function progressAt(state: TimerState, now: number): number {
  if (state.plannedMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingAt(state, now) / state.plannedMs));
}

/** Closes open segments at `until` and drops empty ones. */
export function closeSegments(state: TimerState, until: number): ClosedSegment[] {
  const closed: ClosedSegment[] = [];
  for (const seg of state.segments) {
    const end = Math.min(seg.end ?? until, until);
    if (end > seg.start) closed.push({ start: seg.start, end });
  }
  return closed;
}

export function elapsedMs(segments: readonly ClosedSegment[]): number {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0);
}

/** The kind that follows `kind` given the cycle position after it ended. */
export function nextKindAfter(
  kind: SessionKind,
  outcome: SessionOutcome,
  completedInCycle: number,
  config: TimerConfig,
): SessionKind {
  if (!config.autoProgress && outcome === 'completed') return kind;
  if (kind === 'focus') {
    return outcome === 'completed' && completedInCycle >= config.cycleLength ? 'long' : 'short';
  }
  return 'focus';
}

function makeRecord(
  state: TimerState,
  outcome: SessionOutcome,
  endedAt: number,
): SessionRecord | null {
  const segments = closeSegments(state, endedAt);
  const actualMs = elapsedMs(segments);
  if (outcome !== 'completed' && actualMs <= 0) return null;
  const first = segments[0];
  return {
    id: state.sessionId,
    kind: state.kind,
    outcome,
    plannedMs: state.plannedMs,
    actualMs,
    segments,
    startedAt: first ? first.start : endedAt,
    endedAt,
    taskId: state.taskId,
    cycleIndex: state.completedInCycle,
  };
}

function freshSession(
  state: TimerState,
  kind: SessionKind,
  completedInCycle: number,
  config: TimerConfig,
  now: number,
): TimerState {
  const seq = state.seq + 1;
  const planned = durationFor(kind, config);
  const cycle = kind === 'focus' && completedInCycle >= config.cycleLength ? 0 : completedInCycle;
  return {
    ...state,
    seq,
    sessionId: `${state.idPrefix}-${seq}`,
    kind,
    status: 'idle',
    plannedMs: planned,
    deadline: null,
    remainingMs: planned,
    segments: [],
    completedInCycle: cycle,
    checkpoint: now,
  };
}

function startRunning(state: TimerState, now: number): TimerState {
  const remaining = remainingAt(state, now);
  return {
    ...state,
    status: 'running',
    deadline: now + remaining,
    segments: [...state.segments, { start: now }],
    checkpoint: now,
    notice: null,
  };
}

export function start(state: TimerState, now: number): TransitionResult {
  if (state.status === 'running') return { state, effects: [] };
  if (remainingAt(state, now) <= 0) return { state, effects: [] };
  return { state: startRunning(state, now), effects: [] };
}

export function pause(state: TimerState, config: TimerConfig, now: number): TransitionResult {
  if (state.status !== 'running' || state.deadline === null) return { state, effects: [] };
  if (now >= state.deadline) return complete(state, now, config);
  return {
    state: {
      ...state,
      status: 'paused',
      remainingMs: state.deadline - now,
      deadline: null,
      segments: state.segments.map((s) => (s.end === undefined ? { ...s, end: now } : s)),
      checkpoint: now,
    },
    effects: [],
  };
}

export const resume = start;

function abandon(
  state: TimerState,
  outcome: 'interrupted' | 'skipped',
  nextKind: SessionKind,
  config: TimerConfig,
  now: number,
): TransitionResult {
  const record = makeRecord(state, outcome, now);
  return {
    state: { ...freshSession(state, nextKind, state.completedInCycle, config, now), notice: null },
    effects: record ? [{ type: 'record', record }] : [],
  };
}

/** Reset the current session to its full duration. Run time is recorded as interrupted, without credit. */
export function reset(state: TimerState, config: TimerConfig, now: number): TransitionResult {
  if (state.status === 'running' && state.deadline !== null && now >= state.deadline) {
    return complete(state, now, config);
  }
  return abandon(state, 'interrupted', state.kind, config, now);
}

/** Skip to the next session without granting credit. */
export function skip(state: TimerState, config: TimerConfig, now: number): TransitionResult {
  if (state.status === 'running' && state.deadline !== null && now >= state.deadline) {
    return complete(state, now, config);
  }
  const next = nextKindAfter(state.kind, 'skipped', state.completedInCycle, config);
  const result = abandon(state, 'skipped', next, config, now);
  if (state.kind === 'long') {
    result.state = { ...result.state, completedInCycle: 0 };
  }
  return result;
}

/** Manually switch to another session kind. Any run time is recorded as interrupted. */
export function switchKind(
  state: TimerState,
  kind: SessionKind,
  config: TimerConfig,
  now: number,
): TransitionResult {
  if (state.kind === kind && state.status === 'idle') return { state, effects: [] };
  return abandon(state, 'interrupted', kind, config, now);
}

/** Complete the running session exactly once. */
export function complete(state: TimerState, now: number, config: TimerConfig): TransitionResult {
  if (state.status !== 'running' || state.deadline === null) return { state, effects: [] };
  const endedAt = Math.min(now, state.deadline);
  const record = makeRecord(state, 'completed', endedAt);
  if (!record) return { state, effects: [] };
  const away = now - state.deadline > AWAY_THRESHOLD_MS;
  const completedInCycle =
    state.kind === 'focus' ? state.completedInCycle + 1 : state.completedInCycle;
  const next = nextKindAfter(state.kind, 'completed', completedInCycle, config);
  const afterLong = state.kind === 'long' ? 0 : completedInCycle;
  let nextState = freshSession(state, next, afterLong, config, now);
  nextState.notice = away ? { kind: state.kind, finishedAt: state.deadline } : null;
  const autoStart = next === 'focus' ? config.autoStartFocus : config.autoStartBreaks;
  if (autoStart && !away) {
    nextState = startRunning(nextState, now);
  }
  return {
    state: nextState,
    effects: [{ type: 'completed', record, away, next }],
  };
}

/**
 * Observe the clock. Completes the session if its deadline has passed and repairs state
 * after the wall clock moved backwards.
 */
export function tick(state: TimerState, config: TimerConfig, now: number): TransitionResult {
  let current = state;
  if (now < current.checkpoint - BACKWARDS_TOLERANCE_MS) {
    current = shiftClock(current, now - current.checkpoint);
  }
  if (current.status === 'running' && current.deadline !== null && now >= current.deadline) {
    return complete(current, now, config);
  }
  if (current === state && now <= state.checkpoint) return { state, effects: [] };
  return { state: { ...current, checkpoint: Math.max(now, current.checkpoint) }, effects: [] };
}

/**
 * Shift every wall-clock reference by `delta` ms. Used when a wall-clock change is detected
 * (monotonic clock disagrees with Date.now), so progress is preserved.
 */
export function shiftClock(state: TimerState, delta: number): TimerState {
  if (delta === 0) return state;
  const now = state.checkpoint + delta;
  if (state.status !== 'running' || state.deadline === null) {
    return { ...state, checkpoint: now };
  }
  return {
    ...state,
    deadline: state.deadline + delta,
    segments: state.segments.map((s) =>
      s.end === undefined ? { start: s.start + delta } : { start: s.start, end: s.end },
    ),
    checkpoint: now,
  };
}

export function setTask(state: TimerState, taskId: string | null): TimerState {
  return { ...state, taskId };
}

export function dismissNotice(state: TimerState): TimerState {
  return state.notice ? { ...state, notice: null } : state;
}

/**
 * Apply new durations. An idle session adopts the new duration immediately; a running or
 * paused session keeps its current plan.
 */
export function applyConfig(state: TimerState, config: TimerConfig): TimerState {
  const cycle = Math.min(state.completedInCycle, config.cycleLength);
  if (state.status !== 'idle') return { ...state, completedInCycle: cycle };
  const planned = durationFor(state.kind, config);
  return { ...state, plannedMs: planned, remainingMs: planned, completedInCycle: cycle };
}
