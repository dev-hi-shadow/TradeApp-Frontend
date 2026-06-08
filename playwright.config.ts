import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config — mobile-first app, so we run every spec on BOTH a desktop and a
 * Pixel 5 viewport. A `setup` project logs in once (API → localStorage token)
 * and saves storageState, which the test projects reuse so they land
 * authenticated straight on protected routes.
 *
 * The dev server (Vite :5173) is reused if already running; the backend
 * (:4000, Mongo, Redis, Angel) must be up separately — these are integration
 * tests against the real stack.
 */
const STORAGE = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Pixel 5',
      use: { ...devices['Pixel 5'], storageState: STORAGE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
