# Phase 2 — Step 3 completion and integration contract

4 October 2026. **COMPLETE** for Workstreams D/E: P2-02, P2-07, P2-08, P2-09 and P2-10 in the [approved roadmap](IMPLEMENTATION_PLAN.md) and [requirement map](REQUIREMENTS.json). Phase 2 remains in progress. Step 4 Blueprint/allocation, Step 5 compiler orchestration/production handler activation and Step 6 final API/corpus qualification remain pending. No Phase 3 UI or Phase 4/5 product work is included.

The [Step 3 gate](evidence/step3-gate.json), [PostgreSQL run](evidence/step3-postgres/postgres-harness-run.json) and [source pins](evidence/step3-postgres/step3-source-pins.json) qualify this implementation separately from Steps 1/2 historical evidence. The [starting snapshot](evidence/step3-baseline.json) was captured before Step 3 edits.

## Implementation and ordering

Work followed the approved dependencies: supporting Plan artifacts/guards; assistant reasoning on Step 2 context/metering; runtime-safe existing retrieval/excerpt/PDF owners; bounded research and independent verification; genuine private document access and fenced adoption. Tests accompanied each workstream; the final gate reruns their combined regressions.

| System | Implemented behavior and files |
| --- | --- |
| Supporting persistence | `PlannerPlan.conversation` and `researchDocuments` extend the existing Plan. Conversation CAS advances only `conversationVersion`. Migration `20261004000000_planner_v2_assistant_documents` adds byte/count/shape guards and immutable document receipts. Prisma was regenerated; `SCHEMA_BUILD_VERSION` advances 26→27. Worker readiness checks the supporting fields/guards. No workflow table was added. |
| Assistant | `server/assistant.ts`, `intelligence/assistant.ts` and supporting intake/conversation schemas implement bounded reasoning and separate explicit action admission. Advice can write conversation and usage, never execution or planning state. |
| Research | `server/research.ts` produces Step 1 research/checkpoint artifacts within the existing Attempt. `intelligence/research-reader.ts`, `research-verification.ts`, `research-cache.ts` and `ocr.ts` provide bounded reading, provenance, independent support/applicability review and targeted OCR. |
| Existing owners | PDF parsing, literal excerpt verification, safe fetching and search dispatch move into `pdf-runtime.ts`, `evidence-runtime.ts`, `search/fetch-runtime.ts` and `search/provider-runtime.ts`; original web imports remain guarded wrappers. The older unmetered research agent is not called. Existing authority, Redis/in-process fallback, storage credentials and provider routing remain authoritative. |
| Owned documents | `server/documents.ts` uses the existing storage client with a private `planner-documents` bucket. Plan upload receipts, exact owner/UUID paths, actual byte length and SHA-256 establish owned access/content correspondence. Ownership does not certify issuer authority. |
| Headless API | Authenticated `/api/planner/[id]/assistant` serves conversation and explicit turn/intake/preparation/research actions. `/documents` accepts bounded PDF/text uploads and exposes no storage path/URL. Existing `/operations/[key]` reads/cancels research advice against its original intent. Existing cookie authentication, ownership and durable admission flags apply. |

All paths above are under `lib/planner/v2/` unless an existing research/import owner or API is named. Frozen contracts and ApplyService/execution writers remain unchanged.

## Assistant reasoning and server permission

The model receives selected owned aliases, Step 2's authoritative bounded interview context, the current message and two recent conversation examples, with omissions disclosed. Consequential execution facts/protected dependencies and learning provenance remain authoritative. Mandatory context overflow is explicit. An interview can proceed before availability acceptance with unknown capacity; accepted global availability remains known even if legacy commitments prevent a calculable envelope. Generation still requires accepted capacity.

