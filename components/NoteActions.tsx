'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Note } from '@/types/note';

interface NoteActionsProps {
  note: Note;
}

export default function NoteActions({ note }: NoteActionsProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sentToChat, setSentToChat] = useState(note.sentToChat);
  const [error, setError] = useState('');

  async function sendToChat() {
    setError('');
    setSending(true);
    const res = await fetch('/api/send-to-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
      },
      body: JSON.stringify({ noteId: note.id }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Failed to send to Google Chat.');
    } else {
      setSentToChat(true);
      router.refresh();
    }
  }

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
          onClick={sendToChat}
          disabled={sending || sentToChat}
        >
          {sending ? 'Sending…' : sentToChat ? '✅ Sent to Chat' : '💬 Send to Google Chat'}
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
