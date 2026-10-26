import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SessionRecord } from '../domain/timer/types';
import type { Task } from '../domain/tasks/types';
import { sessionSchema, taskSchema } from './schema';

export const DB_NAME = 'pandaro';
export const DB_VERSION = 1;

interface PandaroDB extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { endedAt: number };
  };
  tasks: {
    key: string;
    value: Task;
  };
  kv: {
    key: string;
    value: unknown;
  };
}

export interface LoadResult {
  sessions: SessionRecord[];
  tasks: Task[];
  /** Number of stored records that failed validation and were moved aside. */
  quarantined: number;
}

/** Storage port used by the stores. */
export interface Repository {
  readonly persistent: boolean;
  load(): Promise<LoadResult>;
  /** Insert a session once. Resolves false if a record with the same id already exists. */
  addSession(record: SessionRecord): Promise<boolean>;
  putTasks(tasks: readonly Task[]): Promise<void>;
  deleteTasks(ids: readonly string[]): Promise<void>;
  /** Replace or merge everything in one transaction. */
  writeAll(
    data: { tasks: readonly Task[]; sessions: readonly SessionRecord[] },
    mode: 'replace' | 'merge',
  ): Promise<void>;
  clear(): Promise<void>;
}

function validate<T>(
  rows: unknown[],
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
) {
  const ok: T[] = [];
  const bad: unknown[] = [];
  for (const row of rows) {
    const r = schema.safeParse(row);
    if (r.success) ok.push(r.data as T);
    else bad.push(row);
  }
  return { ok, bad };
}

export async function openRepository(name = DB_NAME): Promise<Repository> {
  const db: IDBPDatabase<PandaroDB> = await openDB<PandaroDB>(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      // Version-ordered migrations. Each block upgrades from the previous schema.
      if (oldVersion < 1) {
        const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('endedAt', 'endedAt');
        database.createObjectStore('tasks', { keyPath: 'id' });
        database.createObjectStore('kv');
      }
    },
    blocking() {
      db.close();
    },
  });

  return {
    persistent: true,

    async load() {
      const tx = db.transaction(['sessions', 'tasks', 'kv'], 'readwrite');
      const [rawSessions, rawTasks] = await Promise.all([
        tx.objectStore('sessions').getAll(),
        tx.objectStore('tasks').getAll(),
      ]);
      const sessions = validate<SessionRecord>(rawSessions, sessionSchema);
      const tasks = validate<Task>(rawTasks, taskSchema);
      const quarantined = sessions.bad.length + tasks.bad.length;
      if (quarantined > 0) {
        const kv = tx.objectStore('kv');
        const previous = ((await kv.get('quarantine')) as unknown[] | undefined) ?? [];
        await kv.put([...previous, ...sessions.bad, ...tasks.bad].slice(-500), 'quarantine');
        for (const row of sessions.bad) {
          const key = (row as { id?: unknown })?.id;
          if (typeof key === 'string') await tx.objectStore('sessions').delete(key);
        }
        for (const row of tasks.bad) {
          const key = (row as { id?: unknown })?.id;
          if (typeof key === 'string') await tx.objectStore('tasks').delete(key);
        }
      }
      await tx.done;
      return { sessions: sessions.ok, tasks: tasks.ok, quarantined };
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

    async putTasks(tasks) {
      const tx = db.transaction('tasks', 'readwrite');
      await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
    },

    async deleteTasks(ids) {
      const tx = db.transaction('tasks', 'readwrite');
      await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
    },

    async writeAll(data, mode) {
      const tx = db.transaction(['sessions', 'tasks'], 'readwrite');
      const sessions = tx.objectStore('sessions');
      const tasks = tx.objectStore('tasks');
      if (mode === 'replace') {
        await Promise.all([sessions.clear(), tasks.clear()]);
      }
      for (const s of data.sessions) {
        if (mode === 'merge' && (await sessions.getKey(s.id)) !== undefined) continue;
        await sessions.put(s);
      }
      for (const t of data.tasks) {
        if (mode === 'merge') {
          const existing = await tasks.get(t.id);
          if (existing && existing.createdAt > t.createdAt) continue;
        }
        await tasks.put(t);
      }
      await tx.done;
    },

    async clear() {
      const tx = db.transaction(['sessions', 'tasks', 'kv'], 'readwrite');
      await Promise.all([
        tx.objectStore('sessions').clear(),
        tx.objectStore('tasks').clear(),
        tx.objectStore('kv').clear(),
        tx.done,
      ]);
    },
  };
}

/** Used when IndexedDB is unavailable (some private modes). Data lasts for this session only. */
export function memoryRepository(): Repository {
  const sessions = new Map<string, SessionRecord>();
  const tasks = new Map<string, Task>();
  return {
    persistent: false,
    async load() {
      return { sessions: [...sessions.values()], tasks: [...tasks.values()], quarantined: 0 };
    },
    async addSession(record) {
      if (sessions.has(record.id)) return false;
      sessions.set(record.id, record);
      return true;
    },
    async putTasks(list) {
      for (const t of list) tasks.set(t.id, t);
    },
    async deleteTasks(ids) {
      for (const id of ids) tasks.delete(id);
    },
    async writeAll(data, mode) {
      if (mode === 'replace') {
        sessions.clear();
        tasks.clear();
      }
      for (const s of data.sessions)
        if (mode === 'replace' || !sessions.has(s.id)) sessions.set(s.id, s);
      for (const t of data.tasks) {
        const existing = tasks.get(t.id);
        if (mode === 'merge' && existing && existing.createdAt > t.createdAt) continue;
        tasks.set(t.id, t);
      }
    },
    async clear() {
      sessions.clear();
      tasks.clear();
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
