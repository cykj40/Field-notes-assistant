/**
 * Marker string that every Playwright-created note carries in its title or
 * content. Single source of truth for the places that need to recognise a test
 * note: the cleanup paths (tests/global-teardown.ts,
 * scripts/cleanup-test-notes.ts) and the production-only read filter in
 * lib/storage.ts.
 *
 * Tests write this literal into note content directly — see CLAUDE.md.
 */
export const TEST_SENTINEL = '__PLAYWRIGHT_TEST__';
