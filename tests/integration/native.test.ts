import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate running inside the Capacitor Android shell.
const ln = vi.hoisted(() => ({
  createChannel: vi.fn(async () => undefined),
  checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async () => undefined),
  getPending: vi.fn(async () => ({ notifications: [{ id: 77 }] })),
  cancel: vi.fn(async () => undefined),
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
}));
const app = vi.hoisted(() => ({
  listeners: {} as Record<string, (arg: unknown) => void>,
  minimizeApp: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, cb: (arg: unknown) => void) => {
      app.listeners[name] = cb;
      return { remove: vi.fn() };
    }),
    minimizeApp: app.minimizeApp,
  },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => undefined) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(async () => undefined) },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: vi.fn(async () => undefined) },
}));
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: vi.fn(async () => undefined), allowSleep: vi.fn(async () => undefined) },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(async () => ({ uri: 'file:///cache/backup.json' })) },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => undefined) } }));

const platform = await import('../../src/platform');
const { nativeNotifications } = await import('../../src/platform/notifications/native');
const { saveTextFile } = await import('../../src/platform/files');
const { useTimer, setClock } = await import('../../src/state/timerStore');
const { syncNotification } = await import('../../src/state/notificationSync');
const { useSettings } = await import('../../src/state/settingsStore');
const { useUi } = await import('../../src/state/uiStore');
const { DEFAULT_SETTINGS } = await import('../../src/persistence/schema');
const { createInitialState } = await import('../../src/domain/timer/machine');
const { toTimerConfig } = await import('../../src/state/settingsStore');

const MIN = 60_000;
let wall = Date.UTC(2026, 9, 26, 9);

beforeEach(() => {
  vi.clearAllMocks();
  wall = Date.UTC(2026, 9, 26, 9);
  setClock({ now: () => wall, mono: () => wall });
  useSettings.setState({ settings: { ...DEFAULT_SETTINGS, notifications: true } });
  useTimer.getState().hydrate(createInitialState('n', toTimerConfig(DEFAULT_SETTINGS), wall));
  useTimer.setState({ active: true });
});

describe('native notifications', () => {
  it('reports native platform', () => {
    expect(platform.isNative).toBe(true);
    expect(platform.platformName).toBe('android');
  });

  it('maps permissions', async () => {
    expect(await nativeNotifications.permission()).toBe('prompt');
    expect(await nativeNotifications.request()).toBe('granted');
    ln.checkPermissions.mockResolvedValueOnce({ display: 'denied' });
    expect(await nativeNotifications.permission()).toBe('denied');
    ln.checkPermissions.mockRejectedValueOnce(new Error('x'));
    expect(await nativeNotifications.permission()).toBe('unsupported');
  });

  it('schedules exactly one notification while in the background and cancels in the foreground', async () => {
    useTimer.getState().start();
    useTimer.getState().setActive(false);
    await vi.waitFor(() => expect(ln.schedule).toHaveBeenCalledTimes(1));
    const call = ln.schedule.mock.calls[0] as unknown as [
      { notifications: { schedule: { at: Date }; title: string }[] },
    ];
    const n = call[0].notifications[0];
    expect(n?.schedule.at.getTime()).toBe(wall + 25 * MIN);
    expect(n?.title).toMatch(/Focus complete/);
    // Previously pending notifications are cancelled first (no duplicates).
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 77 }] });

    ln.schedule.mockClear();
    ln.cancel.mockClear();
    useTimer.getState().setActive(true);
    await syncNotification();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
    expect(ln.schedule).not.toHaveBeenCalled();
    // Repeating the same state does nothing.
    await syncNotification();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when paused and does not schedule when notifications are off', async () => {
    useTimer.getState().start();
    useTimer.getState().setActive(false);
    await syncNotification();
    expect(ln.schedule).toHaveBeenCalledTimes(1);
    ln.cancel.mockClear();
    useTimer.getState().pause();
    await syncNotification();
    expect(ln.cancel).toHaveBeenCalled();
    ln.schedule.mockClear();
    useSettings.getState().update({ notifications: false });
    useTimer.getState().start();
    await syncNotification();
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('shows an immediate notification on a channel', async () => {
    await nativeNotifications.show('Hi', 'Body');
    const call = ln.schedule.mock.calls.at(-1) as unknown as [
      { notifications: { channelId: string }[] },
    ];
    expect(call[0].notifications[0]?.channelId).toBe('pandaro-sessions');
  });
});

describe('native lifecycle and helpers', () => {
  it('routes app state, back button and notification taps', async () => {
    const onActive = vi.fn();
    const onInactive = vi.fn();
    const onBack = vi.fn(() => false);
    const stop = await platform.watchLifecycle({ onActive, onInactive, onBack });
    app.listeners.appStateChange?.({ isActive: false });
    app.listeners.appStateChange?.({ isActive: true });
    expect(onInactive).toHaveBeenCalled();
    expect(onActive).toHaveBeenCalled();
    app.listeners.backButton?.({});
    expect(app.minimizeApp).toHaveBeenCalled();
    onBack.mockReturnValue(true);
    app.minimizeApp.mockClear();
    app.listeners.backButton?.({});
    expect(app.minimizeApp).not.toHaveBeenCalled();
    stop();
  });

  it('uses native keep-awake, haptics, status bar, splash and share', async () => {
    const { KeepAwake } = await import('@capacitor-community/keep-awake');
    await platform.keepAwake.set(true);
    await platform.keepAwake.set(true);
    await platform.keepAwake.set(false);
    expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(1);
    expect(KeepAwake.allowSleep).toHaveBeenCalledTimes(1);
    await platform.hapticTap(true);
    await platform.setNativeChrome(true);
    await platform.hideSplash();
    const { Share } = await import('@capacitor/share');
    expect(await saveTextFile('b.json', '{}')).toBe('shared');
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['file:///cache/backup.json'] }),
    );
  });

  it('back closes the settings sheet, then returns to the timer', () => {
    useUi.setState({ sheet: 'settings', view: 'stats' });
    // Mirror the engine's back handler.
    const back = () => {
      const ui = useUi.getState();
      if (ui.sheet) return (ui.openSheet(null), true);
      if (ui.view !== 'timer') return (ui.setView('timer'), true);
      return false;
    };
    expect(back()).toBe(true);
    expect(useUi.getState().sheet).toBeNull();
    expect(back()).toBe(true);
    expect(useUi.getState().view).toBe('timer');
    expect(back()).toBe(false);
  });
});
