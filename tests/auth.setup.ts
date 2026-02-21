import { Page } from '@playwright/test';

export const PASSWORD = 'o6giPTeW0lG39G09';

/**
 * Logs in to the application by visiting the login page and submitting credentials.
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

/**
 * Sets the authentication cookie directly without going through the UI.
 */
export async function setAuthCookie(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'field-auth',
      value: PASSWORD,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Strict',
    },
  ]);
}
