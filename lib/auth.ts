import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  username: string;
  role: 'admin' | 'supervisor';
  isLoggedIn: boolean;
}

function getSessionOptions(): SessionOptions {
  const sessionSecret = process.env['SESSION_SECRET'];

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }

  return {
    password: sessionSecret,
    cookieName: 'session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getIronSession<SessionData>(await cookies() as any, getSessionOptions());
}
