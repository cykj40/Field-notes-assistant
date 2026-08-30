import { loadEnvConfig } from '@next/env';
import { Redis } from '@upstash/redis';
import { Note } from '@/types/note';
import { TEST_SENTINEL } from '@/lib/testSentinel';

loadEnvConfig(process.cwd());

async function cleanupTestNotes() {
  const redis = new Redis({
    url: process.env['UPSTASH_REDIS_REST_URL']!,
    token: process.env['UPSTASH_REDIS_REST_TOKEN']!,
  });

  const notes = await redis.get<Note[]>('field:notes');

  if (!notes || notes.length === 0) {
    console.log('No notes in Redis — nothing to clean up.');
    return;
  }

  const kept = notes.filter(
    (n) =>
      !(
        (n.title ?? '').includes(TEST_SENTINEL) ||
        (n.content ?? '').includes(TEST_SENTINEL)
      )
  );

  const deletedCount = notes.length - kept.length;

  if (deletedCount === 0) {
    console.log(`No test notes found. ${notes.length} note(s) unchanged.`);
    return;
  }

  await redis.set('field:notes', kept);
  console.log(`✅ Deleted ${deletedCount} test note(s). ${kept.length} note(s) remain.`);
}

cleanupTestNotes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
