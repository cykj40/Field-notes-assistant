'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Note } from '@/types/note';
import {
  UI_DEADLINE_MS,
  attemptJob,
  discardJob,
  enqueueSendToChat,
  hasPendingSend,
  subscribeOutbox,
} from '@/lib/outbox';

interface NoteActionsProps {
  note: Note;
}

export default function NoteActions({ note }: NoteActionsProps) {
  const router = useRouter();
  const [queued, setQueued] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sentToChat, setSentToChat] = useState(note.sentToChat);
  const [error, setError] = useState('');

  // A send queued before the user navigated away is still queued when they come back.
  useEffect(() => {
    let active = true;
    void hasPendingSend(note.id).then((pending) => {
      if (active && pending) setQueued(true);
    });
    return () => {
      active = false;
    };
  }, [note.id]);

  // The queued send may land minutes later, while the user is still on this
  // page. A successful send deletes the note, so stay off the 404.
  useEffect(() => {
    return subscribeOutbox((event) => {
      if (event.type !== 'job-done' || event.foreground) return;
      if (event.job.type !== 'send-to-chat' || event.noteId !== note.id) return;
      router.push('/');
      router.refresh();
    });
  }, [note.id, router]);

  const sendToChat = useCallback(async () => {
    setError('');
    // Control comes back before any network call starts.
    setQueued(true);

    const { job, persisted } = await enqueueSendToChat({
      noteId: note.id,
      label: note.title ?? 'Untitled',
      claimed: true,
    });

    const outcome = await Promise.race([
      attemptJob(job, { foreground: true }),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), UI_DEADLINE_MS)),
    ]);

    if (outcome === 'timeout') return; // stays queued, retries in the background

    if (outcome.kind === 'success') {
      const result = outcome.result as { deleted?: boolean } | null;
      if (result?.deleted) {
        // Sent and deleted server-side — nothing left to look at.
        router.push('/');
        router.refresh();
      } else {
        setQueued(false);
        setSentToChat(true);
        router.refresh();
      }
      return;
    }

    if (outcome.kind === 'terminal' || !persisted) {
      await discardJob(job.jobId);
      setQueued(false);
      setError(outcome.error);
    }
  }, [note.id, note.title, router]);

  async function handleDelete() {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/notes/${note.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '' },
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setDeleting(false);
      setError('Failed to delete note.');
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href={`/notes/${note.id}/edit`} className="btn-secondary">
          ✏️ Edit
        </Link>

        <button
          className="btn-primary"
          onClick={() => void sendToChat()}
          disabled={queued || sentToChat}
        >
          {queued ? '⏳ Queued to send' : sentToChat ? '✅ Sent to Chat' : '💬 Send to Google Chat'}
        </button>

        <button
          className="btn-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? 'Deleting…' : '🗑️ Delete'}
        </button>
      </div>
    </div>
  );
}
