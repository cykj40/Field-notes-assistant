/**
 * One-shot message handed from the screen that finished an action to the next
 * screen the user lands on (the notes list). It rides in sessionStorage so it
 * survives both router.push() and the full-page navigation used when offline.
 */

export type FlashKind = 'sent' | 'queued';

const KEY = 'field-notes-flash';

export const FLASH_MESSAGES: Record<FlashKind, string> = {
  sent: 'Sent to Google Chat ✓',
  queued: "Queued. Will send when you're back online.",
};

export function setFlash(kind: FlashKind): void {
  try {
    sessionStorage.setItem(KEY, kind);
  } catch (err) {
    // Storage denied (private mode). The note card badge still shows the state.
    console.warn('[flashToast] could not store toast message', err instanceof Error ? err.message : err);
  }
}

/** Returns the pending message once, then forgets it. */
export function takeFlash(): FlashKind | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value === null) return null;
    sessionStorage.removeItem(KEY);
    return value === 'sent' || value === 'queued' ? value : null;
  } catch (err) {
    console.warn('[flashToast] could not read toast message', err instanceof Error ? err.message : err);
    return null;
  }
}
