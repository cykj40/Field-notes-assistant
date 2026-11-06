import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { login, USERS } from './auth.setup';
import { cacheControlledHome, chatPostsContaining, expectQueuedHandoff, storedJobs, writeTempJpeg } from './helpers';

/**
 * Send As Is, end to end: the text the supervisor typed must reach Google Chat
 * exactly as typed. The app server posts to Chat, so the body of that post is
 * read from the capture file written by tests/support/capture-chat-webhook.js
 * (the post still goes to the TEST space — never the real one).
 *
 * These specs must pass with ENABLE_CLIENT_NOTES=0 and no ANTHROPIC_API_KEY.
 * The first test asserts the flag really is off in the server under test.
 *
 * Every note carries __PLAYWRIGHT_TEST__ so global-teardown.ts removes it.
 */

const SENTINEL = '__PLAYWRIGHT_TEST__';

interface CardsPayload {
  cardsV2: Array<{
    card: {
      sections: Array<{
        widgets: Array<{ textParagraph?: { text: string }; image?: { imageUrl: string } }>;
      }>;
    };
  }>;
}

/** Multi-line, with a vendor name, a date and a time that must all survive untouched. */
function rawNote(marker: string): string {
  return [
    'Floor prep, level 2 east wing',
    '',
    '  Pinkus delivered the boards 11/6 around 7:30am',
    'Crew:   two   spaces   kept',
    `Call back Monday ${SENTINEL} ${marker}`,
  ].join('\n');
}

async function fillNote(page: Page, title: string, content: string): Promise<void> {
  await page.goto('/notes/new');
  await page.fill('input#title', title);
  await page.fill('textarea#content', content);
}

async function saveAndReview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Send As Is' }).click();
  await page.waitForURL(/\/notes\/[a-f0-9-]+\/review$/, { timeout: 15000 });
}

async function onlyChatPost(marker: string): Promise<string> {
  await expect.poll(() => chatPostsContaining(marker).length, { timeout: 30000 }).toBeGreaterThan(0);
  // Give a would-be duplicate time to show up before declaring "exactly one".
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const posts = chatPostsContaining(marker);
  expect(posts, 'exactly one Chat post').toHaveLength(1);
  return posts[0]!;
}

test.describe('Send As Is', () => {
  let tempDir: string;
  let tempJpeg: string;

  test.beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-notes-as-is-'));
    tempJpeg = writeTempJpeg(tempDir);
  });

  test.afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('runs with client notes off', async ({ page }) => {
    await login(page, USERS.cyrus);
    const res = await page.request.get('/api/features', {
      headers: { 'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '' },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ clientNotes: false });

    await page.goto('/notes/new');
    await expect(page.getByRole('button', { name: 'Send As Is' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Format with AI' })).toBeDisabled();
  });

  test('online: shares the raw text and photo to Chat byte-for-byte', async ({ page }) => {
    await login(page, USERS.cyrus);

    const marker = `ASIS-ON-${Date.now()}`;
    const raw = rawNote(marker);

    await fillNote(page, `As-is online ${marker}`, raw);
    await page.setInputFiles('input[type="file"]:not([capture])', tempJpeg);
    await expect(page.locator('text=/1 photo attached/')).toBeVisible({ timeout: 15000 });
    await saveAndReview(page);

    // The review screen shows the typed text exactly, and the photo it will send.
    const shown = await page.getByTestId('review-content').evaluate((el) => (el as HTMLElement).innerText);
    expect(shown).toBe(raw);
    const photoUrl = await page.locator('img[alt="Field photo"]').first().getAttribute('src');
    expect(photoUrl).toMatch(/^https:\/\//);

    await page.getByRole('button', { name: 'Share to Google Chat' }).click();
    await expect(page).toHaveURL('/', { timeout: 15000 });
    await expect(page.getByTestId('flash-toast')).toContainText('Sent to Google Chat');

    const payload = JSON.parse(await onlyChatPost(marker)) as CardsPayload & { text?: string };
    expect(payload.text).toBeUndefined();
    const widgets = payload.cardsV2[0]!.card.sections[0]!.widgets;
    const text = widgets[0]!.textParagraph!.text;

    expect(text).toContain(raw); // byte-for-byte, including blank line and double spaces
    expect(text).toContain('Pinkus');
    expect(text).not.toContain('Prime Woodworking');
    expect(text).toContain('11/6 around 7:30am');
    expect(widgets.filter((w) => w.image).map((w) => w.image!.imageUrl)).toEqual([photoUrl]);
  });

  test('online, no photo: plain text payload carries the raw text unchanged', async ({ page }) => {
    await login(page, USERS.cyrus);

    const marker = `ASIS-TXT-${Date.now()}`;
    const raw = rawNote(marker);
    await fillNote(page, `As-is text ${marker}`, raw);
    await saveAndReview(page);

    await page.getByRole('button', { name: 'Share to Google Chat' }).click();
    await expect(page).toHaveURL('/', { timeout: 15000 });

    const payload = JSON.parse(await onlyChatPost(marker)) as { text?: string; cardsV2?: unknown };
    expect(payload.cardsV2).toBeUndefined();
    expect(payload.text).toContain(raw);
  });

  test('offline: the share is queued, then posts exactly once on reconnect', async ({ page, context }) => {
    await login(page, USERS.cyrus);
    await cacheControlledHome(page);

    const marker = `ASIS-OFF-${Date.now()}`;
    const title = `As-is offline ${marker}`;
    const raw = rawNote(marker);
    await fillNote(page, title, raw);
    await saveAndReview(page);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Share to Google Chat' }).click();

    // Queued: back on the list, a send job is waiting, and nothing has reached Chat.
    await expect(page).toHaveURL('/');
    await expect
      .poll(async () => (await storedJobs(page)).some((job) => job.label === `Send to Chat: ${title}`))
      .toBe(true);
    await expectQueuedHandoff(page);
    expect(chatPostsContaining(marker)).toHaveLength(0);

    // Reconnect with no user action: it drains, and Chat gets exactly one post.
    await context.setOffline(false);
    const text = (JSON.parse(await onlyChatPost(marker)) as { text?: string }).text;
    expect(text).toContain(raw);

    await expect.poll(async () => (await storedJobs(page)).length, { timeout: 20000 }).toBe(0);
    await page.goto('/');
    await expect(page.locator('a[href^="/notes/"]', { hasText: title })).toContainText('Sent');
  });
});
