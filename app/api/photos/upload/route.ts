import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireApiKey } from '@/lib/apiKey';
import { getSession } from '@/lib/auth';

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

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const blob = await put(`photos/${id}.jpg`, file, {
    access: 'public',
    addRandomSuffix: false,
  });

  return NextResponse.json({ id, url: blob.url });
}
