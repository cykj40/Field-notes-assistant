# AI Client Notes — Implementation Plan (`ai-features` branch)

**Repo:** `cykj40/Field-notes-assistant` · **Branch:** `ai-features` · **Model:** Anthropic **Claude Sonnet 5.5** (`claude-sonnet-5-5`) via Vercel AI SDK `@ai-sdk/anthropic`

**Shape of the work:** every task below is one small, copy-paste prompt for a coding agent. One prompt = one commit. Run them **in order, one agent at a time** on this branch. Tick the box when its "Done when" list is fully green.

---

## Progress tracker

| Phase | Prompts | Status |
|---|---|---|
| 0. Recon + setup | P0.1 – P0.2 | ⬜ |
| 1. Data model | P1.1 – P1.2 | ⬜ |
| 2. Send As Is (no AI) | P2.1 – P2.3 | ⬜ |
| 3. Deterministic rules | P3.1 – P3.3 | ⬜ |
| 4. AI core (server) | P4.1 – P4.5 | ⬜ |
| 5. AI UI | P5.1 – P5.5 | ⬜ |
| 6. Evals | P6.1 – P6.2 | ⬜ |
| 7. Ship MVP | P7.1 – P7.2 | ⬜ |
| v1. Vision + hierarchy | V1.1 – V1.4 | ⬜ |
| v2. Materials pricing | V2.1 – V2.4 | ⬜ |

### Checklist

**Phase 0 — Recon + setup**
- [ ] P0.1 Recon: verify paths, baseline green
- [ ] P0.2 Install AI SDK, env vars, feature flag

**Phase 1 — Data model**
- [ ] P1.1 Extend `Note` type + storage
- [ ] P1.2 Retain-after-send (stop deleting on send)

**Phase 2 — Send As Is**
- [ ] P2.1 Source role chips on `NoteForm`
- [ ] P2.2 Send As Is button + `AsIsReview` screen
- [ ] P2.3 E2E: as-is path byte-for-byte + offline

**Phase 3 — Deterministic rules (test-first)**
- [ ] P3.1 Unit test runner + rule constants
- [ ] P3.2 `renderClientNotes` (structure → text)
- [ ] P3.3 `postProcessClientNotes` (fixes + warnings)

**Phase 4 — AI core**
- [ ] P4.1 Versioned system prompt
- [ ] P4.2 Zod output schemas
- [ ] P4.3 `runPrepare()` model call (mockable)
- [ ] P4.4 `POST /api/notes/[id]/prepare` route
- [ ] P4.5 API tests with mocked model

**Phase 5 — AI UI**
- [ ] P5.1 Format with AI entry points + gating
- [ ] P5.2 Quick Questions screen
- [ ] P5.3 Confirm + Generate
- [ ] P5.4 Client Notes screen + Chat share of formatted text
- [ ] P5.5 E2E: AI path (mocked model)

**Phase 6 — Evals**
- [ ] P6.1 Goldens + rule-check harness
- [ ] P6.2 LLM-judge "no invented content" check

**Phase 7 — Ship MVP**
- [ ] P7.1 Vercel env (Preview first) + preview verification
- [ ] P7.2 Demo checklist + merge to `main` (flag off)

**v1 — Vision + hierarchy**
- [ ] V1.1 Photo privacy decision (signed URLs if required)
- [ ] V1.2 Vision: photos as image parts
- [ ] V1.3 Attach Photo evidence on clarify answers
- [ ] V1.4 Evals in CI (≥15 goldens)

**v2 — Materials pricing**
- [ ] V2.1 Curated price sheet storage + CSV import
- [ ] V2.2 Markup math (26%) in integer cents + tests
- [ ] V2.3 Materials gate in UI + prompt
- [ ] V2.4 Optional PDF export

---

## Decisions

Locked decisions plus my recommended defaults for the open questions. **Confirm or change the unchecked ones before the phase that needs them.**

