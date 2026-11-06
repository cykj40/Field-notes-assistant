'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FLASH_MESSAGES, FlashKind, takeFlash } from '@/lib/flashToast';

const VISIBLE_MS = 4000;

/**
 * Shows the one-shot message left by setFlash() when the user lands on the
 * notes list. Mounted once in ClientLayout, which persists across navigations,
 * so it re-checks whenever the path changes.
 */
export function FlashToast() {
  const pathname = usePathname();
  const [kind, setKind] = useState<FlashKind | null>(null);

  useEffect(() => {
    if (pathname !== '/') return;
    const pending = takeFlash();
    if (pending) setKind(pending);
  }, [pathname]);

  useEffect(() => {
    if (!kind) return undefined;
    const id = setTimeout(() => setKind(null), VISIBLE_MS);
    return () => clearTimeout(id);
  }, [kind]);

  if (!kind) return null;

  const tone =
    kind === 'sent'
      ? 'bg-green-600 text-white'
      : 'bg-amber-400 text-amber-950';

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="flash-toast"
        data-kind={kind}
        className={`rounded-lg px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}
      >
        {FLASH_MESSAGES[kind]}
      </div>
    </div>
  );
}
