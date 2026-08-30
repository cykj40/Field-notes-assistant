'use client';

import { useState } from 'react';
import { clearCachedPages } from '@/lib/pageCache';

export function LogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout(): Promise<void> {
    if (!window.confirm('Sign out?')) return;

    setLoggingOut(true);
    setError('');

    try {
      // Clear authenticated HTML first. If this fails, keep the session active
      // rather than leaving private cached data behind after logout.
      await clearCachedPages();

      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');

      window.location.assign('/login');
    } catch {
      setLoggingOut(false);
      setError('Could not sign out. Please try again.');
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        className="rounded-lg px-2 py-2 text-xs font-semibold text-green-100 hover:bg-green-700 hover:text-white disabled:opacity-60"
        onClick={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? 'Signing out…' : 'Sign Out'}
      </button>
      {error && <span className="mt-1 text-xs text-red-100" role="alert">{error}</span>}
    </div>
  );
}
