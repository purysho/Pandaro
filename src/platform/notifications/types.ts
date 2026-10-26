export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface SessionNotification {
  /** Session id the notification belongs to. */
  key: string;
  at: number;
  title: string;
  body: string;
}

export interface NotificationPort {
  /** True when notifications can be scheduled in advance (native apps only). */
  readonly canSchedule: boolean;
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  /** Schedule a single notification. Replaces any previously scheduled one. */
  schedule(n: SessionNotification): Promise<void>;
  cancelAll(): Promise<void>;
  /** Show a notification immediately. */
  show(title: string, body: string): Promise<void>;
}

/** Stable positive 31-bit integer id from a session id (Android notification ids are ints). */
export function notificationId(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return h & 0x7fffffff || 1;
}
