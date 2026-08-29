/**
 * Durable client-side outbox.
 *
 * Note creation/edits and "send to Google Chat" are queued here as small JSON
 * job records in IndexedDB, so a bad connection never blocks the user and a
 * queued action survives fully closing the PWA.
 *
 * This module is deliberately free of DOM APIs — it runs both on the page and
 * inside the service worker (see worker/index.ts), which imports it directly.
 */

// Type-only: erased at compile time, so the service-worker bundle (which has no
// `@/` path alias) never has to resolve it.
import type { CreateNoteInput } from '@/types/note';

const DB_NAME = 'field-notes-outbox';
const DB_VERSION = 2;
const STORE = 'jobs';
/** Holds the API key so public/outbox-sync.js can replay jobs without a bundler. */
const META_STORE = 'meta';

/** Channel name shared by pages and the service worker. */
export const OUTBOX_CHANNEL = 'field-notes-outbox';

/** Background Sync tag registered by the page, handled by worker/index.ts. */
export const OUTBOX_SYNC_TAG = 'field-notes-outbox-sync';

/**
 * How long the user waits before we stop caring whether the network worked and
 * hand control back. The request itself is NOT aborted — it stays alive as the
 * job's first attempt (see `attemptJob`).
 */
export const UI_DEADLINE_MS = Number(
  process.env['NEXT_PUBLIC_OUTBOX_TIMEOUT_MS'] ?? 3000
);

/** Nobody is watching a background retry, so it gets a generous cap. */
const BACKGROUND_TIMEOUT_MS = 25_000;

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** A job that has been claimed but not settled is retried after the lease lapses. */
const LEASE_MS = 60_000;

/** Past either ceiling a job is surfaced as "needs attention" — but keeps retrying. */
const ATTENTION_ATTEMPTS = 20;
const ATTENTION_AGE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Job records
// ---------------------------------------------------------------------------

interface OutboxJobBase {
  jobId: string;
  createdAt: string;
  /** Short human label for the pending-sync list. */
  label: string;
  attempts: number;
  /** Epoch ms; a job is due when `Date.now() >= nextAttemptAt`. */
  nextAttemptAt: number;
  /** Epoch ms of an in-flight attempt (page or service worker). */
  claimedAt?: number;
  lastError?: string;
  /** Server rejected the job in a way no retry can fix — stop retrying. */
  terminal?: boolean;
}

export interface CreateNoteJob extends OutboxJobBase {
  type: 'create-note';
  isEdit: boolean;
  /** Present only for edits. */
  noteId?: string;
  payload: CreateNoteInput & { clientId: string };
}

export interface SendToChatJob extends OutboxJobBase {
  type: 'send-to-chat';
  noteId: string;
}

export type OutboxJob = CreateNoteJob | SendToChatJob;

export type OutboxJobStatus = 'pending' | 'retrying' | 'attention';

export function jobStatus(job: OutboxJob): OutboxJobStatus {
  if (job.terminal) return 'attention';
  if (job.attempts >= ATTENTION_ATTEMPTS) return 'attention';
  if (Date.now() - new Date(job.createdAt).getTime() > ATTENTION_AGE_MS) return 'attention';
  if (job.attempts > 0) return 'retrying';
  return 'pending';
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'jobId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open outbox DB'));
  });
  // Don't cache a rejected promise — a private-mode failure shouldn't be permanent.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
  storeName: string = STORE
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(storeName, mode);
  const result = await fn(transaction.objectStore(storeName));
  return result;
}

/**
 * The service worker replays jobs from this same database but has no bundler,
 * so it cannot read NEXT_PUBLIC_* env vars. Leave it the key it needs.
 */
async function rememberApiKey(): Promise<void> {
  try {
    const key = process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '';
    await tx('readwrite', (store) => promisify(store.put(key, 'apiKey')), META_STORE);
  } catch {
    /* storage unavailable — the SW path simply won't run */
  }
}

