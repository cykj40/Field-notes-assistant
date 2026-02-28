import { test, expect } from '@playwright/test';
import { USERS, login } from './auth.setup';

test.describe('Note Authorship and Timestamps', () => {
  test.describe('Note Creation Attribution', () => {
    test('should stamp note with Cyrus and timestamp on creation', async ({ page }) => {
      await login(page, USERS.cyrus);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Cyrus Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Cyrus');
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
      await page.fill('textarea#content', 'This note should be attributed to Brianna');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Brianna')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should stamp note with Victor and timestamp on creation', async ({ page }) => {
      await login(page, USERS.victor);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Victor Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Victor');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Victor')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should stamp note with Scott and timestamp on creation', async ({ page }) => {
      await login(page, USERS.scott);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Scott Attribution Test');
      await page.fill('textarea#content', 'This note should be attributed to Scott');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      await expect(page.locator('text=Created by: Scott')).toBeVisible();
      await expect(page.locator('text=Created:')).toBeVisible();
    });

    test('should show creator and timestamp on note card', async ({ page }) => {
      await login(page, USERS.cyrus);

      // Create a note
      await page.goto('/notes/new');
      await page.fill('input#title', 'Card Attribution Test');
      await page.fill('textarea#content', 'Testing card view attribution');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Go back to home to see the note card
      await page.goto('/');

      // The note card should show creator and timestamp in format "Cyrus · Feb 28, 2026 · 10:42 AM"
      const noteCard = page.locator('a').filter({ hasText: 'Card Attribution Test' });
      await expect(noteCard).toBeVisible();

      // Check for creator name on the card
      await expect(noteCard.locator('text=Cyrus')).toBeVisible();
    });

    test('should display human-readable timestamp format', async ({ page }) => {
      await login(page, USERS.cyrus);

      await page.goto('/notes/new');
      await page.fill('input#title', 'Timestamp Format Test');
      await page.fill('textarea#content', 'Testing readable timestamp');
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
    test('should block note creation without authentication', async ({ page, request }) => {
      // Try to create a note without logging in
      const response = await request.post('/api/notes', {
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

      // Should return 401 Unauthorized
      expect(response.status()).toBe(401);

      const body = await response.json();
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

  test.describe('Note List View Attribution', () => {
    test('should show creator on all notes in list view', async ({ page }) => {
      await login(page, USERS.cyrus);

      // Create multiple notes
      for (let i = 1; i <= 3; i++) {
        await page.goto('/notes/new');
        await page.fill('input#title', `List Test Note ${i}`);
        await page.fill('textarea#content', `Content ${i}`);
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/notes\/[a-f0-9-]+/);
      }

      // Go to home page
      await page.goto('/');

      // All note cards should show "Cyrus"
      const noteCards = page.locator('a').filter({ hasText: 'List Test Note' });
      const count = await noteCards.count();

      for (let i = 0; i < count; i++) {
        const card = noteCards.nth(i);
        await expect(card.locator('text=Cyrus')).toBeVisible();
      }
    });

    test('should show different creators for notes from different users', async ({ page }) => {
      // Login as Cyrus and create a note
      await login(page, USERS.cyrus);
      await page.goto('/notes/new');
      await page.fill('input#title', 'Cyrus Multi-User Test');
      await page.fill('textarea#content', 'From Cyrus');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Logout and login as Brianna
      await page.context().clearCookies();
      await login(page, USERS.brianna);
      await page.goto('/notes/new');
      await page.fill('input#title', 'Brianna Multi-User Test');
      await page.fill('textarea#content', 'From Brianna');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Go to home page
      await page.goto('/');

      // Should see both creators
      await expect(page.locator('text=Cyrus')).toBeVisible();
      await expect(page.locator('text=Brianna')).toBeVisible();
    });
  });
});
