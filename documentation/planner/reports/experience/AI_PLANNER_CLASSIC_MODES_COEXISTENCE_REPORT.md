# SYLF PLANNER — CLASSIC + PLANNER MODES COEXISTENCE REPORT

**Scope:** one focused patch. Remove `PLANNER_MODES_ENABLED` as a product and configuration concept, make the Classic Planner the permanent default Planner experience, and give Planner Modes a deliberate entry point beside it with a way back. No UX Phase 2 work: no research, no provenance, no extraction, no comparison, no preparedness matrix, no Copilot.

**Status:** implemented and verified. Classic is what opens. Planner Modes are permanently available from the Planner header. No migration was needed or written.

**Method:** every site below was read from the current repository before it was changed, and every number is an actual command output. Where a decision could reasonably have gone the other way, the choice and its cost are in §16 rather than implied.

---

## 1. Previous gating behaviour

The planner had two product states chosen by one environment variable, read on the server only:

| `PLANNER_MODES_ENABLED` | Behaviour |
| --- | --- |
| unset / not `"true"` | `/api/planner/capabilities` answered `{ enabled: false }`; every Planner Modes route and service threw `404 NOT_FOUND`; the System Planner tab rendered the Classic Planner; the quick modal rendered the Classic panel |
| `"true"` | Planner Modes were reachable; **the System Planner tab rendered Planner Modes instead of Classic**, so Classic was displaced rather than accompanied |

That second row is the behaviour this patch ends. The variable was never a kill switch for a half-built feature so much as a switch choosing which planner a student got, which is exactly what the new product rule forbids.

## 2. Every `PLANNER_MODES_ENABLED` reference found, and what happened to it

| # | Site | Kind | Action |
| --- | --- | --- | --- |
| 1 | `lib/planner/server/core.ts:31` | the gate itself (`requireEnabled()` → 404) | function **deleted** |
| 2 | `lib/planner/server/mutation-guards.ts:13,17,22,36,52` | five early-returns that disabled mutation guards when off | conditions **removed**; the guards themselves kept and now always active |
| 3 | `app/api/planner/capabilities/route.ts:11,26,35` | disabled capability payload | **removed**; 401/503 now carry `{ error: { code } }` |
| 4 | `lib/study-schedule-service.ts:344` | conditional Prisma select (`plannerPlans` only when enabled) | select is now **unconditional** |
| 5 | 45 call sites of `requireEnabled()` across 15 server modules | route and service entry gating | calls and imports **removed** (`rebalance`, `check-result`, `expansion`, `http`, `materialize`, `operations`, `intake-session`, `preferences`, `revisions`, `generation`, `stretch`, `rebalance-run`, `friction`, `intake`, plus the `core` definition) |
| 6 | 11 test files | `process.env.PLANNER_MODES_ENABLED = "true"` in `beforeEach`, deleted in `afterAll` | **removed**: tests no longer enable anything |
| 7 | `__tests__/planner/database.test.ts:739` | a test asserting the disabled planner 404s | renamed and re-scoped to authentication, owned subjects and strict bodies |
| 8 | `.env.local` (gitignored) | local `=true` used for inspection | **removed** |
| 9 | `.env`, `.env.example` | — | never contained it; verified absent |
| 10 | `__tests__/planner/classic-coexistence.test.ts:19` | assertion that the legacy endpoint never referenced it | **kept**, and joined by a new tree-wide guard (§13) |

No equivalent flag replaced it, and `requireEnabled` no longer exists as a name anywhere in the tree.

## 3. Permanent availability architecture

Availability is no longer a server state, so it is no longer reported as one:

* `PlannerCapabilities` (`lib/planner/transport.ts`) lost `enabled`. It now carries only what a client cannot compute: `today`, `timezone`, `restDays`, `subjects`.
* `useExamCapabilities` treats a failed read as `null` — "could not load just now" — instead of fabricating a disabled capability. The chooser says so plainly and disables the mode buttons rather than pretending the feature is switched off.
* Every Planner Modes route and service is reachable whenever the caller is authorised. There is no second condition to satisfy, and no environment in which Planner Modes exist but are unreachable.

