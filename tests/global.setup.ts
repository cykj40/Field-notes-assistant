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

  for (const entry of fs.readdirSync(storageStateDir)) {
    if (entry.endsWith('.json')) {
      fs.rmSync(path.join(storageStateDir, entry), { force: true });
    }
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
      const tempPath = `${storagePath}.${process.pid}.tmp`;
      const state = await context.storageState();
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      fs.renameSync(tempPath, storagePath);

      console.log(`✓ Created auth state for ${user.username} at ${storagePath}`);
    } catch (error) {
      console.error(`✗ Failed to create auth state for ${user.username}:`, error);
    } finally {
      await context.close();
    }
  }

  // Warm the dev server's on-demand route compilation. The note form now hands
  // control back after NEXT_PUBLIC_OUTBOX_TIMEOUT_MS (3s by default) and queues
  // anything slower — a first-request webpack compile would otherwise push the
  // first create of every run onto the queued path and fail its redirect
  // assertion.
  const warmupContext = await browser.newContext();
  const warmupPage = await warmupContext.newPage();
  const apiKey = process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '';
  try {
    await warmupPage.goto(`${baseURL}/login`);
    await warmupPage.goto(`${baseURL}/notes/new`).catch(() => undefined);
    await warmupPage.request.get(`${baseURL}/api/notes`, { headers: { 'x-api-key': apiKey } });
    await warmupPage.request.get(`${baseURL}/api/notes/__warmup__`, { headers: { 'x-api-key': apiKey } });
    await warmupPage.request.post(`${baseURL}/api/send-to-chat`, {
      headers: { 'x-api-key': apiKey },
      data: {},
    });
    console.log('✓ Warmed API routes');
  } catch (error) {
    console.warn('Warning: route warmup failed (tests may be slower on first request):', error);
  } finally {
    await warmupContext.close();
  }

  await browser.close();
}

export default globalSetup;
