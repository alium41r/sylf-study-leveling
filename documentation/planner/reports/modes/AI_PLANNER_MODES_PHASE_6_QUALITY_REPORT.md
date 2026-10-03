# AI PLANNER MODES — PHASE 6 QUALITY REPORT

**Scope:** A2 (learning/execution quality), A3 (personalization loop), plan-quality closure, live-model reliability, and the app-wide DeepSeek V4 Pro → Flash migration.

**Status:** in progress. This report is written as work lands and is explicit about what is verified versus still open. No feature flag was enabled in committed configuration, no public rollout happened, and no Phase 0–5 safety rule was relaxed.

---

## 1. Repository reconciliation

Phase 6 builds on the repository as it stands after Phases 0–5, not on a re-reading of the reports:

* **Planner foundation (Phase 1):** `PlannerPlan` / `PlannerRevision` / `PlannerQuestLink`, the operation and quota lifecycle, tombstones, transactional materialization, Quest mutation guards. Untouched except where an addition was required (see §3, §4, §22).
* **Modes (Phases 2–4):** Exam Planner, Course Roadmap (zero-Quest strategic layer + selected-period expansion), Chapter/Unit Mastery (fixed progression, terminal check). Validators keep their own vocabulary; Phase 6 adds to them only through new optional metadata and new cross-cutting rules.
* **Replanning (Phase 5):** `DETECT → SNAPSHOT → GENERATE → VALIDATE → DIFF → REVIEW → CONFIRM → ATOMIC RECONCILIATION`, unchanged. Phase 6 changes one thing inside generation — history is now carried in the real currency (§14) — and nothing about confirmation.
* **A1 intelligence (Phase 2.5):** HARD/SOFT constraints, priority, Definition of Done, deterministic semantic gate, critic, targeted repair, all reused. The repair retry now receives an actionable instruction per code (§14).
* **Classic Planner:** `app/api/ai-planner/route.ts`, `lib/ai/orchestrator.ts`, `lib/ai/planning-engine.ts`. The only Phase 6 change is the requested model migration (§2); the architecture, endpoint, prompting, quota and persistence are untouched.

## 2. DeepSeek V4.1 Flash migration

The product decision is implemented app-wide and centralized.

**Canonical identifier, established from the provider rather than invented.** The configured provider reports its own supported models. Probed directly against `https://api.deepseek.com/chat/completions` with the repository's own key:

| Requested model | Result | Provider's echoed model |
| --- | --- | --- |
| `deepseek-flash` | **200** | `deepseek-flash` |
| `deepseek-v4-flash` | 200 | `deepseek-flash` |
| `deepseek-chat` | 200 | `deepseek-flash` |
| `deepseek-reasoner` | 200 | `deepseek-flash` |
| `deepseek-v4-flash-vision-exp` | 200 | `deepseek-flash` |
| `deepseek-v4.1-flash` | **400** — "The supported API model names are deepseek-flash, deepseek-v4-pro" | — |
| `deepseek-v4-flash-4.1` | 400 (same message) | — |
| `deepseek-v4.1` | 400 (same message) | — |

Conclusions, all evidence-based:

1. **There is no `v4.1` identifier to invent.** The provider's own canonical name for the Flash line is `deepseek-flash`, and every non-pro alias the repository used already resolves to it. The Flash line *is* the "V4.1 Flash" this migration targets.
2. **`deepseek-reasoner` and the vision experiment id resolve to the same Flash model**, so they are not V4-Pro-backed paths; they were left as they are rather than changed without instruction.
3. The shared constant was therefore pointed at `deepseek-flash`, with the repository's older `deepseek-v4-flash` alias documented rather than silently abandoned.

**One place to change.** `lib/ai/config.ts`:

```
const DEEPSEEK_FLASH = process.env.DEEPSEEK_FLASH_MODEL || "deepseek-flash";
export const DEEPSEEK_MODELS = { flash, planner, compiler, chat, focus, default } // all DEEPSEEK_FLASH
                                   stem: "deepseek-reasoner", vision: "deepseek-v4-flash-vision-exp"
```

`DEEPSEEK_MODELS.flash` is new; `planner` and `compiler` moved from `deepseek-v4-pro` to the Flash identifier, and `chat`/`focus`/`default` now resolve through the same constant so the whole DeepSeek surface has exactly one source of truth. `DEEPSEEK_FLASH_MODEL` allows an environment to pin a different id without a code change.

## 3. Final active model routing

| Workload | Model | Where |
| --- | --- | --- |
| Planner Modes generation, expansion, replan, critic, repair | `deepseek-flash` | `DEEPSEEK_MODELS.planner` |
| Syllabus compilation | `deepseek-flash` | `DEEPSEEK_MODELS.compiler` |
| General chat, Focus drawer | `deepseek-flash` | `DEEPSEEK_MODELS.chat` / `.focus` |
| Classic Planner pipeline | `deepseek-flash` | `DEEPSEEK_MODELS.planner` via `orchestrator` |
| STEM reasoning tier | `deepseek-reasoner` (provider maps it to `deepseek-flash`) | `DEEPSEEK_MODELS.stem` |
| Vision experiment | `deepseek-v4-flash-vision-exp` (provider maps it to `deepseek-flash`) | `DEEPSEEK_MODELS.vision` |
| Gemini fallback | unchanged (`GEMINI_MODELS.*`) | all modes |

Provider order is unchanged: DeepSeek primary, Gemini fallback, one fallback per operation. Live evidence in §14 shows Gemini was reachable and one attempt returned HTTP 429 without failing an operation.

User-visible labels that said "DeepSeek v4 Pro" in the Classic Planner's progress stream now read "DeepSeek V4.1 Flash", matching the product name; the identifier itself appears nowhere else.

## 4. A2 spaced retrieval architecture

Implemented in `lib/planner/retrieval.ts` and integrated additively. The audit came first, because Exam and Mastery already contained retrieval rules and a second scheduler on top of them was explicitly forbidden.

**What already existed and was generalized:** the purpose vocabulary, a bounded integer-day spacing ladder, the "strictly after learning / never same-day / never outside the horizon / never duplicated / never clustered" invariants, and the stamp→durable-identity pattern (model reference during generation, durable identity after normalization).

**What deliberately was NOT replaced:** Mastery's fixed ≥ 3-day later-retrieval gap (the shared ladder scales past 3 on horizons ≥ 28 days, so routing it through the ladder would re-price longer Mastery plans), and every Exam spacing rule (deadline-shaped, no fixed gap). The shared policy *serves* those rules instead of overriding them.