## 4. Classic preservation

The Classic Planner is untouched: same endpoint (`/api/ai-planner`), same `AiStudyOrchestrator` and `lib/ai/planning-engine.ts`, same prompt behaviour, same quota path, same history, same persistence, and now the default and first thing rendered in the Planner tab. The patch adds one button to the header and nothing else to the panel.

Classic independence is still enforced structurally by `__tests__/planner/classic-coexistence.test.ts`: the legacy endpoint contains no `lib/planner` import, no `PlannerPlan|PlannerRevision|PlannerQuestLink`, no `PLANNER_MODES_ENABLED`, and still calls `reserveQuota(userId, "planner")` through its own orchestrator; the Planner Modes modules never reach back into the orchestrator.

The quick modal (`AiPlannerModal`) is now *always* the Classic panel. It used to swap itself for the Exam Planner when the flag was on; with coexistence that swap would have been the flag by another name.

## 5. Planner Modes preservation

Everything Phase 1 established is intact, and the coexistence suite asserts it: Quick Plan is still the default creation flow inside a mode, the weekly-hours control is still the default capacity input, `Customize days` is still a closed disclosure, Advanced setup ("Fine-tune first") is one deliberate step away, the Plan Brief still reports preparedness as unstated rather than assumed, and generation still runs through the same pipeline. Nothing was redesigned; this patch changes only how users enter and leave.

## 6. Chosen navigation model

**One Planner shell with client view state** (`app/system/components/PlannerTab.tsx`):

```
{ surface: "CLASSIC" } | { surface: "MODES", mode: EXAM | ROADMAP | MASTERY }
```

Why this and not child routes: the System workspace is *already* client tab state — the Planner is one tab among several with no per-tab URL — so adding routes for mode selection would introduce a second navigation model inside the first, with its own back-button semantics to get right. The smallest coherent model is the one the surrounding screen already uses.

Consequences, chosen deliberately:

| Behaviour | Result |
| --- | --- |
| Opening the Planner | Classic, always |
| Choosing a mode | that mode's Quick Plan, immediately (no second chooser) |
| `← Classic Planner` | back to Classic, same session, no reload |
| Refresh | returns to Classic — the documented cost of client view state, and not a half-persistent state: nothing is written, so nothing can be half-restored |
| Saved Planner Modes plans | reached by entering a mode, exactly as before |
| Mobile | a full-width bottom-anchored dialog on small screens, centred from `sm` up |

The mode surfaces also keep their own navigation (`← Classic Planner` beside `← Choose a different plan`), so the way back is visible from inside a mode *and* from inside Advanced setup.

## 7. Desktop UI

```
Planner header:  [icon] AI Study Planner            [quota badge] [▦ Planner modes]
                 ─────────────────────────────────────────────────────────────────
                 [ EXISTING CLASSIC PLANNER UI, unchanged ]
```

The trigger sits in the header's trailing group, next to the quota badge, with a `min-h-11` (44px) target, an icon, and an accessible name. It is discoverable without competing with the Classic workflow: one outlined button, no accent fill, no motion.

## 8. Mobile UI

* Classic remains the primary surface.
* The trigger is in the header's wrapped row, so it never depends on a tiny top-right hit target; it is a full 44px control at every width.
* The chooser is `items-end` below `sm` — a bottom-anchored sheet that becomes a centred dialog from `sm` up — so it fits a narrow screen, scrolls inside `90dvh`, and its three option descriptions wrap.
* Each option is a full-width row with a 44px minimum height and a description that wraps rather than truncating.
* `← Classic Planner` is the first control inside a mode, at the top of the mode surface.

## 9. Capabilities endpoint decision