- [x] **D1 Model:** Anthropic Claude Sonnet 5.5, model id in env (`CLIENT_NOTES_MODEL=claude-sonnet-5-5`) so it can change without a deploy-time code edit.
- [ ] **D2 Retain after send:** stop deleting notes on send, both paths. *(Needed by P1.2.)*
- [ ] **D3 Role tags:** per-note `sourceRole` only. Do **not** touch Neon login roles (`admin|supervisor` = app privilege, not source authority).
- [ ] **D4 Title:** internal-only. Never sent to the model, never in client output or the formatted Chat message.
- [ ] **D5 Clarify UX:** one question at a time ("1 of N"), matching mockup. Model returns all gaps in one batch; UI pages through them.
- [ ] **D6 Pricing:** curated price sheet only (v2). No live supplier scraping.
- [ ] **D7 Who can Generate:** all logged-in users, behind `ENABLE_CLIENT_NOTES`. Restrict to admin by setting a second flag only if needed.
- [ ] **D8 Language:** client output always English, even from Spanish dictation.
- [ ] **D9 Rollup:** one client note per raw note for MVP. Multi-note merge is out of scope.
- [ ] **D10 Photos to model:** MVP is **text-only**. Vision ships in v1 after the photo privacy call (V1.1). Attach Photo on the clarify screen is hidden until V1.3.

### Architecture calls baked into this plan (and why)

1. **Model returns structure, code renders text.** The model outputs JSON sections (`areaPreparation[]`, `tasks[]`, `finalCleanup[]`, `coordination[]`). `renderClientNotes()` builds the text. Section order, headers, bullet format, broom-clean default and the closing line become **impossible to get wrong** instead of "usually right." Post-processing then only polishes bullet strings.
2. **Clarify wording is a code template, not model output.** The model returns `missingStep` (e.g. `"debris removal"`). The server renders `The notes do not mention ${missingStep}. Should this be included before I generate the final output?` Exact wording is guaranteed.
3. **Raw `content` is immutable on the AI path.** AI writes only to `clientNotes` / `clientNotesMeta`. A test asserts `content` is unchanged after every prepare call.
4. **Send As Is has zero AI imports.** No file on that path imports `lib/ai/*`. Enforced by a test (P2.3) so it can't silently regress.
5. **Model is injectable.** `runPrepare()` takes the model as a parameter, so tests and E2E use the AI SDK mock model and never hit Anthropic.

---

## Ground rules (paste at the top of every agent session)

```text
You are working in cykj40/Field-notes-assistant on branch `ai-features`.
Read CLAUDE.md first. Follow these rules for every task:

- Do ONLY the task in this prompt. Minimal footprint: do not touch auth logic,
  unrelated API routes, the service worker, or unrelated config.
- The Send As Is path (NoteForm → Redis/outbox → send-to-chat with raw body)
  must never import anything from lib/ai/ and must never modify note.content.
- The AI path never overwrites note.content. AI output goes in clientNotes /
  clientNotesMeta only.
- Tests must never post to the supervisors' real Google Chat. Use
  GOOGLE_CHAT_WEBHOOK_URL_TEST (Preview/Development) — never the production webhook.
- Tests must never call the real Anthropic API. Use the AI SDK mock model.
- Never store base64 images in Redis. Photos stay in Vercel Blob; Redis holds URLs.
- Google Chat cards use cardsV2 (never legacy `cards`).
- No secrets in NEXT_PUBLIC_* vars. ANTHROPIC_API_KEY is server-only.
- Silent failures are the #1 risk on this project: every catch must log with
  context and surface a user-visible error. No empty catches, no swallowed promises.
- Before finishing: run typecheck, lint, unit tests, and the relevant Playwright
  suite. Report exact commands and results. Show the diff summary.
- One commit for this task with a conventional message. Do not push to main.
```

---

## Phase 0 — Recon + setup

### P0.1 — Recon: verify paths, baseline green
**Agent:** Codex / Cursor (read-only, mechanical)

```text
Read-only recon. Make NO code changes.
1. Confirm these files exist and summarize each in 1–2 lines:
   types/note.ts, lib/storage.ts, lib/auth.ts, lib/db.ts, lib/outbox.ts,
   lib/noteTakers.ts, hooks/useOutbox.ts, components/NoteForm.tsx,
   components/NoteActions.tsx, app/api/send-to-chat/route.ts,
   app/api/photos/upload/route.ts, app/api/transcribe/route.ts,
   .github/workflows/ci.yml, playwright config, .env.example.
2. Report: exact `next`, `react`, `zod` (if present), and `ai` versions from
   package.json; whether any unit test runner exists (vitest/jest/node:test).
3. Report how API routes authenticate today (session vs x-api-key) and how
   send-to-chat deletes the note after sending (file + line).
4. Report how NoteForm submits (direct POST vs outbox) and where `tags: []` is set.
5. Run typecheck, lint, and the full Playwright suite. Report pass/fail counts.
Output a short report listing any path in this plan that does NOT match the repo.
```