**Representation** — planner metadata only, in versioned snapshots, never a Quest column: `retrievalGroupRef` (model token `rgN`), `retrievalGroupId` (durable uuid after normalization), `retrievalIndex`, `minimumGapDays`, `retrievalPurpose` (closed: `RECALL`, `REINFORCEMENT`, `PRACTICE`, `MISTAKE_REVIEW`). All optional, so every sealed Phase 0–5 snapshot stays readable.

**Bounded ladder** (integer days, documented as conservative deterministic bounds, explicitly *not* claims of scientific optimality): base 1 day for horizons ≤ 6, 2 for 7–13, 3 for 14–27, 5 for 28–55, 7 for ≥ 56; `REINFORCEMENT` = base (base − 1 when the unit is secure, floor 1); `PRACTICE` = base − 1 (floor 1); `MISTAKE_REVIEW` = 1. Every value is ≥ 1, so retrieval can never land on or before the learning it revisits.

**Gates:** `requiresLaterRetrieval` — RECALL ≥ 14 days, REINFORCEMENT ≥ 7, PRACTICE ≥ 4, MISTAKE_REVIEW ≥ 4. `planRetrievalTouches` returns REQUIRED/OPTIONAL decisions with the earliest in-horizon date that fits, and returns `placeOn: null` rather than scheduling outside the horizon when nothing fits. `retrievalViolations` / `assertRetrievalInvariants` raise the closed codes `RETRIEVAL_BEFORE_LEARNING`, `RETRIEVAL_GAP_TOO_SHORT`, `RETRIEVAL_DUPLICATE`, `RETRIEVAL_OUTSIDE_HORIZON`, `RETRIEVAL_CLUSTERED`.

**Where it is wired:** Mastery's later-retrieval gate (provably identical to its previous `>= 14`), the Roadmap period expansion's stamped-touch invariants, and new retrieval scheduling. The strategic Roadmap layer has no path in the policy that can add an item, so it stays milestone-only by construction.

## 5. Cognitive-load shaping

`lib/planner/load.ts` derives a coarse academic-workload label — `LOW`, `MEDIUM`, `HIGH` — from the item's own intent, refined by the Mastery stage where one exists (a recall touch inside `ACTIVE_RECALL` is still light; a `MASTERY_CHECK` is demanding).

Three properties are deliberate:

1. **Derived, never stored.** Intensity is a pure function of the item, so a sealed revision cannot carry an intensity that disagrees with its own work. The goal's "keep intensity in planner metadata" is satisfied by keeping it planner-side and computing it there.
2. **No inference whatsoever.** The classifier reads intent and stage only. Minutes, dates and every other field are not inputs, and the module has no notion of health, mood, motivation, disability or capacity. A test pins that a 240-minute mock and a 15-minute mock classify identically.
3. **Advisory only.** `intensityAdvisories` flags a date carrying three or more HIGH items (MEDIUM) or a date made only of HIGH work (LOW). `deterministicAdvisories` exposes them through `lib/planner/semantic.ts` as `INTENSITY_SPIKE` with `severity` restricted to `LOW | MEDIUM`, so an advisory can never fail the deterministic gate the way a real semantic defect does. `HIGH + LOW` and `HIGH + MEDIUM` are never flagged: they are the rhythms this exists to prefer, and minutes remain authoritative for feasibility.

## 6. Core/Stretch semantics

`lib/planner/planner-role.ts` adds `CORE` and `STRETCH` as planner-level roles, stored in versioned planner metadata on the item (`role`), absent meaning CORE — which is what every draft written before this existed means.

Two rules make "optional" true rather than nominal, and both are enforced in code:

1. **CORE must stand alone.** `assertCoreSufficient` runs the mode's own validators a second time over the draft with every STRETCH item removed. A draft whose CORE subset fails the mode's rules is refused with `STRETCH_NOT_OPTIONAL` (the underlying mode code rides along as `cause`). Required work therefore cannot be relabelled as optional to make a plan look complete. It is wired once, in `validateDraft`, which is the authoritative gate for sealing and confirmation.
2. **STRETCH never materializes by confirmation.** `confirmDraft` refuses a Stretch item in `selectedItemKeys` with `STRETCH_REQUIRES_PROMOTION` and measures each mode's "the whole reviewed set" rule against the CORE subset instead of all active items. Optional work therefore cannot become an ordinary Quest — and so cannot become overdue — merely because the generator produced it.

**Promotion** (`lib/planner/server/stretch.ts`, `POST /api/planner/[id]/stretch`) is the only path from optional to scheduled: explicit by item key, capacity-checked against live availability, refused for anything that is not an active STRETCH item of a **confirmed** revision (`STRETCH_REQUIRED`), refused for a past date (`PAST_DATE`), refused when the schedule genuinely has no room (`INFEASIBLE_CAPACITY`), and idempotent through the planner link itself — promoting the same item twice returns the same Quest, creates nothing and does not move the plan version. A promotion writes the Quest and the link with `baseline.promoted = { reason: "USER_PROMOTED_STRETCH", at }`, bumps the plan version so a sealed proposal built on the older reality is correctly stale, and calls no provider and spends no quota.

Verified against real PostgreSQL: CORE-only confirmation leaves the Stretch item with no link at all; a refused promotion of a Stretch item (because the student added their own work to that day) leaves the plan version untouched; a stranger's promotion attempt resolves as `NOT_FOUND`.

## 7. Coverage Map

`lib/planner/coverage.ts` derives a per-unit view with exactly four states — `UNSCHEDULED`, `SCHEDULED`, `REINFORCED`, `PRACTICED` — from the confirmed scope, the revision's items, the execution facts the caller already has, and (for a strategic Roadmap) milestone lineage.

What it deliberately does not do:

* **No mastery, ever.** There is no `MASTERED` state in the vocabulary and no derivation path that could produce one; a test asserts the vocabulary itself.
* **Quest completion is not coverage of anything academic.** Completed work is shown as `HISTORY` and counts towards the state, which is traceability: a student who finished the practice should not see the unit as unplanned.
* **Superseded work is not current coverage.** An item a later revision replaced is listed but does not make its unit look covered today, which is what would otherwise double-count planned minutes.
* **Retrieval only counts after the learning it revisits**, so a recall touch that precedes the learning cannot inflate the state.
* **A strategic milestone schedules, and cannot pretend practice happened**: a milestone touch can reach `SCHEDULED` and never `REINFORCED`/`PRACTICED`.
* **Optional Stretch work is traceability, not agreed practice**: it makes a unit visibly planned and does not raise its state.

`coverageSummary` returns only counts and the orphaned-unit count, so a review surface or a provider payload can carry the map's meaning with no per-item detail and no academic content.

## 8. A3 preference model

