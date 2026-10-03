# Sylf AI Planner — UX Phase 4 Report
## Planner Copilot + Bounded Natural-Language Control + User Release

**Implemented:** Phase 4 only (A–L of §3).
**Not implemented, deliberately:** general-purpose chat, app-wide assistant, unrestricted tool calling, autonomous mutation or replanning, background browsing, agent loops, transcript platform, embeddings, social/Focus/Quest redesign, Classic Planner chat, public enablement, arbitrary deletion of completed work, history rewriting.

---

## 1. Repository reconciliation

- `npx tsc --noEmit` was clean before any edit and is clean after; the Phase 3.1 tree is the base (`scope.provenanceSources` present and used).
- Two repository facts decided the design, and both were read rather than assumed:
  - `PlannerQuestLink.disposition` is a **String** with `CHECK (disposition IN ('LIVE','DETACHED','DELETED'))` — so `USER_RELEASED` needed a migration (see §24), and the toggle `planner_owned_guard` freezes a row once it is `DELETED`, which the same migration extends.
  - The Quest-delete trigger (`planner_quest_guard`) treats a *linked* Quest specially and writes `DELETED/USER_DELETED` on its link. Release therefore **detaches the link first**, so the following Quest delete is an ordinary unlinked delete — and the project's own tombstone is what survives.
- `.env` now contains `SERPER_API_KEY` and `SEARCH_PROVIDER` (absent in Phases 2.1/3.1), so a bounded live smoke became possible; see §34.

## 2. Copilot architecture

```
student message
  → read the intake + its bound plan        (server, authenticated, owner-scoped)
  → project BOUNDED planner state           (PlannerCopilotContextV1)
  → ONE interpretation pass                 (DeepSeek, strict schema)
  → resolve against current state           (labels → confirmed units, dates → calendar)
  → decide: answer | proposal | routing     (lifecycle table + direct-execution policy)
  → optional ONE wording pass for "why"     (over the server's own facts)
```

`lib/planner/copilot/`: `contracts.ts` (pure wire shapes), `outcomes.ts` (server vocabularies), `context.ts` (projection), `model.ts` (DeepSeek), `map.ts` (command → existing action + consequence), `proposal.ts` (signed token), `explain.ts` (deterministic facts), `release.ts` (release + tombstones), `run.ts` (orchestration), `client.ts` (transport). Routes: `app/api/planner/intake/[id]/copilot` and `.../copilot/apply`.

## 3. UI and surfaces

`app/components/planner/copilot/PlannerCopilot.tsx` — a compact disclosure mounted in Quick Plan, with a labelled composer, state-aware quick prompts, a bounded transcript (`role="log"`), a proposal region with Apply/Cancel, a clarification region, and an explanation region. One panel covers every pre-generation context (scope, comparison, matrix, generation) because they all read the same brief. Confirmed-plan work is reached through the same panel: the intake knows the plan it generated (`session.planId`), and the lifecycle shown is derived server-side.

## 4. Bounded conversation context

Eight turns maximum, 300 characters per turn, sent *by the client* with each request and truncated on the server; nothing is stored. There is no transcript table, no summary memory, no embeddings, and no replay — the planner's state is what answers.

## 5. `PlannerCopilotContextV1`

A projection, never the brief: mode, lifecycle, readiness, goal/subject, target date, today, weekly target and hard weekly/session limits, unavailable weekdays, soft preferences, up to 60 unit rows as closed states (preparedness, priority, difficult, overlap), scope-confirmed flag, background curriculum, comparison state and counts, up to 8 **retained confirmed sources**, research policy and whether search is configured, a draft summary and a confirmed-plan summary. Enforced under `COPILOT_LIMITS.contextBytes` and asserted to contain no user id, session id, URL or token.

## 6. Command schema

