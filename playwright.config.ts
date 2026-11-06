import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// Safety guard: E2E runs must never post to the supervisors' real Google Chat.
// The app's send route reads GOOGLE_CHAT_WEBHOOK_URL, so the dev server started
// below is handed the TEST webhook under that name. Fail loudly at config load
// if no test webhook is configured rather than silently falling back.
const testWebhookUrl = process.env['GOOGLE_CHAT_WEBHOOK_URL_TEST'];
if (!testWebhookUrl) {
  throw new Error(
    'GOOGLE_CHAT_WEBHOOK_URL_TEST is not set. Playwright refuses to run without it so ' +
      'e2e tests can never post to the production Google Chat space. Set it in ' +
      '.env.local (or CI secrets) to a test space webhook.'
  );
}

const webServer = process.env['PLAYWRIGHT_SKIP_WEBSERVER']
  ? undefined
  : {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      // Never reuse a running server: an already-running dev server may have been
      // started with the production webhook, which would bypass the guard above.
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        GOOGLE_CHAT_WEBHOOK_URL: testWebhookUrl,
      },
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
