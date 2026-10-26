#!/usr/bin/env node
/*
 * Captures real screenshots of the running app with example data for the README, the PWA
 * manifest and store listings. Usage: start `npm run preview`, then
 *   node scripts/screenshots.mjs [baseUrl] [outDir]
 * Example data is generated locally and clearly fictional (tasks such as "Draft chapter two").
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = process.argv[3] ?? 'docs/store/screenshots';
await mkdir(out, { recursive: true });
await mkdir('public/icons', { recursive: true });

function exampleData(now) {
  const MIN = 60_000;
  const sessions = [];
  let n = 0;
  for (let day = 20; day >= 0; day--) {
    const count = day === 0 ? 2 : [0, 2, 3, 4, 5, 6, 4][(day * 5) % 7];
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - day);
    dayStart.setHours(9, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      const start = day === 0 ? now - (i + 1) * 40 * MIN : dayStart.getTime() + i * 35 * MIN;
      const end = start + 25 * MIN;
      if (end > now) continue;
      sessions.push({
        id: `example-${++n}`,
        kind: 'focus',
        outcome: i === count - 1 && day % 4 === 0 ? 'interrupted' : 'completed',
        plannedMs: 25 * MIN,
        actualMs: i === count - 1 && day % 4 === 0 ? 12 * MIN : 25 * MIN,
        segments: [{ start, end: i === count - 1 && day % 4 === 0 ? start + 12 * MIN : end }],
        startedAt: start,
        endedAt: i === count - 1 && day % 4 === 0 ? start + 12 * MIN : end,
        taskId: null,
        cycleIndex: i % 4,
      });
    }
  }
  const t = (id, title, order, extra = {}) => ({
    id,
    title,
    notes: '',
    estimate: null,
    completedPomodoros: 0,
    done: false,
    doneAt: null,
    createdAt: now - 86_400_000,
    order,
    ...extra,
  });
  const tasks = [
    t('t1', 'Draft chapter two', 1, {
      estimate: 4,
      completedPomodoros: 2,
      notes: 'Outline is in the notebook',
    }),
    t('t2', 'Review pull request feedback', 2, { estimate: 2 }),
    t('t3', 'Plan next week', 3, { estimate: 1 }),
    t('t4', 'Reply to Sam about the workshop', 4, {
      done: true,
      doneAt: now - 3_600_000,
      completedPomodoros: 1,
    }),
  ];
  return { sessions, tasks };
}

/** Seed example data in a first page, then return a fresh page that loads it. */
async function seed(page, { running = false, kind = 'focus' } = {}) {
  const ctx = page.context();
  await page.addInitScript(() => localStorage.setItem('pandaro.onboarded', '1'));
  await page.goto(base);
  await page.getByRole('timer').waitFor();
  const now = Date.now();
  const data = exampleData(now);
  await page.evaluate(async (d) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('pandaro');
      req.onsuccess = () => {
        const tx = req.result.transaction(['sessions', 'tasks'], 'readwrite');
        for (const s of d.sessions) tx.objectStore('sessions').put(s);
        for (const t of d.tasks) tx.objectStore('tasks').put(t);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
      };
    });
  }, data);
  // Closing the first page lets its pagehide handler write first; the fresh page then seeds the timer.
  await page.close();
  const fresh = await ctx.newPage();
  await fresh.addInitScript(
    ({ running, kind, now }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const planned = (kind === 'focus' ? 25 : 5) * 60_000;
      const elapsed = kind === 'focus' ? 9 * 60_000 + 42_000 : 60_000 + 15_000;
      localStorage.setItem(
        'pandaro.timer.v1',
        JSON.stringify({
          v: 1,
          idPrefix: 'shot',
          seq: 100,
          sessionId: 'shot-100',
          kind,
          status: running ? 'running' : 'idle',
          plannedMs: planned,
          deadline: running ? now + planned - elapsed : null,
          remainingMs: planned,
          segments: running ? [{ start: now - elapsed }] : [],
          completedInCycle: 2,
          taskId: 't1',
          checkpoint: now,
          notice: null,
        }),
      );
    },
    { running, kind, now: Date.now() },
  );
  await fresh.goto(base);
  await fresh.getByRole('timer').waitFor();
  await fresh.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  return fresh;
}

const browser = await chromium.launch();
async function shot(name, contextOptions, fn) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', ...contextOptions });
  const first = await ctx.newPage();
  const page = (await fn(first)) ?? first;
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
  console.log('captured', name);
}

// Google Play requires screenshots no longer than 2:1, so the phone viewport is 412×824.
const phone = { ...devices['Pixel 7'], viewport: { width: 412, height: 824 } };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

for (const scheme of ['light', 'dark']) {
  await shot(`phone-timer-${scheme}`, { ...phone, colorScheme: scheme }, (p) =>
    seed(p, { running: true }),
  );
  await shot(`phone-tasks-${scheme}`, { ...phone, colorScheme: scheme }, async (p) => {
    const q = await seed(p);
    await q.getByRole('button', { name: 'Tasks', exact: true }).click();
    return q;
  });
  await shot(`phone-stats-${scheme}`, { ...phone, colorScheme: scheme }, async (p) => {
    const q = await seed(p);
    await q.getByRole('button', { name: 'Stats', exact: true }).click();
    return q;
  });
  await shot(`phone-garden-${scheme}`, { ...phone, colorScheme: scheme }, async (p) => {
    const q = await seed(p);
    await q.getByRole('button', { name: 'Garden', exact: true }).click();
    return q;
  });
  await shot(
    `desktop-${scheme}`,
    { viewport: { width: 1280, height: 800 }, colorScheme: scheme },
    (p) => seed(p, { running: true }),
  );
  await shot(
    `desktop-stats-${scheme}`,
    { viewport: { width: 1280, height: 800 }, colorScheme: scheme },
    async (p) => {
      const q = await seed(p);
      await q.getByRole('tab', { name: 'Stats' }).click();
      return q;
    },
  );
}
await shot('phone-break-light', { ...phone, colorScheme: 'light' }, (p) =>
  seed(p, { running: true, kind: 'short' }),
);
await shot('phone-settings-light', { ...phone, colorScheme: 'light' }, async (p) => {
  const q = await seed(p);
  await q.getByRole('button', { name: 'Settings' }).click();
  return q;
});
await shot(
  'phone-landscape-light',
  { viewport: { width: 844, height: 390 }, isMobile: true, colorScheme: 'light' },
  (p) => seed(p, { running: true }),
);
await shot('tablet-light', { viewport: { width: 820, height: 1180 }, colorScheme: 'light' }, (p) =>
  seed(p, { running: true }),
);
// PWA manifest screenshots (exact sizes declared in vite.config.ts).
await shot(
  '../../../public/icons/screenshot-wide',
  { viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
  (p) => seed(p, { running: true }),
);
await shot(
  '../../../public/icons/screenshot-narrow',
  { ...iphone, deviceScaleFactor: 2, colorScheme: 'light' },
  (p) => seed(p, { running: true }),
);
await browser.close();
