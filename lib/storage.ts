import { Redis } from '@upstash/redis';
import { Note, CreateNoteInput, UpdateNoteInput } from '@/types/note';

const redis = Redis.fromEnv();
const NOTES_KEY = 'field:notes';

async function readNotes(): Promise<Note[]> {
  const notes = await redis.get<Note[]>(NOTES_KEY);
  return notes ?? [];
}

async function writeNotes(notes: Note[]): Promise<void> {
  await redis.set(NOTES_KEY, notes);
}

export async function getNotes(): Promise<Note[]> {
  return readNotes();
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  const notes = await readNotes();
  return notes.find((n) => n.id === id);
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const notes = await readNotes();
  const now = new Date().toISOString();
  const newNote: Note = {
    id: crypto.randomUUID(),
    title: input.title,
    content: input.content,
    location: input.location,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    sentToChat: false,
  };
  notes.unshift(newNote);
  await writeNotes(notes);
  return newNote;
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput & { sentToChat?: boolean },
): Promise<Note | null> {
  const notes = await readNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  notes[idx] = {
    ...notes[idx],
    ...input,
    id,
    updatedAt: new Date().toISOString(),
  };
  await writeNotes(notes);
  return notes[idx];
}

export async function deleteNote(id: string): Promise<boolean> {
  const notes = await readNotes();
  const filtered = notes.filter((n) => n.id !== id);
  if (filtered.length === notes.length) return false;
  await writeNotes(filtered);
  return true;
}
