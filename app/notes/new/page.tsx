import Link from 'next/link';
import NoteForm from '@/components/NoteForm';

export default function NewNotePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-green-600 text-white shadow-md">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-green-200 hover:text-white transition-colors text-sm">
            ← Back
          </Link>
          <h1 className="text-xl font-bold">New Field Note</h1>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        <NoteForm />
      </main>
    </div>
  );
}
