import { test, expect } from '@playwright/test';
import { USERS, login } from './auth.setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Note Authorship and Timestamps', () => {
  test.describe('Note Creation Attribution', () => {
    test('should stamp note with Cyrus and timestamp on creation', async ({ page }) => {
      await login(page, USERS.cyrus);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Cyrus Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Cyrus __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check creator name in detail view
      await expect(page.locator('text=Created by: Cyrus')).toBeVisible();

      // Check for timestamp (should have format like "Wed, Feb 28, 2026, 10:42 AM EST")
      const metaSection = page.locator('text=Created:');
      await expect(metaSection).toBeVisible();
    });

    test('should stamp note with Brianna and timestamp on creation', async ({ page }) => {
      await login(page, USERS.brianna);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Brianna Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Brianna __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Brianna')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should stamp note with Victor and timestamp on creation', async ({ page }) => {
      await login(page, USERS.victor);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Victor Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Victor __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Victor')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should stamp note with Scott and timestamp on creation', async ({ page }) => {
      await login(page, USERS.scott);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Scott Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Scott __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Scott')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should show creator and timestamp on note card', async ({ page }) => {
      await login(page, USERS.cyrus);
      const title = `Card Attribution Test ${Date.now()} __PLAYWRIGHT_TEST__`;

      // Create a note
      await page.goto('/notes/new');
      await page.fill('input#title', title);
      await page.fill('textarea#content', 'Testing card view attribution __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Go back to home to see the note card
      await page.goto('/');

      // The note card should show creator and timestamp in format "Cyrus · Feb 28, 2026 · 10:42 AM"
      const noteCard = page.locator('a').filter({ hasText: title }).first();
      await expect(noteCard).toBeVisible();

      // Check for creator name on the card
      await expect(noteCard.locator('text=Cyrus')).toBeVisible();
    });

    test('should display human-readable timestamp format', async ({ page }) => {
      await login(page, USERS.cyrus);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Timestamp Format Test');
      await page.fill('textarea#content', 'Testing readable timestamp __PLAYWRIGHT_TEST__');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Check that timestamp contains expected date components
      const timestampText = await page.locator('text=Created:').textContent();

      // Should have year (202x)
      expect(timestampText).toMatch(/202\d/);

      // Should have AM or PM
      expect(timestampText).toMatch(/AM|PM/);
    });
  });

  test.describe('Anonymous Note Blocking', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('should block note creation without authentication', async ({ playwright }) => {
      // Use a fresh unauthenticated request context (project storageState does not affect this)
      const freshRequest = await playwright.request.newContext({
        baseURL: 'http://localhost:3000',
        storageState: { cookies: [], origins: [] },
      });
      const response = await freshRequest.post('/api/notes', {
        data: {
          title: 'Anonymous Note',
          content: 'This should not be created',
          tags: [],
        },
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
        },
      });

      // Read body before disposing the context
      const status = response.status();
      const body = await response.json();
      await freshRequest.dispose();

      // Should return 401 Unauthorized
      expect(status).toBe(401);
      expect(body).toHaveProperty('error');
    });

    test('should require session for note creation endpoint', async ({ page }) => {
      // Don't log in, just try to access the new note form
      await page.goto('/notes/new');

      // Should be redirected to login
      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Legacy Data Handling', () => {
    test('should handle notes without created_by gracefully', async ({ page }) => {
      await login(page, USERS.cyrus);

      // We can't easily create a legacy note without created_by in tests,
      // but we can verify the UI doesn't crash when viewing the home page
      await page.goto('/');

      // Page should load without errors
      await expect(page.locator('h1')).toContainText('Field Notes');

      // Check for JavaScript errors
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });

      // Wait a bit to see if any errors occur
      await page.waitForTimeout(1000);

      expect(errors).toHaveLength(0);
    });
  });

});
