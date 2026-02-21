import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNoteById, updateNote, deleteNote } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';
import { NOTE_TAKERS } from '@/lib/noteTakers';
import { UpdateNoteInput } from '@/types/note';

const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  noteTaker: z.enum(NOTE_TAKERS).optional(),
  sentToChat: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = await params;
  const note = await getNoteById(id);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json(note);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input: UpdateNoteInput & { sentToChat?: boolean } = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
    ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.noteTaker !== undefined ? { noteTaker: parsed.data.noteTaker } : {}),
    ...(parsed.data.sentToChat !== undefined ? { sentToChat: parsed.data.sentToChat } : {}),
  };

  const updated = await updateNote(id, input);
  if (!updated) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const { id } = await params;
  const deleted = await deleteNote(id);
  if (!deleted) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
