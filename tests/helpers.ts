import { expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * After a note is saved, Send As Is lands on /notes/[id]/review. Most specs
 * assert on the note detail page instead, so wait for the save to finish and
 * open the detail page.
 */
export async function waitForSavedNote(page: Page, options: { timeout?: number } = {}): Promise<void> {
  await page.waitForURL(/\/notes\/[a-f0-9-]+\/review$/, options);
  await page.goto(page.url().replace(/\/review$/, ''));
}

/** Loads home through the service worker so an offline navigation to `/` works. */
export async function cacheControlledHome(page: Page): Promise<void> {
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

/**
 * The "queued" hand-off after an offline share reached the list. Where the
 * cached page hydrates offline (a production build) the yellow toast shows and
 * consumes the stored message; where it can't (dev) the message is still waiting.
 */
export async function expectQueuedHandoff(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const flag = await page.evaluate(() => sessionStorage.getItem('field-notes-flash')).catch(() => null);
      const toast = await page.getByTestId('flash-toast').getAttribute('data-kind', { timeout: 250 }).catch(() => null);
      return flag === 'queued' || toast === 'queued';
    })
    .toBe(true);
}

/** Jobs currently waiting in the outbox (read straight from IndexedDB). */
export async function storedJobs(page: Page): Promise<Array<{ jobId: string; label: string }>> {
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

// ---------------------------------------------------------------------------
// Outgoing Google Chat payloads
//
// The app server posts to Chat, so the browser can't intercept it. The server
// is started with tests/support/capture-chat-webhook.js, which appends the
// body of every webhook post to this file.
// ---------------------------------------------------------------------------

const CHAT_CAPTURE_FILE =
  process.env['CHAT_CAPTURE_FILE'] ?? path.join(os.tmpdir(), 'field-notes-chat-capture.jsonl');

/** Bodies of the Chat posts so far whose raw text contains `marker`, oldest first. */
export function chatPostsContaining(marker: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(CHAT_CAPTURE_FILE, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => (JSON.parse(line) as { body: string }).body)
    .filter((body) => body.includes(marker));
}

/** A valid 1×1 JPEG on disk, for exercising photo upload. */
export function writeTempJpeg(dir: string): string {
  const file = path.join(dir, 'as-is-photo.jpg');
  fs.writeFileSync(
    file,
    Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=',
      'base64'
    )
  );
  return file;
}
