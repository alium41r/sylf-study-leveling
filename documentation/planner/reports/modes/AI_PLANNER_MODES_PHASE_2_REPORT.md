# Sylf AI Planner Modes — Phase 2 report

Date: 25 September 2026. Scope: gated Exam Planner only.

Phase 1 remains the persistence, quota, capacity, lineage and materialization foundation. No Exam tables, migration, Quest type, scheduler, provider layer, mastery update or public rollout was added. Roadmap, expansion, Mastery and adaptive replanning remain unimplemented.

## 1. Exam Planner UX implemented

The existing System `PlannerTab` now selects the Exam experience when the authenticated server capability reports `PLANNER_MODES_ENABLED=true`. The flow is mode choice → subject → confirmed scope → exam date → explicit availability → covered/confidence/difficulty → optional details and assumptions → generation → sealed review → edit → confirm ordinary Quests.

`AiPlannerModal` opens an accessible quick entry to `/system?tab=planner`. There is no second planner page. The enabled branch does not invoke the legacy completion callback when a draft is ready.

## 2. Exam UserInput contract

`lib/planner/exam-fields.ts` adds strict optional Exam metadata to `UserInputV1`. New generation requires it; existing Phase 1 snapshots remain readable without injecting defaults or changing old digests.

Metadata includes subject name and optional owned Subject ID, exact topic labels, covered status, confidence 1–5, difficulty, format, preferred minutes, optional mock duration, exam-day permission, standard/triage choice and explicit acceptance of reduced reserve. Scope text must equal the confirmed topic list. Duplicate labels and oversized inputs fail validation.

Availability comes from explicit weekday minutes. Saved fixed rest days prefill the form; fixed/floating rest days and existing Quest workload remain authoritative on the server. `dailyGoalMinutes` is not used as available capacity.

## 3. Exam AI strategy

`lib/ai/planner/exam.ts` uses the existing `LLMFactory`, adapter interfaces and configured models: DeepSeek planner, then Gemini flash as the sole fallback. It sends only the user's confirmed synthetic or real scope and deterministic usable dates/minutes, with no search tools or external syllabus enrichment.

The strategy requests overlapping coverage, consolidation, practice and readiness, working back from the exam. Covered, confident and mastered are explicitly separate concepts. It never assigns rewards or execution identities.

## 4. Structured-output contract

The existing strict `ModelProposalV1` is extended with the eight Exam intents, stage, brief educational rationale, optional justified relearning reason and related-topic references for mixed practice. New Exam proposals use exact `tN` scope tokens and `iN` item tokens, no milestones, and no database identities or extra fields.

The pipeline is bounded JSON → Zod → scope/semantic/capacity validation → application UUID assignment → shared draft validation → immutable sealed revision. Raw provider text and candidate reasoning are neither persisted nor streamed. The shared 32 KiB input, 256 KiB payload, 50-topic, 60-item, 15–240-minute item and 365-day horizon bounds remain.

## 5. Semantic validators

`lib/planner/exam-policy.ts` enforces:

- Exact confirmed topics, valid references, valid intent/stage pairs and brief rationale.
- Coverage for unseen topics; covered-topic relearning only with explicit justification.
- Per-topic recall/review and practice, plus mistake review for low-confidence topics.
- Later-date recall for standard plans of at least four calendar dates.
- Dependency order, including same-day order; valid dates and exam-day rules.
- Mixed practice for multiple topics over at least seven dates, required requested mocks and final review close to the exam.
- Overlapping stages when there are multiple unseen topics over a longer horizon.
- Conservative per-topic work floors, capacity and explicit removal/exclusion semantics.

The estimates are planning heuristics, not academic proficiency or mastery measures. No SubjectNode is modified.

## 6. Feasibility/capacity behavior

Preflight returns structured `POTENTIAL_FIT`, `INFEASIBLE` or `SEGMENT_REQUIRED` information: available minutes, coarse estimated work, reserve, available days, minimum item estimate, reasons and explicit choices. Potential fit is not a promise that a valid schedule exists; generation must still pass all final checks.

Tomorrow requires an explicit triage choice. Zero usable dates, insufficient capacity, an oversized mock and scopes beyond the item ceiling are rejected before reserving quota. Choices include increasing availability, reducing confirmed scope, changing the date, choosing triage or manually selecting smaller Exam segments. No automatic rolling expansion or dropped chapters is provided.

Final validation is repeated when sealing and confirming. Existing work, fixed/floating rest, blocked dates, capacity and changed schedule snapshots cannot be overruled by the model.

