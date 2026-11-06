import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientNotesMeta, Note } from '@/types/note';

// In-memory stand-in for the Upstash client. Stores JSON copies, like Redis does.
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({
      get: async (key: string) => (store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null),
      set: async (key: string, value: unknown) => {
        store.set(key, JSON.parse(JSON.stringify(value)));
        return 'OK';
      },
    }),
  },
}));

import { NoteContentMutationError, assertContentUnchanged, updateClientNotes } from '@/lib/storage';

const NOTES_KEY = 'field:notes';

// Raw content with awkward characters on purpose: blank lines, double spaces,
// a sentinel, and a non-ASCII dash.
const RAW_CONTENT = 'Laid  floor\n\nPinkus delivered 11/6 — __PLAYWRIGHT_TEST__ \t';

function seedNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    tags: [],
    photos: [],
    sentToChat: false,
    title: 'Level 2 east',
    content: RAW_CONTENT,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:30:00.000Z',
    noteTaker: 'Victor',
    sourceRole: 'supervisor',
    ...overrides,
  };
}

const META: ClientNotesMeta = {
  promptVersion: 'client-notes-v1',
  modelId: 'claude-sonnet-5-5',
  generatedAt: '2026-11-06T10:00:00.000Z',
  clarifyAnswers: [],
  waived: false,
  materialsRequested: false,
  warnings: [],
  editedByUser: false,
};

function savedNotes(): Note[] {
  return store.get(NOTES_KEY) as Note[];
}

describe('updateClientNotes', () => {
  beforeEach(() => {
    store.clear();
  });

  it('writes only clientNotes and clientNotesMeta; every other field is unchanged', async () => {
    const original = seedNote();
    store.set(NOTES_KEY, [original]);

    const returned = await updateClientNotes(original.id, 'Formatted text', META);

    const saved = savedNotes()[0]!;
    expect(saved).toEqual({ ...original, clientNotes: 'Formatted text', clientNotesMeta: META });
    expect(returned).toEqual(saved);
  });

  it('keeps raw content byte-identical, including whitespace and sentinel text', async () => {
    const original = seedNote();
    store.set(NOTES_KEY, [original]);

    await updateClientNotes(original.id, 'Anything the model wrote', META);

    expect(savedNotes()[0]!.content).toBe(RAW_CONTENT);
  });

  it('leaves updatedAt alone, because it tracks user edits', async () => {
    const original = seedNote();
    store.set(NOTES_KEY, [original]);

    await updateClientNotes(original.id, 'Formatted text', META);

    expect(savedNotes()[0]!.updatedAt).toBe(original.updatedAt);
  });

  it('returns null and writes nothing when the note does not exist', async () => {
    const other = seedNote({ id: 'other' });
    store.set(NOTES_KEY, [other]);

    const result = await updateClientNotes('missing', 'Formatted text', META);

    expect(result).toBeNull();
    expect(savedNotes()).toEqual([other]);
  });

  it('only touches the matching note in the array', async () => {
    const target = seedNote();
    const neighbour = seedNote({ id: 'note-2', content: 'Another note' });
    store.set(NOTES_KEY, [neighbour, target]);

    await updateClientNotes(target.id, 'Formatted text', META);

    expect(savedNotes()[0]).toEqual(neighbour);
    expect(savedNotes()[1]!.clientNotes).toBe('Formatted text');
  });
});

describe('assertContentUnchanged', () => {
  it('passes when content is identical', () => {
    expect(() => assertContentUnchanged('note-1', RAW_CONTENT, RAW_CONTENT)).not.toThrow();
    expect(() => assertContentUnchanged('note-1', undefined, undefined)).not.toThrow();
  });

  it('throws a typed error when even one character differs', () => {
    expect(() => assertContentUnchanged('note-1', RAW_CONTENT, RAW_CONTENT + ' ')).toThrow(
      NoteContentMutationError,
    );
    expect(() => assertContentUnchanged('note-1', 'Pinkus', 'Prime Woodworking')).toThrow(NoteContentMutationError);
  });
});
