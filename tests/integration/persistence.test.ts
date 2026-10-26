import { describe, expect, it, beforeEach } from 'vitest';
import { openDB } from 'idb';
import {
  createRepository,
  memoryRepository,
  openRepository,
  type Repository,
} from '../../src/persistence/db';
import {
  buildBackup,
  backupFileName,
  parseBackup,
  previewImport,
  serializeBackup,
} from '../../src/persistence/backup';
import { migrateSettings, migrateTimer } from '../../src/persistence/migrations';
import { DEFAULT_SETTINGS } from '../../src/persistence/schema';
import {
  KEYS,
  readFlag,
  readJSON,
  removeAll,
  storageAvailable,
  writeFlag,
  writeJSON,
} from '../../src/persistence/storage';
import { createInitialState, start } from '../../src/domain/timer/machine';
import type { SessionRecord } from '../../src/domain/timer/types';
import type { Task } from '../../src/domain/tasks/types';

const T0 = Date.UTC(2026, 9, 26, 9);
const session = (id: string, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  kind: 'focus',
  outcome: 'completed',
  plannedMs: 1_500_000,
  actualMs: 1_500_000,
  segments: [{ start: T0, end: T0 + 1_500_000 }],
  startedAt: T0,
  endedAt: T0 + 1_500_000,
  taskId: null,
  cycleIndex: 0,
  ...extra,
});
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  notes: '',
  estimate: 2,
  completedPomodoros: 0,
  done: false,
  doneAt: null,
  createdAt: T0,
  updatedAt: T0,
  order: 1,
  ...extra,
});

let dbCounter = 0;
async function freshRepo(): Promise<{ repo: Repository; name: string }> {
  const name = `pandaro-test-${++dbCounter}`;
  return { repo: await openRepository(name), name };
}

describe.each([
  ['indexeddb', async () => (await freshRepo()).repo],
  ['memory', async () => memoryRepository()],
])('%s repository', (_label, make) => {
  let repo: Repository;
  beforeEach(async () => {
    repo = await make();
  });

  it('stores sessions exactly once', async () => {
    expect(await repo.addSession(session('a'))).toBe(true);
    expect(await repo.addSession(session('a'))).toBe(false);
    expect((await repo.load()).sessions).toHaveLength(1);
  });

  it('puts, updates and deletes tasks', async () => {
    await repo.putTasks([task('1'), task('2')]);
    await repo.putTasks([task('1', { title: 'Renamed' })]);
    await repo.deleteTasks(['2']);
    const { tasks } = await repo.load();
    expect(tasks).toEqual([task('1', { title: 'Renamed' })]);
  });

  it('merges without duplicating and keeps newer tasks', async () => {
    await repo.addSession(session('a'));
    await repo.putTasks([task('1', { updatedAt: T0 + 10, title: 'Local newer' })]);
    await repo.writeAll(
      { sessions: [session('a', { actualMs: 1 }), session('b')], tasks: [task('1'), task('2')] },
      'merge',
    );
    const { sessions, tasks } = await repo.load();
    expect(sessions.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(sessions.find((s) => s.id === 'a')?.actualMs).toBe(1_500_000);
    expect(tasks.find((t) => t.id === '1')?.title).toBe('Local newer');
    expect(tasks).toHaveLength(2);
  });

  it('replaces everything', async () => {
    await repo.addSession(session('a'));
    await repo.writeAll({ sessions: [session('z')], tasks: [] }, 'replace');
    expect((await repo.load()).sessions.map((s) => s.id)).toEqual(['z']);
    await repo.clear();
    expect(await repo.load()).toEqual({
      sessions: [],
      tasks: [],
      ledger: [],
      tombstones: [],
      quarantined: 0,
    });
  });
});

describe('indexeddb integrity', () => {
  it('quarantines malformed rows instead of failing', async () => {
    const { repo, name } = await freshRepo();
    await repo.addSession(session('good'));
    const raw = await openDB(name, 2);
    await raw.put('sessions', { id: 'bad', kind: 'nap', outcome: 'completed' });
    await raw.put('tasks', { id: 'bad-task', title: '' });
    raw.close();
    const reopened = await openRepository(name);
    const loaded = await reopened.load();
    expect(loaded.quarantined).toBe(2);
    expect(loaded.sessions.map((s) => s.id)).toEqual(['good']);
    const again = await reopened.load();
    expect(again.quarantined).toBe(0);
  });

  it('createRepository falls back to memory without IndexedDB', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error simulating an environment without IndexedDB
    delete globalThis.indexedDB;
    try {
      const repo = await createRepository();
      expect(repo.persistent).toBe(false);
    } finally {
      globalThis.indexedDB = original;
    }
    expect((await createRepository()).persistent).toBe(true);
  });
});

