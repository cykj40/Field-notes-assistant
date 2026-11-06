import Link from 'next/link';

/**
 * Shown in place when a queued send finishes while the user is still on the
 * screen: a green banner, a disabled "Sent ✓" button where Share was, and a way
 * back to the list.
 */
export function SentBanner() {
  return (
    <div className="space-y-3" data-testid="sent-banner">
      <div
        role="status"
        className="rounded-lg bg-green-100 px-4 py-3 text-sm font-semibold text-green-800 ring-1 ring-green-300"
      >
        Sent to Google Chat
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary min-h-[48px]" disabled>
          Sent ✓
        </button>
        <Link href="/" className="btn-secondary min-h-[48px]">
          Back to notes
        </Link>
      </div>
    </div>
  );
}
