import { Capacitor } from '@capacitor/core';
import { webNotifications } from './notifications/web';
import type { NotificationPort } from './notifications/types';

export const isNative = Capacitor.isNativePlatform();
export const platformName = Capacitor.getPlatform() as 'web' | 'android' | 'ios';

let notificationsPort: Promise<NotificationPort> | null = null;

export function notifications(): Promise<NotificationPort> {
  notificationsPort ??= isNative
    ? import('./notifications/native').then((m) => m.nativeNotifications)
    : Promise.resolve(webNotifications);
  return notificationsPort;
}

/** Keep the screen on while a session runs. Silently does nothing when unsupported. */
export const keepAwake = (() => {
  let sentinel: WakeLockSentinel | null = null;
  let active = false;
  return {
    async set(on: boolean): Promise<void> {
      if (on === active) return;
      active = on;
      try {
        if (isNative) {
          const { KeepAwake } = await import('@capacitor-community/keep-awake');
          await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
          return;
        }
        if (on) {
          sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
          sentinel?.addEventListener('release', () => {
            sentinel = null;
            active = false;
          });
        } else {
          await sentinel?.release();
          sentinel = null;
        }
      } catch {
        active = false;
      }
    },
  };
})();

export async function hapticTap(strong = false): Promise<void> {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // Haptics unavailable.
  }
}

export async function setNativeChrome(dark: boolean, background: string): Promise<void> {
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (platformName === 'android') await StatusBar.setBackgroundColor({ color: background });
  } catch {
    // Status bar plugin unavailable.
  }
}

export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // Splash plugin unavailable.
  }
}

export interface LifecycleHandlers {
  onActive(): void;
  onInactive(): void;
  /** Return true if the back press was handled in-app. */
  onBack(): boolean;
}

export async function watchLifecycle(handlers: LifecycleHandlers): Promise<() => void> {
  const onVisibility = () =>
    document.visibilityState === 'visible' ? handlers.onActive() : handlers.onInactive();
  const onPageShow = () => handlers.onActive();
  const onPageHide = () => handlers.onInactive();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  const cleanups: (() => void)[] = [
    () => document.removeEventListener('visibilitychange', onVisibility),
    () => window.removeEventListener('pageshow', onPageShow),
    () => window.removeEventListener('pagehide', onPageHide),
  ];
  if (isNative) {
    const { App } = await import('@capacitor/app');
    const state = await App.addListener('appStateChange', ({ isActive }) =>
      isActive ? handlers.onActive() : handlers.onInactive(),
    );
    const back = await App.addListener('backButton', () => {
      if (!handlers.onBack()) void App.minimizeApp();
    });
    const tap = await import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
      LocalNotifications.addListener('localNotificationActionPerformed', () => handlers.onActive()),
    );
    cleanups.push(
      () => void state.remove(),
      () => void back.remove(),
      () => void tap.remove(),
    );
  }
  return () => cleanups.forEach((c) => c());
}
