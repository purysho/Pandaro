import { DEFAULT_SETTINGS, settingsSchema, timerStateSchema, type Settings } from './schema';
import type { TimerState } from '../domain/timer/types';

/**
 * Settings are migrated field by field: every valid field is kept and anything missing or
 * invalid falls back to its default, so a partially corrupted object never wipes preferences.
 */
export function migrateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const whole = settingsSchema.safeParse(raw);
  if (whole.success) return whole.data;
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = settingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (key === 'v') continue;
    const parsed = shape[key].safeParse(source[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return settingsSchema.parse(out);
}

/** Returns a valid timer snapshot or null when it is missing or malformed. */
export function migrateTimer(raw: unknown): TimerState | null {
  const parsed = timerStateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (s.status === 'running' && s.deadline === null) return null;
  const segments = s.segments.map((seg) =>
    seg.end === undefined ? { start: seg.start } : { start: seg.start, end: seg.end },
  );
  return { ...s, segments };
}
