# Field Notes Assistant — Developer Reference

## Project Overview

Mobile-first Next.js 15 PWA for field supervisors to record voice-dictated notes, attach photos, and send reports to Google Chat. Multi-user with session auth.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Upstash Redis (notes) · Neon Postgres (auth) · Iron-session · Playwright (E2E tests)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string (auth) |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis URL (note storage) |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis token |
| `GOOGLE_CHAT_WEBHOOK_URL` | Yes | Webhook for sending notes to Google Chat |
| `FIELD_NOTES_API_KEY` | Yes | Server-side API key (endpoint abuse protection) |
| `NEXT_PUBLIC_FIELD_NOTES_API_KEY` | Yes | Same value as above — sent as `x-api-key` from browser |
| `SESSION_SECRET` | Yes | Min-32-char secret for iron-session cookie encryption |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL (`https://your-app.vercel.app` in prod, `http://localhost:3000` in dev) |
| `NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY` | Yes (for bilingual voice) | Google Cloud Translation API key — see below |

Generate `FIELD_NOTES_API_KEY` / `SESSION_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Bilingual Voice Dictation

### How It Works

The app supports zero-config bilingual dictation (English + Spanish). One supervisor speaks Spanish; the rest speak English. No language toggle is exposed to users.

**Pattern: dual parallel SpeechRecognition**

Two `SpeechRecognition` instances run simultaneously at all times:
- One with `lang="en-US"`
- One with `lang="es-MX"`

Both listen concurrently. When a final result arrives from either, a 300 ms debounce timer starts. Within that window:
- If **both** instances return a result, the one with higher `confidence` wins.
- If only one returns a result, it wins automatically.

**Spanish → English translation**

If the winning result came from the `es-MX` recognizer, it is sent to the Google Cloud Translation REST API (`/language/translate/v2`) with `source=es`, `target=en`. The translated English text is appended to the notes textarea.

If the winning result is English, it is appended directly — no API call.

**Translation fallback**

If the translation API call fails for any reason (network error, missing key, quota exceeded), the original Spanish transcript is appended unchanged. Notes are never silently dropped.

**Visual indicator**

A "🌐 Translated" badge appears above the mic button for 2 seconds when a Spanish result is detected and translated. It is invisible to the user otherwise — no language toggle, no persistent indicator.

### Google Translate API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Cloud Translation API → Enable
2. Create an API key and restrict it to the Translation API + your domain
3. Add to `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY=your_key_here
   ```
4. Add the same variable to your Vercel project dashboard (Settings → Environment Variables)

The key must be `NEXT_PUBLIC_` because the translation call is made directly from the browser (no server route needed).

### Auto-restart behavior

The Web Speech API stops automatically after a few seconds of silence. Both recognizers have `onend` handlers that restart them if `isRecordingRef.current` is still `true`, maintaining continuous dictation across pauses.

---

## Testing

```bash
npx playwright test
```

Tests live in `tests/`. Covers auth, note CRUD, photo upload/display, Google Chat webhook, multi-user note authorship, and bilingual voice dictation.

### Voice dictation tests (`tests/voice-dictation-bilingual.spec.ts`)

The Web Speech API is not available in headless Chromium, so the tests mock it entirely using `page.addInitScript()`. This injects a `MockSpeechRecognition` class into the page before any scripts load — it's the only reliable way to intercept `window.SpeechRecognition` before the component mounts.

**Pattern:**
1. `mockSpeechRecognition(page)` — called in `beforeEach`, registers the mock via `addInitScript`
2. `page.route('**/language/translate/v2**', ...)` — intercepts translate API calls per-test
3. `fireSpeechResult(page, lang, transcript, confidence)` — fires a fake final result on the recognizer instance matching `lang` (instances register themselves in `window.__mockInstances` when `start()` is called)

The 300ms confidence-resolution window is tested by firing both recognizers in rapid succession and asserting which text ends up in the textarea.

**Run just the voice tests:**
```bash
npx playwright test tests/voice-dictation-bilingual.spec.ts --project=chromium
```

### Test cleanup — Redis teardown

After every test run, `tests/global-teardown.ts` automatically deletes any notes that were created by Playwright.

**How it works:** Notes are stored as a single JSON array at the Redis key `field:notes`. The teardown reads that array, removes any note whose `title` or `content` contains the sentinel string `__PLAYWRIGHT_TEST__`, and writes the filtered array back.

**Rule:** Every test that creates a note must include `__PLAYWRIGHT_TEST__` somewhere in the note's `title` or `content` field. This is already done in all existing test files. When adding new tests that create notes, always append the sentinel to the content (or title for photo-only notes).

The teardown is idempotent — if no test notes are found, it logs a clean message and exits without error.
