'use client';

import { useEffect, useState } from 'react';

interface UseServiceWorkerReturn {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleUpdateFound = (registration: ServiceWorkerRegistration): void => {
      const installingWorker = registration.installing;
      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker is installed but waiting to activate
          setWaitingWorker(installingWorker);
          setUpdateAvailable(true);
        }
      });
    };

    const registerServiceWorker = async (): Promise<void> => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Check if there's already an update waiting
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        // Listen for new updates
        registration.addEventListener('updatefound', () => {
          handleUpdateFound(registration);
        });

        // Check for updates periodically (every hour)
        const intervalId = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        return () => {
          clearInterval(intervalId);
        };
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    // Handle controller change (new SW has taken over)
    const handleControllerChange = (): void => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    registerServiceWorker();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = (): void => {
    if (!waitingWorker) {
      return;
    }

    // Tell the waiting service worker to skip waiting and become active
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  return {
    updateAvailable,
    applyUpdate,
  };
}
