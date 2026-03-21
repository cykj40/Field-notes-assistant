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
| `OPENAI_API_KEY` | Yes | OpenAI key for Whisper audio transcription |

Generate `FIELD_NOTES_API_KEY` / `SESSION_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Bilingual Voice Dictation

Voice dictation uses OpenAI Whisper (`whisper-1`) via `/app/api/transcribe/route.ts`.
The user taps the mic button to record, taps again to transcribe. Whisper
auto-detects English and Spanish — no language selection needed.
`MediaRecorder` captures audio in the browser (`webm/opus` preferred).
Requires `OPENAI_API_KEY` in environment variables.
Cost: $0.006/minute of audio — negligible for field note use.

### PWA cache note

The app uses `next-pwa`, and `next.config.js` now sets `skipWaiting: true` so newer service workers activate faster after deploys. If someone still sees stale voice behavior after a release, have them hard refresh once to flush the old bundle.

---

## Testing

```bash
npx playwright test
```

Tests live in `tests/`. Covers auth, note CRUD, photo upload/display, Google Chat webhook, multi-user note authorship, and voice dictation.

### Voice dictation tests (`tests/voice-dictation-bilingual.spec.ts`)

The browser microphone and Whisper transcription are mocked in Playwright.

**Pattern:**
1. `mockMediaRecorder(page)` replaces `MediaRecorder` and `getUserMedia`
2. `mockTranscribeAPI(page, transcript)` intercepts `/api/transcribe`
3. `goToNoteForm(page, user)` opens the note form for an authenticated user
4. Tests assert on recording, transcribing, and final textarea content

**Run just the voice tests:**
```bash
npx playwright test tests/voice-dictation-bilingual.spec.ts --project=chromium
```

### Test cleanup — Redis teardown

After every test run, `tests/global-teardown.ts` automatically deletes any notes that were created by Playwright.

**How it works:** Notes are stored as a single JSON array at the Redis key `field:notes`. The teardown reads that array, removes any note whose `title` or `content` contains the sentinel string `__PLAYWRIGHT_TEST__`, and writes the filtered array back.

**Rule:** Every test that creates a note must include `__PLAYWRIGHT_TEST__` somewhere in the note's `title` or `content` field. This is already done in all existing test files. When adding new tests that create notes, always append the sentinel to the content (or title for photo-only notes).

The teardown is idempotent — if no test notes are found, it logs a clean message and exits without error.
