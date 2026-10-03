# SYLF PLANNER EXPERIENCE — UX PHASE 2 REPORT
## RESEARCH, SYLLABUS IMPORT & SOURCE PROVENANCE

**Scope:** make Quick Plan able to obtain a student's scope without forcing them to type it — grounded syllabus discovery, honest provenance, document/image/paste import, a hierarchical candidate, review and confirmation, safe fallbacks, and integration with the Phase 1 Plan Brief and the existing generation pipeline.

**Not in this phase, and not started:** curriculum comparison, overlap mapping, the preparedness matrix, AI-prefilled preparedness, Planner Copilot, natural-language action parsing, preference changes, the editing-relaxation rollout, public redesign, any change to Classic Planner or to the coexistence navigation.

**Method:** every claim below was read from the repository or measured by running it. Test counts and sizes are actual command outputs. Where the implementation differs from what the goal asked for, the difference is in §28.

---

## 1. Repository reconciliation

Phase 2 begins on top of Phase 1 (intake foundation) and the coexistence patch, both treated as permanent: Classic Planner is the default Planner surface, Planner Modes are always available, there is no feature flag, and research lives entirely inside a selected mode's Quick Plan.

What Phase 2 added:

| Layer | Files |
| --- | --- |
| Shared node shape | `lib/planner/intake/scope-node.ts` (extracted so the brief and the research contract share one definition without an import cycle) |
| Research contract | `lib/planner/research/contracts.ts` |
| Provider | `lib/planner/research/provider.ts` (grounded search, grounding metadata, timeout, cancellation, bounded retries) |
| Provenance | `lib/planner/research/sources.ts` (domain-derived classification, ranking, dedupe) |
| Orchestration | `lib/planner/research/service.ts` (cache, staleness, statuses, removal memory), `research/import-scope.ts` (paste/document bridge) |
| Import | `lib/planner/import/{outline,pdf,vision,storage,service,validate}.ts` |
| Intake integration | actions `researchScope`, `importScope`, `confirmScope` (extended), `discardScopeCandidate`, `setScopeResearchPolicy`, `setBackground`; `storeScopeCandidate`; the import route |
| UI | `quick-plan/ScopeReview.tsx`, `quick-plan/SourcePanel.tsx`, and the scope section of `quick-plan/QuickPlan.tsx` |
| Telemetry | 10 new events and 12 new counts in the existing closed vocabulary |

### 1.1 Phase 1 preserved, verified

`PlanBriefV1`, `PlannerIntakeSession`, readiness, the weekly-hours distributor, null-preparedness semantics, optimistic versioning, `actionKey` idempotency, Advanced setup, the adapters and the Phase 0–6 engine are untouched in behaviour. The Phase 1 suites (`quick-plan.test.tsx`, `intake-*`, `database-intake-*`, `planner-workspace`, `classic-modes-coexistence`) all still pass, with one fixture update: `scope.removedLabels` is a new required field of the stored scope (§28.4).

## 2. Migration ledger — the factual count

The goal flagged a possible discrepancy. The facts:

| Check | Result |
| --- | --- |
| Migration directories on disk | **56** (57 entries including `migration_lock.toml`) |
| Applied to the development database before this phase | **54**, with two pending: `20260926020000_planner_intake_session` and `20260926030000_subject_archived_at` |
| Action taken | `npx prisma migrate deploy` → **all 56 applied**, `migrate status` now reports "Database schema is up to date" |
| Disposable-PostgreSQL harness | its staged list omitted `subject_archived_at`; added, so the harness now applies the whole chain |
| New migrations in Phase 2 | **none** |

So Phase 1's "54/54" was accurate when written and stale by the time Phase 2 began: the intake-session migration and a `Subject.archivedAt` migration both existed but had not been deployed locally. That also means `archivedAt` — used by the capabilities route and several others — was missing from the local database until now. No historical migration was modified.

## 3. Coexistence regression status

Unchanged and re-verified: Classic opens by default; `Planner modes` opens the chooser; each mode opens its Quick Plan; `← Classic Planner` returns; no environment variable is involved; the removed availability gate has not returned. Research and import appear only inside a selected mode's Quick Plan. `__tests__/planner/classic-modes-coexistence.test.tsx` and `classic-coexistence.test.ts` pass unchanged (they never touch the new code paths).

