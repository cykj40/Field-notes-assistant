import { test, expect, Page, BrowserContext } from '@playwright/test';
import { login, USERS } from './auth.setup';

/**
 * Outbox coverage: note creation and "Send to Google Chat" must hand control
 * back immediately on a bad connection, queue durably, and drain on their own.
 *
 * Every note created here carries __PLAYWRIGHT_TEST__ so global-teardown.ts can
 * remove it (see CLAUDE.md — "Test cleanup").
 */

const SENTINEL = '__PLAYWRIGHT_TEST__';

async function fillNote(page: Page, title: string, content: string) {
  await page.goto('/notes/new');
  await page.fill('input#title', title);
  await page.fill('textarea#content', content);
}

async function cacheControlledHome(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A first install intentionally does not claim the already-open page. The
  // reload is controlled and therefore populates the home document cache.
  await page.reload();
  await expect(page.locator('h1')).toContainText('Field Notes');
  await expect.poll(() => page.evaluate(async () => {
    const cache = await caches.open('field-notes-pages-v1');
    return Boolean(await cache.match('/'));
  })).toBe(true);
}

/** Number of jobs the indicator says are waiting, or 0 when it is hidden. */
async function pendingCount(page: Page): Promise<number> {
  const indicator = page.getByTestId('sync-indicator');
  if ((await indicator.count()) === 0) return 0;
  const text = (await indicator.textContent()) ?? '';
  return Number(text.match(/(\d+)/)?.[1] ?? 0);
}

async function storedJobs(page: Page): Promise<Array<{ jobId: string; label: string }>> {
  return page.evaluate(async () => new Promise((resolve, reject) => {
    const open = indexedDB.open('field-notes-outbox', 2);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('jobs', 'readonly').objectStore('jobs').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(
        request.result.map((job: { jobId: string; label: string }) => ({
          jobId: job.jobId,
          label: job.label,
        }))
      );
    };
  }));
}

test.describe('Outbox — note creation', () => {
  test('queues the note and hands control straight back when offline', async ({ page, context }) => {
    await login(page, USERS.cyrus);
    await cacheControlledHome(page);

    const title = `Offline create ${Date.now()}`;
    await fillNote(page, title, `Queued while offline ${SENTINEL}`);

    await context.setOffline(true);
    await page.click('button[type="submit"]');

    // The IndexedDB write completes before the full offline navigation. The
    // cached home loads and the job remains durable after the form document
    // has been replaced. (Dev-mode chunks are intentionally not precached, so
    // inspect IndexedDB directly rather than requiring hydration offline.)
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Field Notes');
    await expect.poll(async () => (await storedJobs(page)).some((job) => job.label === title)).toBe(true);

    await context.setOffline(false);
  });

  test('drains automatically once the connection returns', async ({ page, context }) => {
    await login(page, USERS.cyrus);
    await cacheControlledHome(page);

    const title = `Offline drain ${Date.now()}`;
    await fillNote(page, title, `Should arrive after reconnect ${SENTINEL}`);

    await context.setOffline(true);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await expect.poll(async () => (await storedJobs(page)).some((job) => job.label === title)).toBe(true);

    // No user action beyond the connection coming back.
    await context.setOffline(false);

    await expect.poll(async () => (await storedJobs(page)).some((job) => job.label === title), {
      timeout: 20000,
    }).toBe(false);

    // ...and the note is really on the server, not just gone from the queue.
    await page.goto('/');
    await expect(page.locator(`text=${title}`)).toBeVisible({ timeout: 10000 });
  });

  test('still shows validation errors inline instead of queueing them', async ({ page }) => {
    await login(page, USERS.cyrus);
    await page.goto('/notes/new');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/title|notes|photo/i').first()).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL('/notes/new');
    expect(await pendingCount(page)).toBe(0);
  });

  test('takes the normal happy path when the network is fine', async ({ page }) => {
    await login(page, USERS.cyrus);

    await fillNote(page, `Online create ${Date.now()}`, `Normal path ${SENTINEL}`);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/notes\/[a-f0-9-]+/, { timeout: 15000 });
    expect(await pendingCount(page)).toBe(0);
  });
});

test.describe('Outbox — durability', () => {
  test('a queued note survives fully closing and reopening the app', async ({ browser }) => {
    // Context 1: the app as the user has it open on the job site.
    const first: BrowserContext = await browser.newContext();
    const page = await first.newPage();
    await login(page, USERS.cyrus);

    const title = `Cold start survivor ${Date.now()}`;
    await fillNote(page, title, `Queued, then the app was killed ${SENTINEL}`);

    await first.setOffline(true);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await expect.poll(async () => (await storedJobs(page)).some((job) => job.label === title)).toBe(true);

    // Capture cookies *and* IndexedDB, then close the app entirely.
    const state = await first.storageState({ indexedDB: true });
    await first.close();

    // Context 2: a cold launch — new process-level state, same stored data.
    const second: BrowserContext = await browser.newContext({ storageState: state });
    const reopened = await second.newPage();
    await reopened.goto('/');

    // The queue came back with the app and drains on mount, unprompted.
    await expect(reopened.locator(`text=${title}`)).toBeVisible({ timeout: 20000 });
    await expect(reopened.getByTestId('sync-indicator')).toHaveCount(0, { timeout: 20000 });

    await second.close();
  });
});

test.describe('Outbox — send to Google Chat', () => {
  test('flips to "Queued to send" immediately when offline', async ({ page, context }) => {
    await login(page, USERS.cyrus);

    await fillNote(page, `Queued send ${Date.now()}`, `Send queued offline ${SENTINEL}`);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/notes\/[a-f0-9-]+/, { timeout: 15000 });

    // Offline for the whole send so no message reaches the real webhook.
    await context.setOffline(true);
    await page.click('button:has-text("Send to Google Chat")');

    await expect(page.locator('button:has-text("Queued to send")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Queued to send")')).toBeDisabled();
    await expect(page.getByTestId('sync-indicator')).toBeVisible({ timeout: 10000 });

    // Discard it rather than letting it fire at the real Chat space on reconnect.
    await page.getByTestId('sync-indicator').click();
    await page.getByTestId('sync-panel').locator('button:has-text("Discard")').first().click();
    await expect(page.getByTestId('sync-indicator')).toHaveCount(0, { timeout: 5000 });

    await context.setOffline(false);
  });
});
