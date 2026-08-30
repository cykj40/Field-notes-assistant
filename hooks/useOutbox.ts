'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OUTBOX_SYNC_TAG,
  OutboxJob,
  discardJob,
  flushOutbox,
  getJobs,
  retryJobNow,
  subscribeOutbox,
} from '@/lib/outbox';

/** How often an open page retries while anything is queued. */
const POLL_MS = 30_000;

interface SyncCapableRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> };
}

/** Best-effort Background Sync registration — absent on iOS Safari, hence POLL_MS. */
async function registerBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
    await registration.sync?.register(OUTBOX_SYNC_TAG);
  } catch {
    /* unsupported or denied — the foreground triggers cover it */
  }
}

interface UseOutboxReturn {
  jobs: OutboxJob[];
  retry: (jobId: string) => Promise<void>;
  discard: (jobId: string) => Promise<void>;
}

/**
 * Owns the outbox retry loop. Mounted once (SyncIndicator) — other components
 * should use `subscribeOutbox` directly rather than starting a second loop.
 */
export function useOutbox(): UseOutboxReturn {
  const [jobs, setJobs] = useState<OutboxJob[]>([]);
  const hasJobs = jobs.length > 0;
  const hasJobsRef = useRef(false);
  hasJobsRef.current = hasJobs;

  const refresh = useCallback(async () => {
    setJobs(await getJobs());
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeOutbox((event) => {
      if (event.type === 'changed') void refresh();
    });
  }, [refresh]);

  // Trigger 1: whenever this page loads with something already queued. A cold
  // start ignores backoff — the timer was computed in a previous session, under
  // conditions that no longer apply.
  useEffect(() => {
    void flushOutbox({ ignoreBackoff: true });
  }, []);

  // Trigger 2 & 3: the connection came back, or the crew reopened the app after
  // walking back into signal.
  useEffect(() => {
    const onWake = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void flushOutbox();
    };
    // The connection coming back is the one signal that makes every backoff
    // stale — retry now rather than sitting out a timer set while offline.
    const onOnline = () => void flushOutbox({ ignoreBackoff: true });
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);

  // Trigger 4: the one that actually carries iOS. Only runs while queued.
  useEffect(() => {
    if (!hasJobs) return undefined;
    void registerBackgroundSync();
    const id = setInterval(() => {
      void flushOutbox();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [hasJobs]);

  const retry = useCallback(async (jobId: string) => {
    await retryJobNow(jobId);
  }, []);

  const discard = useCallback(async (jobId: string) => {
    await discardJob(jobId);
  }, []);

  return { jobs, retry, discard };
}