## 4. Research provider changes

`lib/planner/research/provider.ts`:

* Calls the provider directly (`@google/genai`, dynamically imported) with `tools: [{ googleSearch: {} }]`, so the answer is grounded rather than recalled.
* Uses **`GEMINI_MODELS.research`** from `lib/ai/config.ts`. No model literal exists in the module, and a test fails if one is reintroduced.
* **Extracts real grounding metadata**: `candidates[0].groundingMetadata.groundingChunks[].web.uri` and `.title`. That is the only route by which a source can enter a result.
* Distinct typed failures: `RESEARCH_TIMEOUT`, `RESEARCH_CANCELLED`, `RESEARCH_UNAVAILABLE`; a test asserts a timeout is retried once and then reported as a timeout, and that a permanent 4xx is not retried at all.
* Bounded: `RESEARCH_LIMITS.timeoutMs` (20s), at most 2 attempts, findings truncated to 12,000 characters **with a visible `[truncated]` marker** so a partial answer cannot pass as a whole one.
* `ungrounded: true` when prose arrives with no grounding chunks at all — the flag that stops "the model said so" becoming a found syllabus.

## 5. Gemini config correction

`executeGoogleSearch` in `lib/ai/chat-tool-executor.ts` hardcoded `model: "gemini-3.7-flash"`. It now reads `GEMINI_MODELS.research`. Nothing else in that function changed — same prompt, same system instruction, same return shape and same fallback snippet — because chat behaviour depends on them. `lib/ai/syllabus-compiler.ts` was deliberately left on its existing path (it already guards against the executor's placeholder snippet by comparing `source`).

## 6. Grounding and source capture

A source is built only from a URL the provider's metadata actually contained:

* non-absolute, non-http(s), empty and malformed URIs are dropped (`buildSource` returns `null` rather than repairing anything);
* `publisherOrDomain` is derived from the URL host, never from model prose;
* `retrievedAt` is Sylf's own retrieval time; `documentDate` is filled only when the *title* carries a four-digit year in `19xx`/`20xx` (so a syllabus code like `9231` is never misread as a date) and is documented as title-derived;
* a `USER_UPLOAD` source is typed as such and can never be classified official.

**There is no code path that constructs a URL from model text.** If grounding returned nothing, `sources` is `[]` and the candidate's status is at best `WEAK`.

## 7. Source ranking and classification

`classifySource(url, { board, level })`:

1. official host **and** a document-looking path (`.pdf`, `/pdf/`) → `OFFICIAL_PDF`;
2. official host → `OFFICIAL`;
3. a government/academic TLD (`.gov`, `.gov.<cc>`, `.edu`, `.edu.<cc>`, `.ac.<cc>`, `.mil`) → `OFFICIAL`, authoritative by construction;
4. everything else → `SECONDARY`.

Official hosts are **derived from the repo's own registry**: `EXAM_BOARDS` / `ACADEMIC_LEVELS` from `lib/study-systems.ts` plus a curated, commented board→domain table. An unknown board yields **no** official domains — the safe direction. Content never promotes a source: a test asserts that a host like `best-prep-blog.example/official-syllabus-specification-2026.pdf` is still `SECONDARY`.

Ranking is total and deterministic: source type, then mapping confidence, then number of supported nodes, then domain, then URL. Duplicates collapse on a normalised URL (case, `www.`, fragment, trailing slash) while preserving order.

## 8. Provenance model

`ResearchSource` (`lib/planner/research/contracts.ts`) carries `sourceId`, `url`, `title`, `publisherOrDomain`, `sourceType`, `retrievedAt`, `documentDate`, `nodeIds` and `mappingConfidence`; candidates keep at most 8 sources, and a confirmed scope keeps their ids in `scope.provenanceRefs` (bounded at 8). Individual nodes may cite up to 4 sources (`ScopeNode.sourceIds`, optional, so old scopes parse unchanged).

Research findings are **never stored as pages**: only bounded provider text (≤12,000 characters) is used to build a hierarchy, and that text is not persisted into the brief or any snapshot. Uploaded files are not stored at all in this phase (see §12), so no document body enters the planner's storage.

## 9. Research service

`researchScope({ brief, signal, disabled })` returns `{ candidate, metrics }`. It decides status, applies the student's own removals, caches and reports; it never writes to the brief.

**Status is earned, not assumed:**

| Status | When |
| --- | --- |
| `OK` | findings parsed into a well-formed hierarchy **and** at least one official source, grounded |
| `WEAK` | a candidate exists but nothing official backs it — secondary sources only, or the provider answered without searching, or findings arrived with no citable source |
| `UNAVAILABLE` | there is no candidate to review: nothing parsed, a malformed structure, no goal to research, research disabled, or a provider failure (with the reason preserved in `failureCode`) |

A failure is **stored, not thrown**: the student sees the reason and the next actions in place, and the session keeps a record of what was attempted. `candidateFromResearch` sets `failureCode` (`RESEARCH_TIMEOUT`, `RESEARCH_UNAVAILABLE`, `RESEARCH_CANCELLED`, `RESEARCH_WEAK`, `RESEARCH_NOT_APPLICABLE`, or an `IMPORT_*` code).

Candidate construction is conservative: markdown headings carry the SECTION/CHAPTER spine, bullets nest by relative indentation and otherwise attach to the heading above them, deeper nesting clamps to the engine's three levels rather than being dropped, and a line that is only a marker (`-`, `#`, `1.`) is discarded rather than labelled.

## 10. Caching and staleness

* **Cache key** = a digest of the normalised question (goal, subject, board, level, mode), stored explicitly on the candidate as `cacheKey` — never inferred from display text.
* **Digest** = `researchBriefDigest(brief)` over the material fields (goal, subject, board, level, mode, end date, topic count). Every candidate carries the digest it was computed against.
* **Reuse requires both**: same question **and** same brief, otherwise research runs again. That is why editing "NUST NET Engineering" to "NUST NET Business" mid-search cannot have the old answer applied — `candidateIsStale` compares digests, not wording.
* A stale candidate is never silently rebased; the stale copy is simply not reusable, and the stored candidate's own `retrievedAt` is displayed whenever it is shown.

## 11. Research UX

The scope section of Quick Plan now offers, in one fieldset: **Find syllabus**, **Upload a syllabus**, **Paste an outline**, **Use only what I give you**, plus the manual list editor from Phase 1 and an optional exam-board/level pair.

* Research **never auto-fires**: a test asserts that typing in the goal field sends the goal and calls the provider zero times. It runs only from `Find syllabus`.
* While running, a `role="status"` live region says so; the buttons are disabled rather than pretending to work.
* A failure renders the candidate's own sentence (e.g. "I could not reach a search provider just now. You can upload a syllabus, paste an outline, or enter the scope yourself") — each failure code maps to a different, useful next action rather than "something went wrong".
* Copy is careful: "I found 38 topics across 6 sections from 1 official source", "I found material about this, but nothing from an official source. Treat the list below as a starting point and check it", "I could not find a syllabus for this." The phrase "This is definitely your syllabus" appears nowhere.

## 12. File and import architecture

`lib/planner/import/`:

* `validate.ts` — server-authoritative validation: 5 MB cap (`MAX_UPLOAD_BYTES`), magic-byte sniffing, PDF accepted only on a real `%PDF-` signature (with a small, bounded leading-junk allowance), images through the repository's existing `validateUpload`, a declared-MIME/sniff mismatch **rejected**, and everything else `IMPORT_UNSUPPORTED`. `lib/upload-security.ts` was not modified.
* `storage.ts` — a private `planner-intake` bucket following the established `focus-backgrounds-user` pattern: `<userId>/<sessionId>/<random>.<ext>` paths, `<userId>/` prefix validation on read, signed URLs (900s) and no public URL, bounded listing and deletion for expiry cleanup. The client filename is never a path component.
* The import route (`POST /api/planner/intake/[id]/import`) is multipart, goes through `plannerRoute` (so authentication and `private, no-store` are unchanged) and then through the same session versioning, idempotency and telemetry as any other mutation.

**Lifecycle, stated plainly:** uploaded files are read for extraction and **not retained in this phase** — no object is written, so there is nothing to leak, and nothing needs cleanup. The storage module exists, is owner-scoped and tested, and is the seam Phase 3 can use if a document needs to persist for review; if it is used, expiry cleanup is `deleteSessionFiles`.

## 13. Extraction implementation

* `parseOutline` (pure): indentation, bullet markers, numbering, markdown headings mapped to SECTION→CHAPTER→TOPIC, flat lists, trailing colons, CRLF, depth clamping, deterministic ids, idempotent re-parse, and `OUTLINE_TOO_LARGE` reported rather than silent truncation.
* `extractPdfText` (dependency-free): page objects, `FlateDecode` inflation, text-showing and positioning operators, PDF string escapes, hex strings, and a bounded page cap. It reports `pages` as the ranges it actually read and sets `partial` with a reason (`NO_TEXT_LAYER`, `ENCRYPTED`, `UNPARSEABLE`, `PAGE_LIMIT`, `TEXT_LIMIT`) — a scan returns no text and *does not throw*, so the caller can offer the photograph path.
* `extractOutlineFromImage`: `GEMINI_MODELS.vision` with a strict JSON outline prompt, defensive parsing, cancellation and a 20s timeout; missing credentials return `VISION_UNAVAILABLE` rather than a fabricated list.
* `candidateFromImport` turns either into a candidate with `origin` `PASTE`/`IMPORT`, a `USER_UPLOAD` source for documents and none for a paste, honest status/confidence, and a summary that never claims completeness when extraction was partial.

**No extraction capability infers preparedness, confidence, priority or mastery** — a test asserts the candidate and its nodes contain no such fields at all.

## 14. Hierarchy handling

The candidate preserves SECTION → CHAPTER → TOPIC where the source has it; the tree is stored, reviewed and edited as a tree, and flattening happens only at the adapter boundary (Phase 1's `flattenScope`), exactly as the review amendment requires.

## 15. Large-scope handling

Carried unchanged and now exercised by researched scopes: every leaf is preserved in the brief; chapter-level units are formed first; details stay for traceability; segmentation happens only if meaningful coarsening still cannot fit the engine's bounds. Nothing is truncated, no unrelated chapters are merged, and nothing is hidden. The measured case from Phase 1 stands: 200 leaves coarsen to 20 chapter units against a cap of 50.

## 16. Scope review

`ScopeReview.tsx` renders the hierarchy with per-node selection, collapsible sections, counts in a live region ("N of M units selected"), per-row remove, inline rename, an "Add a topic" control, a filter that appears above 20 nodes and keeps a matching topic's ancestors visible, per-section source markers as **text** ("Official source", "2 sources"), and partial-import honesty naming the pages that were read. `WEAK` carries its caveat; `UNAVAILABLE` renders no tree at all.

`SourcePanel.tsx` lists sources with a plain-text type word, title, publisher, retrieval date and (only when known) document date, official first, with real links and `rel="noreferrer noopener"`; a `USER_UPLOAD` source renders as text with no link, and an empty list says "No public source was used for this scope."

## 17. Confirmation and authority

`confirmScope` is the **only** code path in the tree that may copy a candidate into `brief.scope.nodes`. It requires the current version, validates that every id exists (**in the candidate or in the student's own additions**), applies their renames, appends their additions *without* any source (their wording is not the source's), sets `scope.source` to `RESEARCH_CONFIRMED`/`IMPORT_CONFIRMED`, stamps `confirmedAt`, keeps the source ids in `provenanceRefs`, clears the candidate, bumps the version, is idempotent by `actionKey`, and recomputes readiness.

Two structural guarantees follow, both tested against real PostgreSQL:

* an unconfirmed candidate cannot be planned — `requestGeneration` answers `BRIEF_NOT_READY` while one is waiting;
* a confirmed scope is never overwritten by a candidate, and editing the confirmed scope withdraws the confirmation until the student confirms what is actually there.

## 18. Readiness integration

Phase 1's previously-unused states are now exercised, server-side:

| Situation | State |
| --- | --- |
| Goal named, no scope, policy allows, no candidate | `RESEARCH_AVAILABLE` |
| Candidate waiting, no confirmed scope | `NEEDS_SCOPE_CONFIRMATION` |
| Confirmed scope + the other essentials | `READY_FOR_DRAFT` / `ADVANCED_REFINEMENT_AVAILABLE` |
| Policy off, no scope | `NEEDS_CORE_INFO` with `SCOPE_MISSING` — and never `RESEARCH_AVAILABLE` |

A candidate beside an *already confirmed* scope never blocks or nags: it is an offer. No provider decides readiness.

## 19. "Use only what I give you"

A persisted `researchPolicy: "ALLOW" | "OFF"` on the brief, set by `setScopeResearchPolicy`. When off: research is refused before any provider call (`failureCode: RESEARCH_NOT_APPLICABLE`), the surface disables `Find syllabus`, the policy survives a remount so nothing searches later on its own, any pending candidate is withdrawn (keeping it would leave the student reviewing work they just declined), and manual/pasted/uploaded scope plus generation work exactly as before. `Allow a search again` reverses it.

## 20. Generation integration

Confirmed scope → Phase 1's deterministic adapter → `UserInputV1` → the existing Planner Modes pipeline. No new generator, no raw scraped text anywhere near the model: only bounded, confirmed structure reaches generation. A database test asserts that a scope researched, edited (a unit removed) and re-confirmed generates with the removal in place and provenance retained.

## 21. Quota and cost measurements

No `plannerResearch` quota was created, as instructed. What is measured instead, per operation:

| Metric | Source | Bound |
| --- | --- | --- |
| Provider calls | `metrics.calls` (telemetry `providerCalls`) | 1 normal + at most 1 retry |
| Retries | `metrics.retries` | ≤ 1 |
| Latency | `metrics.latencyMs` | timeout 20s |
| Result status | `metrics.status` | OK/WEAK/UNAVAILABLE |
| Cache hit | `metrics.cacheHit` (telemetry `cacheHit`) | reuse only on same question + brief |
| Sources / official / secondary | counts | ≤ 8 stored |
| Candidate nodes | count | ≤ 200 |

**Recommendation:** a dedicated `plannerResearch` quota is **not yet justified**. One research operation is one bounded provider call with one optional retry, a 20s ceiling, a hard cache hit for repeat questions, and it is explicitly user-initiated — closer in cost to a single generation than to a browsing agent. What would change that judgement: measured retry rates above ~20%, or the second (generation-time) research layer from Phase 0 being added later, or research becoming automatic. Cheap groundwork either way: the metrics already travel with every operation, so a quota can be added without new instrumentation. (Live figures are in §26.)

## 22. Telemetry

Ten events in the existing closed vocabulary — `research_started`, `research_completed`, `research_failed`, `research_cancelled`, `scope_candidate_shown`, `scope_confirmed`, `scope_research_rejected`, `scope_import_started`, `scope_import_completed`, `scope_import_failed` — plus counts: `sourceCount`, `officialSourceCount`, `secondarySourceCount`, `candidateNodes`, `confirmedNodes`, `editedNodes`, `importedTopics`, `researchedTopics`, `retries`, `cacheHit`, `partialImport`, and the closed `scopeOrigin` enum (`RESEARCH | IMPORT | PASTE | MANUAL | RESEARCH_CONFIRMED | IMPORT_CONFIRMED`).

Every field is validated against an allowlist before it is logged. **No topic text, exam title, URL, syllabus text, document text or file name can reach telemetry** — a URL or a file name has no representation in the vocabulary at all, which is the only version of this rule that survives contact with a future caller.

## 23. Privacy and security

* Provider and import modules never log content; server logs carry error codes and (for storage) paths only.
* URIs are data, not fetches: the only outbound request is the provider's grounded search, so no user-supplied URL is ever fetched and the SSRF surface of "paste an official link" does not exist in this phase.
* Uploads: 5 MB cap, magic-byte sniffing, declared-MIME mismatch rejected, owner-scoped paths, signed access only, no public URL, no client filename in a path.
* SSRF-adjacent rules from the goal (localhost, private ranges, credential-bearing URLs, unsupported schemes, oversized responses) are moot for the reason above, and are recorded as deferred to a phase that actually fetches a URL.
* Existing guards are untouched: `plannerRoute` authentication, ownership, versioning, RLS, the server-only boundary, and the always-active Planner mutation guards.

## 24. Performance

| Measurement | Value |
| --- | --- |
| Brief bound (Phase 1, unchanged) | 64 KiB; a 198-node brief measures 19,847 B |
| Candidate stored inside the brief | same envelope, ≤200 nodes, ≤8 sources |
| Session payload philosophy | brief ≤64 KiB inside the ≤256 KiB planner payload bound |
| Research findings retained | ≤12,000 characters, truncated with a visible marker |
| Pasted text accepted through an action | ≤24,000 characters (kept below the engine's 32 KiB action envelope so an over-long paste is a useful error, not a payload failure) |
| Document text retained | ≤60,000 characters, `partial` + `TEXT_LIMIT` when truncated |
| PDF page cap | 40 pages, with the pages actually read reported |
| Provider timeout | 20 s; cancellation honoured |

No bound was raised quietly; the only new ceilings are the pasted/extracted character limits and the page cap, each with a stated reason.

## 25. Tests, database and build

New suites in this phase:

| Suite | What it pins |
| --- | --- |
| `research-provider.test.ts` (13) | grounding capture, no fabricated source, shared registry model, timeout/cancel, retry bounds, truncation marker |
| `research-sources.test.ts` (19) | classification rules incl. the blog-that-looks-official case, registry-derived domains, dedupe, deterministic ranking, `buildSource` refusing bad URLs |
| `research-service.test.ts` (18) | status is earned, hierarchy parsing (headings/bullets/indentation/marker-only lines), determinism, staleness, cache reuse rules, research never writes to the brief, the disabled path |
| `import-outline.test.ts`, `import-pdf.test.ts`, `import-service.test.ts`, `import-validate.test.ts` | outline parsing, synthetic PDFs (text, compressed, two-page, scan, encrypted, page/text limits), validation refusals, candidate honesty, no inferred preparedness |
| `scope-review.test.tsx` | hierarchy, selection rules, filter with ancestors, live counts, WEAK/unavailable/partial copy, text-not-colour source type, axe |
| `quick-plan-research.test.tsx` (8) | research never auto-fires, all four paths offered, review before confirm, confirmation of the reviewed selection, paste, upload, policy off |
| `database-scope-confirmation.test.ts` (9) | real PostgreSQL: unconfirmed candidate cannot generate, confirmation applies exactly the student's choice with provenance, unknown id refused, replay idempotent, stale refused, foreign user denied, removal survives a re-run, policy off withdraws, board persists |

Verified (actual outputs in §25.1):

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | 0 errors |
| Schema | `npx prisma validate` | valid |
| Planner suite | `npx vitest run __tests__/planner` | see §25.1 |
| Disposable PostgreSQL | `node scripts/test-planner-postgres.mjs` | see §25.1 |
| Secrets | `npm run audit:secrets` | no credential patterns in tracked files |
| Models | `npm run audit:models` | 0 active retired-model references |
| Mobile | `npm run mobile:build` / `npm run mobile:verify` | see §25.1 |
| Build | `npm run build` | see §25.1 |
| Full repository | `npx vitest run` | see §25.1 |

### 25.1 Exact results

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0 errors** |
| Schema | `npx prisma validate` | valid; `migrate status` → "Database schema is up to date!" (56/56) |
| Planner suite | `npx vitest run __tests__/planner` | **54 passed / 15 skipped files; 627 passed / 141 skipped tests** |
| Disposable PostgreSQL (serial) | `node scripts/test-planner-postgres.mjs` | **64 passed / 5 skipped files; 761 passed / 7 skipped tests** — migrations, RLS, the confirmation suite |
| Full repository suite | `npx vitest run` | **177 passed / 15 skipped files; 1,915 passed / 141 skipped tests, 0 failures** |
| Secrets | `npm run audit:secrets` | no credential patterns in tracked files |
| Models | `npm run audit:models` | 0 active retired-model references |
| Mobile | `npm run mobile:build` / `npm run mobile:verify` | built; **verify PASSED**, zero server-only symbols or secrets in `mobile/dist` |
| Build | `npm run build` | compiled; `/api/planner/intake`, `/[id]`, `/[id]/action` and the new `/[id]/import` present |

Two failures appeared during the sweep and both were resolved rather than excused: `database-intake-service.test.ts` still asserted that `researchScope` and `importScope` answer `NOT_AVAILABLE` (they are now implemented, so the assertion was narrowed to `compareCurricula`, which correctly still does), and `import-validate.test.ts` failed as a file under parallel load and passes alone and in the serialized run.

## 26. Live research smoke

**Not run.** The synthetic-with-credentials smoke the goal asks for requires a `GEMINI_API_KEY`; this environment has no provider credentials, and the goal's own rule is that source standards must not be weakened to manufacture success. What was verified instead: the provider's grounding capture, classification, status rules and failure paths are covered by unit tests against a mocked SDK, and `RESEARCH_UNAVAILABLE` is the honest answer without credentials. The four smoke scenarios (known exam with a clear official source; a qualification with an official PDF; an ambiguous exam; a deliberately unknown exam) remain to be run in an environment with credentials, and §28 records that as an open item.

## 27. Frontend QA status

**No browser QA was performed.** Browser tooling is unavailable here, so there is no claim of manual inspection of the review surface, the source panel, real file pickers, dark/light/custom backgrounds or mobile layout. What is covered: interaction and accessibility semantics by component tests (jsdom + `@testing-library`, axe where the repo already uses it), and appearance by construction — the new components use the existing token vocabulary and the shared planner stylesheet, with no hardcoded colours. The one behaviour jsdom cannot exercise is the real bottom-sheet/scroll behaviour on a phone.

## 28. Deviations and decisions

1. **Uploaded files are not persisted.** The storage module is written, owner-scoped and tested, but the route reads a file, extracts and discards it. Retaining documents needs a retention answer (how long, what the student can see, what expiry means) that belongs with the review UI in a later phase; not storing them is the conservative default and the goal explicitly allows it.
2. **PDF extraction is dependency-free**, which is why it is honest about limits rather than complete: exotic encodings, object-stream-heavy files and non-Latin encodings are reported as partial or unreadable rather than guessed at.
3. **`RESEARCH_WEAK` doubles as the failure code for a malformed candidate.** The candidate exists but is unusable; the UI's next action is the same (enter or import the scope).
4. **`scope.removedLabels` is a new required field on the stored scope**, so Phase 1 fixtures needed a one-line update. It exists to satisfy the review decision that re-running research must never silently restore a unit the student removed.
5. **Confirmation defaults to the selection, not the candidate.** `confirmScope` with no `nodeIds` confirms the units left ticked. Without this, a fresh candidate would silently re-include anything the student had removed.
6. **The exam-board/level pair moved into Quick Plan.** Official-domain discovery depends on it, so asking for it in Advanced setup alone would have left research unable to classify anything as official for most students.
7. **Generation-time research (Phase 0's second layer) was not implemented.** Repository inspection found no current generation input where a bounded, source-backed lookup would materially improve the result, and the goal says not to add it merely because the architecture allows it. Scope research was the priority.
8. **`executeGoogleSearch` keeps its placeholder fallback.** It is chat behaviour, guarded elsewhere by a source-name check; changing it was out of remit. The research path does not use it.

## 29. Blockers and gaps before UX Phase 3

1. **Live research is unverified against a real provider** (§26) — the single most important open item. Everything about honesty is verified; whether a real grounded search returns useful official sources for real exams is not.
2. **No official-domain entry for Pakistani university admissions** (NUST-style) beyond the board table; the curated list covers exam boards and the common systems, and an unknown board correctly yields none.
3. **Uploaded documents are read once and dropped** (§28.1), so a student cannot reopen the file they imported.
4. **Extraction quality on real-world PDFs is unmeasured** — synthetic fixtures cover the code paths, not the variety of real specifications.
5. **The preparedness matrix does not exist**, by design; prepared-ness remains unstated-or-stated, never inferred from a syllabus.
6. **Conflict presentation is a sentence, not a comparison view.** When fresh research disagrees with a confirmed scope, the student is told and the removed units come back unticked; a proper "what changed since last time" view is Phase 3+ work.
7. **`plannerResearch` quota deferred with a stated trigger** (§21).

---

## Answers to the 20 explicit questions

1. **Can a known exam obtain a syllabus without manual topic entry?** Yes, on the strength of the scope research path: `Find syllabus` → candidate hierarchy → review → confirm. Whether a *specific* real exam returns an official source is the live-smoke question in §26.
2. **Are real source URLs preserved?** Yes — captured from provider grounding metadata, stored on the candidate, kept as `provenanceRefs` after confirmation and displayed in the source panel.
3. **Can Sylf ever display an invented provenance URL?** No. The only constructor of a source is `buildSource`, which accepts URLs from grounding metadata and rejects anything that is not an absolute http(s) URL; there is no code path from model text to a URL. Two suites assert it.
4. **Are official and secondary sources distinguished?** Yes, by host rules derived from the app's own registry, and shown as words ("Official", "Official PDF", "Secondary", "Your upload"), never by colour alone.
5. **Can unconfirmed research influence generation?** No. Candidates live in `brief.scopeCandidate`; the adapters and readiness read `brief.scope.nodes`; only `confirmScope` moves nodes across. Asserted against real PostgreSQL.
6. **Can research silently overwrite user-edited scope?** No. A candidate never writes to the confirmed scope, edits withdraw confirmation, `removedLabels` keeps a removed unit unticked on a later candidate with a sentence explaining why, and confirmation defaults to the student's selection.
7. **Can a user completely disable external research?** Yes — "Use only what I give you" persists on the brief, refuses research before any provider call, disables the button, withdraws any pending candidate, and leaves manual/paste/upload plus generation fully working.
8. **Can a PDF/photo/pasted outline become a reviewable hierarchy?** Yes: pasted outlines and text PDFs parse natively; images and scans go through the vision path; all three become the same `ScopeCandidate` reviewed by the same surface.
9. **Can import infer preparedness or mastery?** No. Nothing in the import or research path writes preparedness, confidence, priority or mastery, and a test asserts those fields do not exist on a candidate.
10. **Is large scope coarsened meaningfully before segmentation?** Yes — Phase 1's rule is preserved and now fed by researched scopes: preserve every leaf, form chapter units first, segment only as a last resort.
11. **Is anything silently truncated?** No. Provider findings truncate with a visible `[truncated]` marker, documents report the pages actually read plus a reason, outlines report `OUTLINE_TOO_LARGE`, and every partial case sets `partial` and says so in the student's copy.
12. **Does a stale research result fail safely?** Yes. Every candidate carries the brief digest it was computed against; reuse requires the same question *and* the same brief; a stale candidate is never applied or silently rebased.
13. **Is research bounded in retries and time?** Yes: one attempt, at most one justified retry, a 20 s timeout, real cancellation, no recursive browsing, and a cache hit for a repeated question.
14. **Is a dedicated `plannerResearch` quota actually needed based on measurement?** Not yet — one bounded, user-initiated, cacheable provider call per operation is closer to a single generation than to an agent (§21). The metrics to revisit that judgement already travel with every operation.
15. **Does generation still use the Phase 0–6 Planner Modes engine?** Yes. Confirmed scope goes through the same adapter and the same generation pipeline, with no new generator and no raw page text ever reaching a model.
16. **Does Planner still open to Classic by default?** Yes, unchanged and re-verified.
17. **Are Planner Modes still permanently available without configuration?** Yes; no flag exists, and the coexistence suites pass unchanged.
18. **Are Phase 1 Quick Plan and Advanced setup preserved?** Yes — weekly hours, the Plan Brief, readiness, refresh recovery, `Customize days` and Advanced setup all behave as before, with the scope section gaining the new paths rather than replacing the manual one.
19. **Is the coexistence architecture unchanged?** Yes; this phase touched neither the navigation nor the gating.
20. **Is UX Phase 3 safe to begin?** Yes, with §29's first item settled first: run the live research smoke with credentials before building a preparedness matrix on top of scopes whose real-world discovery quality has not been observed.

---

## Stop gate

| Condition | State |
| --- | --- |
| Grounded source URLs honestly preserved | ✔ (§6, two suites) |
| Hardcoded research model fixed | ✔ (`GEMINI_MODELS.research`, tested) |
| Known exams can research a candidate scope | ✔ implemented and unit-verified; live verification outstanding (§26) |
| Users can import or paste a syllabus | ✔ (PDF, image, paste) |
| Candidate hierarchy is reviewable | ✔ (ScopeReview + SourcePanel) |
| Research/import require explicit confirmation | ✔ (server-enforced, DB-tested) |
| Confirmed scope flows through Quick Plan into the existing engine | ✔ (DB test generates with the confirmed, edited scope) |
| Fallbacks work when research fails | ✔ (per-code copy and next actions) |
| Classic remains the default Planner surface | ✔ |
| Planner Modes remain permanently available | ✔ |
| No availability feature flag reintroduced | ✔ |
| Measurements, tests and report complete | ✔ (live smoke excepted and stated) |

**Stopped here.** Not begun: curriculum comparison, overlap mapping, preparedness matrix, Copilot, natural-language actions, editing-relaxation rollout, public redesign. Awaiting review before UX Phase 3.