`enabled` was **removed**, not deprecated. The goal allowed keeping it as a compatibility field; it was cleaner to delete it here because there is exactly one consumer (`useExamCapabilities` → the Planner tab and the workspace) and it is in this repository, so no external contract breaks. The endpoint now answers:

* `200 { timezone, today, restDays, subjects }` for an authenticated caller;
* `401 { error: { code: "UNAUTHORIZED" } }` without a session;
* `503 { error: { code: "PLANNER_UNAVAILABLE" } }` if the read fails.

No `enabled: false` remains to be misread as "the feature is off", and the cache header is unchanged (`private, no-store`).

## 10. Server guard changes

Removed: the gate, and only the gate.

Kept and verified: cookie session authentication (all routes still go through `plannerRoute`), ownership scoping (`ownedPlan`, `where: { id, userId }`), `tokenVersion`/session checks, request validation and bounds, quota checks, state guards, Phase 5 mutation safety, lineage immutability, RLS, and the server-only Prisma boundary. §12 records the evidence.

The five mutation guards that the flag used to short-circuit — `assertNoLinkedQuests`, `assertNoPlannerGoals`, `deleteUnlinkedGoals`, `manualPlannerGoal`, `manualLinkedQuest` — now always run. They were previously inert whenever the flag was off; that was correct while Planner Modes could not exist, and would have been a hole now that they always do.

## 11. Telemetry changes

Two events, added to the existing closed vocabulary with the same guards (`lib/planner/telemetry.ts`):

* `planner_surface_opened` with `surface: CLASSIC | MODES` — emitted once per surface actually opened, so Classic and Planner Modes usage can be compared without either being inferred from the other;
* `planner_returned_to_classic` — emitted on the way back.

`planner_mode_selected` (already present, `mode: EXAM | ROADMAP | MASTERY`) is emitted by the chooser. All three carry closed enums only: no route, no label, no academic content. `surface` is validated against a `SURFACES` allowlist before it is logged, like every other field.

## 12. Security review

The gate removal was the risk of this patch, so it got its own suite: `__tests__/planner/gate-removal-security.test.ts` (11 tests).

| Check | Result |
| --- | --- |
| All 8 route families refuse an unauthenticated caller | `GET /api/planner`, `GET /api/planner/[id]`, `POST /api/planner/generate`, `GET /api/planner/recover/[key]`, `POST /api/planner/intake`, `GET`/`PATCH /api/planner/intake/[id]`, `POST /api/planner/intake/[id]/action` → **401 `UNAUTHORIZED`** |
| Refusal is 401, not the gate's old 404 | asserted, because "not found" would disguise an authorization failure |
| Response caching | `Cache-Control: private, no-store` on every refusal |
| Capabilities without a session | 401 with an error body and **no** `enabled` field |
| No gate left in the server surface | every file in `lib/planner/server/` scanned for `requireEnabled`/`PLANNER_MODES_ENABLED` → none |
| Planner modules load with no planner environment variable | `core` has no `requireEnabled`; the intake service imports and exports normally |
| Ownership, RLS, mutation guards | unchanged and still exercised by the existing DB suites (`database*.test.ts`, including the RLS/grant assertions) |
| Guards are now always active (not only when enabled) | verified by the suites in §14.1, which now run against doubles that model the planner tables |
| No direct client Prisma | `__tests__/planner/client-boundary.test.ts` and the `server-only` line-1 checks still pass |

`npm run audit:secrets` and `npm run audit:models` are unchanged and clean (§14).

## 13. Tests

Added:

