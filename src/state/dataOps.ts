import { buildBackup, backupFileName, serializeBackup } from '../persistence/backup';
import type { Backup } from '../persistence/schema';
import { removeAll } from '../persistence/storage';
import { saveTextFile } from '../platform/files';
import { useHistory } from './historyStore';
import { repo } from './repo';
import { useRewards } from './rewardStore';
import { useSettings } from './settingsStore';
import { useTasks } from './taskStore';
import { useTimer } from './timerStore';

export function currentBackup(now = Date.now()): Backup {
  return buildBackup(
    {
      settings: useSettings.getState().settings,
      tasks: useTasks.getState().tasks,
      sessions: useHistory.getState().sessions,
      ledger: useRewards.getState().ledger,
    },
    now,
    `pandaro ${__APP_VERSION__}`,
  );
}

export async function exportData(): Promise<'saved' | 'shared'> {
  const now = Date.now();
  return saveTextFile(backupFileName(now), serializeBackup(currentBackup(now)));
}

async function reloadFromRepo(): Promise<void> {
  const loaded = await repo().load();
  useHistory.getState().replace(loaded.sessions);
  useTasks.getState().replace(loaded.tasks);
  useRewards.getState().replace(loaded.ledger);
}

/**
 * Import a validated backup. Returns an undo function that restores the data as it was before.
 * Merge keeps existing records and settings; replace swaps everything, including settings.
 */
export async function importData(
  backup: Backup,
  mode: 'merge' | 'replace',
): Promise<() => Promise<void>> {
  const before = currentBackup();
  await repo().writeAll(
    { tasks: backup.tasks, sessions: backup.sessions, ledger: backup.ledger ?? [] },
    mode,
  );
  if (mode === 'replace') {
    useSettings.getState().replace(backup.settings);
    useTimer.getState().applySettings();
  }
  await reloadFromRepo();
  return async () => {
    await repo().writeAll(
      { tasks: before.tasks, sessions: before.sessions, ledger: before.ledger ?? [] },
      'replace',
    );
    useSettings.getState().replace(before.settings);
    useTimer.getState().applySettings();
    await reloadFromRepo();
  };
}

/** Remove every trace of local data: IndexedDB, localStorage and offline caches. */
export async function deleteAllData(): Promise<void> {
  await repo().clear();
  removeAll();
  try {
    if ('caches' in globalThis) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
  } catch {
    // Cache storage unavailable.
  }
}
