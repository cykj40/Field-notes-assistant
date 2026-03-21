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
 * Instances register themselves in window.__mockInstances when start() is called,
 * keyed by their `lang` property so fireSpeechResult() can target the right one.
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
        (window as any).__mockInstances = (window as any).__mockInstances || [];
        (window as any).__mockInstances.push(this);
      }

      stop() {
        this.onend?.();
      }

      /** Fires a final speech result into the component's onresult handler. */
      fireResult(transcript: string, confidence: number) {
        // Build a shape that matches SpeechRecognitionEventLike:
        //   results[0].isFinal === true
        //   results[0][0] === { transcript, confidence }
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
 * Fires a fake final speech result on the recognizer instance matching `lang`.
 * The instance must already have called start() (i.e. the Dictate button was clicked).
 */
async function fireSpeechResult(
  page: Page,
  lang: 'en-US' | 'es-MX',
  transcript: string,
  confidence: number
) {
  await page.evaluate(
    ({ lang, transcript, confidence }) => {
      const instances: any[] = (window as any).__mockInstances || [];
      const instance = instances.find((i: any) => i.lang === lang);
      if (!instance) throw new Error(`No mock instance found for lang=${lang}`);
      instance.fireResult(transcript, confidence);
    },
    { lang, transcript, confidence }
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

test.describe('Bilingual Voice Dictation', () => {
  // Inject the SpeechRecognition mock before every page load in this suite.
  test.beforeEach(async ({ page }) => {
    await mockSpeechRecognition(page);
  });

  // ── 1. English → appends directly, no translate call ──────────────────────

  test('English speech appends directly without calling the translate API', async ({ page }) => {
    let translateCalled = false;
    await page.route('**/language/translate/v2**', async (route) => {
      translateCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'en-US', 'Poured foundation on north wall', 0.95);

    await expect(page.locator('#content')).toContainText(
      'Poured foundation on north wall',
      { timeout: 5000 }
    );
    expect(translateCalled).toBe(false);
  });

  // ── 2. Spanish → translate API called, English result in textarea ─────────

  test('Spanish speech triggers translation and appends the English result', async ({ page }) => {
    const counter = mockTranslateAPI(page, 'Installed rebar on south side');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'es-MX', 'Instalamos el hierro en el lado sur', 0.92);

    await expect(page.locator('#content')).toContainText(
      'Installed rebar on south side',
      { timeout: 5000 }
    );
    expect(counter.count).toBe(1);
  });

  // ── 3. Both fire within 300ms — English wins (higher confidence) ──────────

  test('English wins when both recognizers fire and English has higher confidence', async ({ page }) => {
    let translateCalled = false;
    await page.route('**/language/translate/v2**', async (route) => {
      translateCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    // Fire both within a few ms — well inside the 300ms resolution window.
    await fireSpeechResult(page, 'es-MX', 'Trabajamos en el techo', 0.70);
    await fireSpeechResult(page, 'en-US', 'We worked on the roof', 0.91);

    await expect(page.locator('#content')).toContainText(
      'We worked on the roof',
      { timeout: 5000 }
    );
    expect(translateCalled).toBe(false);
  });

  // ── 4. Both fire within 300ms — Spanish wins (higher confidence) ──────────

  test('Spanish wins and translation is called when Spanish has higher confidence', async ({ page }) => {
    const counter = mockTranslateAPI(page, 'We placed the beams');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'en-US', 'We placed something', 0.55);
    await fireSpeechResult(page, 'es-MX', 'Colocamos las vigas', 0.88);

    await expect(page.locator('#content')).toContainText('We placed the beams', { timeout: 5000 });
    expect(counter.count).toBe(1);
  });

  // ── 5. Translation API failure → falls back to original Spanish text ───────

  test('Falls back to original Spanish text when the translation API returns an error', async ({ page }) => {
    mockTranslateAPIError(page);

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'es-MX', 'Terminamos el encofrado', 0.90);

    // Original Spanish text must appear — the note is never dropped.
    await expect(page.locator('#content')).toContainText(
      'Terminamos el encofrado',
      { timeout: 5000 }
    );
    // App must not show an error banner.
    await expect(page.locator('[class*="bg-red-50"]')).not.toBeVisible();
  });

  // ── 6. "🌐 Translated" badge appears briefly then auto-hides ─────────────

  test('Translated badge appears after Spanish input and hides after 2 seconds', async ({ page }) => {
    mockTranslateAPI(page, 'We finished the formwork');

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'es-MX', 'Terminamos el encofrado', 0.90);

    // Badge should appear within 1 second (well before the 2s hide timer).
    await expect(page.getByTestId('translated-badge')).toBeVisible({ timeout: 1000 });

    // After 3 seconds the badge must have auto-hidden (hide timer is 2s).
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('translated-badge')).not.toBeVisible();
  });

  // ── 7. Results fired after stop are silently ignored ─────────────────────

  test('Speech results fired after stopping are ignored and textarea stays empty', async ({ page }) => {
    // Provide a translate mock just in case — should never be reached.
    let translateCalled = false;
    await page.route('**/language/translate/v2**', async (route) => {
      translateCalled = true;
      await route.fulfill({ status: 200, body: '{}' });
    });

    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    // Stop recording before any result is fired.
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();

    // Fire results after stop — these should be ignored.
    await fireSpeechResult(page, 'es-MX', 'Esto no debe aparecer', 0.90);
    await fireSpeechResult(page, 'en-US', 'This should not appear', 0.95);

    await page.waitForTimeout(500);

    await expect(page.locator('#content')).toHaveValue('');
    expect(translateCalled).toBe(false);
  });

  // ── 8. Dictated text persists and can be manually extended ───────────────

  test('Dictated text stays in textarea and can be edited by hand', async ({ page }) => {
    await goToNoteForm(page);
    await page.getByRole('button', { name: 'Start voice dictation' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await fireSpeechResult(page, 'en-US', 'Concrete delivery at 9am', 0.93);

    await expect(page.locator('#content')).toContainText(
      'Concrete delivery at 9am',
      { timeout: 5000 }
    );

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByRole('button', { name: 'Start voice dictation' })).toBeVisible();

    // Manually append text to the textarea.
    await page.locator('#content').click();
    await page.keyboard.press('End');
    await page.keyboard.type(' delayed by one hour');

    await expect(page.locator('#content')).toContainText(
      'Concrete delivery at 9am delayed by one hour'
    );
  });
});