describe('localStorage wrapper', () => {
  it('round-trips JSON and flags', () => {
    expect(writeJSON(KEYS.settings, { a: 1 })).toBe(true);
    expect(readJSON(KEYS.settings)).toEqual({ a: 1 });
    writeFlag(KEYS.onboarded, true);
    expect(readFlag(KEYS.onboarded)).toBe(true);
    writeFlag(KEYS.onboarded, false);
    expect(readFlag(KEYS.onboarded)).toBe(false);
    expect(storageAvailable()).toBe(true);
  });

  it('returns null for corrupt JSON and survives a throwing storage', () => {
    localStorage.setItem(KEYS.timer, '{not json');
    expect(readJSON(KEYS.timer)).toBeNull();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(writeJSON(KEYS.timer, { x: 1 })).toBe(false);
    expect(storageAvailable()).toBe(false);
    expect(() => writeFlag(KEYS.onboarded, true)).not.toThrow();
    spy.mockRestore();
  });

  it('removes only Pandaro keys', () => {
    localStorage.setItem('other', 'keep');
    writeJSON(KEYS.settings, {});
    removeAll();
    expect(localStorage.getItem('other')).toBe('keep');
    expect(localStorage.getItem(KEYS.settings)).toBeNull();
  });
});

describe('migrations', () => {
  it('returns defaults for missing settings', () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields from a partially corrupted settings object', () => {
    const s = migrateSettings({ v: 1, focusMin: 50, volume: 9999, theme: 'dark', extra: true });
    expect(s.focusMin).toBe(50);
    expect(s.theme).toBe('dark');
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('accepts a valid timer snapshot and rejects malformed ones', () => {
    const cfg = {
      focusMs: 1000,
      shortMs: 1000,
      longMs: 1000,
      cycleLength: 4,
      autoProgress: true,
      autoStartFocus: false,
      autoStartBreaks: false,
    };
    const running = start(createInitialState('dev', cfg, T0), T0).state;
    expect(migrateTimer(JSON.parse(JSON.stringify(running)))).toEqual(running);
    expect(migrateTimer({ ...running, status: 'running', deadline: null })).toBeNull();
    expect(migrateTimer({ v: 2 })).toBeNull();
    expect(migrateTimer(null)).toBeNull();
  });
});

describe('backup', () => {
  const backup = buildBackup(
    { settings: DEFAULT_SETTINGS, tasks: [task('1')], sessions: [session('a'), session('b')] },
    T0,
  );

  it('round-trips through JSON', () => {
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed).toEqual({ ok: true, backup });
    expect(backupFileName(T0)).toMatch(/^pandaro-backup-2026-10-26\.json$/);
  });

  it('previews counts and new sessions', () => {
    expect(previewImport(backup, [session('a')])).toEqual({
      tasks: 1,
      sessions: 2,
      newSessions: 1,
      exportedAt: T0,
    });
  });

  it.each([
    ['not json', '{'],
    ['wrong format', JSON.stringify({ format: 'other' })],
    ['newer version', JSON.stringify({ ...backup, version: 99 })],
    ['bad session', JSON.stringify({ ...backup, sessions: [{ id: 'x' }] })],
    [
      'bad segment',
      JSON.stringify({ ...backup, sessions: [session('x', { segments: [{ start: 5, end: 1 }] })] }),
    ],
    ['duplicate ids', JSON.stringify({ ...backup, sessions: [session('a'), session('a')] })],
    ['script title', JSON.stringify({ ...backup, tasks: [task('1', { title: '' })] })],
    ['null', 'null'],
    ['array', '[]'],
  ])('rejects %s with a readable message', (_name, text) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });

  it('rejects oversized input before parsing', () => {
    const r = parseBackup(' '.repeat(10 * 1024 * 1024 + 1));
    expect(r).toMatchObject({ ok: false });
  });

  it('survives a corpus of random malformed inputs', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const base = serializeBackup(backup);
    for (let i = 0; i < 300; i++) {
      const chars = base.split('');
      for (let j = 0; j < 5; j++) {
        const at = Math.floor(rand() * chars.length);
        chars[at] = String.fromCharCode(32 + Math.floor(rand() * 90));
      }
      expect(() => parseBackup(chars.join(''))).not.toThrow();
    }
  });
});

