/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
});
