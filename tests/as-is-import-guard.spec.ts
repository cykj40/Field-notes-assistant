import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Static guard: nothing on the Send As Is path may import the AI code.
 *
 * Starts from every file that makes up the path — the note form, the review
 * screen, the send-to-chat route and the outbox — follows their imports
 * (relative and `@/`), and fails if any reached file imports `lib/ai/` or the
 * AI SDK directly. No browser or server needed.
 */

const ROOT = path.resolve(__dirname, '..');

const ENTRY_POINTS = [
  'app/layout.tsx',
  'components/ClientLayout.tsx',
  'app/notes/new/page.tsx',
  'app/notes/[id]/edit/page.tsx',
  'app/notes/[id]/review/page.tsx',
  'app/notes/[id]/page.tsx',
  'app/page.tsx',
  'app/api/notes/route.ts',
  'app/api/notes/[id]/route.ts',
  'app/api/send-to-chat/route.ts',
  'components/NoteForm.tsx',
  'components/AsIsReview.tsx',
  'components/NoteActions.tsx',
  'hooks/useShareToChat.ts',
  'lib/outbox.ts',
  'lib/storage.ts',
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** Matches `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`, `require('x')`. */
const IMPORT_PATTERN =
  /(?:\bimport|\bexport)\s[^'";]*?\sfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (specifier) found.push(specifier);
  }
  return found;
}

function isFile(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

/** Resolves a project-local specifier to a repo-relative file, or null for packages. */
function resolveLocal(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(path.join(ROOT, fromFile)), specifier);
  else return null;

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, 'index' + ext)),
  ];
  const hit = candidates.find(isFile);
  if (!hit) throw new Error(`Cannot resolve "${specifier}" imported from ${fromFile}`);
  return path.relative(ROOT, hit).split(path.sep).join('/');
}

function isForbidden(specifier: string, resolved: string | null): boolean {
  if (resolved !== null) return resolved.startsWith('lib/ai/') || resolved === 'lib/ai.ts';
  return specifier === 'ai' || specifier.startsWith('ai/') || specifier.startsWith('@ai-sdk/');
}

function walkSendAsIsGraph(): { files: Set<string>; violations: string[] } {
  const files = new Set<string>();
  const violations: string[] = [];
  const queue = [...ENTRY_POINTS];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);

    for (const specifier of specifiersIn(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      const resolved = resolveLocal(specifier, file);
      if (isForbidden(specifier, resolved)) {
        violations.push(`${file} imports ${specifier}`);
      } else if (resolved && !files.has(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return { files, violations };
}

test.describe('Send As Is import graph', () => {
  test('no file on the Send As Is path imports lib/ai or the AI SDK', () => {
    const { files, violations } = walkSendAsIsGraph();

    // Not vacuous: the walk really reached the code that matters.
    for (const expected of ['components/AsIsReview.tsx', 'lib/outbox.ts', 'lib/storage.ts', 'types/note.ts']) {
      expect(files, `${expected} should be in the graph`).toContain(expected);
    }
    expect(files.size).toBeGreaterThan(15);

    expect(violations, 'AI imports on the Send As Is path').toEqual([]);
  });

  test('the detector flags the import forms it claims to catch', () => {
    const sample = [
      "import { x } from '@/lib/ai/config';",
      "export * from '../lib/ai/clientNotes';",
      "const m = await import('@/lib/ai/config');",
      "import 'ai';",
      "import { generateText } from 'ai';",
      "import { anthropic } from '@ai-sdk/anthropic';",
    ].join('\n');
    expect(specifiersIn(sample)).toEqual([
      '@/lib/ai/config',
      '../lib/ai/clientNotes',
      '@/lib/ai/config',
      'ai',
      'ai',
      '@ai-sdk/anthropic',
    ]);
    expect(isForbidden('ai', null)).toBe(true);
    expect(isForbidden('@ai-sdk/anthropic', null)).toBe(true);
    expect(isForbidden('react', null)).toBe(false);
    expect(isForbidden('@/lib/outbox', 'lib/outbox.ts')).toBe(false);
  });
});
