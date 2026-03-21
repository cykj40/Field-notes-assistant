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

Tests live in `tests/`. Covers auth, note CRUD, photo upload/display, Google Chat webhook, and multi-user note authorship. Voice dictation is not currently covered by E2E tests (Web Speech API is not available in headless Chromium).
