import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns a 401 response if the request is missing a valid x-api-key header.
 * Returns null if the check passes (or if FIELD_NOTES_API_KEY is not configured).
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const expectedKey = process.env.FIELD_NOTES_API_KEY;
  if (!expectedKey) return null; // not configured — allow through (dev / unset)

  const provided = req.headers.get('x-api-key');
  if (!provided || provided !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