**Done when**
- [ ] Every path confirmed or the mismatch listed
- [ ] Next.js version confirmed (notes say 15, review says `^16.4.3` — settle it)
- [ ] Baseline test suite green (or existing failures documented before we start)

### P0.2 — Install AI SDK, env vars, feature flag
**Agent:** Codex / Cursor

```text
Task: add AI dependencies and config. No UI, no routes.
1. Install `ai` and `@ai-sdk/anthropic` (and `zod` if missing). Before writing
   code, check the installed AI SDK version's docs (Context7) for the current
   structured-output API — generateObject vs generateText with Output.object —
   and note which one this version recommends in the commit message.
2. Add to .env.example (with comments, no real values):
   ANTHROPIC_API_KEY=
   CLIENT_NOTES_MODEL=claude-sonnet-5-5
   ENABLE_CLIENT_NOTES=0
3. Create lib/ai/config.ts:
   - `import 'server-only'` at the top
   - `isClientNotesEnabled(): boolean` (true only when ENABLE_CLIENT_NOTES === '1')
   - `getClientNotesModelId(): string` (defaults to 'claude-sonnet-5-5')
   - `getAnthropicModel()` returns anthropic(getClientNotesModelId()); throws a
     clear error if ANTHROPIC_API_KEY is missing
4. Expose a client-safe flag ONLY via a server component prop or a tiny
   GET /api/features route returning { clientNotes: boolean } — not a NEXT_PUBLIC var.
```

**Done when**
- [ ] `npm run build` passes with `ENABLE_CLIENT_NOTES=0` and no API key set
- [ ] `lib/ai/config.ts` cannot be imported from a client component (build error if tried)
- [ ] Commit notes which structured-output API is used

---

## Phase 1 — Data model

### P1.1 — Extend `Note` type + storage
**Agent:** Claude Code (Sonnet)

```text
Task: extend the note model. No UI changes.
1. In types/note.ts add:
   export type SourceRole = 'supervisor' | 'manager' | 'project_manager' | 'worker';
   export interface ClarifyAnswer { id: string; missingStep: string; question: string; include: boolean; note?: string }
   export interface ClientNotesMeta {
     promptVersion: string; modelId: string; generatedAt: string;
     clarifyAnswers: ClarifyAnswer[]; waived: boolean;
     materialsRequested: boolean; warnings: string[]; editedByUser: boolean;
   }
   On Note add optional: sourceRole?: SourceRole; clientNotes?: string; clientNotesMeta?: ClientNotesMeta;
2. In lib/storage.ts add `updateClientNotes(id, clientNotes, meta)` that writes ONLY
   those two fields and asserts note.content is byte-identical before and after
   (throw if not). Add `setSourceRole(id, role)` if updates are field-scoped there.
3. Existing notes without the new fields must still load and render.
Do not change Neon user roles. Do not rename `noteTaker`.
```

**Done when**
- [ ] Typecheck passes; existing notes load unchanged
- [ ] `updateClientNotes` cannot change `content` (guarded + tested once P3.1 adds the runner)

### P1.2 — Retain after send
**Requires:** D2 confirmed · **Agent:** Claude Code (Sonnet)

```text
Task: app/api/send-to-chat/route.ts currently deletes the note after a
successful send. Change it to keep the note and set `sentAt` (ISO string) and
`sentBody: 'raw' | 'client'` on it instead. Add those optional fields to Note.
Do not change the message format, the cardsV2 payload, or the outbox retry logic.
Update any UI or test that assumed the note disappears after sending (e.g. list
filtering) — show a small "Sent" badge instead of hiding it.
Verify the outbox still sends exactly once on reconnect (no duplicate posts now
that the note persists).
```

**Done when**
- [ ] Note persists after send with `sentAt`
- [ ] Outbox E2E still green; no duplicate Chat posts on reconnect
- [ ] Redis key size checked on a seeded dataset (retaining notes grows `field:notes` — note the size in the PR)

---

## Phase 2 — Send As Is (no AI, default path)

### P2.1 — Source role chips on `NoteForm`
**Agent:** Cursor / Codex