Responses permit zero to three consequential questions with missing/contradictory bases and concrete consequences. Accepted scope/outcome/deadline/availability cannot be requested as missing; contradictions require supplied evidence/current-message references. One supplemental read round returns at most 30 owned Subject nodes with omitted count, or two prior immutable revision decisions. Saved curriculum is an unverified hint. Student notes accepted separately remain `SELF_REPORTED` and `demonstratesReadiness:false`; checks, timers and completion are evidence rather than consent or mastery.

The server chooses advice or explicitly requested planning mode. Advice demotes model proposals to suggestions. Preparation is a separate user action selecting a stored recommendation and exact targets; current intent, planning version, base revision and consequential context must still match. Joint proposals must name all selected targets. Intake acceptance separately selects exact proposed fields through existing intent CAS, preserving hard facts and exclusions. Models cannot mint authorization, ownership, research attestations or verified mastery.

Conversation retains at most 24 events, eight recommendations and 128 KiB. Pruning increments `omittedEvents` and removes recommendations tied to removed events. Successful same-key replay makes no model call. A deterministic owned request root prevents failed retries from resetting spent usage; a dispatched turn without a saved reply requires an explicit new turn.

Interpretation, supplemental responses and fallback share two external model dispatches and a 30-second foreground window. Ordinary advice uses chat entitlements. Explicit preparation transfers actual owned foreground usage/quota/counters/elapsed time once; replay returns the existing Attempt. Research-authorized advice can transfer its root into `RESEARCH_ADVICE` without granting mutation targets. No diagnostic or model output triggers admission.

## Assessment research, provenance and bounds

Public URLs come from existing search providers. Existing URL/DNS/redirect checks govern actual fetching; issuer-specific registry entries classify final hosts. Natural registered issuer names resolve through that owner. An absent issuer, generic educational domain or exam alias cannot create official status. Snippets are never source evidence. Every search fallback and HTTP hop is charged before dispatch; search response bodies are capped at 1 MiB.

A metered extraction pass identifies claims/assessment fields from actual read text. A distinct pass reviews semantic support and applicability against that text and the accepted assessment. Independently, deterministic validation proves literal excerpts in unique original page/section anchors, assigns claim IDs, validates local scope mappings and compares institution, qualification, code, component, cycle, programme, variant and subset. Fabricated excerpts, wrong selectors and unsupported claims cannot be adopted. Consequential source selectors the student has not selected remain uncertain and prompt a decision.

Authority, applicability and excerpt/support verification are separate requirements. Assessed scope/structure/weights require issuer-verified sources; secondary material can support applicable resources/course outcomes. Prerequisite recommendations never become certified assessed scope. Owned documents retain `UNKNOWN` authority. General resource research avoids an institution interview ritual. Complete assessed coverage requires both passes' completeness findings, matching identity, complete relevant sections, adopted assessed claims and no unresolved gaps. Partial/OCR findings cannot certify completeness.

| Shared allowance | Enforcement |
| --- | --- |
| Root/time | Frozen RESEARCH profile: eight model calls/300 seconds; immutable 120-second research processing sub-window. Takeover does not extend deadlines or refund work. |
| Retrieval | Eight actual search requests including fallback; 16 fetch attempts including redirects; nine retained sources. |
| Extraction | 72,000 selected characters and 40 selected PDF pages across the root; hashes, retrieval timestamps, original page/section locations and gaps persist. |
| OCR | Six targeted pages, batches ≤3; JPEG dimensions ≤1024 and size ≤256 KiB; bounded subprocess time/output, private temporary files and final cleanup. OCR/fallback share the root. |
| Follow-up/review | One focused consequential follow-up; two extraction/synthesis/review dispatches including fallback. Planning retains the later-quality token reserve. Fallback cannot bypass verification through a third unmetered synthesis. |

PDF reading indexes structure/outline/contents and the first two previews, then selects relevant sections before deep extraction. Late weighting tables are selectable; the first-page prefix is not certified as coverage. Omitted required pages, unreadable text and clipping remain gaps. HTML/text selects relevant heading blocks when full reading exceeds the allowance. Targeted scan OCR is optional; unavailable rendering preserves partial extraction. Vision input uses bounded image reservation instead of base64 prose accounting, with actual provider usage settled. Text-only DeepSeek/Groq fallbacks are excluded from OCR because their existing adapters discard images; the current vision-capable Gemini route is used.

