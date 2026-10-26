import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryRepository, type Repository } from '../../src/persistence/db';
import { DEFAULT_SETTINGS } from '../../src/persistence/schema';
import { useHistory } from '../../src/state/historyStore';
import { setRepo } from '../../src/state/repo';
import { useRewards, walletOf } from '../../src/state/rewardStore';
import { useSettings } from '../../src/state/settingsStore';
import { useUi } from '../../src/state/uiStore';
import { GardenPanel } from '../../src/ui/garden/GardenPanel';
import type { SessionRecord } from '../../src/domain/timer/types';

const MIN = 60_000;
const now = new Date(2026, 9, 26, 15).getTime();
let repo: Repository;

const focus = (id: string, endedAt: number): SessionRecord => ({
  id,
  kind: 'focus',
  outcome: 'completed',
  plannedMs: 25 * MIN,
  actualMs: 25 * MIN,
  segments: [{ start: endedAt - 25 * MIN, end: endedAt }],
  startedAt: endedAt - 25 * MIN,
  endedAt,
  taskId: null,
  cycleIndex: 0,
});

beforeEach(() => {
  repo = memoryRepository();
  setRepo(repo);
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS } });
  useHistory.setState({ sessions: [] });
  useRewards.setState({ ledger: [] });
  useUi.setState({ toasts: [] });
});

describe('reward store', () => {
  it('grants nothing without a completed session today', async () => {
    expect(await useRewards.getState().grantToday(now)).toBe(0);
  });

  it('grants the daily shoot once, even when called again', async () => {
    useHistory.setState({ sessions: [focus('a', now - MIN)] });
    expect(await useRewards.getState().grantToday(now)).toBe(1);
    expect(await useRewards.getState().grantToday(now + MIN)).toBe(0);
    expect((await repo.load()).ledger).toHaveLength(1);
    expect(useUi.getState().toasts.at(-1)?.message).toBe('+1 bamboo shoot for today');
  });

  it('respects the "off" style', async () => {
    useSettings.getState().update({ rewardStyle: 'off' });
    useHistory.setState({ sessions: [focus('a', now - MIN)] });
    expect(await useRewards.getState().grantToday(now)).toBe(0);
  });

  it('buys and equips an accessory once, only with enough shoots', async () => {
    expect(await useRewards.getState().buy('flower', now)).toBe(false);
    useRewards.setState({
      ledger: [{ kind: 'grant', id: 'g', amount: 6, reason: 'daily', date: '2026-10-26', at: now }],
    });
    expect(await useRewards.getState().buy('flower', now)).toBe(true);
    expect(useSettings.getState().settings.accessory).toBe('flower');
    expect(await useRewards.getState().buy('flower', now)).toBe(false);
    expect(walletOf(useRewards.getState().ledger).balance).toBe(1);
  });
});

describe('rewards card', () => {
  it('switches style, starts a commitment and wears an accessory', async () => {
    const user = userEvent.setup();
    useRewards.setState({
      ledger: [
        { kind: 'grant', id: 'g', amount: 13, reason: 'daily', date: '2026-10-26', at: now },
      ],
    });
    render(<GardenPanel />);
    expect(screen.getByText('13')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Commitment'));
    expect(useSettings.getState().settings.rewardStyle).toBe('commitment');
    const choose = screen.getByRole('region', { name: 'Choose a commitment' });
    const start = within(choose).getByRole('button', { name: 'Start commitment' });
    expect(start).toBeDisabled();
    await user.click(within(choose).getByRole('radio', { name: /7 days/ }));
    await user.click(start);
    expect(useSettings.getState().settings.commitment?.days).toBe(7);
    expect(screen.getByRole('region', { name: 'Your commitment' })).toHaveTextContent(
      '0 of 7 focus days',
    );
    await user.click(screen.getByRole('button', { name: 'End this commitment' }));
    expect(useSettings.getState().settings.commitment).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Buy Cosy scarf for 12 shoots' }));
    expect(useSettings.getState().settings.accessory).toBe('scarf');
    const wear = screen.getByRole('button', { name: 'Wearing' });
    await user.click(wear);
    expect(useSettings.getState().settings.accessory).toBe('none');
    expect(
      screen.getByRole('button', { name: 'Buy Reading glasses for 20 shoots' }),
    ).toBeDisabled();
  });
});
