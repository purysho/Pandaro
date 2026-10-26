/** localStorage access that never throws (private mode, blocked storage, quota). */

export const KEYS = {
  settings: 'pandaro.settings.v1',
  timer: 'pandaro.timer.v1',
  onboarded: 'pandaro.onboarded',
} as const;

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readJSON(key: string): unknown {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readFlag(key: string): boolean {
  try {
    return store()?.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, on: boolean): void {
  try {
    if (on) store()?.setItem(key, '1');
    else store()?.removeItem(key);
  } catch {
    // Storage unavailable: the flag simply won't persist.
  }
}

export function removeAll(): void {
  try {
    const s = store();
    if (!s) return;
    for (const key of Object.keys(s)) if (key.startsWith('pandaro.')) s.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

export function storageAvailable(): boolean {
  try {
    const s = store();
    if (!s) return false;
    const probe = 'pandaro.__probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
