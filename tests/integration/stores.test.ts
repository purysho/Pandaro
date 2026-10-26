import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryRepository, type Repository } from '../../src/persistence/db';
import { KEYS, readJSON } from '../../src/persistence/storage';
import { DEFAULT_SETTINGS } from '../../src/persistence/schema';
import { useHistory } from '../../src/state/historyStore';
import { setRepo } from '../../src/state/repo';
import { toTimerConfig, useSettings } from '../../src/state/settingsStore';
import { useTasks } from '../../src/state/taskStore';
import { setClock, useTimer } from '../../src/state/timerStore';
import { completionMessage } from '../../src/state/timerEffects';
import { useUi } from '../../src/state/uiStore';
import { currentBackup, importData, deleteAllData } from '../../src/state/dataOps';
import { chime } from '../../src/platform/audio/chime';
import { createInitialState, start } from '../../src/domain/timer/machine';
import { clearCompleted, deleteTask, setTaskDone, toggleActiveTask } from '../../src/ui/actions';

const MIN = 60_000;
let wall = Date.UTC(2026, 9, 26, 9);
const fakeClock = { now: () => wall, mono: () => wall };
let repo: Repository;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  wall = Date.UTC(2026, 9, 26, 9);
  setClock(fakeClock);
  repo = memoryRepository();
  setRepo(repo);
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS, sound: true } });
  useHistory.setState({ sessions: [] });
  useTasks.setState({ tasks: [], filter: 'active' });
  useUi.setState({ toasts: [], celebration: null, announce: '' });
  useTimer.getState().hydrate(createInitialState('t', toTimerConfig(DEFAULT_SETTINGS), wall));
});

