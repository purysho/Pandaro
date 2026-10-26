import { expect, test, type Page } from '@playwright/test';

/*
 * Every screen in portrait and landscape at phone, tablet and desktop sizes.
 * Runs once (desktop project); each case sets its own viewport.
 */
const VIEWPORTS = [
  { name: 'phone portrait', width: 412, height: 824, mobile: true },
  { name: 'phone landscape', width: 824, height: 412, mobile: true },
  { name: 'small phone landscape', width: 667, height: 375, mobile: true },
  { name: 'tablet portrait', width: 820, height: 1180, mobile: true },
  { name: 'tablet landscape', width: 1180, height: 820, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
] as const;

const VIEWS = ['Timer', 'Tasks', 'Stats', 'Garden'] as const;

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'viewports are set per test');
});

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => localStorage.setItem('pandaro.onboarded', '1'));
  await page.goto('/');
  await expect(page.getByRole('timer')).toBeVisible();
}

async function goTo(page: Page, view: (typeof VIEWS)[number]) {
  const tab = page.getByRole('tab', { name: view, exact: true });
  const button = page.getByRole('button', { name: view, exact: true });
  if (view === 'Timer' && !(await button.isVisible())) return;
  if (await tab.isVisible()) await tab.click();
  else await button.click();
}

async function noHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page must not scroll sideways').toBeLessThanOrEqual(innerWidth + 1);
}

async function inViewport(
  page: Page,
  name: string,
  locator = page.getByRole('button', { name, exact: true }),
) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  expect(box, `${name} is rendered`).not.toBeNull();
  if (!box || !vp) return;
  expect(box.y + box.height, `${name} is visible without scrolling`).toBeLessThanOrEqual(vp.height);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test('every screen fits without sideways scrolling', async ({ page }) => {
      await open(page, vp.width, vp.height);
      for (const view of VIEWS) {
        await goTo(page, view);
        await noHorizontalScroll(page);
      }
    });

    test('timer controls are visible without scrolling', async ({ page }) => {
      await open(page, vp.width, vp.height);
      await inViewport(page, 'Start');
      await inViewport(page, 'Reset session');
      await inViewport(page, 'Skip to next session');
      await inViewport(page, 'timer', page.getByRole('timer'));
    });

    test('navigation is reachable', async ({ page }) => {
      await open(page, vp.width, vp.height);
      const nav = page.getByRole('navigation', { name: 'Main' });
      if (vp.width >= 1024) {
        await expect(page.getByRole('tablist', { name: 'Sections' })).toBeVisible();
      } else {
        await expect(nav).toBeVisible();
        for (const v of VIEWS) await inViewport(page, v, nav.getByRole('button', { name: v }));
      }
    });

    test('dialogs fit the screen and scroll inside', async ({ page }) => {
      await open(page, vp.width, vp.height);
      await page.getByRole('button', { name: 'Settings' }).click();
      const dialog = page.getByRole('dialog', { name: 'Settings' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box?.height ?? 0).toBeLessThanOrEqual(vp.height);
      await inViewport(page, 'Close', dialog.getByRole('button', { name: 'Close' }));
      await noHorizontalScroll(page);
      await dialog.getByRole('button', { name: 'Delete all data' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: 'Delete all data' })).toBeInViewport();
    });

    test('onboarding fits', async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      const dialog = page.getByRole('dialog', { name: 'Welcome to Pandaro' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box?.height ?? 0).toBeLessThanOrEqual(vp.height);
      await dialog.getByRole('button', { name: 'Next' }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: 'Next' })).toBeInViewport();
    });
  });
}

test('rotating mid-session keeps the timer running and its time', async ({ page }) => {
  await open(page, 412, 824);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(1500);
  const before = await page.getByRole('timer').textContent();
  await page.setViewportSize({ width: 824, height: 412 });
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  const after = await page.getByRole('timer').textContent();
  expect(['24:59', '24:58', '24:57', '24:56']).toContain(after);
  expect((after ?? '') <= (before ?? '')).toBe(true);
  await page.setViewportSize({ width: 412, height: 824 });
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
