export type SessionKind = 'focus' | 'short' | 'long';
export type TimerStatus = 'idle' | 'running' | 'paused';
export type SessionOutcome = 'completed' | 'interrupted' | 'skipped';

/** A contiguous running interval in epoch milliseconds. `end` is absent while still running. */
export interface Segment {
  start: number;
  end?: number;
}

export interface ClosedSegment {
  start: number;
  end: number;
}

export interface TimerConfig {
  focusMs: number;
  shortMs: number;
  longMs: number;
  /** Completed focus sessions per cycle before a long break. */
  cycleLength: number;
  /** When false, a finished session is followed by another session of the same kind. */
  autoProgress: boolean;
  autoStartFocus: boolean;
  autoStartBreaks: boolean;
}

/** Shown when a session finished while the app was not running or not visible. */
export interface AwayNotice {
  kind: SessionKind;
  finishedAt: number;
}

export interface TimerState {
  v: 1;
  /** Stable per-install prefix so that ids are deterministic across tabs. */
  idPrefix: string;
  seq: number;
  sessionId: string;
  kind: SessionKind;
  status: TimerStatus;
  plannedMs: number;
  /** Wall-clock deadline while running, otherwise null. */
  deadline: number | null;
  /** Remaining time while idle or paused. Ignored while running (derived from deadline). */
  remainingMs: number;
  segments: Segment[];
  /** Completed focus sessions in the current cycle (0..cycleLength). */
  completedInCycle: number;
  taskId: string | null;
  /** Wall-clock time of the most recent observation, used to detect backwards clock moves. */
  checkpoint: number;
  notice: AwayNotice | null;
}

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  outcome: SessionOutcome;
  plannedMs: number;
  actualMs: number;
  segments: ClosedSegment[];
  startedAt: number;
  endedAt: number;
  taskId: string | null;
  /** Number of focus sessions already completed in the cycle when this session started. */
  cycleIndex: number;
}

export type TimerEffect =
  | { type: 'record'; record: SessionRecord }
  | { type: 'completed'; record: SessionRecord; away: boolean; next: SessionKind };

export interface TransitionResult {
  state: TimerState;
  effects: TimerEffect[];
}
