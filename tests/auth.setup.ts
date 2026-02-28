import { Page } from '@playwright/test';

export interface UserCredentials {
  username: string;
  password: string;
}

// Read passwords from environment variables
export const USERS = {
  cyrus: {
    username: 'Cyrus',
    password: process.env['CYRUS_PASSWORD'] ?? '',
  },
  brianna: {
    username: 'Brianna',
    password: process.env['BRIANNA_PASSWORD'] ?? '',
  },
  victor: {
    username: 'Victor',
    password: process.env['VICTOR_PASSWORD'] ?? '',
  },
  scott: {
    username: 'Scott',
    password: process.env['SCOTT_PASSWORD'] ?? '',
  },
} as const;

// Default test user is Cyrus
export const TEST_USERNAME = USERS.cyrus.username;
export const TEST_PASSWORD = USERS.cyrus.password;

/**
 * Logs in to the application by visiting the login page and submitting credentials.
 * Defaults to Cyrus if no credentials provided.
 */
export async function login(page: Page, credentials?: UserCredentials): Promise<void> {
  const creds = credentials ?? { username: TEST_USERNAME, password: TEST_PASSWORD };

  await page.goto('/login');
  await page.fill('input#username', creds.username);
  await page.fill('input#password', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

/**
 * Logs out by clicking the logout button or clearing session.
 */
export async function logout(page: Page): Promise<void> {
  // Navigate to a page where we can clear the session
  // For now, we'll just clear cookies
  const context = page.context();
  await context.clearCookies();
}