```text
Task: add a "Source" chip group to components/NoteForm.tsx above Title,
matching the mockup: Supervisor | Manager | PM | Worker (values: supervisor,
manager, project_manager, worker). Single-select, optional for saving.
Default: none selected. Persist to note.sourceRole on create/edit.
Keep `tags: []` behavior unchanged. Large tap targets (min 44px). No other
layout changes.
```

**Done when**
- [ ] Role saves and reloads on edit
- [ ] Offline create still queues via outbox with `sourceRole` included

### P2.2 — Send As Is button + `AsIsReview` screen
**Agent:** Claude Code (Sonnet)

```text
Task: implement the Send As Is flow from the mockup.
1. NoteForm bottom actions become: [Send As Is] (primary green, first),
   [Format with AI] (outlined — render it but leave it disabled with no handler;
   P5.1 wires it), [Cancel].
2. Send As Is saves the note (existing save/outbox path), then navigates to a
   new review screen (components/AsIsReview.tsx, route of your choice under
   /notes/[id]) showing: "No AI changes" pill, Title card, Notes card (raw
   content rendered with whitespace preserved, NO transformation), photo grid,
   [Share to Google Chat] (primary), [Save] (secondary), caption "Queued if offline".
3. Share to Google Chat uses the EXISTING send-to-chat route + outbox exactly
   as today. Save just returns to the list.
4. This file and its imports must not import from lib/ai/.
```

**Done when**
- [ ] Review screen shows raw text exactly as typed (incl. line breaks)
- [ ] Share works online and queues offline
- [ ] Works with `ENABLE_CLIENT_NOTES=0` and no API key

### P2.3 — E2E: as-is path
**Agent:** Codex / Cursor

```text
Task: Playwright tests for Send As Is. Use the TEST webhook only.
1. Online: create note with multi-line text + "Pinkus" + a date + 1 photo →
   Send As Is → Share. Intercept the outgoing Chat payload and assert the text
   body contains the raw content byte-for-byte (Pinkus and the date NOT altered)
   plus the photo URL.
2. Offline: go offline, Send As Is → Share, assert queued; go online, assert
   exactly one Chat post.
3. Run with ENABLE_CLIENT_NOTES=0 and ANTHROPIC_API_KEY unset — must pass.
4. Add a static test (e.g. a small script or unit test) that fails if any file
   in the Send As Is import graph imports from lib/ai/.
```

**Done when**
- [ ] All three scenarios green in CI
- [ ] Import-guard test fails when you deliberately add a `lib/ai` import (try it, then revert)

---

## Phase 3 — Deterministic rules (build before the AI)

### P3.1 — Unit test runner + rule constants
**Agent:** Codex / Cursor

```text
Task: if P0.1 found no unit runner, add Vitest as a devDependency with
path-alias support matching tsconfig, plus `npm run test:unit`, and add it to
ci.yml before Playwright. Then create lib/clientNotes/constants.ts exporting:
  CLOSING_LINE = 'If you require any further clarification or additional details on specific steps taken, L & D Construction Group is happy to provide more information.'
  BROOM_CLEAN = 'Area was left broom clean.'
  COMPANY_NAME = 'L & D Construction Group'
  SECTION_ORDER = ['Area Preparation','Tasks','Final Cleanup','Coordination'] as const
  CLARIFY_TEMPLATE = (step: string) => `The notes do not mention ${step}. Should this be included before I generate the final output?`
  TERM_REPLACEMENTS = [{ from: /\bpinkus\b/gi, to: 'Prime Woodworking' }, { from: /\bcardboard\b/gi, to: 'Ram Board' }]
Add a test for updateClientNotes' content guard from P1.1.
```

**Done when**
- [ ] `npm run test:unit` runs in CI
- [ ] Closing line matches the Client Notes mockup exactly

> ⚠️ Confirm the `cardboard → Ram Board` replacement is correct in *all* contexts, not just floor protection. If not, move it to a prompt-only rule in P4.1 and drop it here.

### P3.2 — `renderClientNotes` (structure → text)
**Agent:** Claude Code (Sonnet)

