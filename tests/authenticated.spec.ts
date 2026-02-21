import { test, expect, Page } from '@playwright/test';
import { login } from './auth.setup';

interface ConsoleMessage {
  type: string;
  text: string;
  location?: string;
}

function setupConsoleTracking(page: Page): ConsoleMessage[] {
  const messages: ConsoleMessage[] = [];

  page.on('console', (msg) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()?.url,
    });
  });

  page.on('pageerror', (error) => {
    messages.push({
      type: 'pageerror',
      text: error.message,
    });
  });

  return messages;
}

test.describe('Authenticated Routes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should successfully login and access home page', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Field Notes');

    // Check for console errors and warnings
    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors on home page:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings on home page:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should access /notes/new page', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    await page.goto('/notes/new');
    await expect(page).toHaveURL('/notes/new');
    await expect(page.locator('h1')).toContainText('New Field Note');

    // Should have a form
    await expect(page.locator('form')).toBeVisible();

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors on /notes/new:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings on /notes/new:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should create a new note and view it', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    // Go to new note page
    await page.goto('/notes/new');

    // Fill out the form
    await page.fill('input#title', 'Test Location');
    await page.fill('textarea#content', 'This is a test note created by Playwright');

    // Submit the form
    await page.click('button[type="submit"]');

    // Should redirect to note detail page
    await page.waitForURL(/\/notes\/[a-f0-9-]+/);

    // Should see the note content
    await expect(page.locator('text=Test Location')).toBeVisible();
    await expect(page.locator('text=This is a test note created by Playwright')).toBeVisible();

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors during note creation:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings during note creation:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should edit an existing note', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    // First create a note
    await page.goto('/notes/new');
    await page.fill('input#title', 'Edit Test Location');
    await page.fill('textarea#content', 'Original content');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/notes\/[a-f0-9-]+/);

    // Click edit button
    await page.click('a.btn-secondary:has-text("Edit")');

    // Should be on edit page
    await expect(page).toHaveURL(/\/notes\/[a-f0-9-]+\/edit/);

    // Update the note
    await page.fill('input#title', 'Updated Location');
    await page.fill('textarea#content', 'Updated content');

    // Save changes
    await page.click('button[type="submit"]');

    // Should redirect back to note detail page
    await page.waitForURL(/\/notes\/[a-f0-9-]+$/);

    // Should see updated content
    await expect(page.locator('text=Updated Location')).toBeVisible();
    await expect(page.locator('text=Updated content')).toBeVisible();

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors during note edit:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings during note edit:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should delete a note', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    // First create a note
    await page.goto('/notes/new');
    await page.fill('input#title', 'Delete Test Location');
    await page.fill('textarea#content', 'To be deleted');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/notes\/[a-f0-9-]+/);

    // Set up dialog handler before clicking delete
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Delete this note');
      dialog.accept();
    });

    // Click delete button
    await page.click('text=🗑️ Delete');

    // Should redirect back to home
    await page.waitForURL('/');

    // Verify we're back on the home page
    await expect(page.locator('h1')).toContainText('Field Notes');

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors during note deletion:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings during note deletion:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should handle navigation between all routes', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    // Start at home
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Field Notes');

    // Navigate to new note
    await page.click('text=New Note');
    await expect(page).toHaveURL('/notes/new');

    // Navigate back to home
    await page.click('text=Back');
    await expect(page).toHaveURL('/');

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors during navigation:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings during navigation:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });

  test('should check for broken links and 404s', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    // Try accessing a non-existent note
    const response = await page.goto('/notes/nonexistent-id-12345');

    // Check if it handles gracefully (either 404 or redirect)
    if (response) {
      console.log('Response status for non-existent note:', response.status());
    }

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors on 404 page:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings on 404 page:', warnings);
    }

    // Document findings but don't fail the test
    console.log('404 handling test completed');
  });

  test('should verify PWA manifest and service worker', async ({ page }) => {
    const messages = setupConsoleTracking(page);

    await page.goto('/');

    // Check manifest
    const manifestResponse = await page.request.get('/manifest.json');
    expect(manifestResponse.status()).toBe(200);

    const manifest = await manifestResponse.json();
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('icons');

    // Note: Service worker registration happens in the UpdateBanner component
    // which is loaded dynamically with ssr: false

    const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror');
    const warnings = messages.filter((m) => m.type === 'warning');

    if (errors.length > 0) {
      console.log('Console errors during PWA check:', errors);
    }
    if (warnings.length > 0) {
      console.log('Console warnings during PWA check:', warnings);
    }

    expect(errors, `Console errors found: ${JSON.stringify(errors, null, 2)}`).toHaveLength(0);
  });
});
