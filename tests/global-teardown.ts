import { loadEnvConfig } from '@next/env';
import { Redis } from '@upstash/redis';
import { Note } from '@/types/note';

const SENTINEL = '__PLAYWRIGHT_TEST__';

async function globalTeardown() {
  // Load .env.local so Redis credentials are available in this Node process.
  loadEnvConfig(process.cwd());

  const redis = new Redis({
    url: process.env['UPSTASH_REDIS_REST_URL']!,
    token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
  });

  const notes = await redis.get<Note[]>('field:notes');

  if (!notes || notes.length === 0) {
    console.log('[teardown] No notes in Redis — nothing to clean up');
    return;
  }

  const kept = notes.filter(
    (n) =>
      !((n.title ?? '').includes(SENTINEL) || (n.content ?? '').includes(SENTINEL))
  );

  const deletedCount = notes.length - kept.length;

  if (deletedCount === 0) {
    console.log('[teardown] No test notes found to clean up');
    return;
  }

  await redis.set('field:notes', kept);
  console.log(`[teardown] Deleted ${deletedCount} test note(s) from Redis`);
}

export default globalTeardown;