```text
Task: lib/clientNotes/render.ts
export interface ClientNotesSections {
  areaPreparation: string[]; tasks: string[]; finalCleanup: string[];
  coordination: string[]; materials?: string[];
}
export function renderClientNotes(s: ClientNotesSections, opts: { materialsAllowed: boolean }): string
Rules:
- Output order: Area Preparation, Tasks, Final Cleanup, Coordination, (Materials Used only if materialsAllowed && non-empty).
- Each section: label line (plain text, no #, no **), then `- ` bullets, blank line between sections.
- Omit Area Preparation / Tasks if empty. Omit Coordination if empty. Never omit Final Cleanup:
  if empty, use `- ${BROOM_CLEAN}`.
- No outer title. Always end with a blank line then CLOSING_LINE.
- Trim bullets; strip any leading -, *, •, numbers the model left in.
Unit tests: empty cleanup → broom clean; empty coordination omitted; materials
stripped when not allowed; closing line exactly once; output contains no '#', '**', or '```'.
```

**Done when**
- [ ] Output for the mockup input matches the Client Notes mockup text exactly (snapshot test)

### P3.3 — `postProcessClientNotes` (fixes + warnings)
**Agent:** Claude Code (Sonnet)

```text
Task: lib/clientNotes/postProcess.ts
export function postProcessBullets(s: ClientNotesSections, ctx: { knownNames: string[] }): { sections: ClientNotesSections; warnings: string[] }
Apply to every bullet:
- TERM_REPLACEMENTS (auto-fix).
- Company references normalized to COMPANY_NAME (e.g. "L&D", "L and D", "LDCG", "Long & DeLosa") (auto-fix).
- Strip clock times (7:30, 7:30am, 0730 hrs) and dates (11/6, 11/06/2026, Nov 6, Monday) (auto-fix, add warning).
- First person (I, we, I'm, we're, our, my) → warning only (do not rewrite grammar).
- knownNames (from lib/noteTakers.ts + seeded users) → strip + warning.
- Location words (building, floor N, room N, wing, unit, suite) → warning only.
- Drop empty bullets after stripping; dedupe identical bullets.
Never runs on the Send As Is path.
Write table-driven unit tests for each rule, including false-positive cases
("we" inside "weld", "I-beam", "Unit heater").
```

**Done when**
- [ ] ≥25 table-driven cases, including the false-positive ones
- [ ] Warnings are human-readable strings for the UI

---

## Phase 4 — AI core (server only)

### P4.1 — Versioned system prompt
**Agent:** Claude Code (Opus — wording matters)

```text
Task: lib/prompts/clientNotes.v1.ts exporting PROMPT_VERSION = 'client-notes-v1'
and SYSTEM_PROMPT (string). It must instruct the model to:
- Act as L & D Construction Group's job-notes formatter. Technical, direct,
  task-focused. No aesthetic commentary. Never add work not in the raw notes or
  confirmed clarify answers.
- Third person, passive or company voice. Company is always "L & D Construction Group".
- No dates, times, people's names, I/we. Avoid building/room/facility names unless
  necessary to understand the work.
- Pinkus → Prime Woodworking. Cardboard floor protection → Ram Board.
- Source authority: supervisor/manager/project_manager notes are authoritative;
  worker notes are secondary and should be stated conservatively.
- Translate to English if the raw notes are in Spanish.
- PHASE A (no answers yet): return ONLY missing standard steps that are likely
  but unstated (tool/equipment setup, trade coordination, debris/demolition
  removal, implied prep like floor protection). Return each as a short noun
  phrase in `missingStep`. Return an empty list if nothing is missing. Do not
  ask about anything already stated.
- PHASE B (answers provided): include ONLY steps answered Yes. Return sections.
  Do not write headers, closing lines, or broom-clean text — code adds those.
- Materials: never return materials unless materialsRequested is true.
The title field is never provided to you.
Also export `buildUserMessage({ content, sourceRole, answers, materialsRequested })`.
Unit test: buildUserMessage never includes the title.
```

**Done when**
- [ ] Prompt reviewed by Cyrus against the Claude Desktop "Job Notes Assistant" project instructions
- [ ] `promptVersion` exported and used everywhere

### P4.2 — Zod output schemas
**Agent:** Codex / Cursor

```text
Task: lib/clientNotes/schemas.ts
- MissingStepsSchema = z.object({ missingSteps: z.array(z.object({ missingStep: z.string().min(2).max(80) })).max(6) })
- SectionsSchema = z.object({ areaPreparation, tasks, finalCleanup, coordination: z.array(z.string().max(300)), materials: z.array(z.string()).optional() })
- PrepareRequestSchema (route body): z.discriminatedUnion('action', [
    z.object({ action: z.literal('start') }),
    z.object({ action: z.literal('generate'), answers: z.array(z.object({ id: z.string(), include: z.boolean(), note: z.string().max(500).optional() })), waived: z.boolean().default(false) }),
  ])
