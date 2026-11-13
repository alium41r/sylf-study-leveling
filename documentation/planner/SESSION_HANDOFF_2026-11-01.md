# Sylf AI-first Planner — current session handoff

**Prepared 1 November 2026, Asia/Karachi, at the user's explicit request to pause implementation and reset context.**

**Resumption update, 2 November:** the missing full regression gate subsequently
completed with 424 V2 + 225 legacy = 649 passes, no required skips and unchanged
run source pins. See the [updated efficiency report](reports/2026-10-30-research-efficiency/README.md#verification).
The pause-era verification statements below remain historical; they must not
override that newer receipt. A successful real-model journey is still separate.

**Later 2 November continuation:** the user authorized frontend-only simplification. A user-submitted live request returned one settled Research response but stopped on a database lock timeout. The preview writer was corrected and the UI simplified without changing the backend workflow or native work. See the [latest report](reports/2026-11-02-workflow-ui/README.md) for the subsequent real Research success, capacity recovery, strict JSON repair correction and autonomous live retry. The 3 November report is the newer execution record. The earlier instruction to leave frontend markup untouched is superseded only within this newly authorized UI scope.

Read this document first in the next session. It transfers the current work, user priorities, implemented architecture, actual evidence and unfinished verification. It supersedes historical status statements such as “begin Phase A” in older handoffs. It does not replace the underlying contracts or authorize a deployment or new paid experiment.

## 1. Immediate state and objective

The user asked to stop development **for now** and prepare this comprehensive handoff plus a short resumption prompt. Do not infer that writing this document resumes implementation. Resume when instructed in the new session.

The overall product objective is a usable student-facing AI Planner inside Sylf:

**Conversation → Research & Understanding → necessary clarification → natural study strategy → faithful translation → deterministic calendar allocation → independent review and substantive refinement → inspectable proposal → explicit student confirmation → atomic application.**

The architecture and this headless workflow are technically implemented. The student workspace is implemented and connected. Current work is reliability, Research efficiency and genuinely incremental display of provider output. **A complete successful real-model study plan has not been demonstrated in the retained runs described here.** Scripted service/HTTP journeys pass; those are not live model qualification.

The latest user instruction before this documentation request was to preserve their recently redesigned Planner frontend and leave the other agent's native-app work untouched while fixing the Planner. No frontend/native source was edited during the 1 November continuation.

## 2. Pay particular attention to the user's complaints

These are requirements and context from the user, not incidental UX observations. Do not repeat the earlier pattern of investigating extensively while leaving generation unusable.

| User concern | Required response / current position |
| --- | --- |
| “Make it available” after seeing **Planner preview is unavailable** | The workspace must be accessible in the intended local development environment. Diagnose activation/readiness honestly; do not remove the checks or silently enable unfinished production functionality. |
| **Start planning** disabled because the worker was unavailable/incompatible | Check the real compatible worker, runtime and readiness connection. There is now a known local port collision with native Expo; see §10. A polished page with an unusable button does not satisfy the task. |
| Repeated “planning stopped at preflight/research” errors | Fix the actual pipeline/contract/persistence defects. Preserve retained work and provide understandable recovery; do not tell the user the plan succeeded when it did not. |
| Repeated “how much longer?” and frustration with prolonged debugging | Give short, grounded progress updates. Do not promise an unverified completion time or repeatedly say almost done. Finish necessary fixes and checks without reopening broad architectural research. |
| Asked to use their account and keep fixing the integration-bee draft until generation works | This motivated actual-account diagnosis and earlier approved spending. The latest direction emphasizes general workflow functionality. Do not research the competition as a separate deliverable or spend indefinitely. |
| “You just need to get it working… why are you researching the integration bee draft?” | The development task is to make the whole Planner work. The LUMS plan is a reproduction case, not an invitation to manually solve its educational content. Avoid tuning only to this one case. |
| “Why are each processes separate?” Research should automatically lead to planning and subsequent stages | Roles are logical stages in one existing compiler job. There is one web process plus the existing background worker, **not an OS process per agent**. Successful stages hand off automatically. Genuine clarification, operational stops and final confirmation still require appropriate student action. |
| Wanted actual expandable thinking blocks like their reference, not canned “reading/writing” narration | Expose actual DeepSeek API-returned `reasoning_content` through the explicit opt-in adapter and owned display channel, with sensitive display redaction. Do not invent reasoning, simulate typing, call a narrator model, or substitute status messages for actual provider output. Own hidden Codex reasoning is a separate matter. |
| Thinking appeared only as a whole paragraph after a call finished | It must update while the provider response is pending. HTTP streaming must remain unbuffered through adapter, durable preview, server transport and client reader. Actual provider chunk boundaries control timing; there is no promise of one network event per word. |
| Research ran **18m28s**, drifted into planning, repeatedly reasoned about irrelevant details, consumed tokens and failed | This is the specific latest defect diagnosed below. Research must gather sufficient factual context and hand off; avoid lesson design, solving papers, repeated capacity arithmetic and exhaustive resource collecting. |
| Latest priority: “focus very much on efficiency… don't introduce token limits… maybe medium or low” | Research and translation now use LOW reasoning on **new** student-profile admissions. No generation/context/token allowances were reduced. Strategy and review remain HIGH. DeepSeek's documented MEDIUM maps to HIGH, so MEDIUM would not achieve the intended reduction. Scope prompts for every role. Measure real improvement only after an authorized real run; do not claim it from mocks. |
| User changed the frontend design; another agent is building native | Preserve both. Do not overwrite styles/markup to restore an older screenshot. Do not edit/build native or mobile as part of unrelated cleanup. Shared boundaries remain important; coordinate only if a necessary shared change is discovered. |
| Does not want more formal qualification before trying the interface | Formal Phase C educational qualification is deferred. Development previews may show imperfect/incomplete plans and reviewer issues. Approval and executable application remain strictly protected. |

The original goal prioritized exceptional educational quality over efficiency. The later user instruction **explicitly changes the immediate priority to efficiency and task focus**, especially Research, while preserving generous output capacity and meaningful education. Do not blindly reapply the historical “do not optimize yet” wording.

## 3. Read these authorities in order

1. Current user instructions and repository [AGENTS.md](../../AGENTS.md). Inspect current source and consumers before editing. There is extensive concurrent dirty work.
2. This handoff and the [current Research-efficiency report](reports/2026-10-30-research-efficiency/README.md).
3. [Student workspace contract](STUDENT_WORKSPACE.md), especially resources/recovery, reference protocol, automatic workflow, provider reasoning and focused Research.
4. [AI-first foundation contract](AI_FIRST_FOUNDATION.md).
5. [Original approved architecture handoff](AI_FIRST_PLANNER_HANDOFF.md) and [proposal](reports/2026-10-25-ai-first-architecture-proposal/README.md). Their original phase/status/priority statements are historical; do not restart Phase A or infer implementation is absent.
6. [Phase B implementation plan](reports/2026-10-25-ai-first-phase-a/PHASE_B_PLAN.md), [Steps 6–8 completion](reports/2026-10-27-ai-first-phase-b-steps6-8/README.md), and [Phase C handoff](reports/2026-10-27-ai-first-phase-b-steps6-8/PHASE_C_HANDOFF.md). Phase C execution is currently deferred.
7. [Original Phase 3 workspace report](reports/2026-10-29-student-workspace/README.md) and [workflow/reasoning completion record](reports/2026-10-29-integration-bee-recovery/WORKFLOW_COMPLETION.md).
8. The longer [integration-bee recovery log](reports/2026-10-29-integration-bee-recovery/README.md) only when investigating a relevant historical issue. It intentionally retains intermediate states and pending statements from earlier snapshots.

Reports prove their own source snapshots. `FINAL`, “complete”, an old test count, an earlier running-server statement or a UI screenshot does not prove current readiness or live-model success. The [Planner index](README.md) links the other phase reports. Avoid rereading unrelated historical material before acting.

## 4. What is implemented

### Architecture and roles

- **Research & Understanding:** accepted instructions, owned student/context data, resources/uploads, relevant public search/read, diagnostic evidence, provenance, uncertainties and consequential clarification. A durable verified dossier feeds downstream stages.
- **Study Strategist:** natural, detailed educational text through the existing DeepSeek STRATEGIST role, retained as complete versioned Strategy Documents. It does not have to think in internal blueprint schemas.
- **Sylf translation/scheduling:** AI-assisted faithful translation preserves instructions, dependencies, resources, examples, criteria, conditional/stopping behavior and uncertainty. Existing canonical blueprint validators and deterministic allocation enforce executable constraints.
- **Independent Reviewer:** checks research, strategy, translation and schedule; routes substantive correction to the responsible role, preserves issues/corrections/withdrawals and rechecks the complete revised result. No-progress cycles stop honestly with retained drafts.
- **Publication/confirmation:** only an approved, current, completely validated candidate can publish and be explicitly confirmed through the existing atomic ApplyService. Inspectable incomplete drafts are separate from executable plans.

### Phase progress

| Phase/step | Implemented status |
| --- | --- |
| Phase A foundation | Versioned strategy/translation/review artifacts, correspondence, archive/history, orchestration boundaries, resource/capacity contracts, compatibility and runtime policy. |
| B1 baseline/admission | Retained regressions stabilized, explicit compiler-v1/v2 admission/dispatch, versioned readers, old/in-flight semantics preserved. |
| B2 resources/accounting | Role-specific format/effort/context/generation admission, downstream reserves, root aggregate accounting across linked Attempts, uncertain dispatch handling, cancellation/deadlines and truthful usage/cost metadata. |
| B3 Research | Durable research/verification/dossier, source and student-evidence distinctions, clarification/continuation, existing document/PDF/OCR/safe fetch infrastructure, preferred DeepSeek Search with previous-provider fallback retained. No claim that all live search/fetch cases are qualified. |
| B4 capacity | Actual windows/rest/timezone/deadline/workload/recovery constraints, Calendar/tasks/protected work, overlap handling, immutable dossier binding, verifiable allocation, honest shortage/missing/stale/unresolved distinctions. |
| B5 strategy/translation | Full dossier/capacity → retained natural strategy → correspondence-bound activities → validation/allocation, exact provider evidence and recovery. |
| B6–8 | Independent review, routed iterative refinement, continuation, current reviewed publication/confirmation and scripted complete-journey coverage. |
| Phase C | Protocol/cases/rubric prepared; multiple bounded live experiments stopped before complete plan generation. Formal educational qualification deferred by user. |
| Original Phase 3 | Real student workspace, conversation/materials/details, research questions, progress, strategy/research/review inspection, preview, incomplete draft/issues, feedback/recovery and confirmation integration. User has since redesigned its frontend. |
| Latest reliability/efficiency work | Implemented changes described in §6. Remaining aggregate verification and an actual authorized user journey are not complete. |

There is no need to create a new Planner engine, agent manager, event database, scheduler or parallel lifecycle.

## 5. Safeguards that must remain intact

- Cookie authentication/revocation plus per-resource ownership; redirects alone are not authorization. Follow current auth owners because another agent is changing native authentication.
- Immutable accepted instructions/intent versions, requested/resolved correspondence, source applicability/provenance and exact provider responses. Never invent missing anchors, normalize invalid references into acceptance, or silently change facts/permissions.
- Existing worker leases/fences, heartbeat, takeover, cancellation, durable call identities and replay. A settled saved response resumes deterministic assembly rather than being paid for again. An uncertain dispatch blocks unsafe replay.
- Aggregate financial root: continuations retain consumed/reserved/unknown spending, immutable policy and original processing deadline. No new child/reset grants fresh resources or a new four-hour window.
- Honest completion and costs: reasoning tokens are included in completion usage, not charged twice. Preserve provider/model/fingerprint, finish reason, known/unknown cost and incomplete responses.
- Existing canonical validators, timezone/rest-day/calendar owners, currentness/CAS, protected/running/finished work, Quest/Focus integration, transactions and atomic ApplyService. A model approval never overrides these checks.
- Compiler-v1, historical revisions/archives and version-pinned v2 inputs retain their old interpretations. New behavior requires explicit profile/input versions.
- No paid test, production routing/configuration change, deployment or hosted migration during this latest efficiency fix. Do not infer available credit or authorization from old reports.

## 6. Latest LUMS failure: actual diagnosis and implemented correction

### Identify the right case

The latest diagnosed plan is **LUMS integration bee**, not the older separate `integration bee` plan:

- Plan: `873e178a-3c60-46f9-b1ff-7a90878c58e8`
- Failed Research Attempt: `be1c03d4-4852-43b4-9a6f-b8ef1ca06715`
- Financial root: `e5fd7027-de34-52b4-ad08-e6c013292edd`
- Earlier linked clarification Attempt: `3f6170bc-a470-45f6-b6b9-d1f69fe1b5e7`
- UI: `/planner/873e178a-3c60-46f9-b1ff-7a90878c58e8`

The old private helper `/private/tmp/planner-bee-progress.cjs` targeted a different earlier plan. Do not blindly reuse it. Temporary helpers may no longer exist.

Exact owned evidence is preserved in ignored, mode-restricted `backups/planner-research-efficiency-20261030/owned-latest-attempt.json`. Do not copy raw private provider traces or credentials into reports. The [bounded receipt](reports/2026-10-30-research-efficiency/evidence/latest-attempt-diagnostic.json) includes identities, usage and response digests.

### Cause of the 18-minute failure

The actual final COMPLETE response (ledger 348) was replayed against the real validator without a provider call. It omitted three required identity-field `anchor` objects and exceeded the existing 4,000-character extraction synopsis field. The one correction (ledger 350, `_repair1`) fixed the synopsis length but repeated all three missing anchors.

The repair prompt supplied generic action/wrapper/reference guidance, **not the actual validator paths and field bounds**. The model guessed at the cause and could not reliably fix it. Missing anchors were truly missing; accepting the output would have weakened provenance.

Retained provider output also showed repeated calendar arithmetic, educational planning, redundant research variants and sample-paper collection after the material accepted facts were already available. HIGH reasoning was used for all roles.

This linked root used 14 model calls plus 3 searches: **146,795 input tokens; 38,290 completion tokens, including 27,195 reported reasoning tokens; $0.081774804 estimated cost**, all settled. These include the earlier clarification Attempt. This is a catalog estimate, not an invoice, and not the total of every historical experiment. The older recovery report records a separate earlier aggregate estimate of $0.481002696; do not add overlapping/unrelated totals without reconciling ledger identities.

### Changes already in source

1. **Versioned effort policy:** `student-preview-v2` uses LOW for Research (including verification/OCR) and translation, HIGH for natural strategy/review. All previous token/context/root/call/holdback/deadline/spending allowances are unchanged. Legacy `student-preview-v1` stays HIGH; linked old roots keep their original admitted policy. New policy UUID: `1290c270-c194-4902-8d7c-104b700b7987`; legacy UUID: `59f72827-d48f-49d3-99de-4568c163313e`.
2. **Focused Research protocol:** new captures pin `researchProtocolVersion:1`; old captures retain original prompt packets. Gather facts/provenance, close named consequential gaps, stop redundant reading and hand off when sufficient. Other role prompts now state their own boundaries explicitly.
3. **Actual response contract:** Research receives JSON schema derived from `UnderstandingActionSchema`, including required identity and claim anchors. No hand-maintained competing schema.
4. **Exact repair feedback:** the single separately metered correction gets safe deterministic validator paths/types/field bounds and the actual rejected bytes. No extra unbounded retry, transport replay or invented evidence.
5. **Tool outcomes:** durable read/discovered/empty/failed outcomes identify their actual action and source refs. Prior discarded COMPLETE proposals are represented compactly without repeating full failed dossiers; exact raw history and necessary current evidence remain retained.
6. **Incremental reasoning display:** adapter opts into actual DeepSeek `reasoning_content`; provider preview coalescing is about 350 ms, with a trailing reasoning flush timer. Existing fenced Attempt payloads feed a read-only SSE workspace response with about 400 ms lightweight SQL polling. Full chronology refreshes only on checkpoint changes. No extra AI narration calls or synthetic typing.
7. **Client streaming:** `streamWorkspaceActivity` consumes frames immediately using `apiFetch`, `consumeResponseWithTimeout` and shared `readEventStream`. Ordinary `workspaceRequest` intentionally buffers JSON and must not be reused for streaming. Active blocks open; completed full traces load through the existing owned reader. Logout epoch, abort/hidden/unmount handling and fallback remain.
8. **Remaining streaming defect fixed on 1 November:** new live SQL compared one parameter with a UUID column and a JSON text reference without explicit casts. It now uses `$3::uuid` and `$3::text`. The genuine PostgreSQL paused-provider regression now passes. Its foreign-plan expected error was corrected to the existing first guard's `PLAN_NOT_FOUND`, with the rejection requirement intact.

Provider chunks are not necessarily words. If upstream buffers, the application cannot manufacture unreceived output. The implementation reduces avoidable application buffering; live delivery/speed improvement still needs a real authorized run.

## 7. Main implementation owners

Paths below are repository-relative. Read actual files before editing; many are untracked because the whole multi-phase development is still in the working tree.

| Area | Owners |
| --- | --- |
| Admission/profile/readiness/UI payloads | `lib/planner/v2/server/student-workspace.ts`, `lib/planner/v2/client/workspace.ts` |
| Existing lifecycle/compiler | `lib/planner/v2/server/{attempts,worker,compiler,compilation,generation,foundation}.ts`, `lib/planner/v2/main.ts` |
| Research | `lib/planner/v2/server/understanding.ts`, `intelligence/schemas/understanding.ts`, `intelligence/{research-reader,research-verification,ocr}.ts`; existing `lib/planner/research/` infrastructure |
| Strategy/translation | `lib/planner/v2/{server,intelligence}/natural-learning.ts`, corresponding schema, existing allocator/capacity |
| Review/refinement/publication | `lib/planner/v2/{server,intelligence}/reviewed-learning.ts`, `server/reviewed-publication.ts`, existing revision/apply owners |
| Calendar | `lib/planner/v2/server/calendar-capacity.ts`, existing `lib/calendar/planning.ts`, `lib/study-schedule-service.ts`, `lib/timezone-service.ts` |
| Provider/meter/finance | `lib/planner/v2/intelligence/provider.ts`, existing server accounting/role-accounting, `lib/ai/providers/{deepseek,text-stream,types,usage}.ts` |
| Display transport | `lib/planner/v2/server/activity.ts`, `lib/planner/v2/client/transport.ts`, `app/api/planner/workspace/route.ts`, existing shared transport/cache/SSE readers |
| Student UI — preserve current design | `app/components/planner/student/StudentPlannerWorkspace.tsx`, `PlanningActivity.tsx`, stylesheet and adjacent components; `app/planner/` |
| Targeted regressions | `__tests__/planner-v2/intelligence/understanding.test.ts`, `workspace/{contracts,activity,transport}.test.*`, PostgreSQL `understanding.postgres.ts` and `role-resources.postgres.ts`, existing AI provider-streaming tests |

The latest source diff within this continuation was limited to the live SQL casts and the ownership test's expected existing error, plus documentation/local configuration. The other efficiency/streaming changes were already present from the earlier part of this task and were retained.

## 8. Verification: exact status at pause

### Verified on the 1 November continuation

- Node **24.22.1**, supported major 24. Default shell `node` was **26.7.0**, which is unsupported by the worker build/runtime guard. Do not change the repository to Node 26 to hide this mismatch.
- **512 unit tests / 48 files passed** with `npm run test -- --run __tests__/planner-v2 __tests__/ai/provider-streaming.test.ts`. An earlier narrower run passed 448; these overlap and must not be added together.
- `npx tsc --noEmit` passed with temporary `NODE_OPTIONS=--max-old-space-size=8192`.
- Scoped ESLint passed for changed Planner backend/contract/transport owners and relevant tests.
- Existing worker build passed.
- Next.js production build passed with the same temporary 8 GiB heap allowance. This invocation used the Next CLI directly; it is recorded as such, not as a fresh native/mobile build.
- **26 targeted role-resource/streaming PostgreSQL + 225 retained legacy = 251 passed**, zero required skips, unchanged source pins. This includes two actual adapter deltas visible through genuine SQL and SSE **before** completion/usage settlement, then exact final retained text and ownership rejection. The upstream response is synthetic; no paid call.
- Authenticated actual-account browser read confirmed the correct LUMS draft, retained failure/expiry and new request's LOW/HIGH settings. **No authorization was submitted.**
- Isolated, visibly labelled scripted display checks against the redesigned UI passed at desktop dark, phone 390×844 with a light custom background, and desktop 1440×900 light mode with a dark custom background. Received text appeared in an expanded block without horizontal overflow. The fixture tab/server were closed and viewport reset.
- 529 frontend/native/mobile source files were snapshotted; the comparison showed no changes during this continuation. This is a dated preservation observation, not a guarantee that the other agent cannot make later changes.

Receipts are under [checks-2026-11-01](reports/2026-10-30-research-efficiency/evidence/checks-2026-11-01/verification.json), [targeted PostgreSQL](reports/2026-10-30-research-efficiency/evidence/2026-11-01-stream-recheck/focused/postgres-harness-run.json) and its source-pin receipt. Actual-design and explicitly scripted screenshots are under that report's `evidence/ui/`.

### Not verified / interrupted

The earlier 30 October full run retained **423 V2 passes, 1 streaming failure, and 225 legacy passes**. Its source pins were unchanged. Those failed receipts remain at `evidence/final-postgres/`; do not overwrite them or call that run green.

After fixing the SQL casts, a **new full PostgreSQL run was started** for `evidence/2026-11-01-full-postgres/`. At pause there is **no final completion/result receipt**. Its previous exec session is unknown and its known OS processes are no longer alive. The log contains no final result. Treat this as **interrupted/unverified**, not passed and not a demonstrated new test failure. The verification JSON's `postgresFullStatus: PENDING` reflects this absence. Expected bank at that snapshot: **424 V2 + 225 legacy = 649 required checks**; verify actual current case identities/counts on rerun.

The earlier workflow snapshot had 647 passing PostgreSQL checks, and earlier phase snapshots have other totals. Those are historical evidence, not substitutes for the missing final run. Read source-pin manifests and preserve failed/intermediate evidence.

No paid call, hosted migration, production deployment or native/mobile build was performed for this latest efficiency continuation. Earlier mobile checks in older reports are historical only. Full shared-provider lint may still have retained explicit-`any` findings on untouched lines; scoped Planner lint passing is not a claim that all repository lint is clean.

## 9. Remaining work, in dependency order

When the user resumes implementation:

1. **Inspect current dirty state without resetting it.** Preserve the new frontend and native agent's changes. Read this handoff, the latest report and current owners. Check whether another session has since completed verification or changed these files.
2. **Resolve the final verification status.** Look for a completed `2026-11-01-full-postgres` receipt/source pins first. If absent, rerun the existing isolated full bank into a new evidence directory. Fix genuine failures without weakening assertions/deadlines/provenance. If source changes concurrently, distinguish test results from a clean pinned qualification.
3. **Check local readiness.** Both known Planner web/worker processes were gone at the final pause inventory. Do not rely on earlier “running” commentary. Confirm ports and current supported Node runtime. The configured Planner health port is 8082; Expo used 8081. Check the queue read-only before starting a worker so an unexpected queued paid request cannot dispatch unnoticed.
4. **Finish the current correction report/manifest.** Replace pending verification only from actual receipts; document blockers honestly. Do not claim current source, browser, model or quality proof beyond what ran.
5. **Verify the actual workflow through the real workspace when authorized.** The old LUMS request is expired; use the same draft's **New planning request**, not an invalid continuation or a rewritten old root. Check accepted goal/deadline/windows/rest days, current Calendar and permissions anew. New profile/input markers apply through fresh authorized admission. Do not automatically re-research the competition yourself.
6. **If live calls are explicitly in scope, preflight/account first and retain evidence.** Inspect actual input/policy/receipts, finite spending authorization, provider reachability, currentness, cancellation and sleep prevention for unattended work. Stop on accounting uncertainty or provider/operational failure. Preserve raw responses and old failures; do not create a second journal/ledger.
7. **Diagnose subsequent failures by stage and actual returned data.** Confirm Research hands its verified dossier to strategy, strategy to faithful translation, allocation to review/refinement, and final proposal to inspection. Scope prompts and schema feedback should prevent the diagnosed failure but cannot guarantee every future model answer. Keep a best honest incomplete draft inspectable; never manufacture approval to show a complete plan.
8. **Measure efficiency from actual receipts.** Compare elapsed time, calls/input/completion/reasoning usage, repeated searches and task drift for a comparable authorized run. Do not add restrictive token caps or claim speed improvement from lower configured effort alone.

Still deferred: formal educational-quality qualification, production rollout/deployment, broader adaptation work and unrelated product changes. No estimate of “percent complete” is reliable: architecture/service/UI implementation exists; actual model-driven completion/reliability is the unresolved product milestone.

## 10. Runtime, commands and operational caveats

Repository: `/Users/aliumair/Desktop/sylf`; shell zsh; user timezone Asia/Karachi. Use npm/package-lock. Read relevant Next 16 docs in `node_modules/next/dist/docs/` before framework changes. Use the Sylf UI skill if a necessary UI change is authorized, preserving the user's design.

Last supported Node binary used:

```text
/Users/aliumair/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

It reported 24.22.1. Verify existence/version; do not assume temporary runtimes persist across sessions. `.node-version` records 24.21.0, `package.json` supports major 24, and worker checks major 24.

Only the ignored local `.env.local` received:

```dotenv
# Keep the local Planner worker separate from the native Expo dev server.
PLANNER_WORKER_HEALTH_PORT=8082
```

Existing web/worker code already reads this variable. Production routing/configuration was not changed. Never print the rest of `.env.local`, database credentials, provider keys or browser authentication cookies into the chat/report. Do not stop native Expo to reclaim its port. At start it was PID 34070 on 8081; that is historical, not a safe PID to kill later.

Commands, after selecting a verified Node 24 on `PATH`:

```sh
npm run test -- --run __tests__/planner-v2 __tests__/ai/provider-streaming.test.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run planner:worker:build
NODE_OPTIONS=--max-old-space-size=8192 node node_modules/next/dist/bin/next build
# Only after queue/readiness preflight and explicit resumption:
node scripts/dev/dev-planner.mjs
```

The dev composition starts the existing web and worker together. Ready endpoint: `http://127.0.0.1:8082/ready`. Verify JSON `ready:true`, `compatible:true`, compiler versions 1 and 2. An HTML Expo page from port 8081 is not Planner readiness.

The genuine PostgreSQL harness needs Docker or an existing native PostgreSQL binary. Last disposable runtime came from the reputable npm registry package `@embedded-postgres/darwin-arm64@18.4.0-beta.17`, extracted outside dependencies under `/private/tmp/sylf-planner-efficiency-runtime/package/native/bin`. Verify it exists. Do not modify package.json/package-lock just to install a test server.

Example complete rerun (use a new evidence path rather than replacing historical receipts):

```sh
node scripts/test/test-planner-ai-first-foundation.mjs \
  --native-bin /private/tmp/sylf-planner-efficiency-runtime/package/native/bin \
  --evidence-dir documentation/planner/reports/2026-10-30-research-efficiency/evidence/resumed-full-postgres
```

Focused reproduction: add `--focused --focused-suite role-resources` and use a separate evidence directory. The wrapper retains all assertions in the selected suite plus the legacy bank. It uses a disposable source copy and audited schema bootstrap, not hosted migrations or a claimed replay of the incomplete historical migration chain. Full runs can take roughly 12–15 minutes; do not confuse this unpaid regression duration with model latency.

Avoid concurrently running Next generation/build/dev cleanup against the same generated type tree. Earlier runs encountered malformed/stale `.next/dev/types` during concurrent generation and the default TypeScript heap limit. Do not fix generated artifacts by editing application contracts or raising production limits. Current 1 November type/build checks passed with temporary command-local heap allowance.

Temporary logs and process session IDs are not durable evidence. Preserve scrubbed receipts under documentation. Never reuse stale PIDs/session IDs blindly. At final pause, the known full-test and Planner server PIDs no longer existed; no final full-test success can be inferred.

## 11. Historical operational defects already addressed

Inspect source/tests rather than reopening these as unfixed assumptions:

- C01 weekday fixture encoded Friday rest incorrectly; accepted identity/diagnostic evidence context and school-mock versus certified-board distinctions were corrected with provenance intact.
- Research action recovery now uses exact local registries and a single durable metered correction; invalid IDs remain invalid.
- Read-only views/control checks were separated from owner writer locks. Fenced snapshot preparation releases its read snapshot and rechecks a fresh committed lease; actual checkpoint writers still coordinate and revalidate completely.
- Specific heartbeat `55P03` contention recovery verifies the real committed owner/fence/lease/deadline; it does not extend expired leases or processing budgets.
- MIT 2011 PDF extraction contained NUL glyphs causing PostgreSQL `22P05`. NUL/unpaired UTF-16 characters become visible replacement markers with explicit PARTIAL gaps; original bytes/hash are retained. The MIT 2015 PDF remains unsupported by the bounded text indexer and must remain unread/uncertain evidence.
- History reads have finite 60-second client allowance; mutations retain 20-second uncertain-acknowledgement handling. This changes no AI execution deadline.
- Expired continuation is rejected before creating a child or changing facts. UI offers a separately authorized new request.
- Automatic role handoff and provider-reasoning capture/owned expansion were implemented before the current incremental-SSE fix. Do not recreate them as a second engine.

Old capacity values, account rest days, moved tasks, provider receipts and Calendar observations are historical evidence, not current accepted facts. Revalidate rather than copying the old 618-minute capacity result or treating an old date as today.

## 12. Spending, privacy and final success criteria

The conversation contains several separate C01 approvals and later integration-bee debugging approvals, including $1.75 ceilings and broader statements allowing unattended DeepSeek use. They are not an unlimited reusable balance or authorization to repeat formal C01 qualification. Prior root estimates are not invoices. Before any new live dispatch, determine the specific current authorization/ceiling, reconcile known/unknown spend and use existing durable admission/accounting. The latest efficiency work itself used **zero paid calls**.

The user previously requested sleep prevention during unattended paid work. If such work is resumed, maintain it for that execution and clean it up afterward; do not assume a historical `caffeinate` process is still running. Do not use current handoff creation as a reason to launch AI work.

Current implementation work is complete only when its final required checks are honestly resolved and the corrected local workspace can run the intended authorized workflow. Product success additionally requires a real model journey to produce a complete or honestly incomplete inspectable proposal, with all stages connected and retained. If review finds educational defects, show the draft/issues and allow appropriate refinement/feedback. Only an independently approved, current candidate may become executable after explicit student confirmation.

**Do not report a generated real-model plan, educational qualification, improved latency, production readiness, or a green 649-check final run until the corresponding evidence actually exists.** Preserve the user's frontend and the native agent's work throughout.