* `__tests__/planner/classic-modes-coexistence.test.tsx` — 4 tests. **The acceptance test**: in one session, Classic renders first; Exam, Roadmap and Mastery are each entered from the chooser and each returns to Classic; the environment object is compared before and after and is identical. A second test asserts Phase 1's capabilities (weekly hours, closed `Customize days`, Advanced setup, Plan Brief, unstated preparedness) are intact; a third returns to Classic from inside Advanced setup; a fourth asserts the telemetry — one `planner_surface_opened: CLASSIC`, then `planner_mode_selected: EXAM` with `planner_surface_opened: MODES`, then `planner_returned_to_classic` — and checks every logged field is on a fixed allowlist with closed-enum values, so no title, subject, route or label can reach it.
* `__tests__/planner/gate-removal-security.test.ts` — 11 tests, as above, including the tree-wide gate scan.
* Structural guard added to `classic-coexistence.test.ts`: `app`, `lib`, `scripts`, `prisma`, `.env` and `.env.example` contain **no** reference to the flag; test files may mention it only in an assertion that it is absent.

Updated:

* `exam-entry.test.tsx` — rewritten for the new contract: Classic opens, the header button opens a `role="dialog"` chooser with a real label, `Escape` closes it and focus returns to the trigger, each mode routes to its own surface, and the quick modal stays Classic. 6 tests.
* `classic-coexistence.test.ts` — the Planner-tab assertions now pin "Classic is default, no `capabilities.enabled` read, `Planner modes` + chooser present".
* `database.test.ts` — the generation-route test is now "requires cookie authentication, owned subjects and strict generation bodies" (the 404-on-disabled step is gone with the gate).
* 11 DB test files — flag setup/teardown lines removed.

Removed nothing.

## 14. Build, mobile and database verification

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0 errors** |
| Schema | `npx prisma validate` | valid |
| Planner suite | `npx vitest run __tests__/planner` | **45 passed / 14 skipped files; 523 passed / 132 skipped tests** |
| Disposable PostgreSQL | `node scripts/test-planner-postgres.mjs` | **54 passed / 5 skipped files; 648 passed / 7 skipped tests**, migrations and RLS included |
| Migration | none written, none needed | the patch changes no table, column, index, policy or grant |
| Secrets | `npm run audit:secrets` | no credential patterns in tracked files |
| Models | `npm run audit:models` | 0 active retired-model references |
| Mobile | `npm run mobile:build` / `npm run mobile:verify` | built; **verify PASSED**, zero server-only symbols or secrets in `mobile/dist` |
| Production build | `npm run build` | compiled, with `/api/ai-planner` and every `/api/planner/**` route present |
| Full repository suite | `npx vitest run` | **168 passed / 14 skipped files; 1,811 passed / 132 skipped tests, 0 failures** |

### 14.1 The guards now always run, and six non-planner suites had to model that

Removing the flag had one consequence beyond the planner, and it is the most important
finding of this patch: the five mutation guards in `lib/planner/server/mutation-guards.ts`
were previously skipped whenever the flag was off, and eleven test files across the
repository ran in that state. With the gates gone they always run — which is the correct
behaviour, since a planner-linked Quest or Goal must never be deleted or edited outside
the planner's review flow — and thirteen tests in six suites failed for one reason: their
doubles modelled a database without `PlannerPlan`/`PlannerQuestLink`, or answered the
guard's question with the route's own fixture.

| Suite | Failure | Resolution |
| --- | --- | --- |
| `auth/danger-zone` (4) | reset-progress path now consults the guards; the prisma double had no planner models → `TypeError` | planner models added to the double, reporting "nothing linked" |
| `ai/calendar-tools` (3) | same, through the AI tool executor's move/swap/clear | same |
| `quests/quest-completion-atomicity` (2) | same, through the completion path | same |
| `calendar/floating-rest-day` (1), `calendar/floating-rest-day-api` (1) | `cascadeQuestShifts` and the Quest PATCH route now assert before shifting | same (API suite spies `plannerQuestLink.findFirst`) |
| `goals/goals-api` (2) | the route's own `goal.findFirst` fixture was being consumed by the guard, which then took the *planner-linked* branch and 500'd | the double now distinguishes the two reads: `where.OR` (the guard) → `null`, otherwise the goal |
| `planner/database` (1) | an assertion that turned the flag off and expected 404 was, in fact, testing the gate | replaced with the property that must survive: unauthenticated → 401, owner → 200 |