`PlannerCopilotInterpretationV1 { schemaVersion, intent, confidence, summary, commands[≤5], clarification, explanationRefs }`; each command is a strict discriminated variant — `SET_WEEKLY_HOURS`, `SET_TARGET_DATE`, `SET_BACKGROUND_CURRICULUM`, `SET_PREPAREDNESS`, `SET_OVERLAP_CORRECTION`, `SET_PRIORITY`, `SET_DIFFICULTY`, `SET_CONSTRAINT`, `REMOVE_CONSTRAINT`, `UPDATE_SCOPE`, `REQUEST_SCOPE_RESEARCH`, `REQUEST_CURRICULUM_COMPARISON`, `REQUEST_DRAFT_EDIT`, `REQUEST_REPLAN`, `RELEASE_GENERATED_ITEM`. Asserted: there is no field for SQL, Prisma, a JSON patch, a path, a route, a Quest id, a user id or a session id; >5 commands and unknown keys are rejected; `GENERAL_CHAT` is not in the enum at all.

## 7. Interpretation model

The existing DeepSeek Planner model (`DEEPSEEK_MODELS.planner`) through `LLMFactory`, `temperature: 0`, `response_format: json_object`, 30 s timeout, one request per pass, strict parse, no retries and no loop. Malformed output → `COPILOT_BAD_OUTPUT` (never a partial execution). §85 accounting: **1** model call for an ordinary turn, **2** when an explanation is phrased, **1** for research/comparison/draft-edit routing (the capability runs its own pipeline later), **1** for replan routing (Phase 5 runs its own generation later) — stacking is avoided by routing rather than executing in the same turn.

## 8. Hard/soft ambiguity policy

Hard vs soft is decided by the model from the student's wording (`hard` flag on the hours command; `strength` on constraints), and the *server* then requires confirmation for anything hard, so an ambiguous phrase cannot silently become a rule. `SET_WEEKLY_HOURS{hard:true}` maps to `MAX_WEEKLY_MINUTES (HARD)` and always carries `HARD_CONSTRAINT`; `{hard:false}` maps to the ordinary weekly target with no confirmation. "Never more than 90 minutes" → `MAX_SESSION_MINUTES (HARD)`; "I prefer 45-minute sessions" → `SESSION_LENGTH_PREFERENCE (SOFT)`. Genuine ambiguity is answered with one clarification instead.

## 9. Clarification behaviour

At most one clarification per turn, closed code (`HARD_OR_SOFT`, `WHICH_UNIT`, `WHICH_DATE`, `CURRICULUM_OR_PREPAREDNESS`, `SCOPE_OF_CHANGE`), up to four concrete options, and the answer is sent back as the next message. An ambiguous unit label is *detected on the server* (`resolveUnitLabels` returns `ambiguous`) and becomes a refusal the UI turns into "which one did you mean?" — the model is never allowed to pick a referent.

## 10. Command preview

Every proposal carries one deterministic sentence per command, assembled from the current brief plus the proposed value ("Weekly study time: 10h → 8h as your weekly target"; "Friday becomes unavailable as a hard rule"; "Matrices: marked weak"). The model's own `summary` is shown separately as what it understood. The model never writes the consequence text.

## 11. Atomic multi-action apply

`applyBriefCommandBatch` (in `server/intake.ts`, reusing the existing `applyToBrief`) folds every command into an in-memory brief, runs `assertInvariants`, and persists **once** through `patchSession`. One version increment; a command that refuses aborts before anything is written. Asserted: three commands change three things and move the version by exactly one, and a batch containing an impossible command leaves the brief byte-identical.

## 12. Pre-generation actions

Every brief command maps onto an intake action that already existed: `setWeeklyBudget`, `setConstraint`, `setTargetDate`, `setBackgroundCurriculum`, `bulkSetPreparedness`, `setOverlapCorrection`, `setPriority`, `setDifficulty`, `updateScopeUnits`. `setBackgroundCurriculum`, `bulkSetPreparedness`, `setOverlapCorrection`, `setDifficulty` arrived in Phase 3; nothing new was added for the Copilot. The same request through the UI and through the Copilot therefore produces the same action and the same resulting brief.

