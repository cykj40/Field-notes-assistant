export const PAGE_CACHE_NAME = 'field-notes-pages-v1';

/** Remove authenticated page responses before the browser changes users. */
export async function clearCachedPages(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(PAGE_CACHE_NAME);
}