export async function getJobs(): Promise<OutboxJob[]> {
  try {
    const jobs = await tx('readonly', (store) => promisify(store.getAll() as IDBRequest<OutboxJob[]>));
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

async function getJob(jobId: string): Promise<OutboxJob | undefined> {
  try {
    return await tx('readonly', (store) => promisify(store.get(jobId) as IDBRequest<OutboxJob | undefined>));
  } catch {
    return undefined;
  }
}

/**
 * Writes a job. Returns false if storage is unavailable (private mode, storage
 * denied) — callers degrade to a plain online-only request rather than
 * pretending something durable happened.
 */
async function putJob(job: OutboxJob): Promise<boolean> {
  try {
    await tx('readwrite', (store) => promisify(store.put(job)));
    return true;
  } catch {
    return false;
  }
}

async function removeJob(jobId: string): Promise<void> {
  try {
    await tx('readwrite', (store) => promisify(store.delete(jobId)));
  } catch {
    /* storage unavailable — nothing was persisted to remove */
  }
}

/** Removes a job from the outbox. Used on success and on explicit discard. */
export async function discardJob(jobId: string): Promise<void> {
  await removeJob(jobId);
  notify({ type: 'changed' });
}

// ---------------------------------------------------------------------------
// Change notification (page <-> page, service worker -> page)
// ---------------------------------------------------------------------------

export type OutboxEvent =
  | { type: 'changed' }
  | {
      type: 'job-done';
      job: OutboxJob;
      noteId?: string;
      deleted?: boolean;
      /**
       * True when the attempt was started by a view that is already handling
       * its own navigation. Global listeners must not refresh on these — a
       * router.refresh() lands on top of the view's router.push() and cancels it.
       */
      foreground?: boolean;
    };

type Listener = (event: OutboxEvent) => void;

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    channel = new BroadcastChannel(OUTBOX_CHANNEL);
    channel.onmessage = (event: MessageEvent<OutboxEvent>) => {
      for (const listener of listeners) listener(event.data);
    };
  }
  return channel;
}

/** Subscribe to outbox changes from this context, other tabs, and the SW. */
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  getChannel();
  return () => {
    listeners.delete(listener);
  };
}

function notify(event: OutboxEvent): void {
  // BroadcastChannel does not deliver to the posting context, so fan out locally too.
  for (const listener of listeners) listener(event);
  getChannel()?.postMessage(event);
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

function newJobBase(label: string, claimed: boolean): Omit<OutboxJobBase, never> {
  const now = Date.now();
  return {
    jobId: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    label,
    attempts: 0,
    // A claimed job is one whose first attempt is already in flight from the
    // page; it isn't due for a retry until that attempt has had its chance.
    nextAttemptAt: claimed ? now + BASE_BACKOFF_MS : now,
    ...(claimed ? { claimedAt: now } : {}),
  };
}

export interface EnqueueResult<T extends OutboxJob> {
  job: T;
  /** False when IndexedDB is unavailable — the job is not durable. */
  persisted: boolean;
}

export async function enqueueCreateNote(args: {
  isEdit: boolean;
  noteId?: string;
  payload: CreateNoteInput & { clientId: string };
  claimed?: boolean;
}): Promise<EnqueueResult<CreateNoteJob>> {
  const label = args.payload.title?.trim()
    ? args.payload.title.trim()
    : args.payload.content?.trim()
      ? args.payload.content.trim().slice(0, 40)
      : 'Untitled note';
  const job: CreateNoteJob = {
    ...newJobBase(args.isEdit ? `Edit: ${label}` : label, args.claimed ?? false),
    type: 'create-note',
    isEdit: args.isEdit,
    ...(args.noteId ? { noteId: args.noteId } : {}),
    payload: args.payload,
  };
  const persisted = await putJob(job);
  await rememberApiKey();
  notify({ type: 'changed' });
  return { job, persisted };
}

export async function enqueueSendToChat(args: {
  noteId: string;
  label: string;
  claimed?: boolean;
}): Promise<EnqueueResult<SendToChatJob>> {
  const job: SendToChatJob = {
    ...newJobBase(`Send to Chat: ${args.label}`, args.claimed ?? false),
    type: 'send-to-chat',
    noteId: args.noteId,
  };
  const persisted = await putJob(job);
  await rememberApiKey();
  notify({ type: 'changed' });
  return { job, persisted };
}

/** Is there already a queued send for this note? (Survives navigating away and back.) */
export async function hasPendingSend(noteId: string): Promise<boolean> {
  const jobs = await getJobs();
  return jobs.some((job) => job.type === 'send-to-chat' && job.noteId === noteId);
}

// ---------------------------------------------------------------------------
// Attempting a job
// ---------------------------------------------------------------------------

export type AttemptOutcome =
  | { kind: 'success'; result: unknown }
  | { kind: 'retry'; error: string }
  | { kind: 'terminal'; error: string };

function apiHeaders(json: boolean): Record<string, string> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
  };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object' && 'error' in data) {
      const error = (data as { error: unknown }).error;
      if (typeof error === 'string') return error;
      // Zod flattened error
      if (error && typeof error === 'object') {
        const form = (error as { formErrors?: unknown }).formErrors;
        if (Array.isArray(form) && typeof form[0] === 'string') return form[0];
      }
      return 'The server rejected this note.';
    }
  } catch {
    /* no JSON body */
  }
  return `Request failed (${res.status}).`;
}

/**
 * Classifies a response.
 *
 * Recoverable (retry): network failure, timeout, 5xx, 408, 429, and 401/403 —
 * an expired session comes back after the user logs in again, and a queued
 * field note must never be silently discarded because of it.
 * Terminal: 400/404/409/410 — no retry will ever change the answer.
 */
