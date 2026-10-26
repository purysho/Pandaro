import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const shared = {
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify('test') },
  resolve: {
    alias: {
      'virtual:pwa-register': new URL('./tests/stubs/pwa-register.ts', import.meta.url).pathname,
    },
  },
};

const tzProject = (tz: string) => ({
  test: {
    name: `tz:${tz}`,
    include: ['tests/unit/**/*.tz.test.ts'],
    environment: 'node',
    env: { TZ: tz },
    globals: true,
  },
});

export default defineConfig(
  mergeConfig(shared, {
    test: {
      coverage: {
        provider: 'v8',
        include: ['src/domain/**', 'src/persistence/**', 'src/state/**', 'src/platform/**'],
        reporter: ['text-summary', 'text', 'html'],
        thresholds: {
          'src/domain/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
          'src/persistence/**': { lines: 90, functions: 90, branches: 80, statements: 90 },
        },
      },
      projects: [
        {
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
            exclude: ['tests/unit/**/*.tz.test.ts'],
            environment: 'jsdom',
            env: { TZ: 'Europe/London' },
            setupFiles: ['tests/setup.ts'],
            globals: true,
          },
        },
        tzProject('UTC'),
        tzProject('America/New_York'),
        tzProject('Australia/Lord_Howe'),
        tzProject('Asia/Kolkata'),
      ],
    },
  }),
);
