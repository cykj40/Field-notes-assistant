import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getNoteById } from '@/lib/storage';
import AsIsReview from '@/components/AsIsReview';

export const dynamic = 'force-dynamic';

export default async function ReviewNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNoteById(id);
  if (!note) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <Link
            href={`/notes/${note.id}/edit`}
            className="text-green-200 hover:text-white transition-colors text-sm"
          >
            ← Edit
          </Link>
          <h1 className="text-xl font-bold">Review</h1>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        <AsIsReview note={note} />
      </main>
    </div>
  );
}