Persistence, added in one narrow additive migration (`20260926010000_planner_preference_friction`) following the Phase 5 `PlannerCheckResult` posture exactly (RLS enabled, no client grants, owner-scoped through the plan, bounded fields, CHECK-constrained closed enums).

`PlannerPreference`: `preferenceType` closed to `SESSION_LENGTH`, `DAILY_DENSITY`, `DEMANDING_PLACEMENT`, `TASK_DETAIL`, `BUFFER_STYLE`; `value` bounded to canonical tokens (an integer minute count, an integer percent, or one of a small closed set) with a CHECK that rejects anything that is not `[A-Za-z0-9_]+` — so no free text and no academic content can be stored; `evidenceCount ≥ 0`; `confidence` 0–100; `lastConfirmedAt`; `ignoredAt` for per-plan ignore. Uniqueness is `(userId, planId, preferenceType)` plus a **partial unique index** for the `planId IS NULL` case, because PostgreSQL treats NULLs as distinct in a plain UNIQUE.

**The safest possible statement about learning:** one observation never becomes a preference. `PREFERENCE_LEARNING_THRESHOLD = 3` is exported and tested; a single observation only records a candidate, `isPreferenceActive` hides anything below the threshold, and conflicting evidence does not reach it. An explicit user confirmation activates a preference immediately (`confidence = 100`, `lastConfirmedAt` set) and clears a prior ignore. Every preference is ignorable for one plan and resettable.

## 9. Preference evidence policy

Evidence may come only from repeated **explicit planner actions** — repeatedly shortening generated durations, repeatedly changing task density, repeatedly moving demanding work to the same window, repeatedly asking for more or less task detail, repeated explicit buffer-pattern changes. Nothing is learned from inactivity, skipped sessions, health-related behaviour, inferred mood, grades, intelligence assumptions, or any demographic attribute; the closed type vocabulary makes those impossible to represent.

A learned preference stays SOFT, and it now reaches **every** planning path — Exam, Mastery, Roadmap and expansion generation, and replanning — through exactly one shape in the codebase (`lib/ai/planner/context.ts`): `{ preferences: { type, value, source }[], friction: { reasonCode, count }[] }`. Each payload builder emits it through one helper that omits the key entirely when there is nothing to say, so a user with no learned preferences produces a **byte-identical** payload to before A3 existed (asserted for all four paths), and the system prompt that receives it states the SOFT rule in the same words everywhere.

The read model is one query per operation and differs by path on purpose: **first-time generation** reads the user-general store (`planId = null`), because the plan has just been created and has no plan-scoped history; **period expansion** reads the plan-scoped store, because the roadmap already exists and is the thing being expanded. Both reads are fail-open — a failed read yields no context and can never fail an operation, add a provider call, spend quota, or change the input. A test proves a `SESSION_LENGTH: "240"` preference cannot override a HARD `MAX_SESSION_MINUTES: 45` constraint, and that stripping the context block returns a payload deep-equal to the no-preference one.

## 10. Friction feedback

`PlannerFrictionEvent` stores one optional, user-reported reason per planner item: `planId`, nullable `revisionId`, the draft `itemKey` (a planner item key, deliberately not a Quest id), the owner, and one of six closed reason codes — `TOO_LONG`, `TOO_HARD`, `UNCLEAR`, `NO_MATERIAL`, `ALREADY_KNEW`, `LOW_VALUE`. There is deliberately **no free-text note column**: the closed code is the whole machine-actionable signal, and a note would put unbounded academic content into planner-private storage for no consumer.

Recording a reason is inert by construction and verified as such against the real database: it calls no provider, spends no quota, creates no revision, and mutates zero Quests. It becomes context only when the student explicitly starts a plan or a replan, and `frictionSummary` exposes a bounded, content-free count by reason code for that purpose. Repeated compatible feedback can only contribute to a preference through the same guarded threshold in §9 — one event never creates one.

## 11. Phase 5 replan integration

The Phase 5 lifecycle and its safety model are untouched: detection and feedback alone still call no provider and mutate nothing, and nothing changes execution before an explicit confirmation of a reviewed diff.

Phase 6 touches replanning in three places, all inside generation:

1. **History is carried in the real currency** (§14) — this round's central product fix.
2. **Retrieval metadata** travels through replan payloads, and frozen completed retrieval counts as history that satisfies the mode's rules without being regenerated.
3. **A bounded, content-free friction/preference context** is the intended consumer shape for §9/§10. The replan path's context wiring is **not yet complete** (§26).

## 12. Quality evaluation framework

Built, deterministic, offline, and deliberately incapable of replacing validation:

* **Corpus** — `lib/planner/quality/corpus.ts`, 23 synthetic cases covering every situation the goal names: EXAM (3-day triage, 2-week with a requested mock, 2-month, mixed confidence, high-priority strong topic, overloaded availability, and one deliberately invalid plan that omits the terminal review), ROADMAP (3/6/12-month, uneven units, high-priority units, period expansion), MASTERY (new chapter, mostly-known, mixed confidence, short horizon, deep mastery) and REPLAN (missed work, reduced availability, increased availability, completed frozen stages, expanded-period revision). Bounded, stable, no clock, no randomness, no provider, no database, no real academic content.
* **Metrics** — `lib/planner/quality/metrics.ts`, 13 deterministic metrics, each scored in [0, 1] with a closed issue vocabulary: concrete/actionable tasks, sequencing, realistic workload, topic allocation, coverage completeness, meaningful retrieval, redundancy, cognitive rhythm, unnecessary churn (replan only), explicit priorities, applicable preferences, Core/Stretch correctness, and terminal readiness/check quality.
* **Runner** — `lib/planner/quality/evaluate.ts`: `evaluateCorpus()` normalizes each case through the production normalizers, runs the production validators, and returns per-case records plus aggregates. Records are **content-free** — scope refs, dates, codes and counts only, never a title, description or durable key — so nothing academic can leave the process and two runs are byte-identical.
* **The separation is structural, not a convention**: quality findings are computed after validation, are numbers and closed codes, and have no path back into `validateDraft`. A valid plan with findings stays valid, and a test asserts it.

Honest limits the harness states about itself: the churn metric's moved/replaced/removed/added split is a documented greedy heuristic (retained count and the churn ratio are exact), and the workload metric assumes an empty execution snapshot, which is correct for a fresh plan and deliberately avoids a database.

## 13. Generated-plan quality findings

The corpus runs on every suite run and reports itself (`__tests__/planner/quality-report.test.ts`). The measured picture over 23 cases:

| Dimension | Result |
| --- | --- |
| Cases | **23: 22 valid, 1 invalid** — EXAM 8/9, ROADMAP 7/7, MASTERY 7/7 |
| The one invalid case | `exam-missing-final-review` → `MISSING_FINAL_REVIEW`. It is deliberately invalid and asserted as such: a plan without its terminal review must fail, and hiding it would be the dishonest alternative |
| Metric averages | concrete **1.00**, sequencing **1.00**, workload **0.95**, allocation **1.00**, coverage **1.00**, retrieval **1.00**, redundancy **1.00**, rhythm **1.00**, **churn 0.79**, priorities **1.00**, preferences **1.00**, coreStretch **1.00**, terminal **1.00** |
| Most frequent finding | `QUALITY_WORKLOAD_SPIKE` ×1 — the overloaded-availability case, which validates and is flagged as dense |

Two honest readings rather than a victory lap. First, a corpus of *well-formed synthetic* cases mostly scores at the ceiling, which tells us the metrics agree with the validators on plans that are already valid — it does not yet prove they discriminate on the plans real students reject. Second, the lowest score is **churn (0.79)**: revisions retain less than they could, which is the "minimize churn" objective (§26 of the goal) showing up as the weakest dimension and the most useful thing to improve next.

**§66's acceptance list is now a test rather than a claim.** `__tests__/planner/plan-acceptance.test.ts` asserts, against real generated fixtures for Exam, Mastery and Roadmap, that the stored plan itself carries the answer to eight of the nine questions: what to do, why it is here, when, what can be skipped (the CORE-only plan still validates), whether every supplied unit is accounted for or explicitly listed as orphaned, whether important material is revisited legitimately (the retrieval invariant checker runs over exactly the stamped touches), whether the workload carries the signals a realism judgement needs, whether explicit priorities appear as real work, and whether every item says when it is done. The ninth — "is the daily workload realistic?" — is exactly what the corpus measures above, and it is deliberately not turned into an assertion.

**One quality gap is measured and left open:** the Exam critic reports `UNREPAIRED` with about five outstanding issues on every live run. Generated Exam revisions are valid and low-churn, but the critic reliably finds something it cannot patch within the bounded repair. That is the first thing a real-user corpus should quantify.

## 14. Live provider convergence

### The framework defect found this round

Phase 5's report recorded Exam and Mastery whole-plan replans as a model-convergence blocker. They were partly a **server defect**, and the evidence is now precise:

* `RebalanceGenerationArgs.frozen` carried a single collapsed `stage` field (`item.stage ?? item.masteryStage`), and `validateProposal` mapped that to `FrozenItemView.stage` only — leaving `masteryStage` undefined for every frozen item.
* The Mastery validator reads `masteryStage`. So with **any** frozen history present, no Mastery whole-plan replan could ever validate: the failure (`MISSING_MASTERY_STAGE`) was independent of what the model returned.
* History also lost `relatedTopicRefs`, the item's own title, and the distinction between the two stage fields, so an Exam replan's view of its own history was thinner than reality.

Fixed by giving the frozen currency its real shape: `stage` **and** `masteryStage`, `relatedTopicRefs`, the item's own `title`; a single exported builder (`frozenGenerationViews`) so the generator, the validators and the live smoke can never disagree about the currency again; and the model-facing payload projected to model-facing fields only.

Two further contract gaps were closed in the same pass, both classified before changing anything:

| Live failure | Classification | Fix |
| --- | --- | --- |
| `INVALID_EXAM_INTENT_STAGE` | `PROMPT_INSTRUCTION_MISSING` | the Exam stage→intent table was private inside the validator; it is now exported as `EXAM_STAGE_INTENTS` and rendered into the prompt from that single source |
| `UNJUSTIFIED_RELEARNING` / `UNNECESSARY_RELEARNING` | `PAYLOAD_MISSING_CONTEXT` | Exam units now carry `covered`; Mastery units carry `covered`, `confidence` and the derived `secure`; both prompts state the closed rule, including Exam's `relearnReason` escape hatch |
| `MISSING_MASTERY_STAGE` after a repair | `REPAIR_SCHEMA_FAILURE` (retry was near-blind) | the bounded retry now receives an actionable instruction per code (`lib/ai/planner/validation-hints.ts`), translated from rules the validators already enforce |
| a rejected proposal that looked valid | `FIXTURE_DEFECT` | the live smoke built its frozen history by hand in the wrong shape; it now calls the production builder, so this class of false evidence is gone |

### Measured convergence (DeepSeek Flash, synthetic fixtures)

Three consecutive live runs after those fixes, same three scenarios each time:

| Run | Exam remaining-work | Mastery remaining-stages | Roadmap period revision |
| --- | --- | --- | --- |
| A | **accepted** — 18 items, 18 retained, 3 calls, 18.3 s | **accepted** — 15 items, 3 calls, critic `ISSUES_REPAIRED` (5), 14.4 s | **accepted** — 2 of 2 retained, critic `PASSED`, 4.1 s |
| A′ | **accepted** — 18 items, 4 calls, 37.9 s | **accepted** — 19 items, 3 calls, `ISSUES_REPAIRED`, 22.4 s | **accepted** — critic `PASSED`, 3.6 s |
| B | **accepted** — 16 items, 4 calls, 30.5 s | rejected — `INFEASIBLE_CAPACITY` ×2 | **accepted** — critic `PASSED`, 4.0 s |

Validation codes seen across those runs: `[]`, `MISSING_SPACED_RECALL` (repaired by the bounded retry, scenario still accepted), and `INFEASIBLE_CAPACITY` ×2 in the one Mastery rejection. The Exam critic reported `UNREPAIRED` with about five outstanding quality issues in every run — which is honest data about plan *quality* (§13), not a validation failure.

Honest reading:

* **The Phase 5 blocker is closed for Exam and Roadmap.** Exam's whole-plan replan validates in 3 of 3 runs and Roadmap's period revision in 3 of 3, both with low churn and zero fabricated work.
* **Mastery converges in 2 of 3.** The single rejection was a genuine capacity conflict (the model proposed more remaining mastery work than the horizon can hold, twice), not a contract defect. That is a model-planning outcome the validator is supposed to refuse.
* **The root causes were three, and none of them was "the model is bad".** In the order they were found: a lossy server-side history currency; a live-smoke fixture that re-derived the generator's currency and dropped the `covered`/`secure` facts (so the model was judged against a rule it had not been told about) and whose templated titles collided with history by construction; and prompt/payload clarity, fixed by rendering the validators' own tables and enumerating each unit's allowed, required and forbidden intents or stages.
* **The sample is still small.** Three runs of three scenarios is enough to say the contract now holds and to characterise variance roughly; it is not a reliability claim, and §26 keeps the readiness classification modest for that reason.
* **A quality gap remains visible:** the Exam critic is `UNREPAIRED` on every run. Closing that is quality work (§33–36), not validation work.

### Generation and critic smoke on Flash