describe('schema v2', () => {
  it('migrates a v1 database: adds stores and fills task updatedAt', async () => {
    const name = `pandaro-migrate-${++dbCounter}`;
    const v1 = await openDB(name, 1, {
      upgrade(d) {
        const s = d.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('endedAt', 'endedAt');
        d.createObjectStore('tasks', { keyPath: 'id' });
        d.createObjectStore('kv');
      },
    });
    const old = { ...task('legacy'), createdAt: T0 - 5 } as Record<string, unknown>;
    delete old.updatedAt;
    await v1.put('tasks', old);
    await v1.put('sessions', session('s1'));
    v1.close();
    const repo = await openRepository(name);
    const loaded = await repo.load();
    expect(loaded.tasks[0]?.updatedAt).toBe(T0 - 5);
    expect(loaded.sessions).toHaveLength(1);
    expect(loaded.ledger).toEqual([]);
  });

  describe.each([
    ['indexeddb', async () => (await freshRepo()).repo],
    ['memory', async () => memoryRepository()],
  ])('%s ledger and tombstones', (_label, make) => {
    it('records ledger entries once', async () => {
      const repo = await make();
      const grant = {
        kind: 'grant' as const,
        id: 'daily-2026-10-26',
        amount: 1,
        reason: 'daily' as const,
        date: '2026-10-26',
        at: T0,
      };
      expect(await repo.addLedger(grant)).toBe(true);
      expect(await repo.addLedger(grant)).toBe(false);
      expect((await repo.load()).ledger).toEqual([grant]);
    });

    it('keeps a tombstone that is newer than an incoming task, and loses to a newer edit', async () => {
      const repo = await make();
      await repo.putTasks([task('a')]);
      await repo.deleteTasks(['a'], T0 + 100);
      await repo.writeAll({ sessions: [], tasks: [task('a', { updatedAt: T0 + 50 })] }, 'merge');
      expect((await repo.load()).tasks).toEqual([]);
      await repo.writeAll({ sessions: [], tasks: [task('a', { updatedAt: T0 + 200 })] }, 'merge');
      expect((await repo.load()).tasks.map((t) => t.id)).toEqual(['a']);
      await repo.writeAll(
        { sessions: [], tasks: [], tombstones: [{ id: 'a', deletedAt: T0 + 150 }] },
        'merge',
      );
      expect((await repo.load()).tasks).toHaveLength(1);
      await repo.writeAll(
        { sessions: [], tasks: [], tombstones: [{ id: 'a', deletedAt: T0 + 300 }] },
        'merge',
      );
      const after = await repo.load();
      expect(after.tasks).toEqual([]);
      expect(after.tombstones).toEqual([{ id: 'a', deletedAt: T0 + 300 }]);
    });
  });

  it('imports a 1.0 backup whose tasks have no updatedAt', () => {
    const v1 = JSON.parse(
      serializeBackup(
        buildBackup({ settings: DEFAULT_SETTINGS, tasks: [task('1')], sessions: [] }, T0),
      ),
    );
    delete v1.tasks[0].updatedAt;
    delete v1.settings.rewardStyle;
    delete v1.settings.commitment;
    delete v1.settings.accessory;
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.ok && parsed.backup.tasks[0]?.updatedAt).toBe(T0);
    expect(parsed.ok && parsed.backup.settings.rewardStyle).toBe('daily');
  });
});
