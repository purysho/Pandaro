export interface Clock {
  /** Wall-clock epoch milliseconds. */
  now(): number;
  /** Monotonic milliseconds; only differences are meaningful. */
  mono(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  mono: () => performance.now(),
};

/** If wall time and monotonic time disagree by more than this between ticks, the wall clock was changed. */
export const CLOCK_JUMP_THRESHOLD_MS = 2_000;

/**
 * Tracks the relationship between the wall and monotonic clocks and reports backward wall-clock
 * jumps. Forward jumps are deliberately not reported: on some platforms `performance.now()` stops
 * during device sleep, so a forward jump is indistinguishable from real elapsed time and the wall
 * clock is trusted.
 */
export class ClockWatch {
  private lastWall: number;
  private lastMono: number;

  constructor(private readonly clock: Clock = systemClock) {
    this.lastWall = clock.now();
    this.lastMono = clock.mono();
  }

  reset(): void {
    this.lastWall = this.clock.now();
    this.lastMono = this.clock.mono();
  }

  /** Returns a negative number of ms when the wall clock was moved backwards, otherwise 0. */
  backwardJump(): number {
    const wall = this.clock.now();
    const mono = this.clock.mono();
    const drift = wall - this.lastWall - (mono - this.lastMono);
    this.lastWall = wall;
    this.lastMono = mono;
    return drift < -CLOCK_JUMP_THRESHOLD_MS ? drift : 0;
  }
}
