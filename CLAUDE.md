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
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token for photo storage |
| `NEXT_PUBLIC_OUTBOX_TIMEOUT_MS` | No | How long a submit waits before queueing (default `3000`) |

Generate `FIELD_NOTES_API_KEY` / `SESSION_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Photo Storage (Vercel Blob)

Photos are uploaded to Vercel Blob at capture time (before note submission), not inline with the note.

**Flow:**
1. User selects a photo — NoteForm compresses it client-side (Canvas API, 1200px max, JPEG 70%)
2. Compressed blob is immediately POSTed to `/api/photos/upload`
3. Server uploads to Vercel Blob at path `photos/{uuid}.jpg` and returns `{ id, url }`
4. NoteForm stores the public `https://` URL on the photo object
5. On note submit, only the URL (not image data) is stored in Redis

**NotePhoto schema:** `{ id, url, caption?, createdAt }` — `url` is always a `https://` Vercel Blob URL.

**Google Chat webhook:** Photos are sent as image widgets using the Blob URL directly — no proxy or TTL.

**Per-photo upload state in NoteForm:** Each photo tile shows a spinner overlay while uploading and an error overlay with a Retry button on failure. Submit is blocked while any photo is still uploading.

**Old `/api/photos/[id]` route removed** — that route served base64 from Redis as a workaround; it is no longer needed.

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

## Offline Outbox

Note creation/edits and "Send to Google Chat" never block on the network. Both
go through one durable client-side queue (`lib/outbox.ts`, IndexedDB) so a slow
link or a dead one costs the user nothing.

**Submit flow (`NoteForm.tsx`):**
1. Client-side validation is unchanged (title/content/photo, "wait for uploads").
2. The job is written to the outbox *first*, marked as claimed.
3. The request runs as that job's first attempt and is **never aborted** — on a
   slow link it usually lands, and killing it would leave the server to finish
   the write while a retry duplicated it.
4. The user gets control back after `NEXT_PUBLIC_OUTBOX_TIMEOUT_MS` (3s):
   - resolved + OK → normal redirect to `/notes/[id]`
   - 400 from Zod → inline error, nothing queued (the user is right there)
   - timed out or failed → form clears, note stays queued. Online, this
     redirects to `/`; offline it stays on the cleared form with a queued
     notice, because every route is server-rendered and there is nothing to
     navigate to without a connection.

**Send to chat (`NoteActions.tsx`):** the button flips to `⏳ Queued to send`
before any network call. The send route deletes the note on success, so a
**404 on retry is treated as success** — it means an earlier attempt landed and
only the response was lost.

**Idempotency:** creates carry a client-generated `clientId`; `createNote` in
`lib/storage.ts` returns the existing note if it sees that key again. This is
what makes retrying a queued create safe. The same `clientId` is reused if the
user re-taps Create after a failure.

**Retry triggers** (`hooks/useOutbox.ts`) — all four matter:
- flush on mount, ignoring backoff (cold start)
- `online`, ignoring backoff (the reason for the backoff just went away)
- `visibilitychange` → visible
- a 30s interval that only runs while the outbox is non-empty — **this is the
  one that carries iOS**, which has no Background Sync API

Backoff is 30s → 5min cap. Past 20 attempts or 24h a job is flagged "needs
attention" in the indicator but keeps retrying until discarded. A terminal
rejection (400/404/409) stops retrying; 401/403 keep retrying, because an
expired session comes back after login and a field note must never be dropped
for it.

**UI:** `components/SyncIndicator.tsx` — a tappable pill (bottom-left, next to
`UpdateBanner`) showing the pending count, expanding to a per-job list with
status, last error, "Try now", and "Discard".

### Background Sync / the custom service worker

`worker/index.ts` is compiled by next-pwa's `customWorkerDir` support into
`public/worker-<buildId>.js` and `importScripts()`-ed by the generated `sw.js` —
no ejecting, no `swSrc`. It handles the Background Sync event, and **bails if
any window client is open** so the page and the SW never flush the same job.
`worker/` is excluded from `tsconfig.json` (it runs in a ServiceWorkerGlobalScope)
and must use relative imports — the custom-worker webpack pass has no `@/` alias.

Caveats: next-pwa is disabled in development, so there is no SW under
`npm run dev` and Background Sync is not exercised by Playwright. iOS Safari has
no Background Sync at all. Both are why the foreground triggers do the real work.

## Testing

```bash
npx playwright test
```

Tests live in `tests/`. Covers auth, note CRUD, photo upload/display, Google Chat webhook, multi-user note authorship, voice dictation, and the offline outbox.

`tests/global.setup.ts` warms the API routes before the suite runs. Without it,
the dev server's first on-demand route compile can exceed the 3s submit window
and push the first create of a run onto the queued path, failing its redirect
assertion.

### Outbox tests (`tests/outbox-offline.spec.ts`)

Uses `context.setOffline(true)` — no SW involved, since next-pwa is off in dev.
The durability test proves the queue survives a *full* close, not just
backgrounding: it captures `context.storageState({ indexedDB: true })`, closes
the context entirely, and opens a fresh one from that state.

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
