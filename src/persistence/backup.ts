import type { SessionRecord } from '../domain/timer/types';
import type { Task } from '../domain/tasks/types';
import { dateKey } from '../domain/stats/dates';
import {
  BACKUP_FORMAT,
  BACKUP_MAX_BYTES,
  BACKUP_VERSION,
  backupSchema,
  type Backup,
  type Settings,
} from './schema';

export function buildBackup(
  data: { settings: Settings; tasks: readonly Task[]; sessions: readonly SessionRecord[] },
  now: number,
  app = 'pandaro',
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    app,
    settings: data.settings,
    tasks: [...data.tasks],
    sessions: [...data.sessions],
  };
}

export function backupFileName(now: number): string {
  return `pandaro-backup-${dateKey(now)}.json`;
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/** Parse and validate untrusted backup text. Never throws. */
export function parseBackup(text: string): ParseResult {
  if (text.length > BACKUP_MAX_BYTES) {
    return { ok: false, error: 'This file is larger than 10 MB, so it is not a Pandaro backup.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: 'This file is not valid JSON. Choose a file exported from Pandaro.',
    };
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file is not a Pandaro backup.' };
  }
  const version = (raw as { version?: unknown }).version;
  if (typeof version === 'number' && version > BACKUP_VERSION) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of Pandaro. Update the app and try again.',
    };
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join('.') : 'file';
    return {
      ok: false,
      error: `The backup is damaged (problem at “${where}”). Nothing was imported.`,
    };
  }
  const ids = new Set<string>();
  for (const s of parsed.data.sessions) {
    if (ids.has(s.id)) return { ok: false, error: 'The backup contains duplicate sessions.' };
    ids.add(s.id);
  }
  return { ok: true, backup: parsed.data };
}

export interface ImportPreview {
  tasks: number;
  sessions: number;
  newSessions: number;
  exportedAt: number;
}

export function previewImport(backup: Backup, existing: readonly SessionRecord[]): ImportPreview {
  const known = new Set(existing.map((s) => s.id));
  return {
    tasks: backup.tasks.length,
    sessions: backup.sessions.length,
    newSessions: backup.sessions.filter((s) => !known.has(s.id)).length,
    exportedAt: backup.exportedAt,
  };
}