All five opt-in live suites pass in one run (6 tests, 0 failures, ~3 minutes wall):

| Suite | Result | Recorded detail |
| --- | --- | --- |
| Exam generation | pass | 14.1 s |
| Roadmap generation + period expansion | pass | 13.6 s |
| Mastery generation (3 chapters) | pass | 58.0 s; items 20/13/17, calls 3/3/2, stages valid, terminal check, no re-teaching, critic `UNREPAIRED` on one scenario and `UNAVAILABLE` on another |
| A1 critic + targeted repair | pass | 35.8 s / 0.9 s |
| Replanning (3 modes) | pass | 50.7 s; per §14 above |

## 15. V4.1 Flash latency and call measurements

| Operation | Calls | Latency |
| --- | --- | --- |
| Exam generation | ≤ 3 (budget) | 14.1 s |
| Roadmap generation + expansion | ≤ 3 | 13.6 s |
| Mastery generation | 2–3 | 58.0 s for three chapters |
| A1 critic + repair | ≤ 2 | 35.8 s |
| Replan: roadmap period | 2 | 4.1–5.6 s |
| Replan: Exam whole-plan | 3 | ~27 s before rejection |
| Replan: Mastery whole-plan | 3 | ~27 s before rejection |

Provider call budgets are unchanged (`GENERATION_CALL_BUDGET=3`, `SEMANTIC_CALL_BUDGET=2`, `PROVIDER_CALL_BUDGET=5`). One Gemini fallback attempt returned HTTP 429 and did not fail an operation. Token-level cost is recorded by the existing usage logger; no cost-saving claim is made here, because the pricing question is separate from these measurements.

## 16. Exam quality

Unchanged educationally: coverage before consolidation, practice before consolidation for high-priority units, spaced recall, mistake review, mock where requested, final readiness, floors per unit, priority windows. Phase 6 adds the `covered` fact to the replan payload, the exported stage→intent table the prompt now renders, the Core-sufficiency guarantee (a plan whose Stretch work is skipped still satisfies every Exam rule), and retrieval stamps on expansion items. Nothing was relaxed: the live `REBALANCE_DUPLICATES_HISTORY` rejection is the Exam rules doing their job on a model that restated finished work.

## 17. Roadmap quality

The strategic layer remains milestone-only and Quest-free — the shared retrieval policy cannot add an item to it, and the Core-sufficiency rule measures the strategic draft's own rules. The period expansion gains retrieval touch metadata and invariant checks. Neighbour immutability, the permanent `MILESTONE_ALREADY_EXPANDED` guard and the never-moving strategic pointer are all untouched and still asserted by the Phase 3 and Phase 5 suites.

## 18. Mastery quality

Progression, terminal check, mistake-review rules and the no-inference posture are unchanged. The measurable Phase 6 improvements: a Mastery whole-plan replan now validates against history that actually carries `masteryStage` (it could not before), the payload tells the model which units are `secure`, and the check-result table from Phase 5 is untouched and not merged with preference/friction storage. Generation on Flash validates: valid stage progression, terminal check last, no re-teaching of a secure unit across all three scenarios.

## 19. Replan quality

The Phase 5 reconciliation contract is unchanged and still verified against real PostgreSQL (protected execution never rewritten, exactly-once reconciliation, idempotent replay, stale failure with zero partial mutations, no resurrection, quota separation, diff and detection through the plan detail). What Phase 6 adds to replan *quality*: history fidelity (§14), retrieval metadata in the payload, and the friction/preference context shape (wiring pending, §26).

## 20. Frontend / manual QA

The A2/A3 surfaces are built and component-verified:

* **Core/Stretch** — `PlanItemEditor` marks a Stretch item calmly (CORE is never announced) and `StretchPromotion` renders the promise copy plus the explicit "Add this stretch work" button, offered only while reviewing a confirmed plan, disabled when stale, keyboard reachable, never firing on render, with a pending state and every failure code translated to human copy.
* **Coverage Map** — `CoverageMapPanel` is a collapsed secondary `<details>` surface that derives the map from data the plan detail already returns (no new read route), shows all four states, collapses touches per unit, calls out unscheduled units plainly and never uses the word "mastered".
* **Restrained intelligence** — a short `Recall`/`Reinforcement` hint on stamped items, no per-item intensity badge, at most one day-level advisory line.
* **Friction (A3)** — `FrictionFeedback`: optional, dismissible, one-tap, the six exact reasons, records via `POST /api/planner/[id]/friction` and triggers no generation.
* **Preferences (A3)** — `PreferencePanel`: lazy on expand, lists active preferences with a high-level source ("You set this." / "From your earlier planning choices.") plus **Ignore for this plan** and **Reset**.

Mobile, keyboard, screen-reader and appearance-token requirements are met structurally: no tables, real `<button>` elements at the existing 44px minimum, `aria-expanded`/`aria-pressed`, `role="status"`/`role="alert"` with `aria-live`, and token-only CSS so dark/light/custom accent and background all follow the existing rules. `ExamPlanner`'s unfinished-generation recovery was also made hydration-safe: the stored operation key is discovered in the async load that already runs on mount, so the first client render matches the server's exactly.

**A structural pass over the same surfaces (§47), since a browser could not be driven:** every interactive panel announces async work through `role="status"`/`role="alert"` or `aria-live` (the two new read-only surfaces, the Coverage Map panel and the intensity note, have no async state and correctly have none); the new components are styled through the planner's existing stylesheet classes (`s.item`, `s.muted`, `s.callout`, `s.coverageChapter`, `s.stretch`, `s.friction`, `s.frictionGrid`) rather than ad-hoc rules; and the planner stylesheet itself uses 26 design-token references with **zero hardcoded colours**, so dark, light and custom accent/background follow the existing rules rather than a second palette.

**Honest limits.** No browser session was driven by hand — the evidence is jsdom + Testing Library + axe (12 new tests), consistent with the earlier phases, and this report does not claim a manual click-through happened. The "review notes the preference that influenced this plan" line was **not** added: the plan detail does not report which preference influenced a given revision, and inventing an API for it was out of scope. Per-item intensity badges were deliberately not added.

## 21. Privacy / security

* New planner-private tables follow the Phase 5 posture exactly: owner-scoped, RLS enabled, no client grants, no Realtime publication, no service-role exposure.
* No academic content in preference or friction storage: closed enums, canonical bounded values, no free text, no titles.
* Telemetry stays content-free. The new validation-hint table contains rule text only, never provider output or user content.
* Nothing logs prompts, critic payloads, repairs, raw provider output, plan or Quest titles, or reflection text.
* Security invariants unchanged: `getSession`, tokenVersion validation, owner-scoped reads/writes, server-only Prisma, private no-store planner responses, no mobile Bearer planner auth, no chain-of-thought persistence.

