import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getNoteById } from '@/lib/storage';
import NoteForm from '@/components/NoteForm';

export const dynamic = 'force-dynamic';

export default async function EditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNoteById(id);
  if (!note) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <Link href={`/notes/${note.id}`} className="text-green-200 hover:text-white transition-colors text-sm">
            ← Back
          </Link>
          <h1 className="text-xl font-bold">Edit Note</h1>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        <NoteForm initialData={note} noteId={note.id} />
      </main>
    </div>
  );
}
