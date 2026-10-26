import { isNative } from '../platform';
import { useUi } from '../state/uiStore';

/**
 * Register the service worker in "prompt" mode: a new version installs in the background and
 * waits until the user chooses to reload, so nobody is stuck on an old release or interrupted
 * mid-session.
 */
export async function registerServiceWorker(): Promise<void> {
  if (isNative || import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        useUi.getState().setUpdateReady(() => void update(true));
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        // Check for updates hourly while the app stays open.
        window.setInterval(() => void registration.update().catch(() => undefined), 60 * 60_000);
      },
    });
  } catch {
    // Service worker unavailable (e.g. insecure context); the app still works online.
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => undefined);
  deferred = null;
  listeners.forEach((l) => l());
}