## 7. Recovery reserve behavior

The visible default is 15%, calculated deterministically per day through Phase 1 capacity validation. The form permits edits from 0–50%; below 15% requires an explicit acceptance checkbox and corresponding server input. The review displays the percentage and protected minutes. The reserve remains unallocated capacity; it is not represented as fabricated recovery Quests or whole-day claims.

## 8. Generation operation lifecycle

`POST /api/planner/generate` authenticates with the existing cookie session, validates the bounded request, verifies owned references, creates/reuses the Phase 1 plan shell and acquires/reserves one revision operation. Generation creates no Goal or Quest.

A transient `acquired` result identifies the only provider worker. Concurrent same-key requests recover the same operation. The shell binds the key to the full input hash; changing the request under the same key gives a conflict. PostgreSQL tests exposed a serializable-snapshot unique-key race; the existing transaction wrapper now retries the documented Prisma adapter's planner identity collisions within its existing bounded retry loop.

Progress events contain only application IDs, sequence, fixed stage/status and bounded counts. Stages reflect capacity checked, generating, validating the proposal, saving and ready/failed/cancelled. There are no percentages, prompts, academic content or reasoning events.

## 9. Quota/provider behavior

The existing `UserQuota` receipt lifecycle reserves once and atomically settles with a sealed draft. Failure/cancellation releases the original reservation once. Repeated recovery, generation and cancellation cannot charge or refund the same operation twice. Review/edit/confirmation does not reserve a generation charge.

The maximum provider pattern is initial → one validation repair → one fallback, all within a 90-second total deadline under a 120-second route window. A provider transport failure skips the repair. Every result goes through the same validators. Additive `singleAttempt` adapter options disable DeepSeek's thinking retry, Gemini's model/SDK retries and Groq's model/SDK retries for this strategy; legacy defaults are preserved. Numeric provider usage uses the existing logger with quiet failure handling.

