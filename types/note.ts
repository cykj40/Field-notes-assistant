export interface Note {
  id: string;
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  sentToChat: boolean;
}

export type CreateNoteInput = {
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
