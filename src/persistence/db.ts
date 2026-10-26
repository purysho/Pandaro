import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SessionRecord } from '../domain/timer/types';
import type { Task } from '../domain/tasks/types';
import { ledgerSchema, sessionSchema, taskSchema, type LedgerEntry } from './schema';

export const DB_NAME = 'pandaro';
export const DB_VERSION = 2;

export interface Tombstone {
  id: string;
  deletedAt: number;
}

interface PandaroDB extends DBSchema {
  sessions: { key: string; value: SessionRecord; indexes: { endedAt: number } };
  tasks: { key: string; value: Task };
  kv: { key: string; value: unknown };
  ledger: { key: string; value: LedgerEntry };
  tombstones: { key: string; value: Tombstone };
}

export interface LoadResult {
  sessions: SessionRecord[];
  tasks: Task[];
  ledger: LedgerEntry[];
  tombstones: Tombstone[];
  /** Number of stored records that failed validation and were moved aside. */
  quarantined: number;
}

export interface DataSet {
  tasks: readonly Task[];
  sessions: readonly SessionRecord[];
  ledger?: readonly LedgerEntry[];
  tombstones?: readonly Tombstone[];
}

/** Storage port used by the stores. */
export interface Repository {
  readonly persistent: boolean;
  load(): Promise<LoadResult>;
  /** Insert a session once. Resolves false if a record with the same id already exists. */
  addSession(record: SessionRecord): Promise<boolean>;
  putTasks(tasks: readonly Task[]): Promise<void>;
  /** Delete tasks and remember the deletion so it can be synced. */
  deleteTasks(ids: readonly string[], at?: number): Promise<void>;
  /** Insert a ledger entry once. Resolves false if it already exists. */
  addLedger(entry: LedgerEntry): Promise<boolean>;
  /**
   * Replace everything, or merge: sessions and ledger entries are append-only (existing wins),
   * tasks keep the newer `updatedAt`, and tombstones delete older tasks.
   */
  writeAll(data: DataSet, mode: 'replace' | 'merge'): Promise<void>;
  clear(): Promise<void>;
}

/** Fill fields added in schema v2 so older rows and backups stay valid. */
export function normalizeTask(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !('updatedAt' in raw)) {
    const r = raw as { createdAt?: unknown };
    return { ...raw, updatedAt: r.createdAt };
  }
  return raw;
}

function validate<T>(
  rows: unknown[],
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  normalize: (v: unknown) => unknown = (v) => v,
) {
  const ok: T[] = [];
  const bad: unknown[] = [];
  for (const row of rows) {
    const r = schema.safeParse(normalize(row));
    if (r.success) ok.push(r.data as T);
    else bad.push(row);
  }
  return { ok, bad };
}

/** Merge rule shared by both repositories. */
function keepIncomingTask(existing: Task | undefined, incoming: Task): boolean {
  return !existing || incoming.updatedAt >= existing.updatedAt;
}

