import { Page } from '@playwright/test';

export const TEST_USERNAME = 'Cyrus';
export const TEST_PASSWORD = 'test-password-123';

/**
 * Logs in to the application by visiting the login page and submitting credentials.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input#username', TEST_USERNAME);
  await page.fill('input#password', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}