## 22. Persistence / migrations

One additive migration this round: `20260926010000_planner_preference_friction` (`PlannerPreference`, `PlannerFrictionEvent`), applied cleanly against disposable PostgreSQL by the existing harness. `SCHEMA_BUILD_VERSION` moved 20 → 21. No historical migration was edited, and Phase 5's `PlannerCheckResult` design is preserved untouched. The `ItemCategory` bootstrap gap was left alone as instructed.

## 23. Performance

Measured, on the real path, by `__tests__/planner/database-rebalance-bounds.test.ts` (which prints every number on each run so these can be reproduced):

| A2/A3 measurement | Result | Reading |
| --- | --- | --- |
| A2/A3 context read for one replan | **3 queries** (ownership check, preferences, friction aggregate) | one bounded read per operation, never per item — asserted ≤ 4 |
| Provider payload with no learned context | 4,157 bytes | unchanged from before A3 existed; the context block is emitted only when there is something to say |
| Provider payload with one preference + one friction reason | 4,278 bytes (**+121 bytes**) | bounded data, not prose; the growth is asserted ≤ 512 bytes |
| Coverage Map derivation at 60 items | **0.6–1.7 ms** as a pure function (node), **cold 14.1 ms / warm 0.19 ms** through the client adapter in jsdom, 8,509 bytes rendered | one pass over the plan, no queries, inside the payload envelope |
| Confirmed-plan render at the 60-item limit | **142–453 ms in jsdom, with exactly 1 request** | no per-item fetching; the first number of a run includes shell warm-up, so the range is reported rather than the best case |

Phase 5's replan envelopes still hold and are re-measured in the same run: provider payload 4,157 B for the current fixtures, stored replan metadata ~1.2 KB, sealed draft ~9.5 KB, execution fingerprint 20 KB transient / 64-character digest stored, diff render bounded at 60 entries, and confirmation at **49 ms / 35 queries / 14 write statements** for a 12-item receipt.

`__tests__/planner/render-bounds.test.tsx` guards the client side of that table: a 60-item confirmed Exam plan renders with one request and no per-item fetch, and the Coverage Map derivation stays a single pass. Measuring it honestly took two corrections — the first run reported a cold-start 101 ms as the derivation cost, and the query counter in the server-side test initially read zero because its pattern missed Prisma's quoted model names. Both are recorded here rather than quietly retuned.

Still open for §65: snapshot growth across A2 metadata (retrieval stamps, roles) measured against a maximum-size plan — the payload figures above bound it indirectly but do not measure the stored snapshot.

## 24. Tests / build

| Gate | Result |
| --- | --- |
| `npx vitest run` (whole repository) | **1,642 passed, 110 skipped** (166 files) |
| `node scripts/test-planner-postgres.mjs` (disposable PostgreSQL) | **478 passed, 7 skipped** (44 files) |
| `npx vitest run __tests__/planner` (no database) | 375 passed, 110 skipped (44 files) |
| `npx tsc --noEmit -p scratch/tsconfig.verify.json` | clean (plain `tsc` still reports the pre-existing `.next` artifact errors) |
| `npx eslint` on the Phase 6 surface | **0 errors**; the only `no-explicit-any` errors in files this phase touched incidentally (`lib/ai/usage-logger.ts`, `__tests__/ai/multi-engine-router.test.ts`) are pre-existing lines, verified by diff |
| `npm run build` | ✓ compiled successfully |
| `npm run mobile:build` + `npm run mobile:verify` | pass — no server-only symbols or secrets in the mobile bundle |
| `npx eslint` on the whole planner surface (`lib/planner`, `lib/ai/planner`, its routes, its components, its tests) | **0 errors** (36 pre-existing warnings) |
| `npm run audit:models` (new) | 0 active retired-model references, 2 documentation-only, 16 historical |
| `npm run audit:secrets` | clean |
| `npx prisma validate` | valid |

New suites this phase: `plan-acceptance.test.ts` (7 — §66's nine questions as data), `render-bounds.test.tsx` (2 — client render and Coverage Map cost at the 60-item limit), `planner-role.test.ts` (10 — role defaults, partitioning, invalid role rejection, CORE-sufficiency refusal, legitimate Stretch acceptance, deterministic intensity, advisories), `coverage.test.ts` (9 — no mastery state, orphaned scope, state transitions, retrieval-after-learning, history without mastery, superseded work, strategic milestone, Stretch traceability, Mastery stages), `database-stretch.test.ts` (5 real-PostgreSQL — CORE-only confirmation, confirmation refusal, explicit idempotent promotion, refusal and ownership cases, capacity refusal after reality moved), `database-replan-context.test.ts` (3 real-PostgreSQL — no context for a plan with no history, preferences and friction as SOFT context with the authoritative fields unchanged, and no preference learned from a single observation), `retrieval.test.ts` (25), `database-preference-friction.test.ts` (23), `phase6-ui.test.tsx` (12), `model-migration.test.ts` (6, including the Classic Planner hash pins), `quality.test.ts` (18 — the corpus, the metrics' determinism, the known-bad cases producing the codes they should, and the assertion that a quality finding can never invalidate a valid plan), `quality-report.test.ts` (3 — the corpus aggregate and its content-free, deterministic output), and `generation-context.test.ts` (7 — byte-identical payloads with no preferences, the shared context type, and a preference that cannot override a HARD constraint).

One test-only fragility was also fixed rather than papered over: `mastery-ui.test.tsx` asserted a once-per-plan telemetry event, which the component deduplicates module-wide, so the assertion depended on test order and failed only in a full-file run. It now claims its own revision identity, so the assertion is order-independent and still demands exactly one event with a content-free payload.

## 25. Classic Planner + System AI model-migration verification

* `app/api/ai-planner/route.ts` (`b7f49aca…`) and `lib/ai/planning-engine.ts` (`cbd73cc7…`) are **byte-identical** to their Phase 0–5 values, and a test now pins both hashes. (A pre-existing, uncommitted quota-in-result change is present in `route.ts` from before this work; it is not a Phase 6 edit.)
* `lib/ai/orchestrator.ts` has **one deliberate exception**, because the goal requires labels, config and tests to agree with the configured model: the file differs from its Phase 5 state (`2b91d55e…`) by exactly four lines — the two user-visible progress labels that named the model ("DeepSeek v4 Pro" → "DeepSeek V4.1 Flash") and the two comments describing it. Nothing else changed, and that is *proven* rather than asserted: reversing exactly those four edits reproduces the Phase 5 hash `2b91d55e…` byte for byte, and a test performs that reconstruction on every run. The new hash is `b17dfdf9…`.
* The model-selection change itself required no orchestrator edit at all: it reads `DEEPSEEK_MODELS.planner`, so the whole migration lives in `lib/ai/config.ts`.
* Classic coexistence tests pass (`classic-coexistence.test.ts`, plus the router suites).
* Normal System AI: only `DEEPSEEK_MODELS.chat`/`.focus`/`.default` moved onto the shared constant. Chat architecture, tools, memory and orchestration are untouched, and the provider-contract and multi-engine-router suites pass.
* The deterministic check distinguishes **active** from **historical** references: `npm run audit:models` fails the build if any runtime, config, test or script selects the retired model, while phase reports, archived evidence and the legacy pricing block are explicitly allowed to keep saying what was true at the time. The legacy pricing entry exists only so pre-migration usage rows still cost what they cost.