async function classify(job: OutboxJob, res: Response): Promise<AttemptOutcome> {
  if (res.ok) {
    const result: unknown = await res.json().catch(() => ({}));
    return { kind: 'success', result };
  }
  // A send whose note is already gone is a send that already happened: the
  // route deletes the note on success, so 404 means a previous attempt landed
  // and we merely lost the response.
  if (job.type === 'send-to-chat' && res.status === 404) {
    return { kind: 'success', result: { deleted: true } };
  }
  if (res.status === 401 || res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500) {
    return { kind: 'retry', error: await errorMessage(res) };
  }
  return { kind: 'terminal', error: await errorMessage(res) };
}

function request(job: OutboxJob, signal: AbortSignal): Promise<Response> {
  if (job.type === 'send-to-chat') {
    return fetch('/api/send-to-chat', {
      method: 'POST',
      headers: apiHeaders(true),
      body: JSON.stringify({ noteId: job.noteId }),
      signal,
    });
  }
  const url = job.isEdit && job.noteId ? `/api/notes/${job.noteId}` : '/api/notes';
  return fetch(url, {
    method: job.isEdit ? 'PUT' : 'POST',
    headers: apiHeaders(true),
    body: JSON.stringify(job.payload),
    signal,
  });
}

function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** Records the outcome of an attempt and tells everyone what happened. */
async function settle(job: OutboxJob, outcome: AttemptOutcome, foreground: boolean): Promise<void> {
  if (outcome.kind === 'success') {
    await removeJob(job.jobId);
    const result = outcome.result;
    const noteId =
      job.type === 'send-to-chat'
        ? job.noteId
        : result && typeof result === 'object' && typeof (result as { id?: unknown }).id === 'string'
          ? (result as { id: string }).id
          : job.noteId;
    notify({
      type: 'job-done',
      job,
      foreground,
      ...(noteId ? { noteId } : {}),
      ...(job.type === 'send-to-chat' ? { deleted: true } : {}),
    });
    notify({ type: 'changed' });
    return;
  }

  const current = (await getJob(job.jobId)) ?? job;
  const attempts = current.attempts + 1;
  const next: OutboxJob = {
    ...current,
    attempts,
    lastError: outcome.error,
    nextAttemptAt: Date.now() + backoffFor(attempts),
    ...(outcome.kind === 'terminal' ? { terminal: true } : {}),
  };
  delete next.claimedAt;
  await putJob(next);
  notify({ type: 'changed' });
}

/**
 * Runs one attempt for a job that the caller has already claimed.
 *
 * The page uses this for the very first attempt so that a slow-but-working
 * request stays alive and settles the job itself — aborting it would only make
 * the server finish the write anyway and leave a retry to duplicate it.
 */
export async function attemptJob(
  job: OutboxJob,
  options: { timeoutMs?: number; foreground?: boolean } = {}
): Promise<AttemptOutcome> {
  const timeoutMs = options.timeoutMs ?? BACKGROUND_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let outcome: AttemptOutcome;
  try {
    const res = await request(job, controller.signal);
    outcome = await classify(job, res);
  } catch (err) {
    outcome = {
      kind: 'retry',
      error: err instanceof Error && err.name === 'AbortError' ? 'No response — will keep trying.' : 'Offline — will keep trying.',
    };
  } finally {
    clearTimeout(timer);
  }
  await settle(job, outcome, options.foreground ?? false);
  return outcome;
}

// ---------------------------------------------------------------------------
// Flushing
// ---------------------------------------------------------------------------

let flushing = false;

/**
 * Attempts every due job, oldest first. Safe to call from anywhere, any time.
 *
 * `ignoreBackoff` is for the moments when the reason for the backoff has
 * demonstrably gone away — the connection came back, or the app was just
 * reopened — where waiting out a timer computed during the outage is pointless.
 */
export async function flushOutbox(options: { ignoreBackoff?: boolean } = {}): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const now = Date.now();
    for (const job of await getJobs()) {
      if (job.terminal) continue;
      if (!options.ignoreBackoff && job.nextAttemptAt > now) continue;
      // Another context (a second tab, or the service worker) may be mid-attempt.
      const fresh = await getJob(job.jobId);
      if (!fresh) continue;
      if (fresh.claimedAt !== undefined && now - fresh.claimedAt < LEASE_MS) continue;
      await putJob({ ...fresh, claimedAt: now });
      await attemptJob(fresh);
    }
  } finally {
    flushing = false;
  }
}

/** Clears the backoff on a job so the next flush picks it up immediately. */
export async function retryJobNow(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const next: OutboxJob = { ...job, nextAttemptAt: Date.now() };
  delete next.terminal;
  delete next.claimedAt;
  await putJob(next);
  notify({ type: 'changed' });
  await flushOutbox();
}
