import { test, expect } from '@playwright/test';
import { login, USERS } from './auth.setup';

const PAGE_CACHE_NAME = 'field-notes-pages-v1';

async function waitForWorker(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

test.describe('Service worker — home navigation fallback', () => {
  test('shows the honest fallback when no home document has been cached', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/login');
    await waitForWorker(page);

    await context.setOffline(true);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'No connection yet' })).toBeVisible();
    await expect(page.getByText(
      'Your note is saved and will send automatically once you’re back online.'
    )).toBeVisible();

    const reconnected = page.waitForURL('/login');
    await context.setOffline(false);
    await reconnected;
  });

  test('serves the most recent successful home document on network failure', async ({ page, context }) => {
    await login(page, USERS.cyrus);
    await waitForWorker(page);
    await page.reload();

    await expect.poll(() => page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName);
      return Boolean(await cache.match('/'));
    }, PAGE_CACHE_NAME)).toBe(true);

    await page.goto('/notes/new');
    await context.setOffline(true);
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Field Notes');
    await expect(page.getByRole('heading', { name: 'No connection yet' })).toHaveCount(0);

    await context.setOffline(false);
  });

  test('clears authenticated home documents before logout completes', async ({ page }) => {
    await login(page, USERS.cyrus);
    await waitForWorker(page);
    await page.reload();

    await expect.poll(() => page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName);
      return Boolean(await cache.match('/'));
    }, PAGE_CACHE_NAME)).toBe(true);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Sign out?');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL('/');
    expect(await page.evaluate((cacheName) => caches.has(cacheName), PAGE_CACHE_NAME)).toBe(true);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Sign out?');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toContainText('Field Notes');
    expect(await page.evaluate((cacheName) => caches.has(cacheName), PAGE_CACHE_NAME)).toBe(false);
  });

  test('also clears cached documents before a direct login account switch', async ({ page }) => {
    await page.goto('/login');
    await waitForWorker(page);
    await page.evaluate(async (cacheName) => {
      const cache = await caches.open(cacheName);
      await cache.put('/', new Response('<p>previous supervisor</p>', {
        headers: { 'Content-Type': 'text/html' },
      }));
    }, PAGE_CACHE_NAME);

    await login(page, USERS.cyrus);

    expect(await page.evaluate((cacheName) => caches.has(cacheName), PAGE_CACHE_NAME)).toBe(false);
  });
});