describe('timer store', () => {
  it('persists every transition to localStorage synchronously', () => {
    useTimer.getState().start();
    expect(readJSON(KEYS.timer)).toMatchObject({ status: 'running', deadline: wall + 25 * MIN });
    wall += 5 * MIN;
    useTimer.getState().pause();
    expect(readJSON(KEYS.timer)).toMatchObject({ status: 'paused', remainingMs: 20 * MIN });
  });

  it('completes once, stores history, credits the active task and celebrates', async () => {
    const play = vi.spyOn(chime, 'play');
    const task = useTasks.getState().add({ title: 'Write report' }, wall);
    useTimer.getState().setTask(task?.id ?? null);
    useTimer.getState().start();
    wall += 25 * MIN;
    useTimer.getState().tick();
    useTimer.getState().tick();
    await flush();
    expect(useHistory.getState().sessions).toHaveLength(1);
    expect(useTasks.getState().tasks[0]?.completedPomodoros).toBe(1);
    expect(useUi.getState().celebration?.kind).toBe('session');
    expect(play).toHaveBeenCalledTimes(1);
    expect(useTimer.getState().timer.kind).toBe('short');
    expect(useUi.getState().announce).toMatch(/Focus complete/);
    play.mockRestore();
  });

  it('a second tab completing the same session cannot double count', async () => {
    useTimer.getState().start();
    const snapshot = useTimer.getState().timer;
    wall += 25 * MIN;
    useTimer.getState().tick();
    await flush();
    // Another tab still holding the old state completes it too.
    useTimer.getState().adopt(snapshot);
    useTimer.getState().tick();
    await flush();
    expect(useHistory.getState().sessions).toHaveLength(1);
    expect((await repo.load()).sessions).toHaveLength(1);
  });

  it('does not chime or celebrate for a session that ended while away, and mutes when sound is off', async () => {
    const play = vi.spyOn(chime, 'play');
    useTimer.getState().start();
    wall += 3 * 60 * MIN;
    useTimer.getState().tick();
    await flush();
    expect(play).not.toHaveBeenCalled();
    expect(useUi.getState().celebration).toBeNull();
    expect(useTimer.getState().timer.notice).not.toBeNull();
    useTimer.getState().dismissNotice();
    expect(useTimer.getState().timer.notice).toBeNull();

    useSettings.getState().update({ sound: false });
    useTimer.getState().start();
    wall += 5 * MIN;
    useTimer.getState().tick();
    await flush();
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  it('records interrupted and skipped sessions without credit', async () => {
    useTimer.getState().start();
    wall += 3 * MIN;
    useTimer.getState().reset();
    useTimer.getState().start();
    wall += 2 * MIN;
    useTimer.getState().skip();
    await flush();
    expect(useHistory.getState().sessions.map((s) => s.outcome)).toEqual([
      'interrupted',
      'skipped',
    ]);
    expect(useTimer.getState().timer.completedInCycle).toBe(0);
  });

  it('applies new durations to an idle session and switches kinds', () => {
    useSettings.getState().update({ focusMin: 40 });
    useTimer.getState().applySettings();
    expect(useTimer.getState().timer.plannedMs).toBe(40 * MIN);
    useTimer.getState().switchKind('long');
    expect(useTimer.getState().timer.kind).toBe('long');
    useTimer.getState().toggle();
    expect(useTimer.getState().timer.status).toBe('running');
    useTimer.getState().toggle();
    expect(useTimer.getState().timer.status).toBe('paused');
  });

  it('shiftClock keeps remaining time after a backwards clock change', () => {
    useTimer.getState().start();
    wall += 5 * MIN;
    useTimer.getState().shiftClock(-60 * MIN);
    wall -= 60 * MIN;
    useTimer.getState().tick();
    expect(useTimer.getState().timer.status).toBe('running');
    expect((useTimer.getState().timer.deadline ?? 0) - wall).toBe(20 * MIN);
  });

  it('builds friendly completion messages', () => {
    const rec = { kind: 'focus' } as Parameters<typeof completionMessage>[0];
    expect(completionMessage(rec, 'long', 15 * MIN).title).toMatch(/long break/);
    expect(completionMessage(rec, 'short', 5 * MIN).body).toMatch(/5 minutes/);
    expect(completionMessage(rec, 'focus', 25 * MIN).title).toBe('Focus complete');
    expect(completionMessage({ ...rec, kind: 'short' }, 'focus', 25 * MIN).title).toMatch(
      /Break over/,
    );
  });
});

describe('task actions', () => {
  it('completing the active task deselects it and reopen clears doneAt', () => {
    const t = useTasks.getState().add({ title: 'A' }, wall);
    if (!t) throw new Error('no task');
    toggleActiveTask(t.id);
    expect(useTimer.getState().timer.taskId).toBe(t.id);
    setTaskDone(t.id, true);
    expect(useTimer.getState().timer.taskId).toBeNull();
    expect(useTasks.getState().tasks[0]?.doneAt).not.toBeNull();
    setTaskDone(t.id, false);
    expect(useTasks.getState().tasks[0]?.doneAt).toBeNull();
    toggleActiveTask(t.id);
    toggleActiveTask(t.id);
    expect(useTimer.getState().timer.taskId).toBeNull();
  });

  it('delete and clear completed can be undone', async () => {
    const a = useTasks.getState().add({ title: 'A' }, wall);
    const b = useTasks.getState().add({ title: 'B', estimate: 3, notes: ' n ' }, wall);
    if (!a || !b) throw new Error('no task');
    toggleActiveTask(a.id);
    deleteTask(a.id);
    expect(useTasks.getState().tasks.map((t) => t.title)).toEqual(['B']);
    useUi.getState().toasts.at(-1)?.action?.run();
    expect(useTasks.getState().tasks).toHaveLength(2);
    expect(useTimer.getState().timer.taskId).toBe(a.id);

    setTaskDone(b.id, true);
    clearCompleted();
    expect(useTasks.getState().tasks).toHaveLength(1);
    useUi.getState().toasts.at(-1)?.action?.run();
    expect(useTasks.getState().tasks).toHaveLength(2);
    await flush();
    expect((await repo.load()).tasks).toHaveLength(2);
  });

  it('rejects empty titles and ignores unknown ids', () => {
    expect(useTasks.getState().add({ title: '   ' }, wall)).toBeNull();
    useTasks.getState().update('nope', { title: 'x' });
    useTasks.getState().setDone('nope', true, wall);
    useTasks.getState().creditPomodoro('nope');
    expect(useTasks.getState().remove('nope')).toBeNull();
    deleteTask('nope');
    clearCompleted();
    expect(useTasks.getState().tasks).toEqual([]);
  });

  it('edits and reorders', () => {
    const a = useTasks.getState().add({ title: 'A' }, wall);
    const b = useTasks.getState().add({ title: 'B' }, wall);
    if (!a || !b) throw new Error('no task');
    useTasks.getState().update(a.id, { title: '  Alpha  ', estimate: 4 });
    useTasks.getState().update(a.id, { title: '' });
    expect(useTasks.getState().tasks[0]).toMatchObject({ title: 'Alpha', estimate: 4 });
    useTasks.getState().move(b.id, 0, useTasks.getState().tasks);
    const sorted = [...useTasks.getState().tasks].sort((x, y) => x.order - y.order);
    expect(sorted.map((t) => t.title)).toEqual(['B', 'Alpha']);
  });
});

describe('data operations', () => {
  it('imports with merge and replace, and undo restores', async () => {
    useTasks.getState().add({ title: 'Mine' }, wall);
    await flush();
    const backup = {
      ...currentBackup(wall),
      tasks: [],
      settings: { ...DEFAULT_SETTINGS, focusMin: 50 },
    };
    backup.sessions = [
      {
        id: 'x',
        kind: 'focus',
        outcome: 'completed',
        plannedMs: 1,
        actualMs: 1,
        segments: [{ start: 1, end: 2 }],
        startedAt: 1,
        endedAt: 2,
        taskId: null,
        cycleIndex: 0,
      },
    ];
    await importData(backup, 'merge');
    expect(useHistory.getState().sessions).toHaveLength(1);
    expect(useTasks.getState().tasks).toHaveLength(1);
    expect(useSettings.getState().settings.focusMin).toBe(25);

    const undo = await importData(backup, 'replace');
    expect(useTasks.getState().tasks).toHaveLength(0);
    expect(useSettings.getState().settings.focusMin).toBe(50);
    await undo();
    expect(useTasks.getState().tasks.map((t) => t.title)).toEqual(['Mine']);
    expect(useSettings.getState().settings.focusMin).toBe(25);
  });

  it('deletes everything', async () => {
    useTasks.getState().add({ title: 'Mine' }, wall);
    useSettings.getState().update({ focusMin: 30 });
    await flush();
    await deleteAllData();
    expect((await repo.load()).tasks).toEqual([]);
    expect(localStorage.getItem(KEYS.settings)).toBeNull();
  });

  it('settings reset and replace validate input', () => {
    useSettings.getState().update({ focusMin: 999 as number });
    expect(useSettings.getState().settings.focusMin).toBe(25);
    useSettings.getState().replace({ ...DEFAULT_SETTINGS, theme: 'dark' });
    expect(useSettings.getState().settings.theme).toBe('dark');
    useSettings.getState().reset();
    expect(useSettings.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('start() state', () => {
  it('unlocks audio on start', () => {
    const unlock = vi.spyOn(chime, 'unlock');
    useTimer.getState().start();
    expect(unlock).toHaveBeenCalled();
    unlock.mockRestore();
    expect(start).toBeDefined();
  });
});