export async function openRepository(name = DB_NAME): Promise<Repository> {
  const db: IDBPDatabase<PandaroDB> = await openDB<PandaroDB>(name, DB_VERSION, {
    async upgrade(database, oldVersion, _newVersion, tx) {
      // Version-ordered migrations. Each block upgrades from the previous schema.
      if (oldVersion < 1) {
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('endedAt', 'endedAt');
        database.createObjectStore('tasks', { keyPath: 'id' });
        database.createObjectStore('kv');
      }
      if (oldVersion < 2) {
        database.createObjectStore('ledger', { keyPath: 'id' });
        database.createObjectStore('tombstones', { keyPath: 'id' });
        // Tasks gain `updatedAt` (used for sync and merge); start from `createdAt`.
        const tasks = tx.objectStore('tasks');
        let cursor = await tasks.openCursor();
        while (cursor) {
          const value = normalizeTask(cursor.value) as Task;
          if (value !== cursor.value) await cursor.update(value);
          cursor = await cursor.continue();
        }
      }
    },
    blocking() {
      db.close();
    },
  });

  return {
    persistent: true,

    async load() {
      const tx = db.transaction(['sessions', 'tasks', 'kv', 'ledger', 'tombstones'], 'readwrite');
      const [rawSessions, rawTasks, rawLedger, tombstones] = await Promise.all([
        tx.objectStore('sessions').getAll(),
        tx.objectStore('tasks').getAll(),
        tx.objectStore('ledger').getAll(),
        tx.objectStore('tombstones').getAll(),
      ]);
      const sessions = validate<SessionRecord>(rawSessions, sessionSchema);
      const tasks = validate<Task>(rawTasks, taskSchema, normalizeTask);
      const ledger = validate<LedgerEntry>(rawLedger, ledgerSchema);
      const quarantined = sessions.bad.length + tasks.bad.length + ledger.bad.length;
      if (quarantined > 0) {
        const kv = tx.objectStore('kv');
        const previous = ((await kv.get('quarantine')) as unknown[] | undefined) ?? [];
        await kv.put(
          [...previous, ...sessions.bad, ...tasks.bad, ...ledger.bad].slice(-500),
          'quarantine',
        );
        const drop = async (store: 'sessions' | 'tasks' | 'ledger', rows: unknown[]) => {
          for (const row of rows) {
            const key = (row as { id?: unknown })?.id;
            if (typeof key === 'string') await tx.objectStore(store).delete(key);
          }
        };
        await drop('sessions', sessions.bad);
        await drop('tasks', tasks.bad);
        await drop('ledger', ledger.bad);
      }
      await tx.done;
      return { sessions: sessions.ok, tasks: tasks.ok, ledger: ledger.ok, tombstones, quarantined };
    },

    async addSession(record) {
      try {
        await db.add('sessions', record);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'ConstraintError') return false;
        throw error;
      }
    },

    async addLedger(entry) {
      try {
        await db.add('ledger', entry);
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'ConstraintError') return false;
        throw error;
      }
    },

    async putTasks(tasks) {
      const tx = db.transaction(['tasks', 'tombstones'], 'readwrite');
      await Promise.all([
        ...tasks.map((t) => tx.objectStore('tasks').put(t)),
        ...tasks.map((t) => tx.objectStore('tombstones').delete(t.id)),
        tx.done,
      ]);
    },

    async deleteTasks(ids, at = Date.now()) {
      const tx = db.transaction(['tasks', 'tombstones'], 'readwrite');
      await Promise.all([
        ...ids.map((id) => tx.objectStore('tasks').delete(id)),
        ...ids.map((id) => tx.objectStore('tombstones').put({ id, deletedAt: at })),
        tx.done,
      ]);
    },

    async writeAll(data, mode) {
      const tx = db.transaction(['sessions', 'tasks', 'ledger', 'tombstones'], 'readwrite');
      const sessions = tx.objectStore('sessions');
      const tasks = tx.objectStore('tasks');
      const ledger = tx.objectStore('ledger');
      const tombstones = tx.objectStore('tombstones');
      if (mode === 'replace') {
        await Promise.all([sessions.clear(), tasks.clear(), ledger.clear(), tombstones.clear()]);
      }
      for (const s of data.sessions) {
        if (mode === 'merge' && (await sessions.getKey(s.id)) !== undefined) continue;
        await sessions.put(s);
      }
      for (const e of data.ledger ?? []) {
        if (mode === 'merge' && (await ledger.getKey(e.id)) !== undefined) continue;
        await ledger.put(e);
      }
      for (const t of data.tasks) {
        if (mode === 'merge') {
          const gone = await tombstones.get(t.id);
          if (gone && gone.deletedAt >= t.updatedAt) continue;
          if (!keepIncomingTask(await tasks.get(t.id), t)) continue;
        }
        await tasks.put(t);
      }
      for (const stone of data.tombstones ?? []) {
        const existing = await tasks.get(stone.id);
        if (existing && existing.updatedAt > stone.deletedAt) continue;
        await tasks.delete(stone.id);
        await tombstones.put(stone);
      }
      await tx.done;
    },

    async clear() {
      const tx = db.transaction(['sessions', 'tasks', 'kv', 'ledger', 'tombstones'], 'readwrite');
      await Promise.all([
        tx.objectStore('sessions').clear(),
        tx.objectStore('tasks').clear(),
        tx.objectStore('kv').clear(),
        tx.objectStore('ledger').clear(),
        tx.objectStore('tombstones').clear(),
        tx.done,
      ]);
    },
  };
}

/** Used when IndexedDB is unavailable (some private modes). Data lasts for this session only. */
export function memoryRepository(): Repository {
  const sessions = new Map<string, SessionRecord>();
  const tasks = new Map<string, Task>();
  const ledger = new Map<string, LedgerEntry>();
  const tombstones = new Map<string, Tombstone>();
  return {
    persistent: false,
    async load() {
      return {
        sessions: [...sessions.values()],
        tasks: [...tasks.values()],
        ledger: [...ledger.values()],
        tombstones: [...tombstones.values()],
        quarantined: 0,
      };
    },
    async addSession(record) {
      if (sessions.has(record.id)) return false;
      sessions.set(record.id, record);
      return true;
    },
    async addLedger(entry) {
      if (ledger.has(entry.id)) return false;
      ledger.set(entry.id, entry);
      return true;
    },
    async putTasks(list) {
      for (const t of list) {
        tasks.set(t.id, t);
        tombstones.delete(t.id);
      }
    },
    async deleteTasks(ids, at = Date.now()) {
      for (const id of ids) {
        tasks.delete(id);
        tombstones.set(id, { id, deletedAt: at });
      }
    },
    async writeAll(data, mode) {
      if (mode === 'replace') {
        sessions.clear();
        tasks.clear();
        ledger.clear();
        tombstones.clear();
      }
      for (const s of data.sessions)
        if (mode === 'replace' || !sessions.has(s.id)) sessions.set(s.id, s);
      for (const e of data.ledger ?? [])
        if (mode === 'replace' || !ledger.has(e.id)) ledger.set(e.id, e);
      for (const t of data.tasks) {
        if (mode === 'merge') {
          const gone = tombstones.get(t.id);
          if (gone && gone.deletedAt >= t.updatedAt) continue;
          if (!keepIncomingTask(tasks.get(t.id), t)) continue;
        }
        tasks.set(t.id, t);
      }
      for (const stone of data.tombstones ?? []) {
        const existing = tasks.get(stone.id);
        if (existing && existing.updatedAt > stone.deletedAt) continue;
        tasks.delete(stone.id);
        tombstones.set(stone.id, stone);
      }
    },
    async clear() {
      sessions.clear();
      tasks.clear();
      ledger.clear();
      tombstones.clear();
    },
  };
}

export async function createRepository(): Promise<Repository> {
  try {
    if (typeof indexedDB === 'undefined') return memoryRepository();
    return await openRepository();
  } catch {
    return memoryRepository();
  }
}
