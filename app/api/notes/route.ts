import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNotes, createNote } from '@/lib/storage';
import { requireApiKey } from '@/lib/apiKey';

const CreateNoteSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: z.string().optional(),
    location: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .refine((d) => (d.title?.trim() ?? '') !== '' || (d.content?.trim() ?? '') !== '', {
    message: 'At least a title or notes content is required.',
  });

export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const notes = await getNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const parsed = CreateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = await createNote(parsed.data);
  return NextResponse.json(note, { status: 201 });
}
