import { chromium, FullConfig } from '@playwright/test';
import { USERS } from './auth.setup';
import * as path from 'path';

/**
 * Global setup to create authenticated browser contexts for each user.
 * This allows tests to reuse authenticated sessions without logging in each time.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const storageStateDir = path.join(__dirname, '.auth');

  // Create .auth directory if it doesn't exist
  const fs = await import('fs');
  if (!fs.existsSync(storageStateDir)) {
    fs.mkdirSync(storageStateDir, { recursive: true });
  }

  const browser = await chromium.launch();

  // Create authenticated sessions for each user
  for (const [key, user] of Object.entries(USERS)) {
    if (!user.password) {
      console.warn(`Warning: No password set for ${user.username}. Skipping auth state creation.`);
      continue;
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Navigate to login page
      await page.goto(`${baseURL}/login`);

      // Fill in credentials
      await page.fill('input#username', user.username);
      await page.fill('input#password', user.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for redirect to home page
      await page.waitForURL(`${baseURL}/`, { timeout: 10000 });

      // Save authenticated state
      const storagePath = path.join(storageStateDir, `${key}.json`);
      await context.storageState({ path: storagePath });

      console.log(`✓ Created auth state for ${user.username} at ${storagePath}`);
    } catch (error) {
      console.error(`✗ Failed to create auth state for ${user.username}:`, error);
    } finally {
      await context.close();
    }
  }

  await browser.close();
}

export default globalSetup;
