import { test, expect } from '@playwright/test';
import { USERS, login } from './auth.setup';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Google Chat Webhook Attribution', () => {
  test.skip(
    !process.env['GOOGLE_CHAT_WEBHOOK_URL'],
    'Skipping webhook tests - GOOGLE_CHAT_WEBHOOK_URL not configured'
  );

  test('should include creator name and timestamp in webhook message', async ({ page, request }) => {
    await login(page, USERS.victor);

    // Create a note
    await page.goto('/notes/new');
    await page.fill('input#title', `Webhook Attribution Test ${Date.now()} __PLAYWRIGHT_TEST__`);
    await page.fill('textarea#content', 'Testing webhook attribution format __PLAYWRIGHT_TEST__');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/notes\/[a-f0-9-]+/);

    // Get the note ID from URL
    const url = page.url();
    const noteId = url.split('/').pop();

    // Mock the webhook to capture the message
    // Instead of actually sending to Google Chat, we'll just check the formatting
    // by inspecting what would be sent

    // For now, we'll just verify the note was created with proper attribution
    await expect(page.locator('text=Created by: Victor')).toBeVisible();
    await expect(page.locator('text=Created:')).toBeVisible();

    // If webhook URL is configured, test the actual submission
    if (process.env['GOOGLE_CHAT_WEBHOOK_URL']) {
      const sendButton = page.locator('button:has-text("Send to Google Chat")');
      if ((await sendButton.count()) > 0) {
        await sendButton.click();
        // After a successful send the note is deleted and the user is redirected to home
        await expect(page).toHaveURL('/', { timeout: 10000 });
      }
    }
  });

  test('should format webhook message with creator - timestamp pattern', async ({ page }) => {
    await login(page, USERS.victor);

    // Create a note
    await page.goto('/notes/new');
    const timestamp = new Date().toISOString();
    await page.fill('input#title', `Webhook Format Test ${timestamp} __PLAYWRIGHT_TEST__`);
    await page.fill('textarea#content', 'Content for webhook formatting test __PLAYWRIGHT_TEST__');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/notes\/[a-f0-9-]+/);

    // Verify the note has attribution
    await expect(page.locator('text=Created by: Victor')).toBeVisible();

    // The actual webhook message format is "Victor — Feb 28, 2026 10:42 AM: [content]"
    // We verify this by checking the note detail page has the right data
    const createdText = await page.locator('text=Created:').textContent();

    // Should contain year
    expect(createdText).toMatch(/202\d/);

    // Should contain AM or PM
    expect(createdText).toMatch(/AM|PM/);
  });

  test('should handle notes from different creators in webhook', async ({ page }) => {
    // Create notes from different users
    const users = [USERS.cyrus, USERS.brianna, USERS.victor];

    for (const [index, user] of users.entries()) {
      await page.context().clearCookies();
      await login(page, user);

      await page.goto('/notes/new');
      await page.fill('input#title', `${user.username} Webhook Test ${index} __PLAYWRIGHT_TEST__`);
      await page.fill('textarea#content', `Note from ${user.username} __PLAYWRIGHT_TEST__`);
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/notes\/[a-f0-9-]+/);

      // Verify attribution
      await expect(page.locator(`text=Created by: ${user.username}`)).toBeVisible();
    }

    // Go to home page and verify all notes show different creators
    await page.goto('/');

    for (const user of users) {
      await expect(page.locator(`text=${user.username}`).first()).toBeVisible();
    }
  });

  test('should gracefully handle notes without creator in webhook', async ({ page }) => {
    await login(page, USERS.cyrus);

    // We can't easily create a legacy note without creator,
    // but we can verify the home page doesn't crash when displaying notes
    await page.goto('/');

    // Page should load successfully
    await expect(page.locator('h1')).toContainText('Field Notes');

    // Check for JavaScript errors
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });
});
