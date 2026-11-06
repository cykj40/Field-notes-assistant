'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Note } from '@/types/note';
import { useShareToChat } from '@/hooks/useShareToChat';
import { SentBanner } from '@/components/SentBanner';

interface NoteActionsProps {
  note: Note;
}

export default function NoteActions({ note }: NoteActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { queued, sent, justSent, error: shareError, share } = useShareToChat(note);
  const error = shareError || deleteError;

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
      setDeleteError('Failed to delete note.');
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {justSent && <SentBanner />}

      <div className="flex flex-wrap gap-3">
        <Link href={`/notes/${note.id}/edit`} className="btn-secondary">
          ✏️ Edit
        </Link>

        {!justSent && (
          <button
            className="btn-primary"
            onClick={() => void share()}
            disabled={queued || sent}
          >
            {queued ? '⏳ Queued to send' : sent ? '✅ Sent to Chat' : '💬 Send to Google Chat'}
          </button>
        )}

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