Public content caches expire after 15 minutes with actual content hash/retrieval provenance. Verified results expire after five minutes and bind owner, complete accepted intent/dependencies, source versions, selected text and extraction. Values over 256 KiB return uncached to bound the existing memory fallback. Private blobs are not globally cached. Cached schemas and source hashes are checked before reuse.

## Durable lifecycle and owned document adoption

Research advice uses the existing Attempt, worker supervisor, accounting, heartbeat, deadlines and fences. It has zero mutation targets and immutable owned read-intent hashes. Existing RevisionService publishes its answer/evidence without an intent, revision, candidate or Quest. Reads show whether the original intent remains current after an edit; old results cannot silently attach to a new goal.

READ/EXTRACTED/VERIFIED checkpoints retain pending queries/candidates, source hashes, owner/root/request/authorization and intent correspondence. Takeover resumes saved candidates; a lost unsaved search response requires another charged request. Cancellation/supersession/expiry/obsolete fences block publication. Material planning conflicts enter `NEEDS_DECISION`; an explicit new linked Attempt retains the prior checkpoint.

Planning research adopts a derived intent only through existing atomic `RevisionService.resolveResearch`: requested intent is immutable, resolved intent binds once and joint targets resolve all-or-none. Independent semantic mappings annotate existing scope, preserve exclusions or add supported source-linked scope with server identities. Accepted hard facts remain intact; actual protected execution/current context stays authoritative. The compiler checkpoint is rebound to resolved intent/evidence/context for Step 4. Research alone leaves planning running for later compiler orchestration and cannot fabricate a candidate.

`OWNED_DOCUMENT` rejection was lifted only after actual access/content verification existed. Uploads support PDF/valid UTF-8 text, ≤3 MiB and nine immutable receipts per Plan, with idempotent keys. Reads verify an owned V2 Plan receipt, exact owner/UUID location, private bucket and actual size/hash. Blobs are reread after synthesis before publication/adoption. Foreign/missing/replaced content fails. Public intent APIs still cannot mint trusted research. External model/fetch/storage operations remain outside short coordinated writer transactions.

## Validation and reproduction

| Evidence | Result |
| --- | --- |
| [Unit results](evidence/step3-units.json) / [log](evidence/step3-units.log) | 457 passed in 36 files, zero failures/required skips. Includes Step 1/2 contracts/context/providers/checkpoints and changed legacy owner regressions. |
| [V2 PostgreSQL](evidence/step3-postgres/postgres-phase1-results.json) | 113 passed in nine suites: previous 83 required tests, 27 new service cases and three new actual headless-route cases. |
| [Current Planner PostgreSQL](evidence/step3-postgres/postgres-current-results.json) | 225 passed in 17 suites, zero failures/required skips. One pre-existing live-provider experiment is explicitly excluded from this database gate and not claimed as passed. |
| [Worker build](evidence/step3-worker-build.log) / [Node loading](evidence/step3-node-load.log) | Ordinary Node compilation and ten imports pass without Next/provider credentials. A separate compiled-process PostgreSQL case runs the actual supervisor/research handler with durable model/search/fetch accounting. |
| [Native PDF rendering](evidence/step3-native-ocr.log) | Actual `pdftoppm` renders a page whose JPEG passes shared image/input bounds. This check makes zero model calls; OCR quality is not claimed. |
| [Isolated](evidence/step3-typecheck.log), [worker](evidence/step3-worker-typecheck.log), [whole-source](evidence/step3-source-typecheck.log) checks; [lint](evidence/step3-lint.log) | Pass; no new lint errors/warnings. Whole-source checking excludes generated Next validators without writing shared `.next`. |
| [Full typecheck](evidence/step3-full-typecheck.log) / [private web build](evidence/step3-build.json) | Production compilation succeeds. Full checking retains 14 generated errors across nine unchanged unrelated owners. Private build stops at Acoustics' invalid `CURATED_SOUNDSCAPES` route export. Hash correspondence qualifies these pre-existing blockers; none is repaired here. |
| [Gate](evidence/step3-gate.json) / [preservation](evidence/step3-source-preservation.json) | Twelve frozen sources and governing inputs unchanged. The 2,496-entry Git-listed starting snapshot excludes secret-like paths and Phase 2 evidence; it is not a full filesystem snapshot. Scoped edits, derived output and unrelated concurrency are recorded. |

