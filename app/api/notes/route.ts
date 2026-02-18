import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNotes, createNote } from '@/lib/storage';

const CreateNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  location: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export async function GET() {
  const notes = getNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = createNote(parsed.data);
  return NextResponse.json(note, { status: 201 });
}
