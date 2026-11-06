'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasPendingSend, subscribeOutbox } from '@/lib/outbox';

/**
 * "Queued" pill for a note whose send is waiting in the outbox. The list is
 * server-rendered, so when the send finally lands this also refreshes it so
 * the card flips to its Sent badge.
 */
export default function QueuedBadge({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    let active = true;
    const check = () => {
      void hasPendingSend(noteId).then((pending) => {
        if (active) setQueued(pending);
      });
    };
    check();
    const unsubscribe = subscribeOutbox((event) => {
      if (event.type === 'changed') {
        check();
        return;
      }
      if (event.job.type === 'send-to-chat' && event.noteId === noteId) {
        setQueued(false);
        router.refresh();
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [noteId, router]);

  if (!queued) return null;

  return (
    <span
      data-testid="queued-badge"
      className="shrink-0 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium"
    >
      Queued
    </span>
  );
}
