import Link from 'next/link';
import { getNotes } from '@/lib/storage';
import NoteCard from '@/components/NoteCard';


export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const notes = await getNotes();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Field Notes</h1>
            <p className="text-xs text-green-200">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/notes/new" className="btn-secondary bg-white text-green-700 hover:bg-green-50">
            + New Note
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        {notes.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-lg font-semibold text-gray-700">No notes yet</h2>
            <p className="text-sm text-gray-500 mt-1">Start recording your field observations.</p>
            <Link href="/notes/new" className="btn-primary mt-6 inline-flex">
              Create your first note
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
