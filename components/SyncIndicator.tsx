'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OutboxJob, jobStatus, subscribeOutbox } from '@/lib/outbox';
import { useOutbox } from '@/hooks/useOutbox';

function statusLabel(job: OutboxJob): { text: string; className: string } {
  switch (jobStatus(job)) {
    case 'attention':
      return { text: 'Needs attention', className: 'text-red-700 bg-red-50 ring-red-200' };
    case 'retrying':
      return { text: `Retrying (${job.attempts})`, className: 'text-amber-700 bg-amber-50 ring-amber-200' };
    default:
      return { text: 'Pending', className: 'text-gray-600 bg-gray-50 ring-gray-200' };
  }
}

export function SyncIndicator() {
  const { jobs, retry, discard } = useOutbox();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // A job landing changes what the server would render — pull the real state in
  // wherever the user happens to be standing.
  useEffect(() => {
    return subscribeOutbox((event) => {
      if (event.type === 'job-done' && !event.foreground) router.refresh();
    });
  }, [router]);

  if (jobs.length === 0) return null;

  const needsAttention = jobs.some((job) => jobStatus(job) === 'attention');

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]">
      {open && (
        <div className="card mb-2 w-80 max-w-full overflow-hidden" data-testid="sync-panel">
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <p className="text-sm font-semibold text-gray-700">Waiting to sync</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close sync list"
            >
              ×
            </button>
          </div>
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {jobs.map((job) => {
              const status = statusLabel(job);
              return (
                <li key={job.jobId} className="px-3 py-2 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-800 line-clamp-2">{job.label}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${status.className}`}>
                      {status.text}
                    </span>
                  </div>
                  {job.lastError && (
                    <p className="text-xs text-gray-500 line-clamp-2">{job.lastError}</p>
                  )}
                  <div className="flex gap-3 pt-0.5">
                    <button
                      type="button"
                      onClick={() => void retry(job.jobId)}
                      className="text-xs font-semibold text-green-700 hover:text-green-800"
                    >
                      Try now
                    </button>
                    <button
                      type="button"
                      onClick={() => void discard(job.jobId)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Discard
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-testid="sync-indicator"
        aria-label={`${jobs.length} waiting to sync`}
        className={[
          'flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold shadow-lg ring-1 transition-colors',
          needsAttention
            ? 'bg-red-600 text-white ring-red-700 hover:bg-red-700'
            : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50',
        ].join(' ')}
      >
        <span aria-hidden="true">{needsAttention ? '⚠️' : '⏳'}</span>
        <span>{jobs.length} syncing</span>
      </button>
    </div>
  );
}
