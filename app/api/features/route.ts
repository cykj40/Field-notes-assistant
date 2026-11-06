import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiKey';
import { isClientNotesEnabled } from '@/lib/ai/config';

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  return NextResponse.json({ clientNotes: isClientNotesEnabled() });
}
