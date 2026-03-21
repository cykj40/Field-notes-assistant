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
| `NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY` | Optional | Legacy translation key; current voice dictation no longer depends on it |

Generate `FIELD_NOTES_API_KEY` / `SESSION_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Bilingual Voice Dictation

### How It Works

Voice dictation now lives in [`hooks/useVoiceRecognition.ts`](./hooks/useVoiceRecognition.ts) and is consumed only by [`components/NoteForm.tsx`](./components/NoteForm.tsx). There is no separate `VoiceRecorder` component in the current app.

**Pattern: lazy-init `SpeechRecognition` + explicit language mode**

The recognizer is created lazily inside the hook's `start()` method so the browser sees it as part of the direct user click. This avoids stale-ref / remount issues from pre-initializing recognition in an effect.

`NoteForm` shows a clean two-button language mode above the mic:
- `English` -> `en-US`
- `Espanol` -> `es-ES`

`es-ES` is used (not `es-MX`) because it is the most universally supported Spanish locale across Chrome, Safari, and Android WebView. `es-MX` gets silently rejected on many browser/OS combos and returns no results.

The selected language tells the recognizer what language to expect before recording starts. The resulting transcript is appended exactly as spoken, so English stays English and Spanish stays Spanish.

### Real-time transcription with `continuous: true`

`continuous` is set to `true` and `interimResults` is set to `true` for real-time feedback. Text appears as the user speaks rather than waiting for a full utterance to end.

- **Interim results** are shown in a live preview below the mic button (`…` suffix, italic gray text). They are not written to the textarea.
- **Final results** replace the interim preview and are appended permanently to the textarea.
- The `onend` restart loop is removed — `continuous: true` keeps the recognizer running without restarts. Only `onerror` (network/no-speech errors) triggers a manual restart after 300 ms.

### PWA cache note

The app uses `next-pwa`, and `next.config.js` now sets `skipWaiting: true` so newer service workers activate faster after deploys. If someone still sees stale voice behavior after a release, have them hard refresh once to flush the old bundle.

---

## Testing

```bash
npx playwright test
```

Tests live in `tests/`. Covers auth, note CRUD, photo upload/display, Google Chat webhook, multi-user note authorship, and voice dictation.

### Voice dictation tests (`tests/voice-dictation-bilingual.spec.ts`)

The Web Speech API is not available in headless Chromium, so the tests mock it entirely using `page.addInitScript()`.

**Pattern:**
1. `mockSpeechRecognition(page)` registers the lazy-init recognizer mock and tracks `window.__mockStartCount`
2. `setBrowserLanguage(page, 'en-US' | 'es-ES')` sets the default browser language before the page loads
3. `goToNoteForm(page, user)` opens the note form for any seeded user
4. `fireSpeechResult(page, transcript)` drives final transcripts into the active recognizer instance

**Run just the voice tests:**
```bash
npx playwright test tests/voice-dictation-bilingual.spec.ts --project=chromium
```

### Test cleanup — Redis teardown

After every test run, `tests/global-teardown.ts` automatically deletes any notes that were created by Playwright.

**How it works:** Notes are stored as a single JSON array at the Redis key `field:notes`. The teardown reads that array, removes any note whose `title` or `content` contains the sentinel string `__PLAYWRIGHT_TEST__`, and writes the filtered array back.

**Rule:** Every test that creates a note must include `__PLAYWRIGHT_TEST__` somewhere in the note's `title` or `content` field. This is already done in all existing test files. When adding new tests that create notes, always append the sentinel to the content (or title for photo-only notes).

The teardown is idempotent — if no test notes are found, it logs a clean message and exits without error.