## 13. Explanation path

`explanationFacts` builds up to six facts **before** the model answers, each with an id; the model may only phrase them, and the response returns the facts as well as the phrasing, so a failed wording pass still answers. Facts cover: why a named unit is in the plan (confirmed scope, curriculum overlap, preparedness, priority, difficulty), where a confirmed scope came from, availability and capacity, soft preferences, comparison state, draft state, confirmed-plan state, previously released items. When nothing in state explains the question, the fact set says exactly that.

## 14. Provenance-aware explanations

A confirmed scope's retained sources (Phase 3.1) are quoted by publisher, type and — via `sourceTypeIsOfficial` — authority ("cambridgeinternational.org (official pdf: the verified authority for this target)"). A scope confirmed before retention existed says "confirmed without a retained source record", and no URL, publisher or authority is invented. No web call is made to explain an already-confirmed source.

## 15. Research routing

`REQUEST_SCOPE_RESEARCH` and `REQUEST_CURRICULUM_COMPARISON` become capability proposals; confirming them returns `{ route: "RESEARCH", request: { action: "researchScope" } }` (or `compareCurricula` with `force`), which the surface runs through the Phase 2.1 pipeline. No second research stack, no browsing by the model, no implicit research: a message that merely mentions an exam produces no research command.

## 16. Comparison routing