For this single-attempt Exam call, Gemini 2.5 Flash receives `thinkingBudget: 0`, consistent with [Google's documented thinking controls](https://ai.google.dev/gemini-api/docs/generate-content/thinking). The adapter exposes only a bounded finish-reason enum; `MAX_TOKENS` is rejected before parsing. The prompt requests concise descriptions and rationale. Adapter tests verify the options, signal, output limit and unchanged legacy defaults. These measures bound generation; they do not establish provider reliability.

## 10. Cancellation/recovery behavior

The request signal and operation deadline reach each provider call. An abort race rejects late results even when an SDK ignores its signal. Sealing checks cancellation inside the transaction; durable cancellation also wins against a later worker in another process. In-process cancellation additionally aborts the live request. An already sealed operation is recovered as ready.

`/api/planner/recover/[key]` resolves an owned operation from the original request key. Existing plan/operation recovery remains available. Explicit cancellation or lease expiry refunds atomically. Cleanup can release an already reserved operation even if the feature gate switches off while it runs.

EOF or a lost ready event always leads to durable recovery; it never means success by itself and does not start another provider request. The client retains form inputs during cancellation and keeps only the opaque operation key in session storage. Academic form/draft content is not persisted in browser storage.

## 11. Review/edit/confirm UX

Review includes title, exam date/timezone, available/study days, total work, recovery reserve, topic representation, assumptions/warnings and individual stage/intent/date/duration items. Details expose title, date, duration, order, lock/unlock and removal controls. Edits append an immutable `EDIT` revision with stable item identities. Locked items must be unlocked before changes. Invalid edits cannot be confirmed.

Full-topic exclusions require explicit acknowledgment. Confirmation selects all remaining validated Exam items, preventing partial selection from bypassing the educational checks. It calls the Phase 1 transaction and uses the authoritative receipt and existing cache invalidation. The success state links to ordinary Focus and Quests and retains plan review.

LIVE, DETACHED and DELETED lineage is shown. Materialized items are not editable through this UI. Stale/schedule/execution conflicts are surfaced for review; completed, active, deleted or detached work is not overwritten or recreated. Reconciliation remains Phase 5.

## 12. Existing Sylf integration

Materialization still creates ordinary PENDING Quests with canonical difficulty/rewards, matching `targetMinutes` and `requiredMinutes`, an optional owned Subject, and no SubjectNode. It does not mint XP or Sylph. Existing Dashboard, Quests, Calendar, Focus, session settlement, streaks and deadline behavior remain the execution path.

The new DB test confirms a generated/edited Exam draft, starts its Quest through the existing `start_study_session` RPC, settles its 45 minutes through `settle_study_session_atomic`, and replays settlement to verify unchanged XP/Sylph/study totals and ledger count. The browser confirmation check resolves the ordinary `/focus?questId=...` link.

## 13. Accessibility/mobile result

Labels wrap every field; errors are associated with forms/edit fieldsets. Steps move focus to their headings. Progress uses a restrained polite live region. Buttons and primary controls have 44px minimum targets and visible focus. Native date segments support keyboard entry. The new quick modal uses native modal-dialog focus containment, Escape cancellation and return focus.

Browser verification used the actual shared component with synthetic API fixtures: 360px dark and 390px light layouts, draft review, keyboard progression/date entry, explicit availability, generation, confirmation and the Focus link. A wider layout displays summary columns correctly. Automated UI tests cover progressive disclosure, focus, explicit availability, cancellation/input retention, saved edits, confirmation and gate selection. Axe found no violations in the tested wizard state; color contrast was visually checked rather than asserted in jsdom. New UI has no required animation and includes a reduced-motion override.

## 14. Telemetry/privacy

Content-free events cover mode selection, generation start/completion/failure, feasibility warnings, cancellation/recovery, edits and confirmation. Metadata is limited to fixed mode/version, opaque application UUIDs, bounded counts and latency; numeric provider usage remains in the existing usage logger.

Draft routes use private/no-store responses, existing cookie/tokenVersion authentication and ownership checks. No client Prisma, service-role exposure, mobile Bearer auth, draft Realtime publication, syllabus logging or provider payload logging was introduced. The normal mobile bundle verifier passed with mocks disabled and no server-only symbols/secrets. Both tracked-file and planner tracked/untracked secret scans passed.

## 15. Provider smoke-test result

Controlled tests used synthetic topics and existing development credentials, without outputting credentials or model content.

- Configured DeepSeek `deepseek-v4-pro` returned HTTP 402. Successful availability of that primary model is therefore not established in this environment.
- Configured Gemini `gemini-2.5-flash` returned JSON in an earlier standalone smoke test. The first bounded attempt did not produce a validated proposal and failed closed; a second bounded attempt passed the full Exam validators in approximately 35 seconds. That standalone test made no database writes.
- Malformed output repair, exhausted repair/fallback, timeout, propagated abort and an SDK that returns after abort are covered by deterministic strategy tests.
- Durable recovery, lost delivery, cancellation/refund, single-worker concurrency, replay and confirmation are verified against disposable PostgreSQL.

The final live-provider + disposable-PostgreSQL smoke test failed after approximately 35 seconds: DeepSeek returned HTTP 402 and Gemini returned HTTP 503. The operation was durably `FAILED`, with zero Quests before confirmation and zero confirmed Quests. Its success assertion therefore failed; it is not counted as a passing end-to-end run. No successful live-provider → sealed database draft → confirmed Quest chain has been demonstrated. Deterministic provider fixtures verify that chain against real disposable PostgreSQL, while the earlier standalone smoke verifies one live proposal. Timeout, abort and repair behavior are verified with deterministic adapters, not claimed as live-provider timing guarantees.

## 16. Tests/build result

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npx prisma validate` | Passed |
| Disposable PostgreSQL planner harness, final live run | 101 passed; 1 live-provider smoke failed on HTTP 402/503; 1 standalone live smoke skipped |
| New gate tests | 3 passed, included in the planner total |
| Provider option / Exam / existing provider contract tests | 37 passed; includes 3 new adapter-option tests |
| Full repository suite | 1,261 passed; 7 failed; 56 skipped, plus a timed-out suite hook under competing build load |
| Rerun of the four affected non-DB test files, one worker | 122 passed; no remaining failure in those files |
| Four hosted Focus-background DB tests | Existing `ENOTFOUND` Supabase DNS failures, also documented in Phase 1; not modified |
| `npm run audit:secrets` | Passed; additional tracked/untracked planner scan also passed |
| `npm run mobile:build` and `npm run mobile:verify` | Passed; mocks disabled; no server-only symbols/secrets |
| `npm run build` in shared checkout | Compilation and TypeScript passed; failed on missing shared `.next/server/pages-manifest.json` while another development server was active |
| `npm run build` in isolated current-source copy | Passed completely, including the final Gemini option changes; compilation, TypeScript and static generation completed with exit code 0 |

The isolated build used the same package, dependencies and source, with a temporary Turbopack root adjustment solely to resolve the shared dependency directory. Final comparison found no Planner source differences between the build copy and the working tree. The repository's Next configuration was not changed. Existing legacy planner, Quest, Focus/session, Calendar/rest, security and mobile regression suites were included in the full run. The final additional secret scan covered 49 Planner/report files, including untracked files, with no credential-pattern matches.

An earlier attempt to start the final elevated build was not executed because automatic approval review hit its usage limit. The subsequent approved run completed successfully. Planner-scoped whitespace checks pass; unrelated existing working-tree whitespace findings were left untouched.

## 17. Deviations from Phase 0/1 and justification

These are additive extensions, not a replacement foundation:

- Optional v1 metadata preserves historical sealed snapshots/digests.
- Related-topic references permit explicit mixed practice; soft removal retains sealed identities and exposes exclusions.
- A transient acquired flag and terminal stop service connect the existing operation/quota model to real generation.
- Adapter single-attempt controls prevent nested retries without changing legacy defaults.
- Planner-specific unique-constraint retries address the concurrency race demonstrated by real PostgreSQL testing.
- Deterministic conservative work floors and explicit manual segments implement the bounded pilot rather than claiming a mathematically optimal or academically complete schedule.
- Recovery by request key handles a disconnect before the client receives a plan ID. Only that opaque key is retained in session storage.

No schema or historical migration was edited. Before changes, relevant source was reconciled with the Phase 1 report and a working-tree snapshot. Subsequent unrelated settings, Calendar, Goals, System shell, audio, mobile, motion and Focus edits were preserved. The concurrent FocusScreen change is a workspace data attribute; its Quest loading and required-minute logic remain unchanged. The legacy planner route hash still matches Phase 1. The final audit also found and reviewed a concurrent AI orchestrator change replacing hardcoded Gemini model strings/display labels with `GEMINI_MODELS.default`; it was preserved and is included in the successful build. Phase 2 itself does not edit the legacy orchestrator.

## 18. Remaining blockers before Phase 3

Keep the feature gated and review Phase 2 before beginning Phase 3. Resolve the primary provider's HTTP 402 and establish reliable fallback availability after its latest HTTP 503. Repeat the live-provider/database confirmation smoke when the environment is available; one earlier valid live proposal is not a reliability/SLA claim. Recheck the target environment's migration ledger/schema and apply the existing additive planner migration through the normal reviewed Prisma workflow before enablement.

The historical missing-`ItemCategory` bootstrap gap remains untouched. The disposable DB harness uses the audited pre-planner schema plus unchanged existing security/settlement migrations and the unchanged planner migration. It is test infrastructure, not a substitute production migration chain.

Public launch, automatic schedule changes, Roadmap/Mastery implementation and execution reconciliation are outside this phase.

## Explicit stop-gate answers

| Question | Answer |
| --- | --- |
| Can a user create a real Exam plan end-to-end? | The complete path is implemented and passes with deterministic provider fixtures against real PostgreSQL, including ordinary Focus settlement. One live standalone proposal passed validation, but the latest live-provider/database run failed on HTTP 402/503, so successful live end-to-end creation in this environment is not established. |
| Does generation create zero live Quests before confirmation? | Yes. Generation writes only the plan shell, revision operation and quota receipt. DB tests assert zero Goals/Quests before confirmation. |
| Can the model overrule capacity/date validation? | No. Server validation applies before sealing and again at confirmation. |
| Can an impossible plan appear feasible? | A coarse preflight can only report potential fit. An invalid schedule cannot become a sealed/confirmed feasible plan; the server rejects it. This does not guarantee academic sufficiency. |
| Can lost network response duplicate generation? | No when recovering/retrying the original request key. Only the acquiring transaction can invoke the provider. |
| Can confirmation duplicate Quests? | No. Exact receipt replay and transactional lineage constraints preserve one Quest per item identity. |
| Can Exam Planner overwrite completed/deleted/detached execution? | No. Existing conflict checks, immutable baselines and tombstones remain; this phase offers no reconciliation shortcut. |
| Does the resulting plan execute through ordinary Focus/Quest systems? | Yes, including the existing atomic session/reward settlement and replay behavior. |
| Is legacy behavior unchanged when the feature flag is off? | Phase 2 retains the existing panel/modal branch and legacy endpoint; gate tests cover selection and the legacy endpoint hash is unchanged. The separate concurrent orchestrator model-configuration change described above was preserved. |
| Is Phase 3 safe to begin? | Await Phase 2 review and an explicit next-phase request. The shared foundation is preserved; provider/environment and deployment checks above remain prerequisites for enablement, not permission for a public rollout. |

Phase 2 stops here. No Phase 3–5 work or production enablement is included.