- PrepareResponse: { type: 'questions', items: { id, missingStep, question }[] } | { type: 'draft', clientNotes: string, warnings: string[], meta }
`question` is always produced by CLARIFY_TEMPLATE on the server — never by the model.
```

**Done when**
- [ ] Schemas exported and typed; unit tests for valid/invalid payloads

### P4.3 — `runPrepare()` model call
**Agent:** Claude Code (Sonnet)

```text
Task: lib/ai/clientNotes.ts ('server-only').
export async function findMissingSteps(input, model): Promise<{ missingStep: string }[]>
export async function generateSections(input, model): Promise<ClientNotesSections>
- `model` is injected (LanguageModel). Default callers pass getAnthropicModel().
- Use the structured-output API chosen in P0.2 with the P4.2 schemas.
- temperature 0. Hard timeout (AbortSignal, 30s). maxOutputTokens sane (e.g. 1500).
- On schema failure: retry once, then throw a typed ClientNotesError('model_output_invalid').
- Log: noteId, promptVersion, modelId, latency, token usage. Never log raw note text.
Then export `prepareDraft(note, answers, waived, model)` that: generateSections →
postProcessBullets → renderClientNotes → returns { clientNotes, warnings, meta }.
```

**Done when**
- [ ] Functions run against the AI SDK mock model in unit tests
- [ ] No raw note text in logs (grep the log calls)

### P4.4 — `POST /api/notes/[id]/prepare`
**Agent:** Claude Code (Sonnet)

```text
Task: app/api/notes/[id]/prepare/route.ts (Next App Router; params is a Promise).
- 404 if !isClientNotesEnabled().
- 401 unless an iron-session user exists (session required, not just x-api-key).
- Validate body with PrepareRequestSchema → 400 on failure.
- Load note → 404 if missing; 422 if content is empty.
- action 'start': findMissingSteps → store pending questions in Redis
  `field:clarify:{noteId}` (TTL 1h) with server-generated ids + CLARIFY_TEMPLATE
  questions → return { type: 'questions', items } (items may be empty).
- action 'generate': load the clarify session; reject (409) if any pending
  question id is unanswered and waived=false. Map answers back to missingStep
  server-side (never trust client-sent wording). prepareDraft → updateClientNotes
  (content untouched) → delete the clarify key → return { type: 'draft', ... }.
- Simple per-user rate limit (e.g. 20/hour) via Redis INCR + EXPIRE → 429.
- Map ClientNotesError to 502 with a user-safe message; Anthropic down must not 500 silently.
```

**Done when**
- [ ] Route works end-to-end locally with a real key against a throwaway note
- [ ] Flag off → 404; logged out → 401

### P4.5 — API tests with mocked model
**Agent:** Codex / Cursor

```text
Task: tests for the prepare route using the AI SDK mock model (inject via a
test-only module seam, not an env var that could leak into prod).
Cases: flag off 404; no session 401; bad body 400; start returns questions with
exact CLARIFY_TEMPLATE wording; generate with unanswered question 409; generate
with waived=true succeeds; generate stores clientNotes and leaves content
byte-identical; model returns invalid JSON twice → 502; rate limit → 429.
```

**Done when**
- [ ] All cases green without network access

---

## Phase 5 — AI UI

### P5.1 — Format with AI entry points + gating
**Agent:** Cursor / Codex

```text
Task: wire the "Format with AI" button in NoteForm and add it to NoteActions.
- Hidden entirely when the server says clientNotes is disabled.
- Disabled when navigator.onLine is false, with helper text:
  "Needs connection, use Send As Is or try later".
- Requires a Source role; if none, show inline "Pick a source first".
- If role is worker, show a non-blocking warning banner: "Worker notes will be
  stated conservatively. Review before sending."
- On tap: save the note via the normal path FIRST, then navigate to
  /notes/[id]/prepare. Saving must never depend on the AI call succeeding.
