import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const webServer = process.env['PLAYWRIGHT_SKIP_WEBSERVER']
  ? undefined
  : {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env['CI'],
      timeout: 120000,
    };

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/global.setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-cyrus',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/.auth/cyrus.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-brianna',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/.auth/brianna.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-victor',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/.auth/victor.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-scott',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/.auth/scott.json',
      },
      dependencies: ['setup'],
    },
  ],
  ...(webServer ? { webServer } : {}),
});
