import fs from 'fs';
import path from 'path';
import { Note, CreateNoteInput, UpdateNoteInput } from '@/types/note';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify([], null, 2));
  }
}

export function getNotes(): Note[] {
  ensureDataDir();
  const data = fs.readFileSync(NOTES_FILE, 'utf-8');
  return JSON.parse(data) as Note[];
}

export function getNoteById(id: string): Note | undefined {
  return getNotes().find((n) => n.id === id);
}

export function createNote(input: CreateNoteInput): Note {
  const notes = getNotes();
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
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  return newNote;
}

export function updateNote(id: string, input: UpdateNoteInput & { sentToChat?: boolean }): Note | null {
  const notes = getNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  notes[idx] = {
    ...notes[idx],
    ...input,
    id,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  return notes[idx];
}

export function deleteNote(id: string): boolean {
  const notes = getNotes();
  const filtered = notes.filter((n) => n.id !== id);
  if (filtered.length === notes.length) return false;
  fs.writeFileSync(NOTES_FILE, JSON.stringify(filtered, null, 2));
  return true;
}
