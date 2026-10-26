import { create } from 'zustand';
import type { TimerConfig } from '../domain/timer/types';
import { migrateSettings } from '../persistence/migrations';
import { DEFAULT_SETTINGS, type Settings, type Theme } from '../persistence/schema';
import { KEYS, readJSON, writeJSON } from '../persistence/storage';

const MIN = 60_000;

export function toTimerConfig(s: Settings): TimerConfig {
  return {
    focusMs: s.focusMin * MIN,
    shortMs: s.shortMin * MIN,
    longMs: s.longMin * MIN,
    cycleLength: s.cycleLength,
    autoProgress: s.autoProgress,
    autoStartFocus: s.autoStartFocus,
    autoStartBreaks: s.autoStartBreaks,
  };
}

export const PRESETS = [
  { id: 'classic', label: 'Classic 25 / 5 / 15', focusMin: 25, shortMin: 5, longMin: 15 },
  { id: 'deep', label: 'Deep work 50 / 10 / 20', focusMin: 50, shortMin: 10, longMin: 20 },
  { id: 'gentle', label: 'Gentle 15 / 3 / 10', focusMin: 15, shortMin: 3, longMin: 10 },
] as const;

interface SettingsState {
  settings: Settings;
  load(): void;
  update(patch: Partial<Omit<Settings, 'v'>>): void;
  replace(next: Settings): void;
  reset(): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  load: () => set({ settings: migrateSettings(readJSON(KEYS.settings)) }),
  update: (patch) => {
    const next = migrateSettings({ ...get().settings, ...patch });
    writeJSON(KEYS.settings, next);
    set({ settings: next });
  },
  replace: (next) => {
    const valid = migrateSettings(next);
    writeJSON(KEYS.settings, valid);
    set({ settings: valid });
  },
  reset: () => {
    writeJSON(KEYS.settings, DEFAULT_SETTINGS);
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));

export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
