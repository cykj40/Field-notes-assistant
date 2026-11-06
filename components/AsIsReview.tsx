'use client';

import { useRouter } from 'next/navigation';
import { Note } from '@/types/note';
import { goToList, useShareToChat } from '@/hooks/useShareToChat';
import { SentBanner } from '@/components/SentBanner';

interface AsIsReviewProps {
  note: Note;
}

/**
 * Review screen for the Send As Is path. Shows the note exactly as saved — no
 * AI, no transformation — and shares it through the normal send-to-chat route.
 * Nothing in here may import from lib/ai/.
 */
export default function AsIsReview({ note }: AsIsReviewProps) {
  const router = useRouter();
  const { queued, sent, justSent, error, share } = useShareToChat(note);

  return (
    <div className="space-y-5">
      <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-300">
        No AI changes
      </span>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <section className="card p-4" aria-label="Title">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</h2>
        <p className="mt-1 text-gray-900" data-testid="review-title">
          {note.title ?? <span className="italic text-gray-400">Untitled</span>}
        </p>
      </section>

      <section className="card p-4" aria-label="Notes">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h2>
        {note.content ? (
          // Raw text, whitespace preserved, no trimming or replacement.
          <p
            className="mt-1 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed"
            data-testid="review-content"
          >
            {note.content}
          </p>
        ) : (
          <p className="mt-1 text-sm italic text-gray-400">No notes text</p>
        )}
      </section>

      {note.photos && note.photos.length > 0 && (
        <section className="space-y-2" aria-label="Photos">
          <h2 className="text-sm font-semibold text-gray-700">📷 Photos ({note.photos.length})</h2>
          <div className="grid grid-cols-2 gap-2">
            {note.photos.map((photo) => (
              <div key={photo.id} className="relative overflow-hidden rounded-lg">
                <img
                  src={photo.url}
                  alt={photo.caption ?? 'Field photo'}
                  className="h-40 w-full object-cover"
                />
                {photo.caption && (
                  <p className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white">
                    {photo.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {justSent && <SentBanner />}

      {!justSent && (
        <div className="space-y-2">
          <div className="flex gap-3">
            <button
              type="button"
              className="btn-primary min-h-[48px] flex-1 justify-center"
              onClick={() => void share()}
              disabled={queued || sent}
            >
              {sent ? 'Sent ✓' : queued ? '⏳ Queued to send' : 'Share to Google Chat'}
            </button>
            <button
              type="button"
              className="btn-secondary min-h-[48px]"
              onClick={() => goToList(router)}
            >
              Save
            </button>
          </div>
          <p className="text-center text-xs text-gray-500">Queued if offline</p>
        </div>
      )}
    </div>
  );
}