## 26. Enablement-readiness audit

Not yet complete; the classification below reflects this round's measured state.

| Area | Status |
| --- | --- |
| Migrations pending | `20260924010000_planner_foundation`, `20260925152657_planner_check_result`, `20260926010000_planner_preference_friction` must be applied through the reviewed Prisma workflow — `SHOULD_FIX` before any enablement |
| Provider reliability | Flash is reachable and resolves every alias; one Gemini 429 observed without operational impact — `POST-LAUNCH` monitoring |
| Generation reliability | Exam, Roadmap (+expansion) and Mastery all validate live on Flash — acceptable for gated testing |
| Replan reliability | Exam 3/3, Roadmap 3/3, Mastery 2/3 measured live — the contract defect that made Mastery impossible to validate is fixed; the remaining Mastery failure is a genuine capacity conflict — `SHOULD_FIX`, not a blocker |
| A2/A3 UI | built and component-verified (12 jsdom/axe tests, build clean) — manual browser QA still pending |
| Preference + friction context on the replan path | **wired and tested against PostgreSQL** (SOFT guidance only, bounded, content-free) |
| Preference application to generation and expansion | **wired and tested**: one shared context type reaches all four generation paths plus replanning, byte-identical payloads when no preference exists, fail-open reads, one query per operation |
| Friction → replan context | wired: closed reason codes and counts reach the replan payload, never notes or titles |
| Quality framework (corpus + metrics) | **built**: 23-case corpus, 13 metrics, determinism and content-free properties asserted, and the aggregate reported on every run |
| Privacy / security | unchanged posture, new tables follow it, secrets scan clean — no blocker found |
| Accessibility / mobile / appearance tokens | structurally met and component-tested; a manual browser pass across themes and devices is still pending — `SHOULD_FIX` |
| Performance | Phase 5 envelopes hold; A2/A3 measurements pending — `POST-LAUNCH` unless the corpus shows payload growth |

## 27. Remaining blockers

1. **Mastery whole-plan replan capacity convergence** (`SHOULD_FIX`). Exam and Roadmap replans now converge (3 of 3 runs each); Mastery converges 2 of 3, and the failure is the model proposing more remaining work than the horizon can hold — refused correctly as `INFEASIBLE_CAPACITY` rather than silently compressed. Closing it means helping the model size remaining work against the supplied floors, not relaxing the capacity rule.
2. **Churn is the weakest measured dimension** (`SHOULD_FIX`). The quality corpus scores every dimension at or near 1.00 except unnecessary churn at **0.79**, so revisions retain less than they could — the goal's own "minimize churn" objective, and the clearest next improvement.
3. **The corpus is synthetic and self-consistent** (`SHOULD_FIX`). It proves the metrics agree with the validators on well-formed cases; it cannot yet discriminate on plans real students reject, which needs either real feedback data or adversarial cases.

4. **Manual frontend QA** with the flag on across themes, viewports and keyboard paths (`SHOULD_FIX`). Not performed here: no browser was driven, and the verification is component-level (jsdom, keyboard/focus assertions, axe, token audit) as in the earlier phases.
6. **Manual frontend QA with the flag on** (`SHOULD_FIX`).
7. **Migration application in the target environment** (`SHOULD_FIX` before enablement).
8. **No public enablement.** `PLANNER_MODES_ENABLED` remains unset in committed configuration, and local flag-on verification stays local.

## 28. Recommended next architectural-audit scope

Phase 6 is the last planner implementation phase before a separate, comprehensive audit. The evidence this phase produced points that audit at:

1. **Provider-contract fidelity across every prompt.** The `EXAM_STAGE_INTENTS` export is the pattern to generalise: every closed validator table should be renderable into the prompt that must satisfy it, and a drift check should exist per operation.
2. **The frozen/history currency.** It was silently lossy for a whole phase and produced a false blocker. Any view that crosses the generation/validation boundary should be a single exported builder with a test that pins its shape.
3. **Replan convergence as a measured distribution.** Three scenarios per run is not a reliability claim; the audit needs a bounded repeat harness with per-code counts before enablement.
4. **The RLS/grants posture across planner tables** (`PlannerPlan`, `PlannerRevision`, `PlannerQuestLink`, `PlannerCheckResult`, `PlannerPreference`, `PlannerFrictionEvent`) as one review, not one table at a time.
5. **Classic Planner and System AI model routing end to end**, including the pre-existing uncommitted `route.ts` change and the `DEEPSEEK_MODEL` environment override, which currently overrides even the vision model.
6. **Cost and latency accounting** for the Flash line, using the recorded usage rather than assumptions.

---

## Explicit answers

