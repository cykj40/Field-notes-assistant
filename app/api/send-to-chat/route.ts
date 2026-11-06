import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, markNoteSent } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';
import { Note } from '@/types/note';

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

  // The note outlives the send, so a retried request (e.g. the first response
  // was lost) must not post to Chat a second time.
  if (note.sentAt) {
    return NextResponse.json({ success: true, alreadySent: true, sentAt: note.sentAt });
  }

  const hasPhotos = note.photos && note.photos.length > 0;

  let chatPayload: object;

  if (hasPhotos) {
    // Photos are already public Vercel Blob URLs — use them directly
    const widgets: object[] = [
      { textParagraph: { text: formatNoteForChat(note) } },
      ...note.photos!.map((photo) => ({
        image: { imageUrl: photo.url, altText: 'Field photo' },
      })),
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
    chatPayload = { text: formatNoteForChat(note) };
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

  // Marked sent only now, after the webhook answered OK. This route always
  // posts the raw note body; the AI path will pass 'client' when it lands.
  let sent: Note | null;
  try {
    sent = await markNoteSent(noteId, 'raw');
  } catch (err) {
    console.error(`[send-to-chat] Posted note ${noteId} to Chat but failed to record it as sent:`, err);
    // 409 is terminal for the outbox: a 5xx would be retried and post a duplicate.
    return NextResponse.json(
      { error: 'The note was posted to Google Chat but could not be marked as sent. Do not send it again.' },
      { status: 409 }
    );
  }

  if (!sent) {
    console.warn(`[send-to-chat] Note ${noteId} was posted to Chat but no longer exists to mark as sent.`);
    return NextResponse.json({ success: true, noteMissing: true });
  }

  return NextResponse.json({ success: true, sentAt: sent.sentAt, sentBody: sent.sentBody });
}