No production behaviour was weakened to make these pass, and no assertion was deleted.
The guards are strictly *more* active than before, which is why the doubles had to change
rather than the code.

Two further behavioural consequences worth naming:

* `lib/study-schedule-service.ts` now always selects `plannerPlans` for a goal, so a goal
  that belongs to a planner plan is labelled as such in the study schedule regardless of
  configuration. That is the point of the change, and it is a single indexed relation.
* Goal edits and deletions now take the planner's advisory-lock transaction whenever the
  goal is planner-linked. For an account with no planner data the guard's `findFirst`
  returns null and the path is unchanged.

## 15. Frontend QA status

**No browser QA was performed.** No browser automation is available in this environment, so there is no claim of manual inspection of desktop layouts, dark/light/custom backgrounds, real tap targets or a real bottom sheet. What is covered instead:

* interaction, dialog semantics, focus entry and focus return, Escape dismissal, mode routing and the return path — by the coexistence and entry suites (jsdom + `@testing-library`);
* appearance — by construction: the chooser uses the application's existing tokens (`system-card`, `border-border-subtle`, `text-text-secondary`, `bg-bg-abyss/40`, `accent-primary`) and the shared motion variants, with no hardcoded colours, and the Classic panel is unchanged.

The one behaviour I could not exercise in jsdom is `AnimatePresence`'s exit animation, so the dismissal assertions check the state change (`aria-expanded` → `false`) rather than the node's disappearance mid-animation.

## 16. Deviations and decisions

1. **`enabled` was deleted rather than deprecated.** The goal permitted a compatibility field; with a single in-repo consumer it was cleaner to remove it. The cost: a hypothetical external client reading `enabled` would need updating, which is why §9 documents the new shape.
2. **Refresh returns to Classic.** Client view state was chosen over routes (§6). This is deliberate, not accidental: nothing is persisted, so there is no half-restored state. If review wants a refreshable mode URL, that is a routing decision for a later patch rather than something to bolt on now.
3. **`AiPlannerModal` no longer changes shape.** It was the flag's other visible branch; making it Classic-only keeps the modal honest about what it is.
4. **The mutation guards are now always active, and that reached beyond the planner.** This is a behaviour change in the *off* state only, which no longer exists — but eleven test files repository-wide were running in that state, and six of them had to model the planner tables their doubles had never needed (§14.1). It is documented as a finding rather than a footnote because it is the clearest evidence that the flag was load-bearing: switching it off also switched off the protection of planner-linked rows.
5. **Historical reports still describe the gate.** [AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md](AI_PLANNER_EXPERIENCE_PHASE_0_ARCHITECTURE_REPORT.md) and the Planner Modes Phase 0–6 reports are immutable records of how the feature was gated then. The Phase 1 report — the one this patch supersedes — carries three inline "superseded" pointers to this document rather than being rewritten.
6. **The modes button says "Planner modes", not "Advanced".** As instructed: Exam, Roadmap and Mastery are different workflows, not a harder version of Classic.

## 17. Blockers before UX Phase 2

Unchanged from the Phase 1 report, and none of them are caused by this patch:

1. **Source provenance needs a real result shape first.** `executeGoogleSearch` (`lib/ai/chat-tool-executor.ts:1244-1295`) still discards grounding metadata and hardcodes `gemini-3.7-flash` instead of reading `GEMINI_MODELS`. Phase 2 must extend that before presenting any source to a student.
2. **Research volume is unmeasured**, which is why `plannerResearch` quota still does not exist.
3. **`RESEARCH_AVAILABLE` and `NEEDS_SCOPE_CONFIRMATION` remain unexercised** — their first real use is Phase 2.
4. **Findings are still intake-time only**; no educational validator was converted.
5. **Advisory acceptances are not persisted** (recomputed per read).
6. **The scope editor is still the Phase 1 placeholder** (flat, no reordering), by design.

