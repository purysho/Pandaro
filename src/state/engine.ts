import { createRepository } from '../persistence/db';
import { migrateTimer } from '../persistence/migrations';
import { KEYS, storageAvailable } from '../persistence/storage';
import { ClockWatch } from '../platform/clock';
import { keepAwake, setNativeChrome, watchLifecycle } from '../platform';
import { useHistory } from './historyStore';
import { useRewards } from './rewardStore';
import { setRepo } from './repo';
import { resolvedTheme, useSettings } from './settingsStore';
import { useTasks } from './taskStore';
import { loadTimerSnapshot, useTimer } from './timerStore';
import { useUi } from './uiStore';

const TICK_MS = 250;

/** Apply the theme to <html>. Mirrors public/theme-init.js, which runs before first paint. */
export function applyTheme(): void {
  const { theme, reduceMotion } = useSettings.getState().settings;
  const resolved = resolvedTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.reduceMotion = reduceMotion ? 'true' : 'false';
  root.style.colorScheme = resolved;
  const bg = resolved === 'dark' ? '#161816' : '#F7F3EA';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  void setNativeChrome(resolved === 'dark');
}

/** Load persisted data and start the clock. Returns a cleanup function. */
export async function startEngine(): Promise<() => void> {
  useSettings.getState().load();
  applyTheme();

  const repository = await createRepository();
  setRepo(repository);
  if (!repository.persistent || !storageAvailable()) useUi.getState().setStorageWarning(true);

  const loaded = await repository.load().catch(() => ({
    sessions: [],
    tasks: [],
    ledger: [],
    tombstones: [],
    quarantined: 0,
  }));
  useHistory.getState().replace(loaded.sessions);
  useTasks.getState().replace(loaded.tasks);
  useRewards.getState().replace(loaded.ledger);
  if (loaded.quarantined > 0) {
    useUi
      .getState()
      .toast(
        `${loaded.quarantined} damaged record(s) were set aside so the rest of your data loads.`,
      );
  }

  useTimer.getState().hydrate(loadTimerSnapshot());
  const activeTask = useTimer.getState().timer.taskId;
  if (activeTask && !loaded.tasks.some((t) => t.id === activeTask && !t.done)) {
    useTimer.getState().setTask(null);
  }
  useTimer.getState().applySettings();
  useTimer.getState().tick();
  void useRewards.getState().grantToday(Date.now());

  const watch = new ClockWatch();
  const interval = window.setInterval(() => {
    const jump = watch.backwardJump();
    if (jump !== 0) useTimer.getState().shiftClock(jump);
    useTimer.getState().tick();
  }, TICK_MS);

  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.timer && e.newValue) {
      try {
        const state = migrateTimer(JSON.parse(e.newValue));
        if (state) useTimer.getState().adopt(state);
      } catch {
        // Ignore malformed writes from other tabs.
      }
    }
    if (e.key === KEYS.settings) {
      useSettings.getState().load();
      applyTheme();
      useTimer.getState().applySettings();
    }
  };
  window.addEventListener('storage', onStorage);

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onScheme = () => applyTheme();
  media?.addEventListener?.('change', onScheme);

  const stopLifecycle = await watchLifecycle({
    onActive: () => {
      watch.reset();
      useTimer.getState().setActive(true);
      useTimer.getState().tick();
    },
    onInactive: () => {
      useTimer.getState().tick();
      useTimer.getState().setActive(false);
    },
    onBack: () => {
      const ui = useUi.getState();
      if (ui.sheet) {
        ui.openSheet(null);
        return true;
      }
      if (ui.view !== 'timer') {
        ui.setView('timer');
        return true;
      }
      return false;
    },
  });

  const unsubAwake = useTimer.subscribe((s) => {
    const want =
      useSettings.getState().settings.keepAwake && s.active && s.timer.status === 'running';
    void keepAwake.set(want);
  });

  return () => {
    window.clearInterval(interval);
    window.removeEventListener('storage', onStorage);
    media?.removeEventListener?.('change', onScheme);
    stopLifecycle();
    unsubAwake();
    void keepAwake.set(false);
  };
}
