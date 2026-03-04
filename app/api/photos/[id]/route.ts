import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // No API key required — must be publicly accessible for Google Chat
  const data = await redis.get<string>(`field:photo:${id}`);
  if (!data) {
    return new NextResponse('Not found', { status: 404 });
  }

  // data is a base64 data URL like "data:image/jpeg;base64,..."
  const [header, base64] = data.split(',');
  const mimeType = header?.split(':')[1]?.split(';')[0] ?? 'image/jpeg';
  const buffer = Buffer.from(base64 ?? '', 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
