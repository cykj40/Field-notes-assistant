import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession, SessionOptions } from 'iron-session';
import { SessionData } from './lib/auth';

function getSessionOptions(): SessionOptions {
  const sessionSecret = process.env['SESSION_SECRET'];

  if (!sessionSecret) {
    // Allow build to pass without SESSION_SECRET
    return {
      password: 'build-time-placeholder-min-32-chars-long-secret',
      cookieName: 'session',
      cookieOptions: {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      },
    };
  }

  return {
    password: sessionSecret,
    cookieName: 'session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    },
  };
}

export async function proxy(request: NextRequest) {
  // Get session from cookies
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    getSessionOptions()
  );

  // Check if user is authenticated
  if (!session.isLoggedIn) {
    // API routes should return 401 JSON, not redirect to login
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     *   /login                — the login page itself
     *   /api/auth/...         — auth API endpoints (login, logout)
     *   /api/photos/...       — public photo serving endpoints (for Google Chat)
     *   /_next/...            — Next.js internals (JS chunks, HMR, etc.)
     *   /favicon.ico          — browser favicon request
     *   /icons/...            — PWA icons
     *   /manifest.json        — PWA manifest
     *   /offline.html         — install-time service-worker fallback document
     *   /sw.js                — service worker
     *   /outbox-sync.js       — importScripts()'d into sw.js; must be reachable
     *                           unauthenticated or the SW's top-level
     *                           importScripts() throws on an HTML redirect
     *                           instead of loading JS, and install fails
     *   /workbox-*.js         — stale from next-pwa/Workbox; kept in case any
     *                           already-installed client still references one
     */
    '/((?!login$|api/auth/|api/photos/|_next/|favicon\\.ico$|icons/|manifest\\.json$|offline\\.html$|sw\\.js$|outbox-sync\\.js$|workbox-).*)',
  ],
};
