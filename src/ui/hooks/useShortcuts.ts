import { useEffect } from 'react';
import { applyTheme } from '../../state/engine';
import { resolvedTheme, useSettings } from '../../state/settingsStore';
import { useTimer } from '../../state/timerStore';
import { useUi } from '../../state/uiStore';

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Start or pause' },
  { keys: 'R', action: 'Reset the session' },
  { keys: 'S', action: 'Skip to the next session' },
  { keys: 'N', action: 'Add a task' },
  { keys: 'T', action: 'Switch light and dark theme' },
  { keys: '1 – 4', action: 'Timer, Tasks, Stats, Garden' },
  { keys: 'Alt + ↑ / ↓', action: 'Move the focused task' },
  { keys: '?', action: 'Show shortcuts' },
];

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function toggleTheme(): void {
  const { settings, update } = useSettings.getState();
  update({ theme: resolvedTheme(settings.theme) === 'dark' ? 'light' : 'dark' });
  applyTheme();
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const ui = useUi.getState();
      if (ui.sheet) return;
      if (document.querySelector('[role="dialog"]')) return;
      const timer = useTimer.getState();
      const key = e.key.toLowerCase();
      if (key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        timer.toggle();
      } else if (key === 'r') timer.reset();
      else if (key === 's') timer.skip();
      else if (key === 't') toggleTheme();
      else if (key === 'n') {
        e.preventDefault();
        ui.setView('tasks');
        window.setTimeout(() => document.getElementById('quick-add')?.focus(), 0);
      } else if (key === '?') ui.openSheet('shortcuts');
      else if (key === '1') ui.setView('timer');
      else if (key === '2') ui.setView('tasks');
      else if (key === '3') ui.setView('stats');
      else if (key === '4') ui.setView('garden');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
