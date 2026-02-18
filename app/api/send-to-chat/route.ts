import { NextRequest, NextResponse } from 'next/server';
import { getNoteById, updateNote } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';

function formatNoteForChat(note: { title?: string; content?: string; location?: string; tags: string[]; createdAt: string }): string {
  const lines: string[] = [
    `*📋 Field Note: ${note.title ?? 'Untitled'}*`,
    '',
    note.content ?? '',
  ];

  if (note.location) {
    lines.push('', `📍 *Location:* ${note.location}`);
  }

  if (note.tags.length > 0) {
    lines.push(`🏷️ *Tags:* ${note.tags.join(', ')}`);
  }

  const date = new Date(note.createdAt).toLocaleString();
  lines.push('', `🕐 *Recorded:* ${date}`);

  return lines.join('\n');
}

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
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

  const text = formatNoteForChat(note);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error: `Google Chat error: ${error}` }, { status: 502 });
  }

  const updated = await updateNote(noteId, { sentToChat: true });
  return NextResponse.json({ success: true, note: updated });
}
