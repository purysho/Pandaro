import { LocalNotifications } from '@capacitor/local-notifications';
import { notificationId, type NotificationPort, type PermissionState } from './types';

const CHANNEL = 'pandaro-sessions';
let channelReady: Promise<void> | null = null;

function ensureChannel(): Promise<void> {
  channelReady ??= LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Session reminders',
    description: 'Tells you when a focus session or break ends',
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => undefined);
  return channelReady;
}

function map(state: string): PermissionState {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

let scheduled: number[] = [];

export const nativeNotifications: NotificationPort = {
  canSchedule: true,
  async permission() {
    try {
      return map((await LocalNotifications.checkPermissions()).display);
    } catch {
      return 'unsupported';
    }
  },
  async request() {
    try {
      return map((await LocalNotifications.requestPermissions()).display);
    } catch {
      return 'unsupported';
    }
  },
  async schedule(n) {
    await ensureChannel();
    await this.cancelAll();
    const id = notificationId(n.key);
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: n.title,
          body: n.body,
          channelId: CHANNEL,
          schedule: { at: new Date(n.at), allowWhileIdle: true },
          extra: { session: n.key },
        },
      ],
    });
    scheduled = [id];
  },
  async cancelAll() {
    try {
      const pending = await LocalNotifications.getPending();
      const ids = new Set([...scheduled, ...pending.notifications.map((p) => p.id)]);
      if (ids.size > 0) {
        await LocalNotifications.cancel({ notifications: [...ids].map((id) => ({ id })) });
      }
    } catch {
      // Nothing to cancel.
    }
    scheduled = [];
  },
  async show(title, body) {
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{ id: notificationId(`now-${Date.now()}`), title, body, channelId: CHANNEL }],
    });
  },
};
