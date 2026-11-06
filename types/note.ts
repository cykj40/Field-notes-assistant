import { NoteTaker } from '@/lib/noteTakers';

/**
 * Who the note came from. Per-note source authority only — unrelated to the
 * Neon login roles (admin | supervisor), which are app privilege, not source.
 */
export const SOURCE_ROLES = ['supervisor', 'manager', 'project_manager', 'worker'] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export type SentBody = 'raw' | 'client';

/** One answered clarify question from the AI path. */
export interface ClarifyAnswer {
  id: string;
  missingStep: string;
  question: string;
  include: boolean;
  note?: string;
}

/** Provenance + review state for AI-generated client notes. */
export interface ClientNotesMeta {
  promptVersion: string;
  modelId: string;
  generatedAt: string;
  clarifyAnswers: ClarifyAnswer[];
  waived: boolean;
  materialsRequested: boolean;
  warnings: string[];
  editedByUser: boolean;
}

export interface Note {
  id: string;
  /** Client-generated idempotency key — dedupes retried offline creates. */
  clientId?: string;
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
  sourceRole?: SourceRole;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  sentToChat: boolean;
  /** ISO time the note was posted to Chat. Set only after a successful webhook response. */
  sentAt?: string;
  /** Which body was posted: the raw `content`, or the AI-formatted `clientNotes`. */
  sentBody?: SentBody;
  photos?: NotePhoto[];
  /** AI-formatted output. Never overwrites `content`. */
  clientNotes?: string;
  clientNotesMeta?: ClientNotesMeta;
}

export interface NotePhoto {
  id: string;
  url: string;            // Vercel Blob public URL (https://)
  caption?: string | undefined;
  createdAt: string;
}

export type CreateNoteInput = {
  clientId?: string;
  title?: string;
  content?: string;
  location?: string;
  tags: string[];
  noteTaker?: NoteTaker;
  sourceRole?: SourceRole;
  createdBy?: string;
  photos?: NotePhoto[];
};

export type UpdateNoteInput = Partial<CreateNoteInput>;
