import { test, expect, Page } from '@playwright/test';
import { login, USERS, UserCredentials } from './auth.setup';

async function mockTranscribeAPI(page: Page, transcript: string) {
  await page.route('**/api/transcribe**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transcript }),
    });
  });
}

async function mockTranscribeAPIError(page: Page) {
  await page.route('**/api/transcribe**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Transcription failed' }),
    });
  });
}

async function mockMediaRecorder(page: Page) {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      state = 'inactive';
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;

      constructor(public stream: any, public options?: any) {}

      start() {
        this.state = 'recording';
        (window as any).__mockRecorder = this;
        setTimeout(() => {
          this.ondataavailable?.({
            data: new Blob(['fake-audio-data-padded-to-1500-bytes'.padEnd(1500, 'x')],
              { type: 'audio/webm' })
          });
        }, 50);
      }

      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }

      static isTypeSupported() { return true; }
    }

    (window as any).MediaRecorder = MockMediaRecorder;

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }],
        }),
      },
    });
  });
}

async function goToNoteForm(page: Page, credentials: UserCredentials = USERS.cyrus) {
  await login(page, credentials);
  await page.goto('/notes/new');
  await expect(page.locator('form')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();
}

test.describe('Voice Dictation', () => {
  test.beforeEach(async ({ page }) => {
    await mockMediaRecorder(page);
  });

  test('mic button starts recording and shows Stop state', async ({ page }) => {
    await mockTranscribeAPI(page, '');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  });

  test('stopping recording shows transcribing state', async ({ page }) => {
    await mockTranscribeAPI(page, 'Test transcript');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('text=Transcribing')).toBeVisible();
  });

  test('transcript appears in textarea after transcription', async ({ page }) => {
    await mockTranscribeAPI(page, 'Poured foundation on north wall __PLAYWRIGHT_TEST__');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('#content')).toHaveValue(
      'Poured foundation on north wall __PLAYWRIGHT_TEST__',
      { timeout: 10000 }
    );
  });

  test('spanish transcript appears correctly', async ({ page }) => {
    await mockTranscribeAPI(page, 'Terminamos el encofrado __PLAYWRIGHT_TEST__');
    await goToNoteForm(page, USERS.victor);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('#content')).toHaveValue(
      'Terminamos el encofrado __PLAYWRIGHT_TEST__',
      { timeout: 10000 }
    );
  });

  test('empty transcript does not append anything', async ({ page }) => {
    await mockTranscribeAPI(page, '');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('#content')).toHaveValue('');
  });

  test('transcription error does not crash the app', async ({ page }) => {
    await mockTranscribeAPIError(page);
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('#content')).toHaveValue('');
  });

  test('dictated text can be edited manually after transcription', async ({ page }) => {
    await mockTranscribeAPI(page, 'Concrete delivery at 9am');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('#content')).toHaveValue(
      'Concrete delivery at 9am',
      { timeout: 10000 }
    );
    await page.locator('#content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' delayed by one hour');
    await expect(page.locator('#content')).toHaveValue(
      'Concrete delivery at 9am delayed by one hour'
    );
  });

  test('multiple dictations append correctly', async ({ page }) => {
    await mockTranscribeAPI(page, 'First sentence');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('#content')).toHaveValue('First sentence', { timeout: 10000 });

    await mockTranscribeAPI(page, 'Second sentence');
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.locator('#content')).toHaveValue(
      'First sentence Second sentence',
      { timeout: 10000 }
    );
  });
});
