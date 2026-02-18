import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getNoteById } from '@/lib/storage';
import NoteActions from '@/components/NoteActions';

export const dynamic = 'force-dynamic';

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = getNoteById(id);
  if (!note) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-green-200 hover:text-white transition-colors text-sm shrink-0">
              ← Back
            </Link>
            <h1 className="text-lg font-bold truncate">{note.title}</h1>
          </div>
          {note.sentToChat && (
            <span className="shrink-0 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">
              Sent to Chat
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6 space-y-6">
        {/* Meta */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>Created: {formatDateTime(note.createdAt)}</p>
          {note.updatedAt !== note.createdAt && (
            <p>Updated: {formatDateTime(note.updatedAt)}</p>
          )}
        </div>

        {/* Location */}
        {note.location && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>📍</span>
            <span>{note.location}</span>
          </div>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="card p-5">
          <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{note.content}</p>
        </div>

        {/* Actions */}
        <NoteActions note={note} />
      </main>
    </div>
  );
}
