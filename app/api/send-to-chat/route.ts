import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, deleteNote } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function formatRecordedDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatNoteForChat(note: {
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: string;
  createdBy?: string;
  createdAt: string;
}): string {
  const creator = note.createdBy ?? 'Unknown';
  const timestamp = formatRecordedDate(note.createdAt);

  const lines: string[] = [
    `*Field Note: ${note.title ?? 'Untitled'}*`,
    '',
    note.content ?? '',
    '',
    `${creator} — ${timestamp}`,
  ];

  if (note.noteTaker) {
    lines.push('', `Note taker: ${note.noteTaker}`);
  }

  if (note.location) {
    lines.push('', `Location: ${note.location}`);
  }

  if (note.tags.length > 0) {
    lines.push('', `Tags: ${note.tags.join(', ')}`);
  }

  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const webhookUrl = process.env['GOOGLE_CHAT_WEBHOOK_URL'];
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Google Chat webhook not configured' }, { status: 500 });
  }

  const { noteId } = await req.json();
  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required' }, { status: 400 });
  }

  const note = await getNoteById(noteId);
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const hasPhotos = note.photos && note.photos.length > 0;

  let chatPayload: object;

  if (hasPhotos) {
    // Store photos in Redis temporarily for Google Chat to fetch
    const imageUrls: string[] = [];

    for (const photo of note.photos!) {
      await redis.set(`field:photo:${photo.id}`, photo.dataUrl, { ex: 3600 });
      imageUrls.push(`${appUrl}/api/photos/${photo.id}`);
    }

    // Build widgets: text first, then images with altText
    const widgets: object[] = [
      { textParagraph: { text: formatNoteForChat(note) } },
      ...imageUrls.map((url) => ({ image: { imageUrl: url, altText: 'Field photo' } })),
    ];

    // CRITICAL: Use cardsV2 (NOT cards) for Google Chat incoming webhooks
    chatPayload = {
      cardsV2: [
        {
          cardId: noteId,
          card: {
            header: {
              title: `Field Note: ${note.title ?? 'Untitled'}`,
              subtitle: `${note.createdBy ?? 'Unknown'} — ${formatRecordedDate(note.createdAt)}`,
            },
            sections: [{ widgets }],
          },
        },
      ],
    };
  } else {
    // Plain text — existing behavior
    const text = formatNoteForChat(note);
    chatPayload = { text };
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatPayload),
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: `Google Chat error: ${error}` }, { status: 502 });
  }

  // Delete the note after successful send
  await deleteNote(noteId);
  return NextResponse.json({ success: true, deleted: true });
}
