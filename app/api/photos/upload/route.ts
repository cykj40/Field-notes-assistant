import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiKey';
import { getSession } from '@/lib/auth';

// Max photo size: 800px wide, JPEG quality 70
// We compress client-side using Canvas API so no sharp needed server-side.
// This route just validates the upload and passes it back as a data URL.

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('image') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }

  // Validate type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  // Validate size — reject anything over 5MB before compression
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 });
  }

  // Convert to base64 data URL
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  const id = crypto.randomUUID();

  return NextResponse.json({ id, dataUrl });
}
