/* eslint-disable */
/**
 * Background Sync replay for the offline outbox.
 *
 * This file is imported into the generated service worker via next-pwa's
 * `importScripts` option (see next.config.js). It is hand-written plain JS on
 * purpose: next-pwa's `customWorkerDir` compile cannot run in this repo — the
 * "ajv": ">=6.14.0" override in package.json resolves ajv to 8.x while
 * babel-loader's ajv-keywords@3 requires ajv 6, which crashes the custom-worker
 * webpack pass and fails `next build` outright.
 *
 * It is deliberately dumb: it replays jobs and deletes the ones that succeed.
 * The full state machine (backoff, attempt counting, terminal classification,
 * "needs attention") lives in lib/outbox.ts and runs whenever a page is open.
 *
 * COUPLED TO lib/outbox.ts — database name, store names, sync tag, and the job
 * record shape must stay in step with it.
 */
(function () {
  var DB_NAME = 'field-notes-outbox';
  var JOBS = 'jobs';
  var META = 'meta';
  var SYNC_TAG = 'field-notes-outbox-sync';

  function open() {
    return new Promise(function (resolve, reject) {
      // No version: never trigger an upgrade from here, which would block on
      // any page that has the database open.
      var request = indexedDB.open(DB_NAME);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function readAll(db, storeName) {
    return new Promise(function (resolve, reject) {
      var request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function readKey(db, storeName, key) {
    return new Promise(function (resolve) {
      var request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { resolve(undefined); };
    });
  }

  function remove(db, jobId) {
    return new Promise(function (resolve) {
      var request = db.transaction(JOBS, 'readwrite').objectStore(JOBS).delete(jobId);
      request.onsuccess = function () { resolve(); };
      request.onerror = function () { resolve(); };
    });
  }

  function send(job, apiKey) {
    var headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey || '' };
    if (job.type === 'send-to-chat') {
      return fetch('/api/send-to-chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ noteId: job.noteId }),
      });
    }
    var isEdit = job.isEdit && job.noteId;
    return fetch(isEdit ? '/api/notes/' + job.noteId : '/api/notes', {
      method: isEdit ? 'PUT' : 'POST',
      headers: headers,
      body: JSON.stringify(job.payload),
    });
  }

  async function replay() {
    // An open page flushes better than we can — it can navigate and refresh on
    // success — and running both would double-submit.
    var windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 0) return;

    var db;
    try {
      db = await open();
    } catch (e) {
      return;
    }
    if (!db.objectStoreNames.contains(JOBS)) return;

    var apiKey = db.objectStoreNames.contains(META) ? await readKey(db, META, 'apiKey') : '';
    var jobs = await readAll(db, JOBS);
    jobs.sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });

    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      if (job.terminal) continue;
      try {
        var response = await send(job, apiKey);
        // 404 on a send means the note was already sent and deleted server-side:
        // an earlier attempt landed and only its response was lost.
        if (response.ok || (job.type === 'send-to-chat' && response.status === 404)) {
          await remove(db, job.jobId);
        }
        // Anything else is left exactly as it is for the page to classify.
      } catch (e) {
        // Still no connection — stop, and let the next sync event try again.
        break;
      }
    }
  }

  self.addEventListener('sync', function (event) {
    if (event.tag !== SYNC_TAG) return;
    event.waitUntil(replay());
  });
})();
