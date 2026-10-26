import { defineConfig, devices } from '@playwright/test';

const port = 4173;
/** Set PANDARO_E2E_URL to test an already running deployment (e.g. the Docker container). */
const external = process.env.PANDARO_E2E_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  ...(external
    ? {}
    : {
        webServer: {
          command: `npm run preview`,
          port,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});
