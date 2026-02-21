import { NoteTaker } from '@/lib/noteTakers';

export interface Note {
  id: string;
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
  createdAt: string;
  updatedAt: string;
  sentToChat: boolean;
}

export type CreateNoteInput = {
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
