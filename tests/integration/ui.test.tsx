import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { createInitialState } from '../../src/domain/timer/machine';
import { memoryRepository } from '../../src/persistence/db';
import { DEFAULT_SETTINGS } from '../../src/persistence/schema';
import { KEYS, writeFlag } from '../../src/persistence/storage';
import { useHistory } from '../../src/state/historyStore';
import { setRepo } from '../../src/state/repo';
import { toTimerConfig, useSettings } from '../../src/state/settingsStore';
import { useTasks } from '../../src/state/taskStore';
import { setClock, useTimer } from '../../src/state/timerStore';
import { useUi } from '../../src/state/uiStore';
import { Panda } from '../../src/ui/panda/Panda';

let wall = Date.UTC(2026, 9, 26, 9);
const MIN = 60_000;

beforeEach(() => {
  wall = Date.UTC(2026, 9, 26, 9);
  setClock({ now: () => wall, mono: () => wall });
  setRepo(memoryRepository());
  writeFlag(KEYS.onboarded, true);
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS } });
  useHistory.setState({ sessions: [] });
  useTasks.setState({ tasks: [], filter: 'active' });
  useUi.setState({ view: 'timer', sheet: null, toasts: [], celebration: null });
  useTimer.getState().hydrate(createInitialState('ui', toTimerConfig(DEFAULT_SETTINGS), wall));
});

describe('timer screen', () => {
  it('starts, pauses and resumes from the main button', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(useTimer.getState().timer.status).toBe('running');
    act(() => {
      wall += 90_000;
      useTimer.getState().tick();
    });
    expect(screen.getByRole('timer')).toHaveTextContent('23:30');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('shows four session dots and the next session', () => {
    render(<App />);
    expect(
      screen.getByRole('img', { name: '0 of 4 focus sessions completed in this cycle' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Next: Short break · 5 min/)).toBeInTheDocument();
  });

  it('asks before switching session type mid-run', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('tab', { name: 'Long break' }));
    const dialog = screen.getByRole('dialog', { name: /Switch to long break/ });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(useTimer.getState().timer.kind).toBe('focus');
    await user.click(screen.getByRole('tab', { name: 'Long break' }));
    await user.click(screen.getByRole('button', { name: 'Switch' }));
    expect(useTimer.getState().timer.kind).toBe('long');
  });

  it('switches immediately when idle', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Short break' }));
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
  });

  it('keyboard shortcuts control the timer and theme', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard(' ');
    expect(useTimer.getState().timer.status).toBe('running');
    await user.keyboard('r');
    expect(useTimer.getState().timer.status).toBe('idle');
    await user.keyboard('s');
    expect(useTimer.getState().timer.kind).toBe('short');
    await user.keyboard('t');
    expect(useSettings.getState().settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.keyboard('3');
    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });

  it('pats the panda for encouragement', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Pat the panda' }));
    expect(document.querySelector('[data-pose="wave"]')).not.toBeNull();
  });

  it('shows the away notice', () => {
    useTimer.getState().start();
    wall += 3 * 60 * MIN;
    useTimer.getState().tick();
    render(<App />);
    expect(screen.getByText(/while you were away/)).toBeInTheDocument();
  });
});

describe('tasks screen', () => {
  it('adds a task with Enter, makes it the focus, completes and undoes deletion', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.type(screen.getByLabelText('New task'), 'Draft chapter one{Enter}');
    expect(screen.getByText('Draft chapter one')).toBeInTheDocument();
    expect(useTimer.getState().timer.taskId).toBe(useTasks.getState().tasks[0]?.id);
    expect(screen.getByText('· Current focus')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Complete “Draft chapter one”/ }));
    expect(useTasks.getState().tasks[0]?.done).toBe(true);
    expect(screen.getByText(/Everything is done/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /Delete “Draft chapter one”/ }));
    expect(useTasks.getState().tasks).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useTasks.getState().tasks).toHaveLength(1);
  });

  it('edits a task title, notes and estimate', async () => {
    const user = userEvent.setup();
    useTasks.getState().add({ title: 'Old' }, wall);
    useUi.setState({ view: 'tasks' });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Edit “Old”' }));
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.type(screen.getByLabelText(/Notes/), 'Some notes');
    await user.type(screen.getByLabelText('Estimated sessions'), '3');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(useTasks.getState().tasks[0]).toMatchObject({
      title: 'New title',
      notes: 'Some notes',
      estimate: 3,
    });
    expect(screen.getByLabelText('0 of 3 estimated sessions done')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('changes theme, durations and toggles', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    await user.click(within(dialog).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(within(dialog).getByRole('button', { name: 'Deep work 50 / 10 / 20' }));
    expect(useTimer.getState().timer.plannedMs).toBe(50 * MIN);
    await user.click(within(dialog).getByRole('switch', { name: 'Start breaks automatically' }));
    expect(useSettings.getState().settings.autoStartBreaks).toBe(true);
    const focus = within(dialog).getByLabelText('Focus');
    await user.clear(focus);
    await user.type(focus, '30{Enter}');
    expect(useSettings.getState().settings.focusMin).toBe(30);
    await user.clear(focus);
    await user.type(focus, '500');
    await user.tab();
    expect(useSettings.getState().settings.focusMin).toBe(30);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('requires typing DELETE before deleting all data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    const confirm = screen.getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeEnabled();
    // Escape closes only the topmost dialog.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Delete all data?' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('rejects an invalid backup with a readable error', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const input = screen.getByLabelText('Choose a backup file');
    await user.upload(input, new File(['not json'], 'x.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/);
  });
});

describe('onboarding, stats and garden', () => {
  it('walks through onboarding once', async () => {
    writeFlag(KEYS.onboarded, false);
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    expect(screen.getByRole('dialog', { name: 'Welcome to Pandaro' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Start focusing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();
    render(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders stats and garden from history', async () => {
    const user = userEvent.setup();
    const end = wall - MIN;
    useHistory.setState({
      sessions: Array.from({ length: 6 }, (_, i) => ({
        id: `s${i}`,
        kind: 'focus' as const,
        outcome: 'completed' as const,
        plannedMs: 25 * MIN,
        actualMs: 25 * MIN,
        segments: [{ start: end - 25 * MIN - i * 60 * MIN, end: end - i * 60 * MIN }],
        startedAt: end - 25 * MIN - i * 60 * MIN,
        endedAt: end - i * 60 * MIN,
        taskId: null,
        cycleIndex: 0,
      })),
    });
    render(<App />);
    expect(screen.getByTestId('today-sessions')).toHaveTextContent('6');
    expect(screen.getByTestId('today-focus')).toHaveTextContent('2h 30m');
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByText('Focus this week').nextSibling).toHaveTextContent('2h 30m');
    await user.click(screen.getByRole('button', { name: 'Garden' }));
    expect(screen.getByText('6 sessions grown')).toBeInTheDocument();
    const stretch = screen.getByRole('radio', { name: /Stretching/ });
    expect(stretch).toBeEnabled();
    await user.click(stretch);
    expect(useSettings.getState().settings.pandaPose).toBe('pose-stretch');
  });
});

describe('panda', () => {
  it.each(['idle', 'focus', 'break', 'paused', 'celebrate', 'cycle', 'stretch', 'wave'] as const)(
    'renders the %s pose',
    (pose) => {
      const { container } = render(<Panda pose={pose} title={`Panda ${pose}`} />);
      expect(screen.getByRole('img', { name: `Panda ${pose}` })).toBeInTheDocument();
      expect(container.querySelector(`[data-pose="${pose}"]`)).not.toBeNull();
    },
  );
});
