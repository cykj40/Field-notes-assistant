import { Redis } from '@upstash/redis';
import { Note, CreateNoteInput, UpdateNoteInput, ClientNotesMeta, SentBody } from '@/types/note';
import { TEST_SENTINEL } from '@/lib/testSentinel';

const redis = Redis.fromEnv();
const NOTES_KEY = 'field:notes';

async function readNotes(): Promise<Note[]> {
  const notes = await redis.get<Note[]>(NOTES_KEY);
  return notes ?? [];
}

async function writeNotes(notes: Note[]): Promise<void> {
  await redis.set(NOTES_KEY, notes);
}

/**
 * E2E tests run against the same Redis key as production — there is no separate
 * test store — so notes tagged with TEST_SENTINEL are hidden from the list
 * views in production only.
 *
 * Every other environment (local dev, CI, Vercel previews, where VERCEL_ENV is
 * unset or 'preview') reads everything, unchanged. That is what lets specs
 * assert on the home list right after creating a note.
 *
 * Deliberately not applied to getNoteById: tests navigate straight to the
 * detail page of a note they just created.
 */
function hideTestNotes(notes: Note[]): Note[] {
  if (process.env['VERCEL_ENV'] !== 'production') return notes;
  return notes.filter(
    (n) =>
      !(
        (n.title ?? '').includes(TEST_SENTINEL) ||
        (n.content ?? '').includes(TEST_SENTINEL)
      )
  );
}

export async function getNotes(): Promise<Note[]> {
  return hideTestNotes(await readNotes());
}

export async function getNotesSummary(): Promise<Note[]> {
  const notes = hideTestNotes(await readNotes());
  return notes.map((n) => ({ ...n, photos: [] }));
}

export async function getNoteById(id: string): Promise<Note | undefined> {
  const notes = await readNotes();
  return notes.find((n) => n.id === id);
}

export async function createNote(input: CreateNoteInput): Promise<Note> {
  const notes = await readNotes();

  // Idempotency: a queued note that was retried after its first attempt already
  // landed must not create a second note.
  if (input.clientId) {
    const existing = notes.find((n) => n.clientId === input.clientId);
    if (existing) return existing;
  }

  const now = new Date().toISOString();
  const newNote: Note = {
    id: crypto.randomUUID(),
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    sentToChat: false,
    photos: input.photos ?? [],
    ...(input.clientId ? { clientId: input.clientId } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.content ? { content: input.content } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.noteTaker ? { noteTaker: input.noteTaker } : {}),
    ...(input.sourceRole ? { sourceRole: input.sourceRole } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
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
  const existingNote = notes[idx];
  if (!existingNote) return null;
  const updatedNote: Note = {
    ...existingNote,
    ...input,
    id,
    updatedAt: new Date().toISOString(),
  };
  notes[idx] = updatedNote;
  await writeNotes(notes);
  return updatedNote;
}

/**
 * Thrown when a client-notes write would have changed the raw note `content`.
 * `content` is the supervisor's original words; the AI path must never touch it.
 */
export class NoteContentMutationError extends Error {
  constructor(public readonly noteId: string) {
    super(`Refusing to write client notes for note ${noteId}: raw content would have changed`);
    this.name = 'NoteContentMutationError';
  }
}

/** Throws NoteContentMutationError unless content is identical (absent stays absent). */
export function assertContentUnchanged(
  noteId: string,
  before: string | undefined,
  after: string | undefined,
): void {
  if (before !== after) throw new NoteContentMutationError(noteId);
}

/**
 * Writes ONLY clientNotes and clientNotesMeta. Every other field — notably
 * `content`, and `updatedAt`, which tracks user edits — is left exactly as it
 * was. Returns null when the note does not exist.
 */
export async function updateClientNotes(
  id: string,
  clientNotes: string,
  meta: ClientNotesMeta,
): Promise<Note | null> {
  const notes = await readNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const existingNote = notes[idx];
  if (!existingNote) return null;

  const updatedNote: Note = {
    ...existingNote,
    clientNotes,
    clientNotesMeta: meta,
  };
  assertContentUnchanged(id, existingNote.content, updatedNote.content);

  notes[idx] = updatedNote;
  await writeNotes(notes);
  return updatedNote;
}

/**
 * Marks a note as posted to Chat. Call ONLY after the webhook answered OK.
 * Writes just sentToChat, sentAt and sentBody; `content` and every other field
 * (including updatedAt, which tracks edits) stay as they were. The first send
 * wins: an already-sent note is returned untouched. Returns null if the note
 * no longer exists.
 */
export async function markNoteSent(id: string, sentBody: SentBody): Promise<Note | null> {
  const notes = await readNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const existingNote = notes[idx];
  if (!existingNote) return null;
  if (existingNote.sentAt) return existingNote;

  const sentNote: Note = {
    ...existingNote,
    sentToChat: true,
    sentAt: new Date().toISOString(),
    sentBody,
  };
  assertContentUnchanged(id, existingNote.content, sentNote.content);

  notes[idx] = sentNote;
  await writeNotes(notes);
  return sentNote;
}

export async function deleteNote(id: string): Promise<boolean> {
  const notes = await readNotes();
  const filtered = notes.filter((n) => n.id !== id);
  if (filtered.length === notes.length) return false;
  await writeNotes(filtered);
  return true;
}
