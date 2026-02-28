import Link from 'next/link';
import { Note } from '@/types/note';

interface NoteCardProps {
  note: Note;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
  return `${date} · ${time}`;
}

export default function NoteCard({ note }: NoteCardProps) {
  const raw = note.content ?? '';
  const preview = raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;

  return (
    <Link href={`/notes/${note.id}`} className="card block p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold text-gray-900 line-clamp-1">
          {note.title ?? <span className="italic text-gray-400">Untitled</span>}
        </h2>
        {note.sentToChat && (
          <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            Sent
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-gray-600 line-clamp-2">{preview}</p>

      {note.location && (
        <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <span>Location:</span>
          <span className="truncate">{note.location}</span>
        </p>
      )}

      {note.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400">
        {note.createdBy ?? 'Unknown'} · {formatDateTime(note.createdAt)}
      </p>
    </Link>
  );
}
