import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { openRepository } from '../../src/persistence/db';
import { startEngine } from '../../src/state/engine';
import { useHistory } from '../../src/state/historyStore';
import { useSettings } from '../../src/state/settingsStore';
import { useTasks } from '../../src/state/taskStore';
import { setClock, useTimer } from '../../src/state/timerStore';
import { useUi } from '../../src/state/uiStore';
import { systemClock } from '../../src/platform/clock';
import { DEFAULT_SETTINGS } from '../../src/persistence/schema';

const MIN = 60_000;
let stop: (() => void) | null = null;

beforeEach(async () => {
  setClock(systemClock);
  useUi.setState({ toasts: [], storageWarning: false, view: 'timer', sheet: null });
  useHistory.setState({ sessions: [] });
  useTasks.setState({ tasks: [] });
  // Start from an empty database.
  const repo = await openRepository();
  await repo.clear();
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

describe('engine start-up', () => {
  it('loads settings, applies the theme and restores a running session', async () => {
    const now = Date.now();
    localStorage.setItem(
      'pandaro.settings.v1',
      JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'dark', focusMin: 30 }),
    );
    localStorage.setItem(
      'pandaro.timer.v1',
      JSON.stringify({
        v: 1,
        idPrefix: 'eng',
        seq: 3,
        sessionId: 'eng-3',
        kind: 'focus',
        status: 'running',
        plannedMs: 30 * MIN,
        deadline: now + 20 * MIN,
        remainingMs: 30 * MIN,
        segments: [{ start: now - 10 * MIN }],
        completedInCycle: 1,
        taskId: 'missing-task',
        checkpoint: now,
        notice: null,
      }),
    );
    stop = await startEngine();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(useSettings.getState().settings.focusMin).toBe(30);
    const timer = useTimer.getState().timer;
    expect(timer).toMatchObject({ sessionId: 'eng-3', status: 'running', completedInCycle: 1 });
    // A task that no longer exists is cleared from the session.
    expect(timer.taskId).toBeNull();
  });

  it('completes a session whose deadline passed while closed, exactly once', async () => {
    const now = Date.now();
    localStorage.setItem(
      'pandaro.timer.v1',
      JSON.stringify({
        v: 1,
        idPrefix: 'eng',
        seq: 1,
        sessionId: 'eng-1',
        kind: 'focus',
        status: 'running',
        plannedMs: 25 * MIN,
        deadline: now - 60 * MIN,
        remainingMs: 25 * MIN,
        segments: [{ start: now - 85 * MIN }],
        completedInCycle: 0,
        taskId: null,
        checkpoint: now - 80 * MIN,
        notice: null,
      }),
    );
    stop = await startEngine();
    await vi.waitFor(() => expect(useHistory.getState().sessions).toHaveLength(1));
    expect(useTimer.getState().timer).toMatchObject({ kind: 'short', status: 'idle' });
    expect(useTimer.getState().timer.notice?.kind).toBe('focus');
    stop();
    stop = await startEngine();
    await new Promise((r) => setTimeout(r, 50));
    expect(useHistory.getState().sessions).toHaveLength(1);
  });

  it('ignores a corrupt timer snapshot and quarantines damaged records', async () => {
    localStorage.setItem('pandaro.timer.v1', '{"v":1,"status":"running"');
    const db = await openDB('pandaro', 2);
    await db.put('sessions', { id: 'broken', kind: 'focus' });
    db.close();
    stop = await startEngine();
    expect(useTimer.getState().timer.status).toBe('idle');
    expect(useUi.getState().toasts.at(-1)?.message).toMatch(/1 damaged record/);
  });

  it('adopts timer state written by another tab and reloads settings', async () => {
    stop = await startEngine();
    const other = {
      ...useTimer.getState().timer,
      kind: 'long' as const,
      seq: 9,
      sessionId: 'x-9',
      plannedMs: 15 * MIN,
      remainingMs: 15 * MIN,
    };
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'pandaro.timer.v1', newValue: JSON.stringify(other) }),
    );
    expect(useTimer.getState().timer.sessionId).toBe('x-9');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'pandaro.timer.v1', newValue: '{broken' }),
    );
    expect(useTimer.getState().timer.sessionId).toBe('x-9');
    localStorage.setItem(
      'pandaro.settings.v1',
      JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light' }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'pandaro.settings.v1' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('handles visibility changes and the back action', async () => {
    stop = await startEngine();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(useTimer.getState().active).toBe(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(useTimer.getState().active).toBe(true);
  });

  it('ticks on an interval and completes on time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date', 'performance'] });
    stop = await startEngine();
    useTimer.getState().start();
    vi.advanceTimersByTime(25 * MIN + 500);
    await vi.waitFor(() => expect(useHistory.getState().sessions).toHaveLength(1));
    expect(useTimer.getState().timer.kind).toBe('short');
  });
});