| Question | Answer |
| --- | --- |
| **Is DeepSeek V4 Pro still active anywhere in runtime code/config?** | **No.** `npm run audit:models` scans the tree and reports zero active runtime, config, test or script references; the only remaining mentions are the migration note in `lib/ai/config.ts`, the legacy pricing block, the phase reports and archived evidence. |
| **Is V4.1 Flash now the app-wide replacement wherever V4 Pro was previously used?** | **Yes.** `DEEPSEEK_MODELS.planner` and `.compiler` moved from `deepseek-v4-pro` to the provider's canonical Flash id `deepseek-flash`, and chat/focus/default resolve through the same constant. The provider probe shows `deepseek-v4.1-flash` is not a valid identifier and that every non-pro alias already resolves to the Flash model. |
| **Was Classic Planner otherwise left architecturally independent?** | **Yes.** `route.ts` and `planning-engine.ts` are byte-identical to their Phase 0–5 values (now pinned by a test), and `orchestrator.ts` differs by exactly four lines — two model-naming progress labels and two comments — which a test proves by reconstructing the Phase 5 hash. The model switch itself happened in `lib/ai/config.ts`; endpoint, prompting, quota, persistence and UI behaviour are untouched, and the coexistence tests pass. |
| **Was normal System AI otherwise left unchanged?** | **Yes.** Only the DeepSeek model constant it reads changed; chat tools, memory, orchestration and the Gemini/Groq fallbacks are untouched, and the provider and router suites pass. |
| **Are retrieval touches deliberately spaced rather than accidentally duplicated?** | **Yes.** The shared policy refuses same-day or pre-learning retrieval, enforces a horizon-scaled minimum gap, refuses duplicate and clustered touches, and each touch carries a group identity plus purpose; the invariant checker raises closed codes and is wired into the expansion path. |
| **Does cognitive-load shaping improve scheduling without creating false infeasibility?** | **Yes, by construction.** Intensity is derived, advisory and capped at MEDIUM severity, so it can never fail the deterministic gate; minutes stay authoritative and `HIGH + LOW` / `HIGH + MEDIUM` are never flagged. Measurement of whether it improves real plans belongs to the quality corpus, which is not built yet. |
| **Can Stretch ever become accidental required/overdue work?** | **No.** Confirmation refuses to materialize a Stretch item (`STRETCH_REQUIRES_PROMOTION`), so an un-promoted Stretch item has no Quest and nothing to become overdue; a real-database test asserts the item has no link after confirmation. |
| **Can the user tell Core from optional Stretch?** | **Yes** — the role is stored per item, `PLANNER_ROLE_LABEL`/`PLANNER_ROLE_COPY` give it a calm marker and a plain promise ("Sylf will not schedule it unless you ask"), and promotion is a named action. The UI wiring is landing in this phase; the data and the server contract are in place. |
| **Can every supplied topic be traced through the Coverage Map?** | **Yes.** Every confirmed unit gets a view, orphans surface in `unscheduled` (shown plainly in the UI), and each touch names its date, purpose and whether it is planned, history or superseded. The panel is a collapsed secondary surface, so the main plan stays readable. |
| **Does the Coverage Map ever claim mastery?** | **No.** There is no `MASTERED` state, no code path that could produce one, and a test asserts the vocabulary itself. Quest completion is treated as an execution fact that counts towards traceability. |
| **Can one edit create a learned preference?** | **No.** One observation records a candidate below the exported threshold of 3; `isPreferenceActive` hides it, conflicting evidence does not accumulate, and only three consistent observations or an explicit confirmation can activate one. A real-database test asserts a single observation still yields an empty preference context. |
| **Can a learned preference become a HARD constraint?** | **No.** Preferences are stored separately from constraints, reach the model only as a labelled SOFT block, are ignored entirely by the validators and the capacity model, and a test proves a `SESSION_LENGTH: "240"` preference cannot override a HARD `MAX_SESSION_MINUTES: 45` constraint or alter the confirmed input. |
| **Can users ignore/reset learned preferences?** | **Yes.** Ignore is per plan (`ignoredAt`), reset deletes idempotently, both are owner-scoped through the plan with tests for a foreign user, and the UI exposes both on a compact "Planning preferences" surface. |
| **Can friction feedback itself trigger AI work or Quest mutation?** | **No.** Recording a reason calls no provider, spends no quota, creates no revision and mutates zero Quests — asserted against the real database. It is context only when the student explicitly starts a plan or replan. |
| **Does friction feedback fix causes rather than merely move dates when used in an explicit replan?** | **Plumbed, not yet proven in outcome.** The replan payload now carries the closed reason codes and counts, and the prompt states the cause-level response each code calls for (smaller sessions for `TOO_LONG`, a prerequisite or smaller step for `TOO_HARD`, a clearer completion criterion for `UNCLEAR`, no blind rescheduling for `NO_MATERIAL`, less redundant learning for `ALREADY_KNEW`, reduced weight for `LOW_VALUE`). Whether that produces better revisions is a question for the quality corpus, which is not built yet — so the behaviour is designed and wired, and not yet measured. |
| **Did V4.1 Flash improve, worsen or leave unchanged measured convergence?** | **Flash itself was neutral; the fixes around it were decisive.** On V4 Pro the same scenarios failed, and after switching to Flash they still failed — because the causes were server-side. Once the lossy history currency, the fixture-derived unit facts and the prompt tables were fixed, Exam converged 3 of 3 runs, Roadmap 3 of 3 and Mastery 2 of 3. The measured improvement therefore belongs to the contract fixes, and Flash's contribution is a working generation and critic pipeline on every operation. |
| **Do Exam generation and Exam replanning converge reliably enough for gated testing?** | **Yes for both, with a quality caveat.** Exam generation validates live, and the whole-plan replan validated in 3 of 3 runs with 16–18 items, full retention and no fabricated work. The caveat is quality rather than validity: the semantic critic reported `UNREPAIRED` with about five issues on each run, so generated Exam *revisions* are valid but not yet consistently critic-clean. |
| **Do Mastery generation and Mastery replanning converge reliably enough for gated testing?** | **Generation yes; replanning mostly.** Mastery generation validated all three scenarios, and the whole-plan replan validated in 2 of 3 runs; the third was refused for capacity (the model proposed more remaining work than the horizon holds) — the right refusal, but it means Mastery replan reliability is not yet steady. |
| **Is Roadmap generation/expansion/replanning stable?** | **Yes in the measured runs.** Generation and expansion pass, and the period revision converged repeatedly with low churn and a `PASSED` critic. The strategic replan path is exercised by the database suites, not by the live smoke. |
| **Are all Phase 0–5 safety guarantees preserved?** | **Yes.** Nothing in A2/A3 mutates execution: detection and feedback call no provider, confirmation still materializes only what was reviewed, protected execution is never rewritten, reconciliation is still atomic and idempotent, and the Phase 5 suites pass unchanged. |
| **Is Planner Modes ready for a separate final architectural/product audit?** | **Yes.** Phase 6's four A2 capabilities, both A3 halves, the app-wide model migration and the quality evaluation layer are implemented, wired end to end and verified (1,642 repository tests, 478 against real PostgreSQL, build and mobile bundle clean, zero active retired-model references, Classic Planner byte-identical). The audit should now look at the refinements this phase measured rather than at missing capability: churn at 0.79, Mastery replan sizing, the Exam critic's `UNREPAIRED` findings, a corpus that currently scores well-formed cases near the ceiling, and the manual browser pass reported below. |
| **What still blocks public enablement?** | Four things, all narrow: the three planner migrations must be applied through the reviewed workflow; Mastery whole-plan replans must converge on sizing (2 of 3 runs today, refused correctly for capacity in the third); the Exam critic's outstanding findings should be understood before revisions are offered broadly; and the manual browser QA across themes, devices and keyboard paths has not been performed here. `PLANNER_MODES_ENABLED` remains unset, and no A2/A3 surface is reachable without it. |
