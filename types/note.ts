import { NoteTaker } from '@/lib/noteTakers';

export interface Note {
  id: string;
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  sentToChat: boolean;
  photos?: NotePhoto[];
}

export interface NotePhoto {
  id: string;
  dataUrl: string;        // base64 data URL stored directly on the note
  caption?: string | undefined;
  createdAt: string;
}

export type CreateNoteInput = {
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
  createdBy?: string;
  photos?: NotePhoto[];
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
