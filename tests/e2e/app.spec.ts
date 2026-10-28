import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MIN = 60_000;

async function skipOnboarding(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pandaro.onboarded', '1'));
}

function trackProblems(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.protocol !== 'data:' &&
      url.protocol !== 'blob:'
    ) {
      problems.push(`external request: ${r.url()}`);
    }
  });
  return problems;
}

async function go(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('timer')).toBeVisible();
}

async function finishAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

test.describe('Pandaro', () => {
  test('loads cleanly with no external requests and no errors', async ({ page }) => {
    const problems = trackProblems(page);
    await go(page);
    await expect(page).toHaveTitle('Pandaro');
    await expect(page.getByRole('dialog', { name: 'Welcome to Pandaro' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(1200);
    expect(problems).toEqual([]);
  });

  test('a full four-session cycle with a fast-forwarded clock', async ({ page }) => {
    await skipOnboarding(page);
    await page.clock.install({ time: new Date('2026-10-26T09:00:00') });
    await go(page);
    const start = page.getByRole('button', { name: 'Start', exact: true });
    const timer = page.getByRole('timer');

    for (let i = 1; i <= 4; i++) {
      await start.click();
      await page.clock.fastForward(25 * MIN);
      await page.clock.runFor(1000);
      await expect(page.getByTestId('today-sessions')).toHaveText(String(i));
      await expect(
        page.getByRole('img', { name: `${i} of 4 focus sessions completed in this cycle` }),
      ).toBeVisible();
      if (i < 4) {
        await expect(timer).toHaveText('05:00');
        await start.click();
        await page.clock.fastForward(5 * MIN);
        await page.clock.runFor(1000);
        await expect(timer).toHaveText('25:00');
      }
    }
    await expect(timer).toHaveText('15:00');
    await expect(page.getByText('Long break', { exact: true }).last()).toBeVisible();
    await start.click();
    await page.clock.fastForward(15 * MIN);
    await page.clock.runFor(1000);
    await expect(
      page.getByRole('img', { name: '0 of 4 focus sessions completed in this cycle' }),
    ).toBeVisible();
    await expect(page.getByTestId('today-focus')).toHaveText('1h 40m');
  });

  test('a refresh mid-session keeps the remaining time', async ({ page }) => {
    await skipOnboarding(page);
    await go(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.reload();
    const text = await page.getByRole('timer').textContent();
    expect(['24:57', '24:56', '24:58']).toContain(text);
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('a session that ended while away completes once and does not chain', async ({ page }) => {
    await skipOnboarding(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const now = Date.now();
      const deadline = now - 2 * 60 * 60_000;
      localStorage.setItem(
        'pandaro.settings.v1',
        JSON.stringify({ v: 1, autoStartBreaks: true, autoStartFocus: true }),
      );
      localStorage.setItem(
        'pandaro.timer.v1',
        JSON.stringify({
          v: 1,
          idPrefix: 'e2e',
          seq: 1,
          sessionId: 'e2e-1',
          kind: 'focus',
          status: 'running',
          plannedMs: 25 * 60_000,
          deadline,
          remainingMs: 25 * 60_000,
          segments: [{ start: deadline - 25 * 60_000 }],
          completedInCycle: 0,
          taskId: null,
          checkpoint: deadline - 20 * 60_000,
          notice: null,
        }),
      );
    });
    await go(page);
    await expect(page.getByText(/finished at .* while you were away/)).toBeVisible();
    await expect(page.getByTestId('today-sessions')).toHaveText(/^[01]$/);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveText('05:00');
    await page.reload();
    await expect(page.getByRole('timer')).toHaveText('05:00');
    const stored = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('pandaro');
          req.onsuccess = () => {
            const tx = req.result.transaction('sessions');
            const count = tx.objectStore('sessions').count();
            count.onsuccess = () => resolve(count.result);
          };
        }),
    );
    expect(stored).toBe(1);
  });

  test('tasks persist across reloads and track sessions', async ({ page }) => {
    await skipOnboarding(page);
    await page.clock.install({ time: new Date('2026-10-26T10:00:00') });
    await go(page);
    const isWide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (!isWide) await page.getByRole('button', { name: 'Tasks' }).click();
    await page.getByLabel('New task', { exact: true }).fill('Write the proposal');
    await page.getByLabel('New task', { exact: true }).press('Enter');
    await expect(page.getByText('· Current focus')).toBeVisible();
    if (!isWide) await page.getByRole('button', { name: 'Timer' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.clock.fastForward(25 * MIN);
    await page.clock.runFor(1000);
    await page.reload();
    if (!isWide) await page.getByRole('button', { name: 'Tasks' }).click();
    await expect(page.getByLabel('1 sessions done')).toBeVisible();
  });

  test('keyboard-only use', async ({ page }) => {
    await skipOnboarding(page);
    await go(page);
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByRole('timer')).toHaveText('25:00');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to timer' })).toBeFocused();
  });

  test('theme choice persists without a flash', async ({ page }) => {
    await skipOnboarding(page);
    await go(page);
    await page.keyboard.press('t');
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.reload({ waitUntil: 'commit' });
    await page.waitForSelector('html[data-theme]', { state: 'attached' });
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  });

  test('serves a valid web app manifest and icons', async ({ page, request }) => {
    await go(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(`/${href?.replace(/^\//, '')}`)).json();
    expect(manifest).toMatchObject({ name: 'Pandaro', display: 'standalone' });
    for (const icon of manifest.icons as { src: string; purpose: string }[]) {
      const res = await request.get(`/${icon.src}`);
      expect(res.status(), icon.src).toBe(200);
    }
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  test('works offline after the first visit', async ({ page, context }) => {
    await skipOnboarding(page);
    await go(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('timer')).toHaveText('25:00');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await context.setOffline(false);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious accessibility violations (${theme})`, async ({ page }) => {
      await skipOnboarding(page);
      await page.emulateMedia({ colorScheme: theme });
      await go(page);
      await page.addStyleTag({ content: '.view-enter { animation: none !important; }' });
      const views =
        (page.viewportSize()?.width ?? 0) >= 1024
          ? ['Tasks', 'Stats', 'Garden']
          : ['Timer', 'Tasks', 'Stats', 'Garden'];
      for (const view of views) {
        await page
          .getByRole((page.viewportSize()?.width ?? 0) >= 1024 ? 'tab' : 'button', {
            name: view,
            exact: true,
          })
          .click();
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        expect(
          serious.map(
            (v) => `${view}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      }
      await page.getByRole('button', { name: 'Settings' }).click();
      // Contrast is only meaningful once the dialog's fade-in has finished.
      await finishAnimations(page);
      const settings = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(
        settings.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => v.id),
      ).toEqual([]);
    });
  }
});
