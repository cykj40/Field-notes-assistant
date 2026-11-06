'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UI_DEADLINE_MS,
  attemptJob,
  discardJob,
  enqueueSendToChat,
  hasPendingSend,
  subscribeOutbox,
} from '@/lib/outbox';
import { setFlash } from '@/lib/flashToast';

interface ShareableNote {
  id: string;
  title?: string | undefined;
  sentToChat: boolean;
}

/**
 * Full navigation offline: every route is server-rendered, so a client-side
 * push has nothing to fetch. The service worker answers a real navigation from
 * its cached document.
 */
export function goToList(router: ReturnType<typeof useRouter>): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    window.location.assign('/');
    return;
  }
  router.push('/');
  router.refresh();
}

/**
 * Share-to-Chat behaviour shared by the review screen and the note page.
 *
 *  - Online and sent: green toast, back to the list.
 *  - Queued (offline, slow, or failed but durable): yellow toast, back to the list.
 *  - A send that was already queued finishes while the user is still here:
 *    `justSent` flips so the screen can show a banner and a disabled "Sent ✓".
 *
 * Uses the existing outbox exactly as before; only what happens afterwards moved.
 */
export function useShareToChat(note: ShareableNote) {
  const router = useRouter();
  const [queued, setQueued] = useState(false);
  const [sent, setSent] = useState(note.sentToChat);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState('');
  // Synchronous guard: two taps in the same frame must not enqueue two jobs.
  const startedRef = useRef(false);

  // A send queued before the user navigated away is still queued when they come back.
  useEffect(() => {
    let active = true;
    void hasPendingSend(note.id).then((pending) => {
      if (active && pending) {
        startedRef.current = true;
        setQueued(true);
      }
    });
    return () => {
      active = false;
    };
  }, [note.id]);

  // The queued send may land minutes later, while the user is still on this screen.
  useEffect(() => {
    return subscribeOutbox((event) => {
      if (event.type !== 'job-done' || event.foreground) return;
      if (event.job.type !== 'send-to-chat' || event.noteId !== note.id) return;
      setQueued(false);
      setSent(true);
      setJustSent(true);
      router.refresh();
    });
  }, [note.id, router]);

  const share = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setError('');
    // Control comes back before any network call starts.
    setQueued(true);

    const { job, persisted } = await enqueueSendToChat({
      noteId: note.id,
      label: note.title ?? 'Untitled',
      claimed: true,
    });

    // Never aborted: on a slow link the request usually lands, and the job it
    // belongs to settles itself.
    const attempt = attemptJob(job, { foreground: true });
    let outcome = await Promise.race([
      attempt,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), UI_DEADLINE_MS)),
    ]);
    // Without durable storage there is no queue to hand off to, so keep waiting.
    if (outcome === 'timeout' && !persisted) outcome = await attempt;

    if (outcome !== 'timeout' && outcome.kind === 'success') {
      const result = outcome.result as { deleted?: boolean } | null;
      // `deleted` means the note no longer exists (the outbox maps a 404 on
      // send to this) — there is nothing to confirm, just go back.
      if (!result?.deleted) setFlash('sent');
      goToList(router);
      return;
    }

    if (outcome !== 'timeout' && (outcome.kind === 'terminal' || !persisted)) {
      console.error('[share] send to Google Chat failed', outcome.error);
      await discardJob(job.jobId);
      setQueued(false);
      setError(outcome.error);
      startedRef.current = false;
      return;
    }

    // Timed out, or failed in a way that retries: it stays queued and sends itself.
    setFlash('queued');
    goToList(router);
  }, [note.id, note.title, router]);

  return { queued, sent, justSent, error, share };
}
