import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

/** Compare two strings without leaking timing information. */
function safeCompare(a: string, b: string): boolean {
  // Hash both to a fixed-length buffer so timingSafeEqual never throws on length mismatch
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const secret = process.env.FIELD_AUTH_SECRET;

  if (!secret || !safeCompare(password ?? '', secret)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('field-auth', secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return response;
}
