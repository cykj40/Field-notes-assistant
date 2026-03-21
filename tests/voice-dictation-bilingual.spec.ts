import { test, expect, Page } from '@playwright/test';
import { login } from './auth.setup';

// ---------------------------------------------------------------------------
// Helpers — SpeechRecognition mock
// ---------------------------------------------------------------------------

/**
 * Injects a controllable SpeechRecognition mock into the page via addInitScript.
 * Must be called before any page.goto() so the mock is in place when the
 * component mounts and reads window.SpeechRecognition.
 *
 * The single active instance is stored in window.__mockInstance when start()
 * is called so fireSpeechResult() can target it.
 */
async function mockSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: any) => void) | null = null;

      start() {
        (window as any).__mockInstance = this;
      }

      stop() {
        this.onend?.();
      }

      /** Fires a final speech result into the component's onresult handler. */
      fireResult(transcript: string, confidence: number) {
        const resultItem = Object.assign([{ transcript, confidence }], { isFinal: true });
        const event = { resultIndex: 0, results: [resultItem] };
        this.onresult?.(event);
      }
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
  });
}

/**
 * Fires a fake final speech result on the active recognizer instance.
 * The button must have been clicked first so start() was called.
 */
async function fireSpeechResult(page: Page, transcript: string, confidence: number) {
  await page.evaluate(
    ({ transcript, confidence }) => {
      const instance = (window as any).__mockInstance;
      if (!instance) throw new Error('No active mock SpeechRecognition instance');
      instance.fireResult(transcript, confidence);
    },
    { transcript, confidence }
  );
}

// ---------------------------------------------------------------------------
// Helpers — Google Translate API mock
// ---------------------------------------------------------------------------

/**
 * Intercepts requests to the Google Translate REST API and returns the given text.
 * Also increments the returned counter object so tests can assert call count.
 */
function mockTranslateAPI(page: Page, returnText: string): { count: number } {
  const counter = { count: 0 };
  page.route('**/language/translate/v2**', async (route) => {
    counter.count++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { translations: [{ translatedText: returnText }] },
      }),
    });
  });
  return counter;
}

/** Intercepts the Translate API and returns a 500 error to simulate network/key failure. */
function mockTranslateAPIError(page: Page): { count: number } {
  const counter = { count: 0 };
  page.route('**/language/translate/v2**', async (route) => {
    counter.count++;
    await route.fulfill({ status: 500, body: 'Internal Server Error' });
  });
  return counter;
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

async function goToNoteForm(page: Page) {
  await login(page);
  await page.goto('/notes/new');
  await expect(page.locator('form')).toBeVisible();
  // Wait until the component detects SpeechRecognition and renders the mic button.
  await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Voice Dictation with Auto-Translation', () => {
  // Inject the SpeechRecognition mock before every page load in this suite.
  test.beforeEach(async ({ page }) => {
    await mockSpeechRecognition(page);
  });

  // ── 1. English → translate called, returns same text, no badge ─────────────

  test('English speech appends text and no translated badge is shown', async ({ page }) => {
    // Translate is always called — for English it returns the same text
    const counter = mockTranslateAPI(page, 'Poured foundation on north wall');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Poured foundation on north wall', 0.95);

    await expect(page.locator('#content')).toContainText(
      'Poured foundation on north wall',
      { timeout: 5000 }
    );
    // Translate was called (always-translate approach)
    expect(counter.count).toBe(1);
    // Badge must NOT appear — translated text equals original
    await expect(page.getByTestId('translated-badge')).not.toBeVisible();
  });

  // ── 2. Spanish → translate returns English result, appended to textarea ────

  test('Spanish speech triggers translation and appends the English result', async ({ page }) => {
    const counter = mockTranslateAPI(page, 'Installed rebar on south side');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Instalamos el hierro en el lado sur', 0.92);

    await expect(page.locator('#content')).toContainText(
      'Installed rebar on south side',
      { timeout: 5000 }
    );
    expect(counter.count).toBe(1);
  });

  // ── 3. Translation API failure → falls back to original text ───────────────

  test('Falls back to original text when the translation API returns an error', async ({ page }) => {
    mockTranslateAPIError(page);

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Terminamos el encofrado', 0.90);

    // Original text must appear — the note is never silently dropped
    await expect(page.locator('#content')).toContainText(
      'Terminamos el encofrado',
      { timeout: 5000 }
    );
    // App must not show an error banner
    await expect(page.locator('[class*="bg-red-50"]')).not.toBeVisible();
  });

  // ── 4. "🌐 Translated" badge appears when text changes, hides after 2s ─────

  test('Translated badge appears after Spanish input and hides after 2 seconds', async ({ page }) => {
    mockTranslateAPI(page, 'We finished the formwork');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Terminamos el encofrado', 0.90);

    // Badge should appear within 1 second (well before the 2s hide timer)
    await expect(page.getByTestId('translated-badge')).toBeVisible({ timeout: 1000 });

    // After 3 seconds the badge must have auto-hidden (hide timer is 2s)
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('translated-badge')).not.toBeVisible();
  });

  // ── 5. No badge when translation matches original ──────────────────────────

  test('No badge shown when translated text matches original', async ({ page }) => {
    // Simulate translate returning the exact same English text
    mockTranslateAPI(page, 'Concrete poured on second floor');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Concrete poured on second floor', 0.97);

    await expect(page.locator('#content')).toContainText(
      'Concrete poured on second floor',
      { timeout: 5000 }
    );
    await expect(page.getByTestId('translated-badge')).not.toBeVisible();
  });

  // ── 6. Results fired after stop are silently ignored ──────────────────────

  test('Speech results fired after stopping are ignored and textarea stays empty', async ({ page }) => {
    // Provide a translate mock just in case — should never be reached
    let translateCalled = false;
    await page.route('**/language/translate/v2**', async (route) => {
      translateCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    // Stop recording before any result is fired
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();

    // Fire result after stop — should be ignored
    await fireSpeechResult(page, 'This should not appear', 0.95);

    await page.waitForTimeout(500);

    await expect(page.locator('#content')).toHaveValue('');
    expect(translateCalled).toBe(false);
  });

  // ── 7. Dictated text persists and can be manually extended ─────────────────

  test('Dictated text stays in textarea and can be edited by hand', async ({ page }) => {
    mockTranslateAPI(page, 'Concrete delivery at 9am');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'Concrete delivery at 9am', 0.93);

    await expect(page.locator('#content')).toContainText(
      'Concrete delivery at 9am',
      { timeout: 5000 }
    );

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();

    // Manually append text to the textarea
    await page.locator('#content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' delayed by one hour');

    await expect(page.locator('#content')).toContainText(
      'Concrete delivery at 9am delayed by one hour'
    );
  });
});