```

**Done when**
- [ ] Offline: button disabled, Send As Is still works
- [ ] Flag off: button not rendered

### P5.2 — Quick Questions screen
**Agent:** Claude Code (Sonnet)

```text
Task: app/notes/[id]/prepare/page.tsx + components/ClarifyQuestions.tsx matching
the mockup. On mount POST {action:'start'}; show a loading state.
- If items is empty, go straight to Confirm (P5.3).
- One question per screen: "1 of N" counter, question text, large Yes/No toggle,
  Next (disabled until answered), Back.
- A secondary "Generate without these" link that sets waived=true (confirm dialog).
- Attach Photo: render NOTHING for now (V1.3).
- Errors (502/429/network) show a retry button AND a "Use Raw Notes Instead"
  button that goes to the AsIsReview screen.
- Keep answers in component state; refreshing the page restarts the session (acceptable for MVP).
```

**Done when**
- [ ] Every error state has a way back to raw notes

### P5.3 — Confirm + Generate
**Agent:** Cursor / Codex

```text
Task: after the last question, show a short summary: "Include: …" / "Exclude: …"
(or "No missing steps found"), [Generate] primary, [Back]. Generate POSTs
{action:'generate', answers, waived}; shows a loading state with a cancel that
aborts the fetch; on success route to the Client Notes screen.
```

**Done when**
- [ ] Double-tapping Generate sends one request

### P5.4 — Client Notes screen + Chat share
**Agent:** Claude Code (Sonnet)

```text
Task: components/ClientNotesPanel.tsx at /notes/[id]/client matching the mockup.
- Render note.clientNotes: section label lines bold in the UI only; the stored/
  copied text stays plain.
- If clientNotesMeta.warnings is non-empty, show them in a yellow list above the text.
- Buttons: Use Raw Notes Instead (→ AsIsReview, raw untouched), Edit (textarea;
  saving sets editedByUser=true and re-runs ONLY renderer-safe checks: closing line
  present, no '#'/'**'), Copy (navigator.clipboard with a fallback textarea select
  for iOS; toast "Copied"), Share to Google Chat.
- Share: extend send-to-chat with an optional `body: 'raw' | 'client'` (default 'raw',
  so existing callers are unchanged). For 'client', send clientNotes text + photo
  links, NO title. Same outbox/offline behavior.