Required cases cover advice isolation/replay, exact/stale/foreign targets, conversation CAS/pruning, notes without consent/mastery, foreground transfer, actual authenticated headless routes, issuer/component/cycle/subset/quote/support failures, late PDF selection, private bucket/foreign ownership/hash changes, targeted OCR ceilings, joint/excluded-scope adoption, supersession/cancellation/takeover/deadline and compiled supervision. PostgreSQL services, SQL, locks, ownership, guards and accounting are real; providers/search/storage responses are fixtures. HTTP fixtures mock session identity only.

The harness creates/removes disposable loopback PostgreSQL, applies the audited bootstrap plus required migrations and touches no hosted data. It does not replay the incomplete historical migration chain from empty state. Reproduce in order:

```sh
node scripts/test-planner-v2-phase2-step3-postgres.mjs --native-bin /absolute/local/postgres/bin
node scripts/verify-planner-v2-phase2-step3-build.mjs
node scripts/verify-planner-v2-phase2-step3.mjs
```

The existing disposable Docker runtime is also supported. Source pins reject stale integration evidence. The final gate checks required suites, source/migration correspondence, native rendering, source/runtime/lint/build qualification, references and preservation. Steps 1/2 historical gates were not rerun or relabeled.

## Limitations and refinements

No governing architectural deviation was necessary. Two refinements were documented before completion: interview capacity may be explicitly unknown before acceptance, and bounded vision needs an image reservation rather than a base64 text estimate. Both preserve existing owners/frozen profiles. Runtime-safe wrappers share existing implementations.

These fixtures establish integrity and lifecycle behavior, not live educational quality, external search availability, hosted storage/Redis configuration or latency. Native rendering is exercised; OCR transcription quality remains fixture-based. Live provider/corpus qualification is Step 6. PDF encoding/CID fonts, encryption, missing usable indexes and unreadable sections remain conservative limitations with disclosed gaps. Native `pdftoppm` is needed for scans; timeouts/missing rendering retain partial results. Larger imports require a later staging path. Issuer registry coverage is finite.

Private uploads support PDF/text only. Losing/failed-upload blob cleanup is attempted; cleanup failures or account/metadata deletion can leave private orphan storage requiring operational cleanup. Removed metadata revokes the read path, and no public/signed URL is issued. Unrelated account deletion is unchanged. Research advice currently answers one Plan/assessment; planning supports joint adoption. Intake patch acceptance requires a single exact Plan binding.

Production `main.ts` deliberately retains unconfigured handlers/unready status until Step 5 composes the compiler. The research advice handler is executable and tested through existing supervision/compiled Node; default deployment activation is not claimed. Existing generation endpoint activation remains Step 6. No Planner UI is built.

## Step 4 handoff

Step 4 consumes bounded authoritative context, shared metering, resolved research intent/provenance and produced compiler checkpoints. It implements policy-aware LearningBlueprint generation, complete local-reference/scope validation, deterministic protected capacity/dependency allocation, explicit infeasibility feedback and at most one educational adaptation. Compose research without resetting budgets or weakening requested/resolved/base/context correspondence. Independent quality review/repair, production activation and final candidate/ApplyService/corpus qualification remain the later approved gates.
