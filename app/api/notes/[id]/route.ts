import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNoteById, updateNote, deleteNote } from '@/lib/storage';

const UpdateNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  location: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sentToChat: z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = getNoteById(id);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json(note);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = updateNote(id, parsed.data);
  if (!updated) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deleteNote(id);
  if (!deleted) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
