/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: false,
  disable: process.env.NODE_ENV === 'development',
});

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Block clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Stops browser from sending referrer when navigating away
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Allow microphone (needed for voice dictation); block everything else
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  // Force HTTPS for 1 year once visited (Vercel always serves HTTPS)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

module.exports = withPWA({
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
});
