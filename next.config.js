/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // Background Sync replay for the offline outbox. Injected as-is rather than
  // built from `worker/` — next-pwa's custom-worker compile crashes in this
  // repo (the "ajv" override resolves ajv 8 against ajv-keywords@3). See the
  // header comment in public/outbox-sync.js.
  importScripts: ['/outbox-sync.js'],
});

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Block clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops browser from sending referrer when navigating away
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Allow camera and microphone (needed for photo capture and voice dictation); block geolocation
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  // Force HTTPS for 1 year once visited (Vercel always serves HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

module.exports = withPWA({
  // Next 16 defaults to Turbopack. Declare its configuration explicitly while
  // retaining the existing plugin-based configuration during this transition.
  turbopack: {},
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
});
