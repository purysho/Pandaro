/*
 * Bamboo shoot rewards: a cosmetic currency earned on days with at least one completed focus
 * session. Four styles (see docs/research/rewards-review-analysis.md):
 *  - off:        no daily rewards (the garden still grows per session)
 *  - daily:      a fixed 1 shoot per active day (default)
 *  - growing:    1–5 shoots; each active day steps up one level, each missed day steps down one
 *  - commitment: the user commits to 3/7/14/30 days; shoots scale with the commitment, missed days
 *                use grace days instead of breaking it, and finishing pays a bonus
 * No style ever takes shoots away.
 */
import { shiftDateKey } from '../stats/dates';

export type RewardStyle = 'off' | 'daily' | 'growing' | 'commitment';
export type CommitmentDays = 3 | 7 | 14 | 30;

export const COMMITMENT_OPTIONS: readonly CommitmentDays[] = [3, 7, 14, 30];
export const COMMITMENT_MULTIPLIER: Record<CommitmentDays, number> = { 3: 1, 7: 1.5, 14: 2, 30: 3 };
export const GRACE_DAYS = 2;
export const GROWING_MAX = 5;

export interface Commitment {
  id: string;
  days: CommitmentDays;
  /** Local date key of the first day. */
  startDate: string;
}

export interface RewardGrant {
  /** Unique per reason and day, so a grant can never be recorded twice. */
  id: string;
  amount: number;
  reason: 'daily' | 'growing' | 'commitment' | 'commitment-bonus';
  date: string;
}

/** Date keys of the inclusive range [from, to]. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  for (let guard = 0; cursor <= to && guard < 400; guard++) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    cursor = shiftDateKey(new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12).getTime(), -1);
  }
  return out;
}

/** Level for the "growing" style on `today`, from activity in the previous 30 days. */
export function growingLevel(activeDates: ReadonlySet<string>, today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const todayTs = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, 12).getTime();
  let level = 0;
  for (let back = 30; back >= 1; back--) {
    const key = shiftDateKey(todayTs, back);
    if (activeDates.has(key)) level = Math.min(GROWING_MAX, level + 1);
    else level = Math.max(0, level - 1);
  }
  return Math.min(GROWING_MAX, level + 1);
}

export interface CommitmentProgress {
  commitment: Commitment;
  activeDays: number;
  missedDays: number;
  graceLeft: number;
  status: 'active' | 'completed' | 'lapsed';
  /** Last date that still counts towards this commitment. */
  lastDate: string;
}

/**
 * Progress of a commitment up to and including `today`. A commitment completes once it has
 * `days` active days. Missed days use grace days; once more than GRACE_DAYS are missed it lapses
 * quietly (no penalty, the user can start a new one).
 */
export function commitmentProgress(
  c: Commitment,
  activeDates: ReadonlySet<string>,
  today: string,
): CommitmentProgress {
  let active = 0;
  let missed = 0;
  let lastDate = c.startDate;
  for (const date of datesBetween(c.startDate, today)) {
    lastDate = date;
    if (activeDates.has(date)) active += 1;
    else if (date < today) missed += 1;
    if (active >= c.days) {
      return {
        commitment: c,
        activeDays: active,
        missedDays: missed,
        graceLeft: Math.max(0, GRACE_DAYS - missed),
        status: 'completed',
        lastDate,
      };
    }
    if (missed > GRACE_DAYS) {
      return {
        commitment: c,
        activeDays: active,
        missedDays: missed,
        graceLeft: 0,
        status: 'lapsed',
        lastDate,
      };
    }
  }
  return {
    commitment: c,
    activeDays: active,
    missedDays: missed,
    graceLeft: GRACE_DAYS - missed,
    status: 'active',
    lastDate,
  };
}

/**
 * Grants earned on `today` given the style. Callers record grants by id, so calling this again
 * on the same day (or from two tabs) cannot pay twice.
 */
export function grantsForDay(
  style: RewardStyle,
  activeDates: ReadonlySet<string>,
  today: string,
  commitment: Commitment | null,
): RewardGrant[] {
  if (!activeDates.has(today)) return [];
  switch (style) {
    case 'off':
      return [];
    case 'daily':
      return [{ id: `daily-${today}`, amount: 1, reason: 'daily', date: today }];
    case 'growing':
      return [
        {
          id: `daily-${today}`,
          amount: growingLevel(activeDates, today),
          reason: 'growing',
          date: today,
        },
      ];
    case 'commitment': {
      if (!commitment || today < commitment.startDate) {
        return [{ id: `daily-${today}`, amount: 1, reason: 'daily', date: today }];
      }
      const progress = commitmentProgress(commitment, activeDates, today);
      if (progress.status === 'lapsed' && progress.lastDate < today) {
        return [{ id: `daily-${today}`, amount: 1, reason: 'daily', date: today }];
      }
      const grants: RewardGrant[] = [
        {
          id: `daily-${today}`,
          amount: Math.round(COMMITMENT_MULTIPLIER[commitment.days]),
          reason: 'commitment',
          date: today,
        },
      ];
      if (progress.status === 'completed' && progress.lastDate === today) {
        grants.push({
          id: `commitment-${commitment.id}`,
          amount: commitment.days,
          reason: 'commitment-bonus',
          date: today,
        });
      }
      return grants;
    }
  }
}

/** Cosmetic items that can be bought with bamboo shoots. */
export type AccessoryId = 'scarf' | 'bamboo-hat' | 'glasses' | 'flower';

export interface Accessory {
  id: AccessoryId;
  label: string;
  price: number;
}

export const ACCESSORIES: readonly Accessory[] = [
  { id: 'flower', label: 'Cherry blossom', price: 5 },
  { id: 'scarf', label: 'Cosy scarf', price: 12 },
  { id: 'glasses', label: 'Reading glasses', price: 20 },
  { id: 'bamboo-hat', label: 'Bamboo hat', price: 35 },
];

export interface Wallet {
  earned: number;
  spent: number;
  balance: number;
  owned: AccessoryId[];
}

export interface Purchase {
  id: string;
  item: AccessoryId;
  price: number;
}

export function wallet(grants: readonly RewardGrant[], purchases: readonly Purchase[]): Wallet {
  const earned = grants.reduce((a, g) => a + g.amount, 0);
  const spent = purchases.reduce((a, p) => a + p.price, 0);
  return {
    earned,
    spent,
    balance: earned - spent,
    owned: [...new Set(purchases.map((p) => p.item))],
  };
}

export function canBuy(w: Wallet, item: AccessoryId): boolean {
  const a = ACCESSORIES.find((x) => x.id === item);
  return !!a && !w.owned.includes(item) && w.balance >= a.price;
}
