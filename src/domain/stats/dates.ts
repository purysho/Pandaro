/** Local calendar date key `YYYY-MM-DD` for an epoch timestamp, in the runtime's time zone. */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Epoch ms of local midnight that starts the day containing `ts`. */
export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Epoch ms of the next local midnight after `ts`. Computed with the local Date constructor so
 * 23- and 25-hour days around daylight-saving changes are handled.
 */
export function nextLocalMidnight(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Date key `days` calendar days before the date of `ts` (negative moves forward). */
export function shiftDateKey(ts: number, days: number): string {
  const d = new Date(ts);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - days, 12).getTime());
}

/** Inclusive list of date keys for the `count` days ending on the date of `ts`, oldest first. */
export function lastNDateKeys(ts: number, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(shiftDateKey(ts, i));
  return keys;
}

export function monthKey(ts: number): string {
  return dateKey(ts).slice(0, 7);
}
