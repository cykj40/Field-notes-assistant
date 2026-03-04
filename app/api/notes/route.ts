import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNotes, createNote } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';
import { NOTE_TAKERS } from '@/lib/noteTakers';
import { CreateNoteInput } from '@/types/note';
import { getSession } from '@/lib/auth';

const PhotoSchema = z.object({
  id: z.string(),
  dataUrl: z.string().startsWith('data:image/'),
  caption: z.string().optional(),
  createdAt: z.string(),
});

const CreateNoteSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: z.string().optional(),
    location: z.string().optional(),
    tags: z.array(z.string()).default([]),
    noteTaker: z.enum(NOTE_TAKERS).optional(),
    photos: z.array(PhotoSchema).default([]),
  })
  .refine(
    (d) => (d.title?.trim() ?? '') !== '' || (d.content?.trim() ?? '') !== '' || d.photos.length > 0,
    { message: 'At least a title, notes content, or photo is required.' }
  );

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const notes = await getNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  // Get the authenticated user from session
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = CreateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input: CreateNoteInput = {
    tags: parsed.data.tags,
    createdBy: session.username,
    photos: parsed.data.photos,
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.content !== undefined ? { content: parsed.data.content } : {}),
    ...(parsed.data.location !== undefined ? { location: parsed.data.location } : {}),
    ...(parsed.data.noteTaker !== undefined ? { noteTaker: parsed.data.noteTaker } : {}),
  };

  const note = await createNote(input);
  return NextResponse.json(note, { status: 201 });
}
