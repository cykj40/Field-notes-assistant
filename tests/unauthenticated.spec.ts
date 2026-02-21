import { test, expect } from '@playwright/test';

test.describe('Unauthenticated Access', () => {
  test('should redirect to /login when accessing home page without auth', async ({ page }) => {
    const messages: string[] = [];

    page.on('console', (msg) => {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');
    await expect(page).toHaveURL('/login');

    // Check for any console errors
    const errors = messages.filter((m) => m.startsWith('[error]'));
    expect(errors, `Console errors found: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('should redirect to /login when accessing /notes/new without auth', async ({ page }) => {
    const messages: string[] = [];

    page.on('console', (msg) => {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/notes/new');
    await expect(page).toHaveURL('/login');

    const errors = messages.filter((m) => m.startsWith('[error]'));
    expect(errors, `Console errors found: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('should allow access to /login page', async ({ page }) => {
    const messages: string[] = [];

    page.on('console', (msg) => {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/login');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toContainText('Field Notes');
    await expect(page.locator('input[type="password"]')).toBeVisible();

    const errors = messages.filter((m) => m.startsWith('[error]'));
    expect(errors, `Console errors found: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should still be on login page
    await expect(page).toHaveURL('/login');

    // Should show error message
    await expect(page.locator('text=Invalid password')).toBeVisible();
  });

  test('should allow access to static assets', async ({ page }) => {
    const manifestResponse = await page.goto('/manifest.json');
    expect(manifestResponse?.status()).toBe(200);
  });
});
