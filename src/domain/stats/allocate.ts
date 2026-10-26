import { dateKey, nextLocalMidnight } from './dates';

export interface Interval {
  start: number;
  end: number;
}

/**
 * Split intervals at local midnights and sum milliseconds per local date.
 * Intervals that are empty or inverted contribute nothing.
 */
export function allocateByDate(intervals: readonly Interval[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { start, end } of intervals) {
    let cursor = start;
    while (cursor < end) {
      const boundary = Math.min(end, nextLocalMidnight(cursor));
      const key = dateKey(cursor);
      out.set(key, (out.get(key) ?? 0) + (boundary - cursor));
      cursor = boundary;
    }
  }
  return out;
}
