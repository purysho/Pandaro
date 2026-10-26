import type { NotificationPort, PermissionState } from './types';

function current(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'default') return 'prompt';
  return Notification.permission;
}

/**
 * Browsers cannot schedule notifications for a time when the page isn't running, so the web
 * port only shows notifications immediately (used when a session ends in a background tab).
 */
export const webNotifications: NotificationPort = {
  canSchedule: false,
  async permission() {
    return current();
  },
  async request() {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      await Notification.requestPermission();
    } catch {
      // Older Safari uses a callback form; fall through to the current state.
    }
    return current();
  },
  async schedule() {
    // Not possible on the web.
  },
  async cancelAll() {
    // Nothing scheduled on the web.
  },
  async show(title, body) {
    if (current() !== 'granted') return;
    const options: NotificationOptions = {
      body,
      icon: 'icons/icon-192.png',
      tag: 'pandaro-session',
    };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
      new Notification(title, options);
    } catch {
      // Notification failed (e.g. Android Chrome without a service worker); the in-app chime still plays.
    }
  },
};
