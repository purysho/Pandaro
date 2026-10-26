/*
 * Panda Garden: a calm visual record of completed focus sessions.
 * Everything is derived from the count of completed focus sessions, so it can't be
 * duplicated, lost on refresh, or punished by missed days.
 */

export const SEGMENTS_PER_STALK = 6;
export const SESSIONS_PER_SEGMENT = 2;
export const MAX_STALKS = 12;

export interface Stalk {
  index: number;
  segments: number;
}

export type UnlockId =
  'sprout' | 'lantern' | 'stones' | 'pond' | 'bridge' | 'moon-gate' | 'pose-stretch';

export interface Unlock {
  id: UnlockId;
  at: number;
  label: string;
  kind: 'decoration' | 'pose';
}

export const UNLOCKS: readonly Unlock[] = [
  { id: 'sprout', at: 1, label: 'First bamboo sprout', kind: 'decoration' },
  { id: 'pose-stretch', at: 5, label: 'Stretching break pose', kind: 'pose' },
  { id: 'lantern', at: 10, label: 'Paper lantern', kind: 'decoration' },
  { id: 'stones', at: 25, label: 'Stepping stones', kind: 'decoration' },
  { id: 'pond', at: 50, label: 'Koi pond', kind: 'decoration' },
  { id: 'bridge', at: 100, label: 'Red bridge', kind: 'decoration' },
  { id: 'moon-gate', at: 250, label: 'Moon gate', kind: 'decoration' },
];

export interface GardenState {
  sessions: number;
  stalks: Stalk[];
  unlocked: Unlock[];
  next: Unlock | null;
  /** Sessions until the next segment grows. */
  untilNextSegment: number;
}

export function deriveGarden(completedFocus: number): GardenState {
  const sessions = Math.max(0, Math.floor(completedFocus));
  const totalSegments = Math.min(
    MAX_STALKS * SEGMENTS_PER_STALK,
    Math.floor(sessions / SESSIONS_PER_SEGMENT),
  );
  const stalks: Stalk[] = [];
  const sprouted = sessions > 0 ? 1 : 0;
  const stalkCount = Math.min(
    MAX_STALKS,
    Math.max(sprouted, Math.ceil(totalSegments / SEGMENTS_PER_STALK)),
  );
  for (let i = 0; i < stalkCount; i++) {
    const segments = Math.min(SEGMENTS_PER_STALK, totalSegments - i * SEGMENTS_PER_STALK);
    stalks.push({ index: i, segments: Math.max(0, segments) });
  }
  const full = totalSegments >= MAX_STALKS * SEGMENTS_PER_STALK;
  return {
    sessions,
    stalks,
    unlocked: UNLOCKS.filter((u) => sessions >= u.at),
    next: UNLOCKS.find((u) => sessions < u.at) ?? null,
    untilNextSegment: full ? 0 : SESSIONS_PER_SEGMENT - (sessions % SESSIONS_PER_SEGMENT),
  };
}