---

## Answers to the 13 explicit questions

1. **Is `PLANNER_MODES_ENABLED` completely unnecessary now?** Yes. The gate, its five guard short-circuits, the capability field, the schedule projection branch and 45 call sites are gone; a tree-wide guard test fails if the name returns to shipped code, and the app runs with the variable absent from every env file.
2. **Can Classic and Planner Modes be used in the same session?** Yes — proven directly by `classic-modes-coexistence.test.tsx`, which uses Classic, all three modes and the return path in one mounted session and asserts the environment object is byte-identical before and after.
3. **Does Planner open to Classic by default?** Yes. The tab's initial state is `{ surface: "CLASSIC" }` and the Classic panel is what renders, with no capability check in the way.
4. **Can a user enter Exam/Roadmap/Mastery without env changes?** Yes. One header button, one chooser, no configuration.
5. **Can a user return to Classic easily?** Yes — `← Classic Planner` sits in the mode surface's own navigation bar (including inside Advanced setup), one click, no reload, no browser back.
6. **Is Classic still architecturally independent?** Yes, and it is now structurally tested: the legacy endpoint and orchestrator import nothing from `lib/planner`, and no Planner Modes module reaches back into the orchestrator.
7. **Is Classic generation behaviour unchanged?** Yes. No file in the Classic path was modified. `app/api/ai-planner/route.ts`, `lib/ai/orchestrator.ts` and `lib/ai/planning-engine.ts` keep their pinned hashes, and `classic-coexistence.test.ts` still asserts their independence.
8. **Is Planner Modes generation behaviour unchanged?** Yes. The gate was the only thing removed from those paths; quota, operations, critic, repair, cancellation and recovery are as Phase 1 left them, and the Phase 1 capability assertions still pass inside a mode.
9. **Did removing the feature gate weaken any auth/security guard?** No. All eight planner route families still return 401 without a session; ownership, validation, quota, state guards, RLS and the server-only boundary are untouched. The five mutation guards are now *always* active. Evidence in §12 and `gate-removal-security.test.ts`.
10. **Are existing saved Planner Mode plans still reachable?** Yes — by entering a mode, exactly as before. Nothing was hidden or migrated; the mode surfaces and their saved-plan lists are unchanged.
11. **Is Advanced setup still available inside Planner Modes?** Yes: "Fine-tune first" from Quick Plan, with the return to Classic still visible from inside it.
12. **Was any migration required?** No. No table, column, index, policy or grant changed, and none of the existing ones were touched. Had one appeared necessary, this patch would have stopped and explained why first.
13. **Is UX Phase 2 safe to begin afterward?** Yes. The intake foundation and the Planner Modes surfaces are unchanged, and the entry/exit model is now permanent and tested. The one thing Phase 2 must do first is §17.1: give the search result a source-bearing shape before any provenance is shown.

---

## Stop gate

| Condition | State |
| --- | --- |
| Classic is the permanent default Planner experience | ✔ |
| Planner Modes are permanently available alongside it | ✔ |
| `Planner modes` chooser works | ✔ (dialog, Escape, focus entry/return, three workflows) |
| Exam / Roadmap / Mastery entry works | ✔ (each opens its own Quick Plan) |
| Back to Classic works | ✔ (from Quick Plan and from Advanced setup) |
| `PLANNER_MODES_ENABLED` removed as an active product/config concept | ✔ (gate, calls, capability field, env, local env, tests, docs pointer) |
| Security remains intact | ✔ (§12, 11 tests) |
| Phase 1 Planner Modes behaviour remains intact | ✔ (§5, asserted) |
| Classic behaviour remains intact | ✔ (§4, hash-pinned) |
| Tests / build pass | ✔ (§14) |
| Report complete | ✔ |

**Stopped here.** UX Phase 2 has not been started: no research, grounding metadata capture, provenance, upload/extraction, comparison, preparedness matrix or Copilot. Awaiting review.
