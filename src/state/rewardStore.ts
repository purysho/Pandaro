import { create } from 'zustand';
import {
  ACCESSORIES,
  canBuy,
  grantsForDay,
  wallet,
  type AccessoryId,
  type Purchase,
  type RewardGrant,
  type Wallet,
} from '../domain/rewards/rewards';
import { dateKey } from '../domain/stats/dates';
import type { LedgerEntry } from '../persistence/schema';
import type { SessionRecord } from '../domain/timer/types';
import { useHistory } from './historyStore';
import { repo } from './repo';
import { useSettings } from './settingsStore';
import { useUi } from './uiStore';

interface RewardState {
  ledger: LedgerEntry[];
  replace(ledger: LedgerEntry[]): void;
  /** Record today's rewards if they are due. Safe to call repeatedly or from several tabs. */
  grantToday(now: number): Promise<number>;
  buy(item: AccessoryId, now: number): Promise<boolean>;
}

export function activeDates(
  sessions: readonly SessionRecord[] = useHistory.getState().sessions,
): Set<string> {
  const out = new Set<string>();
  for (const s of sessions) {
    if (s.kind === 'focus' && s.outcome === 'completed') out.add(dateKey(s.endedAt));
  }
  return out;
}

export function walletOf(ledger: readonly LedgerEntry[]): Wallet {
  const grants: RewardGrant[] = [];
  const purchases: Purchase[] = [];
  for (const e of ledger) {
    if (e.kind === 'grant')
      grants.push({ id: e.id, amount: e.amount, reason: e.reason, date: e.date });
    else purchases.push({ id: e.id, item: e.item, price: e.price });
  }
  return wallet(grants, purchases);
}

export const useRewards = create<RewardState>((set, get) => ({
  ledger: [],
  replace: (ledger) => set({ ledger }),

  grantToday: async (now) => {
    const { rewardStyle, commitment } = useSettings.getState().settings;
    const grants = grantsForDay(rewardStyle, activeDates(), dateKey(now), commitment);
    let total = 0;
    for (const g of grants) {
      const entry: LedgerEntry = { kind: 'grant', ...g, at: now };
      let stored = false;
      try {
        stored = await repo().addLedger(entry);
      } catch {
        stored = false;
      }
      if (!stored || get().ledger.some((e) => e.id === entry.id)) continue;
      set((s) => ({ ledger: [...s.ledger, entry] }));
      total += g.amount;
    }
    if (total > 0) {
      const bonus = grants.some((g) => g.reason === 'commitment-bonus');
      useUi
        .getState()
        .toast(
          bonus
            ? `Commitment complete! +${total} bamboo shoots`
            : `+${total} bamboo shoot${total === 1 ? '' : 's'} for today`,
        );
    }
    return total;
  },

  buy: async (item, now) => {
    const accessory = ACCESSORIES.find((a) => a.id === item);
    if (!accessory || !canBuy(walletOf(get().ledger), item)) return false;
    const entry: LedgerEntry = {
      kind: 'purchase',
      id: `purchase-${item}`,
      item,
      price: accessory.price,
      at: now,
    };
    if (!(await repo().addLedger(entry))) return false;
    set((s) => ({ ledger: [...s.ledger, entry] }));
    useSettings.getState().update({ accessory: item });
    return true;
  },
}));
