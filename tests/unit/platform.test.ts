import { describe, expect, it, vi } from 'vitest';
import { Chime } from '../../src/platform/audio/chime';
import { ClockWatch } from '../../src/platform/clock';
import { notificationId } from '../../src/platform/notifications/types';
import { webNotifications } from '../../src/platform/notifications/web';
import { formatClock, formatDay, formatDuration, spokenRemaining } from '../../src/ui/format';

function fakeAudio(state: AudioContextState = 'running') {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), gain: param() });
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(node),
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };
  return ctx;
}

describe('chime', () => {
  it('stays silent until unlocked by a gesture', () => {
    const ctx = fakeAudio();
    const c = new Chime(() => ctx as unknown as AudioContext);
    expect(c.play('toBreak', 1)).toBe(false);
    c.unlock();
    expect(c.unlocked).toBe(true);
    expect(c.play('toBreak', 0.5)).toBe(true);
    // Three notes, each with a fundamental and an overtone.
    expect(ctx.createOscillator).toHaveBeenCalledTimes(6);
  });

  it('plays once per key and never at zero volume', () => {
    const ctx = fakeAudio();
    const c = new Chime(() => ctx as unknown as AudioContext);
    c.unlock();
    expect(c.play('toFocus', 0)).toBe(false);
    expect(c.play('toFocus', 1, 's1')).toBe(true);
    expect(c.play('toFocus', 1, 's1')).toBe(false);
    for (let i = 0; i < 60; i++) c.play('toFocus', 1, `k${i}`);
    expect(c.play('toFocus', 1, 'k59')).toBe(false);
  });

  it('resumes a suspended context', () => {
    const ctx = fakeAudio('suspended');
    const c = new Chime(() => ctx as unknown as AudioContext);
    c.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    c.play('toBreak', 1);
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(c.unlocked).toBe(false);
  });

  it('handles environments without Web Audio', () => {
    const c = new Chime(() => null);
    c.unlock();
    expect(c.play('toBreak', 1)).toBe(false);
    const throwing = new Chime(() => {
      throw new Error('blocked');
    });
    expect(() => throwing.unlock()).not.toThrow();
    expect(throwing.play('toBreak', 1)).toBe(false);
  });

  it('survives audio graph errors', () => {
    const ctx = fakeAudio();
    ctx.createGain = vi.fn(() => {
      throw new Error('boom');
    });
    const c = new Chime(() => ctx as unknown as AudioContext);
    c.unlock();
    expect(c.play('toBreak', 1)).toBe(false);
  });
});

describe('clock watch', () => {
  it('reports backward wall-clock jumps only', () => {
    let wall = 1_000_000;
    let mono = 0;
    const w = new ClockWatch({ now: () => wall, mono: () => mono });
    wall += 1000;
    mono += 1000;
    expect(w.backwardJump()).toBe(0);
    wall += 3_600_000; // forward jump (or sleep): trusted
    mono += 1000;
    expect(w.backwardJump()).toBe(0);
    wall -= 600_000;
    mono += 1000;
    expect(w.backwardJump()).toBe(-601_000);
    w.reset();
    expect(w.backwardJump()).toBe(0);
  });
});

describe('notifications', () => {
  it('derives stable positive ids', () => {
    expect(notificationId('abc-1')).toBe(notificationId('abc-1'));
    expect(notificationId('abc-1')).not.toBe(notificationId('abc-2'));
    expect(notificationId('')).toBeGreaterThan(0);
  });

  it('web port reports unsupported without the Notification API and never schedules', async () => {
    expect(webNotifications.canSchedule).toBe(false);
    const original = (globalThis as { Notification?: unknown }).Notification;
    delete (globalThis as { Notification?: unknown }).Notification;
    expect(await webNotifications.permission()).toBe('unsupported');
    expect(await webNotifications.request()).toBe('unsupported');
    await webNotifications.show('a', 'b');
    (globalThis as { Notification?: unknown }).Notification = original;
    await expect(
      webNotifications.schedule({ key: 'k', at: 1, title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
    await expect(webNotifications.cancelAll()).resolves.toBeUndefined();
  });

  it('web port maps permission states', async () => {
    const show = vi.fn();
    const FakeNotification = Object.assign(
      function FakeNotification(title: string) {
        show(title);
      },
      {
        permission: 'default' as NotificationPermission,
        requestPermission: vi.fn(async () => {
          FakeNotification.permission = 'granted';
          return 'granted' as const;
        }),
      },
    );
    const original = (globalThis as { Notification?: unknown }).Notification;
    (globalThis as { Notification?: unknown }).Notification = FakeNotification;
    expect(await webNotifications.permission()).toBe('prompt');
    expect(await webNotifications.request()).toBe('granted');
    await webNotifications.show('Done', 'Body');
    expect(show).toHaveBeenCalledWith('Done');
    (globalThis as { Notification?: unknown }).Notification = original;
  });
});

describe('formatting', () => {
  it('formats the clock and never shows negatives', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00');
    expect(formatClock(61_001)).toBe('01:02');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('formats durations and spoken text', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(65 * 60_000)).toBe('1h 05m');
    expect(spokenRemaining(61_000)).toBe('1 minute 1 second remaining');
    expect(spokenRemaining(120_000)).toBe('2 minutes remaining');
    expect(spokenRemaining(0)).toBe('0 seconds remaining');
    expect(formatDay('2026-10-26')).toMatch(/Mon/);
    expect(formatDay('2026-10-26', 'long')).toMatch(/Oct/);
  });
});
