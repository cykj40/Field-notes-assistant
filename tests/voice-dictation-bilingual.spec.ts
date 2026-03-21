import { test, expect, Page } from '@playwright/test';
import { login, USERS, UserCredentials } from './auth.setup';

async function mockSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      maxAlternatives = 1;
      onresult: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;

      start() {
        (window as any).__mockInstance = this;
        (window as any).__mockStartCount = ((window as any).__mockStartCount ?? 0) + 1;
      }

      stop() {
        this.onend?.();
      }

      fireResult(transcript: string) {
        const resultItem = Object.assign([{ transcript, confidence: 0.95 }], { isFinal: true });
        const event = { resultIndex: 0, results: [resultItem] };
        this.onresult?.(event);
      }

      fireError(error: string) {
        this.onerror?.({ error });
      }
    }

    (window as any).__mockInstance = null;
    (window as any).__mockStartCount = 0;
    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
  });
}

async function setBrowserLanguage(page: Page, language: 'en-US' | 'es-MX') {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => value,
    });

    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => [value],
    });
  }, language);
}

async function fireSpeechResult(page: Page, transcript: string) {
  await page.evaluate((value) => {
    const instance = (window as any).__mockInstance;
    if (!instance) throw new Error('No active mock SpeechRecognition instance');
    instance.fireResult(value);
  }, transcript);
}

async function fireSpeechError(page: Page, error: string) {
  await page.evaluate((value) => {
    const instance = (window as any).__mockInstance;
    if (!instance) throw new Error('No active mock SpeechRecognition instance');
    instance.fireError(value);
  }, error);
}

async function getRecognitionSnapshot(page: Page) {
  return page.evaluate(() => ({
    lang: (window as any).__mockInstance?.lang ?? null,
    startCount: (window as any).__mockStartCount ?? 0,
  }));
}

async function goToNoteForm(page: Page, credentials: UserCredentials = USERS.cyrus) {
  await login(page, credentials);
  await page.goto('/notes/new');
  await expect(page.locator('form')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();
}

test.describe('Voice Dictation', () => {
  test.beforeEach(async ({ page }) => {
    await mockSpeechRecognition(page);
  });

  test('mic button click reaches start() synchronously', async ({ page }) => {
    const voiceConsoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('[voice]')) {
        voiceConsoleErrors.push(msg.text());
      }
    });

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    const snapshot = await getRecognitionSnapshot(page);
    expect(snapshot.startCount).toBe(1);
    expect(voiceConsoleErrors).toEqual([]);
  });

  test('defaults to English when the browser prefers English', async ({ page }) => {
    await setBrowserLanguage(page, 'en-US');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();

    const snapshot = await getRecognitionSnapshot(page);
    expect(snapshot.lang).toBe('en-US');
  });

  test('defaults to Spanish when the browser prefers Spanish', async ({ page }) => {
    await setBrowserLanguage(page, 'es-MX');
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();

    const snapshot = await getRecognitionSnapshot(page);
    expect(snapshot.lang).toBe('es-MX');
  });

  test('language selector switches recognition language before recording', async ({ page }) => {
    await setBrowserLanguage(page, 'en-US');
    await goToNoteForm(page, USERS.victor);
    await page.getByRole('button', { name: 'Espanol' }).click();
    await page.getByRole('button', { name: 'Start voice dictation' }).click();

    const snapshot = await getRecognitionSnapshot(page);
    expect(snapshot.lang).toBe('es-MX');
  });

  test('English speech appends the spoken English text', async ({ page }) => {
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await fireSpeechResult(page, 'Poured foundation on north wall');

    await expect(page.locator('#content')).toHaveValue('Poured foundation on north wall');
  });

  test('Spanish speech appends the spoken Spanish text', async ({ page }) => {
    await goToNoteForm(page, USERS.victor);
    await page.getByRole('button', { name: 'Espanol' }).click();
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await fireSpeechResult(page, 'Terminamos el encofrado');

    await expect(page.locator('#content')).toHaveValue('Terminamos el encofrado');
  });

  test('results fired after stopping are ignored', async ({ page }) => {
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await fireSpeechResult(page, 'This should not appear');

    await page.waitForTimeout(500);
    await expect(page.locator('#content')).toHaveValue('');
  });

  test('onend/onerror restart while still recording', async ({ page }) => {
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();

    await fireSpeechError(page, 'no-speech');
    await page.waitForTimeout(450);

    const snapshot = await getRecognitionSnapshot(page);
    expect(snapshot.startCount).toBeGreaterThan(1);
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  });

  test('dictated text can still be extended manually after stopping', async ({ page }) => {
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await fireSpeechResult(page, 'Concrete delivery at 9am');

    await expect(page.locator('#content')).toHaveValue('Concrete delivery at 9am');

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await page.locator('#content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' delayed by one hour');

    await expect(page.locator('#content')).toHaveValue('Concrete delivery at 9am delayed by one hour');
  });
});
