import { Page } from '@playwright/test';

/**
 * After a note is saved, Send As Is lands on /notes/[id]/review. Most specs
 * assert on the note detail page instead, so wait for the save to finish and
 * open the detail page.
 */
export async function waitForSavedNote(page: Page, options: { timeout?: number } = {}): Promise<void> {
  await page.waitForURL(/\/notes\/[a-f0-9-]+\/review$/, options);
  await page.goto(page.url().replace(/\/review$/, ''));
}
