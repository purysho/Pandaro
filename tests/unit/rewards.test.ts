import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  canBuy,
  commitmentProgress,
  grantsForDay,
  growingLevel,
  wallet,
  type Commitment,
} from '../../src/domain/rewards/rewards';

const days = (...keys: string[]) => new Set(keys);
const c = (n: Commitment['days'], startDate = '2026-10-01', id = 'c1'): Commitment => ({
  id,
  days: n,
  startDate,
});

describe('reward styles', () => {
  it('pays nothing on a day without a completed session', () => {
    for (const style of ['off', 'daily', 'growing', 'commitment'] as const) {
      expect(grantsForDay(style, days('2026-10-01'), '2026-10-02', c(7))).toEqual([]);
    }
  });

  it('off pays nothing; daily pays one shoot with a stable id', () => {
    expect(grantsForDay('off', days('2026-10-02'), '2026-10-02', null)).toEqual([]);
    expect(grantsForDay('daily', days('2026-10-02'), '2026-10-02', null)).toEqual([
      { id: 'daily-2026-10-02', amount: 1, reason: 'daily', date: '2026-10-02' },
    ]);
  });

  it('growing steps up per active day, steps down per missed day, never below 1 or above 5', () => {
    expect(growingLevel(days(), '2026-10-10')).toBe(1);
    expect(growingLevel(days('2026-10-09'), '2026-10-10')).toBe(2);
    expect(growingLevel(days('2026-10-07', '2026-10-08', '2026-10-09'), '2026-10-10')).toBe(4);
    const allMonth = new Set(
      Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 10).padStart(2, '0')}`),
    );
    for (let d = 1; d <= 9; d++) allMonth.add(`2026-10-0${d}`);
    expect(growingLevel(allMonth, '2026-10-10')).toBe(5);
    // Two missed days after a run steps down two levels, it does not reset.
    expect(
      growingLevel(days('2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'), '2026-10-10'),
    ).toBe(3);
  });

  it('commitment pays the multiplier and a one-time completion bonus', () => {
    const active = days('2026-10-01', '2026-10-02', '2026-10-03');
    expect(grantsForDay('commitment', active, '2026-10-02', c(3))).toEqual([
      { id: 'daily-2026-10-02', amount: 1, reason: 'commitment', date: '2026-10-02' },
    ]);
    expect(grantsForDay('commitment', active, '2026-10-03', c(3))).toEqual([
      { id: 'daily-2026-10-03', amount: 1, reason: 'commitment', date: '2026-10-03' },
      { id: 'commitment-c1', amount: 3, reason: 'commitment-bonus', date: '2026-10-03' },
    ]);
    expect(grantsForDay('commitment', days('2026-10-01'), '2026-10-01', c(7))[0]?.amount).toBe(2);
    expect(grantsForDay('commitment', days('2026-10-01'), '2026-10-01', c(30))[0]?.amount).toBe(3);
  });

  it('commitment without an active plan falls back to the daily reward', () => {
    expect(grantsForDay('commitment', days('2026-10-02'), '2026-10-02', null)[0]?.reason).toBe(
      'daily',
    );
    expect(grantsForDay('commitment', days('2026-09-20'), '2026-09-20', c(7))[0]?.reason).toBe(
      'daily',
    );
  });
});

describe('commitment progress', () => {
  it('uses grace days instead of breaking', () => {
    const p = commitmentProgress(
      c(3),
      days('2026-10-01', '2026-10-03', '2026-10-05'),
      '2026-10-05',
    );
    expect(p).toMatchObject({ status: 'completed', activeDays: 3, missedDays: 2, graceLeft: 0 });
  });

  it('lapses quietly after more than two missed days', () => {
    const p = commitmentProgress(c(7), days('2026-10-01'), '2026-10-06');
    expect(p.status).toBe('lapsed');
    // After lapsing, active days still earn the plain daily reward.
    expect(
      grantsForDay('commitment', days('2026-10-01', '2026-10-06'), '2026-10-06', c(7))[0]?.reason,
    ).toBe('daily');
  });

  it('today not yet active does not count as missed', () => {
    const p = commitmentProgress(c(7), days('2026-10-01'), '2026-10-02');
    expect(p).toMatchObject({ status: 'active', missedDays: 0, graceLeft: 2, activeDays: 1 });
  });

  it('crosses month boundaries', () => {
    const p = commitmentProgress(
      c(3, '2026-10-30'),
      days('2026-10-30', '2026-10-31', '2026-11-01'),
      '2026-11-01',
    );
    expect(p.status).toBe('completed');
  });
});

describe('wallet and shop', () => {
  it('balances grants and purchases and blocks double buys', () => {
    const grants = [
      { id: 'a', amount: 10, reason: 'daily' as const, date: 'x' },
      { id: 'b', amount: 3, reason: 'daily' as const, date: 'y' },
    ];
    const w = wallet(grants, [{ id: 'p1', item: 'flower', price: 5 }]);
    expect(w).toEqual({ earned: 13, spent: 5, balance: 8, owned: ['flower'] });
    expect(canBuy(w, 'flower')).toBe(false);
    expect(canBuy(w, 'scarf')).toBe(false);
    expect(canBuy({ ...w, balance: 12 }, 'scarf')).toBe(true);
    expect(ACCESSORIES.every((a) => a.price > 0)).toBe(true);
  });
});