Same path, with `refresh` distinguishing "compare" from "compare again" (which maps to `force: true`, replacing the stored comparison while preserving the student's corrections).

## 17. `researchPolicy` OFF

Enforced on the server, not merely requested in the prompt: a research or comparison command on a plan whose policy is OFF is refused with `RESEARCH_DISABLED` and the copy "Web research is off for this plan. I can work only from what you have given me." Asserted on real PostgreSQL, including that no candidate appears.

## 18. No-search-provider behaviour

`researchConfigured` travels in the context, so the model is told the truth; the routed research path degrades exactly as Phase 2.1 does (`RESEARCH_UNAVAILABLE` with an honest reason), and no Copilot action depends on search being configured — the DB suite runs with no provider and every non-research test passes.

## 19. Confirmed-plan boundary

`COPILOT_INTENT_LIFECYCLE` is the enforcement table: `SCOPE_UPDATE`, `PREPAREDNESS_UPDATE`, `CONSTRAINT_UPDATE`, `DRAFT_EDIT` and the research intents are `PRE_GENERATION`/`DRAFT_REVIEW` only; `REPLAN_REQUEST` and `CONFIRMED_PLAN_CHANGE` are `CONFIRMED` only. A brief command on a confirmed plan is refused with `COMMAND_NOT_ALLOWED_IN_STATE` and the copy "This plan is already confirmed, so its structure changes through a replan."

## 20. Phase 5 replan bridge

Confirming a replan proposal returns the **exact Phase 5 request body** (`RebalanceRequestSchema`: requestKey, expectedVersion, baseRevisionId, reasonCode mapped from the student's reason, `inputChanges: []`, `scope.milestoneKey: null`) and executes nothing: no revision, no Quest change, no rebalance row. Asserted on real PostgreSQL (plan version and active revision unchanged, zero `REBALANCE` revisions). Copilot is not a second replanner, and one turn never stacks the interpretation model on the replan model.

## 21. Draft warning integration

`REQUEST_DRAFT_EDIT` resolves unit labels into concrete item edits server-side (the most substantial item for that unit, so "remove the revision session for vectors" removes the revision session) and returns them for the existing edit endpoint, which owns the Phase 3 acknowledgement exchange: the same warning codes, the same `ACK:` spellings, the same "keep my change / undo". A hard blocker cannot be turned into an acceptable warning because the Copilot never touches the validator.

## 22. Generated-item release

`releaseGeneratedItem` (in `lib/planner/copilot/release.ts`) is reachable only through a confirmed proposal. It is planner-side, transactional and model-free: eligibility is derived from the execution snapshot, re-checked against a locked Quest inside the transaction, then the link is detached and marked `USER_RELEASED`, and the Quest is deleted in the same transaction.

## 23. Release eligibility

Releasable: planner-owned, linked to the current plan lineage, `LIVE`, pending (future or overdue), no recorded time, no sessions, not in progress, not completed/failed, not locked by the student. Blocked with closed codes: `RELEASE_ALREADY_RELEASED`, `RELEASE_STARTED`, `RELEASE_IN_PROGRESS`, `RELEASE_COMPLETED`, `RELEASE_FAILED`, `RELEASE_PROTECTED` (locked), `RELEASE_CONFLICTED` (detached or conflicted), `RELEASE_NOT_PLANNER_OWNED`, `RELEASE_NOT_FOUND`. A manual Quest is not linked at all, so it can never enter this path; its own delete UX is untouched.

## 24. `USER_RELEASED` lineage and tombstones

Migration `20260927090000_planner_user_released_disposition` (staged into the disposable-DB harness) makes two additive changes: the `planner_link_bounds` CHECK accepts `USER_RELEASED` with the same shape as `DELETED` (no Quest, a removal timestamp), and `planner_ownership_guard` freezes a row once it is `DELETED` **or** `USER_RELEASED`. The link keeps `itemKey`, `baseline` and `createdRevisionId`, so the planner can always say that it created this work and that the student released it. `removalReason = 'USER_RELEASED'` distinguishes it from a manual delete in the same column.

## 25. Resurrection protection

Structural, not conventional: a non-`LIVE` disposition is never replannable (`isPlannerQuestReplannable`), never available to materialisation, and frozen for rebalancing; the release path itself refuses a second attempt with `RELEASE_ALREADY_RELEASED`. Asserted: after a release, re-reading eligibility never offers the item again, and a repeat attempt is refused.

## 26. Preference and friction interaction

Copilot can *set* an explicit soft preference (an existing `setConstraint`), which is exactly Phase 6 A3's activation path — and it cannot activate a learned preference, because nothing in this phase writes `PlannerPreference`. A one-off complaint ("this plan is too intense") becomes a proposal about the brief or a replan request, never a stored preference. Friction reasons are unchanged and no free-text friction storage was added.

## 27. Security

`plannerRoute` authentication on both routes (cookie `hunter_token`, custom jose/bcrypt flow untouched), owner scope on every read and write, `private, no-store`, no `userId`/owner id anywhere in the model's input or output, and identity derived only from the session. Proposals are HMAC-signed with `JWT_SECRET` under a domain-separated prefix (`sylf.planner.copilot.proposal.v1:`), failing closed if the secret is absent; `timingSafeEqual` comparison; the token is what the client holds, never the commands.

## 28. Prompt-injection boundaries

The system rules, the planner-state JSON, the recent turns and the student's message are separate labelled blocks, with the student's message last. Research content never reaches the Copilot at all — the extractor reads pages, and the Copilot receives only the projection (which contains no page text, only retained source *metadata*). A source page saying "ignore previous instructions" has no path into a Copilot turn, and even if it did, the model's output cannot express anything but the closed command union.

## 29. Telemetry

Events: `copilot_opened`, `copilot_message_sent`, `copilot_interpreted`, `copilot_clarification_requested`, `copilot_proposal_created`, `copilot_proposal_applied`, `copilot_proposal_cancelled`, `copilot_bad_output`, `copilot_explanation_requested`, `copilot_research_requested`, `copilot_replan_requested`, `copilot_refused`, `generated_item_release_requested`, `generated_item_released`, `generated_item_release_blocked`. Metadata passes a single closed-value filter (intents, clarification codes, error codes, confirmation codes, lifecycle states, latency buckets, outcomes), so a free-form string cannot travel even by mistake; counts are `commandCount`, `modelPasses`, `released`, `findings`, `candidacyCount`. Never logged: message text, model text, topic names, URLs, prompts, research text, Quest titles.

## 30. Accessibility and mobile

Labelled composer (`htmlFor`), `role="log"` transcript with `aria-live="polite"`, proposal and clarification regions with headings that receive focus when they appear, real `<button>` Apply/Cancel, text (never colour) carrying warning meaning, buttons ≥44 px, one-column composer on narrow screens with full-width input, and the panel is a disclosure so it never covers Generate or Confirm. No drawer trap exists because there is no overlay at all.

## 31. Performance and model-cost bounds

Context is bounded to 8 KiB and asserted; the interpretation payload is capped at 24,000 characters on the server; a turn is at most 2 model passes; intents/commands are capped at 5; the proposal token is capped at 4 KiB and expires after 30 minutes. Latency travels as a bucket only. Existing Plan Brief bounds were **not** raised (no field was added to the brief by this phase).

## 32. Tests

| Suite | Tests | What it proves |
| --- | --- | --- |
| `__tests__/planner/copilot-contract.test.ts` | 26 | no shape for SQL/patch/path/Quest id; >5 commands and unknown keys rejected; `GENERAL_CHAT` absent; target vs hard limit; soft vs hard weekday and session length; preparedness nuance without an invented confidence; overlap ≠ preparedness; unknown unit refused; ambiguous label detected; relative date resolved from the current intake; three-command batch previews and maps to three existing actions; direct-execution allowlist excludes hard rules, scope removal and release; proposal signing round-trip, tamper refusal, stale/foreign/expired refusals; context bounds and privacy; lifecycle table; grounded explanations incl. retained provenance, absent provenance, closed weekdays and "nothing grounded" |
| `__tests__/planner/database-copilot.test.ts` | 14 | direct application in one version increment; multi-command proposal → atomic apply → stale replay refused → stranger refused; impossible command persists nothing; researchPolicy OFF refused with no candidate; explanation changes nothing; one clarification, no mutation; confirmed-plan routing produces the Phase 5 request and mutates nothing; release removes the Quest and records the tombstone with lineage intact; started/completed/already-released/foreign refusals; warning (not refusal) for an educational gap; released work is never offered again |

Model stubs are used deliberately: what is asserted is the server's behaviour given an interpretation, never the model's language skill — which is the part nothing may depend on.

## 33. Real PostgreSQL results

`node scripts/test-planner-postgres.mjs`: **78 files passed, 5 skipped; 1 021 tests passed, 7 skipped** (the seven are live-provider smoke tests). Both new suites run there, including the release lifecycle and the confirmed-plan routing. The planner suite is **858 across 69 files** without a database and **1 028 across 83** with it.

## 34. Build, mobile, audit — and the live smoke

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx prisma validate` | valid; one migration added, staged into the disposable-DB harness |
| `npx vitest run` (whole repository) | **189 files passed, 2 145 tests passed, 171 skipped** |
| `npm run audit:secrets` / `audit:models` | clean |
| `npm run mobile:build` / `mobile:verify` | built; bundle verification PASSED |
| `npm run build` | compiled successfully |

**Live research smoke:** `SERPER_API_KEY` and `SEARCH_PROVIDER` are now present in `.env` (they were absent in Phases 2.1 and 3.1). A bounded live run was **not** performed in this session — the credentials' presence was detected, and the smoke remains the first pre-public item rather than something claimed as passing.

## 35. Browser QA status

**Not performed.** No browser automation is available in this environment, and jsdom renders are not browser QA. The panel's DOM contract, focus movement, labels, regions and touch sizes are asserted; layout, dark/light/custom appearance and real mobile behaviour are not, and are listed as pre-public.

## 36. Deviations

1. **A migration was required** (`USER_RELEASED`): the disposition is constrained by a CHECK and frozen by a trigger, so durable tombstone semantics could not be added inside the JSON contract. Additive, no data rewritten, staged into the test harness.
2. **Confirmed-plan Copilot is reached through the intake that generated the plan** (`session.planId`). A plan created outside an intake has no Copilot panel; that is a stated boundary rather than a second parallel surface.
3. **One confirmation unit per turn.** Brief commands and a capability in the same message are refused with `TOO_MANY_COMMANDS` and a request to split, rather than partially applied.
4. **`REQUEST_REPLAN` routes instead of executing** (§20): the Phase 5 request is returned for the client to send, which avoids stacking model passes and keeps one replanner.
5. **Direct execution is narrower than §21 permits** — one command, high confidence, allowlisted, no hard rule, no scope removal.
6. **`provenanceSources`-based explanations are only as good as what was retained**: a pre-3.1 confirmation says so.
7. **One heavy UI render was given an explicit wait.** The mastery maximum-scope test (sixty items, every text field at its bound — the heaviest render in the suite) exhausted the default one-second window under a fully parallel repository run. Its *assertion* is unchanged; the wait is now explicit at 30 s. All 189 files and 2 145 tests pass with it.
8. `SET_PRIORITY`/`SET_DIFFICULTY` from Copilot require student wording; the model is told explicitly that its own judgement is not authority, and the schema gives it no field to express one.

## 37. Pre-public carry-forward

1. **Live Brave/Serper research smoke** — the credential is now present, and this is the first thing the next phase or the pre-public pass should run; the comparison/status and research routing rules are otherwise verified against stubs and the authority registry only.
2. **Real browser QA**, desktop and mobile, dark/light/custom appearance.
3. **Public enablement decision** — untouched by this phase.

## 38. Blockers before UX Phase 5 / final integration

Nothing in Phase 4 is blocked. What the next phase should know: the Copilot's surface is intake-scoped (§36.2); proposal tokens are stateless and expire in 30 minutes (§63/§64 chosen architecture); release records `USER_RELEASED` as a first-class disposition, so a future re-offer must read `releasedItems` before proposing a replacement (§38's "acceptable" wording is not yet built — the *record* it would need is).

---

## Explicit answers

**Is Copilot a general chat assistant?** No. It is planner-only: the intent vocabulary is closed and `GENERAL_CHAT` does not exist; anything unrelated gets one line — "I can help change, explain, research or rebalance this study plan."

**Can the model directly mutate Planner data?** No. It produces one strict interpretation; the server maps it to existing typed actions, and only after the policy, lifecycle and version checks pass.

**What is the source of truth: chat or Plan Brief?** The Plan Brief. The conversation is never stored and never replayed; recent turns are labelled context that the client holds.

**How much conversation history is retained?** Eight turns, 300 characters each, sent per request and truncated server-side; nothing is persisted.

**Can Copilot create arbitrary database patches?** No — no shape exists for SQL, Prisma, a JSON patch, a field path or a route name, and the schema rejects unknown keys.

**How are ambiguous HARD/SOFT constraints handled?** The wording decides the flag; anything hard requires an explicit confirmation; genuine ambiguity produces one clarification rather than a guess.

**Can one message create multiple Planner changes?** Yes, up to five commands, previewed together.

**Are multi-command changes atomic?** Yes: folded in memory, invariants checked, one `patchSession` write, one version increment. A failing command persists nothing.

**Can a stale Copilot proposal apply?** No. The session version must equal the version being confirmed, the token carries its own version and expiry, and a mismatch is `COPILOT_PROPOSAL_STALE`; expiry is `COPILOT_PROPOSAL_EXPIRED`; a rewritten token is `COPILOT_PROPOSAL_UNKNOWN`.

**Can Copilot research without explicit user intent?** No. Research and comparison are only ever capability proposals from an explicit request; mentioning an exam triggers nothing.

**Can Copilot research when `researchPolicy=OFF`?** No — refused server-side with `RESEARCH_DISABLED`, no search, no fetch, no research model call, and the policy cannot be switched back on by the model.

**What happens without a Brave/Serper key?** The context says search is unconfigured, the routed research path degrades to the existing honest `UNAVAILABLE`, and every other Copilot action works.

**Can Copilot use model memory as replacement web research?** No. It has no browse tool, and a research request is only ever routed to the real pipeline.

**Can Copilot explain why a topic is included?** Yes, from deterministic server facts, optionally phrased by the model.

**Does it use retained confirmed provenance?** Yes; and when none was retained it says so rather than inventing one. No web call is made to explain a confirmed source.

**Can curriculum overlap silently become preparedness?** No. Overlap corrections map to `setOverlapCorrection`; preparedness maps to `bulkSetPreparedness`. Separate commands, separate actions.

**Can the model set priority from its own judgement?** No. Only explicit student wording produces `SET_PRIORITY`/`SET_DIFFICULTY`, and the prompt states the prohibition.

**Can Copilot directly mutate a confirmed plan?** No. Brief intents are refused in the `CONFIRMED` lifecycle.

**How are confirmed-plan changes routed?** As a Phase 5 request body (`reasonCode`, `baseRevisionId`, `expectedVersion`, `inputChanges: []`), returned to the client; Copilot executes nothing.

**Does Phase 5 still require explicit user confirmation?** Yes — Phase 5 generates the proposal and diff, and the plan changes only when the student confirms that diff.

**Can the student release planner-generated work?** Yes, through a confirmed Copilot proposal.

**Which generated items are releasable?** Planner-owned, linked, `LIVE`, pending, unstarted, unedited, not locked.

**Can completed/started items be released?** No — `RELEASE_COMPLETED`, `RELEASE_STARTED`, `RELEASE_IN_PROGRESS`; and work the student locked is `RELEASE_PROTECTED`.

**Is release a hard delete?** The Quest row is removed (so the task disappears from the student's work), but the planner's record is not deleted: the link becomes a durable tombstone.

**What durable lineage records `USER_RELEASED`?** `PlannerQuestLink.disposition = 'USER_RELEASED'` with `removalReason = 'USER_RELEASED'`, `removedAt`, a null `questId`, and its original `itemKey`, `baseline` and `createdRevisionId` intact — frozen by the migration's guard.

**Can a later replan silently recreate released work?** No. A non-`LIVE` disposition is never replannable, never materialisable and frozen; asserted by re-reading eligibility after a release.

**Can Sylf explicitly offer a replacement later?** The record it would need exists (`releasedItems`), but no re-offer flow is built in this phase — that is future work, deliberately.

**Are educational release gaps warnings rather than arbitrary blockers?** Yes: releasing a recall session reports `MISSING_SPACED_RECALL` (and the other completeness codes) as WARNING findings in the existing vocabulary, and the release succeeds.

**Are hard invariants still hard?** Yes: ownership, version/staleness, plan-confirmed state, quest-level guards, lineage immutability, protected execution and the migration's CHECK all remain, and none consults the Copilot.

**Is Classic Planner unchanged?** Yes — no change to Classic, to Planner Modes coexistence, or to navigation; the coexistence suites still pass.

**Were existing research/comparison/preparedness/flexibility semantics preserved?** Yes. Research and comparison are routed, not reimplemented; comparison status semantics from Phase 3.1 are untouched; the preparedness matrix and its priority/difficulty controls are untouched; the draft-edit acknowledgement vocabulary is reused rather than replaced.

**Is public enablement still deferred?** Yes.

**Is the final integration/quality phase safe to begin?** Yes, with the three pre-public items carried forward (§37) and the deviations in §36 stated rather than hidden.
