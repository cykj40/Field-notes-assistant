/**
 * Test-only Node preload (`node --require`) for the app server.
 *
 * send-to-chat posts to Google Chat from the server, so Playwright's
 * page.route() can't see it. This wraps global fetch and appends the BODY of
 * every request to GOOGLE_CHAT_WEBHOOK_URL to CHAT_CAPTURE_FILE (one JSON
 * object per line) so specs can assert on exactly what would reach Chat. The
 * request is still forwarded untouched. It records only the body, never the
 * URL, and does nothing unless both env vars are set.
 */
const fs = require('node:fs');

const file = process.env.CHAT_CAPTURE_FILE;
const webhook = process.env.GOOGLE_CHAT_WEBHOOK_URL;

if (file && webhook && typeof globalThis.fetch === 'function') {
  const realFetch = globalThis.fetch;
  globalThis.fetch = function captureChatWebhook(input, init) {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
      if (url === webhook && init && typeof init.body === 'string') {
        fs.appendFileSync(file, JSON.stringify({ at: Date.now(), body: init.body }) + '\n');
      }
    } catch (err) {
      console.error('[chat-capture] failed to record webhook post:', err instanceof Error ? err.message : err);
    }
    return realFetch.apply(this, arguments);
  };
}
