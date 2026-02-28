'use client';

import { useServiceWorker } from '@/hooks/useServiceWorker';

export function UpdateBanner() {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-green-600 px-4 py-3 shadow-lg">
      <div className="flex items-center justify-between gap-4 mx-auto max-w-7xl">
        <p className="text-sm font-semibold text-white">
          A new version is available
        </p>
        <button
          onClick={applyUpdate}
          className="btn-secondary text-white hover:bg-green-700 active:bg-green-800 ring-green-500"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}