```

**Done when**
- [ ] Copy works on iOS Safari and Android Chrome (manual check on a phone)
- [ ] Existing raw send unchanged (P2.3 still green)

### P5.5 — E2E: AI path
**Agent:** Codex / Cursor

```text
Task: Playwright E2E for the AI path with the mock model returning one missing
step ("debris removal") then sections for "Laid floor protection. Removed old tile.
Installed new subfloor." Assert: question text exact; answering No and generating
shows output identical to the Client Notes mockup; Copy puts plain text on the
clipboard; Use Raw Notes Instead shows the original text untouched; Share to Chat
(TEST webhook) sends the formatted text without the title.
```

**Done when**
- [ ] Green in CI with no Anthropic key present

---

## Phase 6 — Evals

### P6.1 — Goldens + rule-check harness
**Agent:** Claude Code (Sonnet) · **Input needed:** 10 anonymized real L&D notes from Cyrus

```text
Task: evals/golden/*.json with { id, raw, sourceRole, clarifyAnswers, materialsRequested, expected?: string }.
scripts/eval-client-notes.ts + `npm run eval:client-notes`:
- Runs findMissingSteps + prepareDraft with the REAL model (requires ANTHROPIC_API_KEY;
  exits with a clear message if missing). Never runs in normal CI.
- Rule checks per output: closing line exactly once at end; sections in order;
  Final Cleanup present; Coordination only if raw mentions coordination;
  no '#', '**', '```'; no I/we/our/my; no date/time patterns; no "Pinkus";
  "Prime Woodworking" if raw had Pinkus; company only as COMPANY_NAME;
  no Materials unless requested; clarify questions match CLARIFY_TEMPLATE.
- Prints a pass/fail table + writes evals/results/<timestamp>.json including
  promptVersion and modelId.
```

**Done when**
- [ ] 10 goldens, 100% rule-check pass on Sonnet 5.5
- [ ] Results file committed for the baseline run

### P6.2 — LLM-judge "no invented content"
**Agent:** Claude Code (Sonnet)

```text
Task: add a judge step to the eval script: given raw notes + confirmed Yes answers
+ generated output, return { inventedClaims: string[] } via structured output.
Fail the golden if inventedClaims is non-empty. Use a separate judge prompt file
(lib/prompts/judge.v1.ts). Record judge results in the same results JSON.
```

**Done when**
- [ ] Judge catches a deliberately seeded invented bullet (test it once)

---

## Phase 7 — Ship MVP

### P7.1 — Vercel env + preview verification
**Agent:** you + Vercel MCP

- [ ] Add `ANTHROPIC_API_KEY`, `CLIENT_NOTES_MODEL=claude-sonnet-5-5` to **Preview + Development**
- [ ] `ENABLE_CLIENT_NOTES=1` on **Preview only**; Production stays `0`
- [ ] Push `ai-features`, open PR, wait for the preview deployment (check build logs, not just `state`)
- [ ] On the **live preview URL** (Chrome, not build output): run the full demo checklist below
- [ ] Check `get_runtime_logs` for the prepare route: no 500s, no raw note text logged

### P7.2 — Demo checklist + merge
- [ ] Seeded login works
- [ ] Send As Is shares raw note + photo unchanged (online and offline → reconnect)
- [ ] Mockup note produces the debris-removal question, then the exact mockup output
- [ ] Copy works on a real phone
- [ ] Worker role shows the warning banner
- [ ] Flag off in Production: no Format with AI button, nothing else changed
- [ ] Eval script green on goldens
- [ ] Merge to `main` with Production flag still `0`; verify production with `curl` + Chrome
- [ ] Flip Production `ENABLE_CLIENT_NOTES=1` for Cyrus first, then the team

---

## v1 — Vision + hierarchy

### V1.1 — Photo privacy decision
- [ ] Decide D10: keep public Blob URLs for vision, or move to private Blob + short-lived signed URLs
- [ ] If private: one prompt to migrate upload route + a read-URL helper; existing public photos stay readable

### V1.2 — Vision: photos as image parts
```text
Task: pass up to 4 note photos as image parts to both findMissingSteps and
generateSections. Prompt v2 (bump PROMPT_VERSION): photos are evidence; when a
worker note conflicts with photos, prefer the photo and omit or soften the claim;
never describe aesthetics from photos. Add 3 goldens with photos + one worker-vs-photo conflict.
```

### V1.3 — Attach Photo on clarify answers
```text
Task: enable Attach Photo on the Quick Questions screen. Upload via the existing
photo route, store the URL on the ClarifyAnswer, include it as an image part in
generate. Online only.
```

### V1.4 — Evals in CI
- [ ] ≥15 goldens
- [ ] Rule checks run in CI on a recorded-output fixture (no live model); live eval stays manual or nightly with a secret

---

## v2 — Materials pricing

### V2.1 — Curated price sheet
```text
Task: Redis hash `field:prices` keyed by normalized material name →
{ supplier, unit, priceCents, updatedAt }. Admin-only page to upload a CSV
(material, supplier, unit, price). Validate with Zod; reject the whole file on any bad row.
```

### V2.2 — Markup math
```text
Task: lib/pricing/markup.ts. All math in integer cents.
unitCents = round_half_up(priceCents * 126 / 100); totalCents = unitCents * qty.
Format row: Material / Source (Supplier + 26% markup) / Unit Price / Quantity / Total.
Unit tests: rounding edges (e.g. 333¢), qty 0 rejected, missing price → typed error.
```

### V2.3 — Materials gate
```text
Task: "Include materials" toggle on the Confirm screen (default off). When on,
the model returns material names + quantities ONLY; prices are joined from
field:prices in code. Any material without a curated price shows "Price not on
file" and blocks priced output until resolved or removed. The model never outputs a price.
```

### V2.4 — Optional PDF export
- [ ] Export the rendered client notes (no title, no internal fields) to PDF

---

## Agent routing (keeps Claude usage down)

| Prompt type | Agent |
|---|---|
| Recon, installs, schemas, UI wiring, E2E | Codex or Cursor CLI |
| Storage guards, route logic, render/post-process | Claude Code (Sonnet) |
| System prompt wording, judge prompt | Claude Code (Opus) |
| Env, deploy, live verification | You + Vercel MCP + Chrome |

Run sequentially. Never two agents on this branch at once.
