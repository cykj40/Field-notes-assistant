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
  url: string;            // Vercel Blob public URL (https://)
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
