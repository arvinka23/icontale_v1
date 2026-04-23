// ═══════════════════════════════════════════════════════════════
//  Playwright configuration
//
//  Browser smoke tests for IconTale. Runs against a locally-started
//  dev server by default; set PLAYWRIGHT_BASE_URL to point at a
//  staging deploy for ad-hoc verification.
//
//  Redis is a hard dependency of the server, so these tests are
//  skipped when REDIS_URL is not set. CI provisions Redis before
//  invoking the Playwright job.
// ═══════════════════════════════════════════════════════════════

import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT || 3100;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.(js|ts)/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  fullyParallel: true,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `PORT=${PORT} NODE_ENV=test npm run start:dev`,
        url: `${BASE_URL}/health`,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30_000,
      },
});
