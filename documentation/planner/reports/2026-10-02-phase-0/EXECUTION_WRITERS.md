# Phase 0: execution writer inventory

**Read-only source inventory, 2 October 2026. No application code or SQL was changed. No hosted data or credentials were accessed, and no providers were called.**

This inventories the current working tree, including direct and delegated ORM writes, effective SQL/RPC definitions, trigger/FK side effects, generic tools, automatic schedule/penalty paths, and shared web/mobile callers. It is an implementation seam map, not a claim that V2 protections already exist. This pass read `AGENTS.md` and the bundled Next 16 route-handler, deployment and `after` guides. Existing concurrent changes were preserved.

Machine-readable companion: [execution-writers.json](execution-writers.json). Each curated entry has fields, protection and a Phase 1 seam; the JSON also carries exact ORM sites, method/delegate routes, ordered effective SQL functions, runtime raw SQL calls/sites, drop events and source hashes. Hashes anchor this mutable checkout; line numbers must be refreshed if concurrent edits change a file.

## Coverage and conclusion

The curated inventory contains **36 behavior groups**, backed by **105 exact ORM mutation sites**, **21 effective relevant SQL function signatures** and **65 indexed route files**. The mechanical index includes evidence/Planner lifecycle mutations and may contain dormant branches; groups below distinguish them. Pure calculators (`awardXP`, difficulty/session math), reads, styling writes and storage/media writes are not execution materializers. New Phase 0 V2 contract scaffolding/harness are owned by parallel agents and excluded from current execution authority.

Planner apply is not the only execution authority. Shared protection must include session start/settle and explicit Quest completion, ordinary Quest/Goal writes, chat moves/swaps/deletion, rest-day shifting, deadline sweeps, academic identity changes and erasure. Current Planner transactions use advisory namespace 73641; timer/reward RPCs do not. Client timer leadership is a local aid, not server pause/fencing authority.

## Verified writer groups

### Planner

**P01 — Initial confirmation / Roadmap expansion confirmation**

Sources: [lib/planner/server/materialize.ts:106](/Users/aliumair/Desktop/sylf/lib/planner/server/materialize.ts:106), [lib/planner/server/materialize.ts:78](/Users/aliumair/Desktop/sylf/lib/planner/server/materialize.ts:78), [app/api/planner/[id]/commit/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/planner/[id]/commit/route.ts:1).

**Writes:** Goal.*; Quest.title/description/date/requiredMinutes/targetMinutes/status/rewards; PlannerQuestLink.*; Plan.active/latestDraft/state/version; Revision.confirmation*.

**Current authority/protection:** Owned Plan/references; per-user 73641 advisory lock; serializable retry; version/digest/latest candidate/live availability; batch creation and receipt atomic. Replay transport key returns receipt; distinct key on same confirmed revision currently errors.

**Phase 1 seam:** Retain atomic batch/ownership core; require Goal; canonical timebox/criterion/resources; verify complete semantic correspondence; joint apply and receipt identity.

**P02 — Rebalance confirmation**

Sources: [lib/planner/server/rebalance.ts:990](/Users/aliumair/Desktop/sylf/lib/planner/server/rebalance.ts:990), [lib/planner/server/rebalance.ts:1114](/Users/aliumair/Desktop/sylf/lib/planner/server/rebalance.ts:1114), [app/api/planner/[id]/rebalance/confirm/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/planner/[id]/rebalance/confirm/route.ts:1).

**Writes:** Link disposition/questId/appliedRevision/baseline; Quest DELETE/new rows; Plan active/latest/version; Revision confirmation receipt.

**Current authority/protection:** Same Planner transaction/version/digest/live execution guards; protected items frozen. Replacement tombstones links before deleting; new Quests batched; retained Quests not rewritten.

**Phase 1 seam:** Use full content/effort/placement equality; shared coordinated apply; paused remaining-work overlay/withdrawal/continuation; no direct deletion of started history.

**P03 — Plan shells, generation/expansion attempts, revisions and archive**

Sources: [lib/planner/server/revisions.ts:26](/Users/aliumair/Desktop/sylf/lib/planner/server/revisions.ts:26), [lib/planner/server/revisions.ts:100](/Users/aliumair/Desktop/sylf/lib/planner/server/revisions.ts:100), [lib/planner/server/revisions.ts:492](/Users/aliumair/Desktop/sylf/lib/planner/server/revisions.ts:492), [lib/planner/server/operations.ts:28](/Users/aliumair/Desktop/sylf/lib/planner/server/operations.ts:28), [lib/planner/server/operations.ts:108](/Users/aliumair/Desktop/sylf/lib/planner/server/operations.ts:108).

**Writes:** Plan creation/current draft/version/state; Revision input/output/operation/lease/quota/receipt.

**Current authority/protection:** Planner transaction; owned references; unique creation/operation keys+hash; sealed snapshot guard; archive advances version and does not delete Quests. Current operation state is stored on Revision.

**Phase 1 seam:** Split Intent/Attempt from immutable Revision; fenced worker; preserve existing execution on archive unless separately authorized reviewed withdrawal.

**P04 — Optional stretch promotion**

Sources: [lib/planner/server/stretch.ts:71](/Users/aliumair/Desktop/sylf/lib/planner/server/stretch.ts:71), [app/api/planner/[id]/stretch/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/planner/[id]/stretch/route.ts:1).

**Writes:** Quest CREATE; Link CREATE baseline promotion; Plan.version.

**Current authority/protection:** Owned confirmed revision, expected version, live capacity and dependency checks; existing link makes retry no-op; transaction.

**Phase 1 seam:** Merge into requested change/review/apply; never promote because capacity exists.

**P05 — Copilot generated-item release**

Sources: [lib/planner/copilot/release.ts:286](/Users/aliumair/Desktop/sylf/lib/planner/copilot/release.ts:286), [lib/planner/copilot/release.ts:383](/Users/aliumair/Desktop/sylf/lib/planner/copilot/release.ts:383), [app/api/planner/intake/[id]/copilot/apply/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/planner/intake/[id]/copilot/apply/route.ts:1).

**Writes:** Link USER_RELEASED/questId=null/removal timestamps; Quest DELETE.

**Current authority/protection:** Owned active revision, execution classification/user lock; unlink/tombstone before delete in one transaction; protected sessions/terminal work blocked.

**Phase 1 seam:** Merge release into explicit diff/apply; preserve tombstones and no automatic reattachment; continuation uses withdrawal, not started-row deletion.

**P06 — Released-work reoffer accept/decline**

Sources: [lib/planner/server/reoffer.ts:129](/Users/aliumair/Desktop/sylf/lib/planner/server/reoffer.ts:129), [lib/planner/server/reoffer.ts:290](/Users/aliumair/Desktop/sylf/lib/planner/server/reoffer.ts:290), [app/api/planner/[id]/reoffer/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/planner/[id]/reoffer/route.ts:1).

**Writes:** Replacement Quest/Link CREATE; old Link reofferState/reofferedAt; Plan.version.

**Current authority/protection:** Owned/versioned transaction, live capacity, past-date fallback, original tombstone retained; explicit accept/decline.

**Phase 1 seam:** Merge into shared change/apply; restoration/continuation lineage and approved resources/criterion remain canonical.

**P07 — Manual linked Quest structural edit/delete escape hatch**

Sources: [lib/planner/server/mutation-guards.ts:47](/Users/aliumair/Desktop/sylf/lib/planner/server/mutation-guards.ts:47), [app/api/quests/[id]/route.ts:81](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:81), [app/api/quests/[id]/route.ts:298](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:298).

**Writes:** Quest title/description/date/required+target/difficulty/rewards/goalId or DELETE; Link DETACHED/DELETED via trigger.

**Current authority/protection:** Owned linked lookup; Planner transaction+Quest row lock; session existence protects unsafe date/time/delete fields; title/description may change after start; terminal edits blocked. Sets transaction-local sylf.planner_manual_quest. Mixed execution/structural commands rejected.

**Phase 1 seam:** Replace direct edit/detach with bounded reviewed Revision/apply. Keep started content immutable; add authoritative pause/version gates; do not allow generic tool bypass.

**P08 — Manual linked Goal edit and guarded bulk Goal deletion**

Sources: [lib/planner/server/mutation-guards.ts:19](/Users/aliumair/Desktop/sylf/lib/planner/server/mutation-guards.ts:19), [lib/planner/server/mutation-guards.ts:32](/Users/aliumair/Desktop/sylf/lib/planner/server/mutation-guards.ts:32).

**Writes:** Goal title/description/targetWeeks/targetDate/effort/status/color; unlinked Goal/Quest DELETE.

**Current authority/protection:** Planner transaction and Goal row lock; manual_goal setting permits direct linked Goal update; guarded delete rejects Planner-linked records.

**Phase 1 seam:** Goal display projection versus Plan intent must be explicit; semantic target changes create intent/proposal, cosmetic color may remain independent.

**P09 — Classic direct materializer**

Sources: [app/api/ai-planner/route.ts:148](/Users/aliumair/Desktop/sylf/app/api/ai-planner/route.ts:148), [app/api/ai-planner/route.ts:233](/Users/aliumair/Desktop/sylf/app/api/ai-planner/route.ts:233).

**Writes:** Goal.*; Quest.title/description/scheduledFor/requiredMinutes/difficulty/rewards/status; ChatSession/SystemMessage.

**Current authority/protection:** Cookie auth/quota and owned chat-session lookup; streamed provider result writes Goal and Quests directly in separate statements. No modern Plan/Revision/Link, confirmation transaction, execution correspondence or materialization idempotency.

**Phase 1 seam:** Retire after endpoint/client cutover. Do not reuse as fallback when modern generation fails; import existing rows as legacy unlinked work without invented provenance.

### Quest

**Q01 — Ordinary/manual or SubjectNode Quest creation**

Sources: [app/api/quests/route.ts:148](/Users/aliumair/Desktop/sylf/app/api/quests/route.ts:148), [app/api/quests/route.ts:321](/Users/aliumair/Desktop/sylf/app/api/quests/route.ts:321), [app/locker/components/CreateNodeQuestModal.tsx:160](/Users/aliumair/Desktop/sylf/app/locker/components/CreateNodeQuestModal.tsx:160).

**Writes:** Quest title/description/goal/subject/node/date/target+required/difficulty/rewards/scopeWeight/status.

**Current authority/protection:** Cookie auth, owned Goal/Subject/node, duration clamp 15–240, rest-day guard, server reward calculation; a single insert, no Planner user lock or idempotency key.

**Phase 1 seam:** Coordinate creation consuming global capacity; one duration contract; standalone Quests remain supported; node progress is execution evidence, not verified mastery.

**Q02 — Ordinary field/status update and explicit completion**

Sources: [app/api/quests/[id]/route.ts:79](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:79), [app/api/quests/[id]/route.ts:160](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:160), [app/api/quests/[id]/route.ts:217](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:217).

**Writes:** Quest title/description/requiredMinutes/date/elapsedSeconds/difficulty/goal/status/completedAt; completion RPC rewards; failure HP/ledger/message.

**Current authority/protection:** Linked structural helper first; owned Quest; date/rest checks. Status-only linked calls continue to normal execution. Completion uses claim_quest_reward then separate field update; failure status write precedes separate HP transaction. Unlinked requiredMinutes edits do not also synchronize targetMinutes.

**Phase 1 seam:** Separate structural apply from authoritative execution transition; remove client elapsedSeconds writes; coordinate completion/failure and timebox aliases with RPC disposition/version guards.

**Q03 — Single/bulk Quest deletion**

Sources: [app/api/quests/[id]/route.ts:283](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:283), [app/api/quests/route.ts:373](/Users/aliumair/Desktop/sylf/app/api/quests/route.ts:373).

**Writes:** Quest DELETE; StudySession.questId SET NULL; Link tombstone via trigger.

**Current authority/protection:** Single linked path uses helper; bulk preflight assertNoLinkedQuests; ownership filters; SQL trigger backstop. Ordinary deletes have no execution-history protection beyond FK retention.

**Phase 1 seam:** Explicit standalone deletion policy; linked withdrawal/apply, currentness invalidation and session coordination; retain actual histories.

### Goal

**G01 — Goal CRUD routes**

Sources: [app/api/goals/route.ts:59](/Users/aliumair/Desktop/sylf/app/api/goals/route.ts:59), [app/api/goals/route.ts:118](/Users/aliumair/Desktop/sylf/app/api/goals/route.ts:118), [app/api/goals/[id]/route.ts:62](/Users/aliumair/Desktop/sylf/app/api/goals/[id]/route.ts:62), [app/api/goals/[id]/route.ts:129](/Users/aliumair/Desktop/sylf/app/api/goals/[id]/route.ts:129).

**Writes:** Goal title/description/targetWeeks/date/effort/status/color; Goal/associated Quest DELETE.

**Current authority/protection:** Cookie auth/ownership and schema validation; linked PATCH manualGoal escape; guarded linked deletion; bulk route explicitly deletes Quests then Goals. No common global lock on unlinked creates/updates.

**Phase 1 seam:** Make Planner-linked outcome/deadline edits intent changes; preserve ordinary goals; deletion must coordinate dependencies and execution.

**G02 — Timeline adjustment endpoint**

Sources: [app/api/goals/[id]/adjust/route.ts:25](/Users/aliumair/Desktop/sylf/app/api/goals/[id]/adjust/route.ts:25), [app/api/goals/[id]/adjust/route.ts:75](/Users/aliumair/Desktop/sylf/app/api/goals/[id]/adjust/route.ts:75).

**Writes:** Goal.targetWeeks/effortLevel; PENDING Quest DELETE; SystemMessage CREATE.

**Current authority/protection:** Owned Goal and assertNoPlannerGoals; despite preview wording POST mutates. Goal update, delete and message are separate statements, no transaction/idempotency.

**Phase 1 seam:** Replace linked adjustment with reviewed change; ordinary path cannot race linked adoption; retirement/transport mapping must be explicit.

### Chat/calendar

**C01 — Generic chat Goal/Quest create/update**

Sources: [lib/ai/chat-tool-executor.ts:209](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:209), [lib/ai/chat-tool-executor.ts:251](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:251), [lib/ai/chat-tool-executor.ts:470](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:470), [lib/ai/chat-tool-executor.ts:567](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:567), [lib/ai/chat-tool-executor.ts:579](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:579).

**Writes:** Goal CREATE/update target/date/title/effort/status/color; Quest CREATE/update content/time/date/rewards/status.

**Current authority/protection:** Server executor receives authenticated user; referenced ownership, rest-day and reward-driving clamps; linked updates rejected with assertNoPlannerGoals/assertNoLinkedQuests. Multi-Quest creation loops individual calls, no common idempotent apply.

**Phase 1 seam:** Route authorized linked commands to shared change service; coordinate standalone calendar capacity; typed ownership registry; no parallel Planner-like materializer.

**C02 — Chat Goal/Quest destructive commands**

Sources: [lib/ai/chat-tool-executor.ts:291](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:291), [lib/ai/chat-tool-executor.ts:370](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:370), [lib/ai/chat-tool-executor.ts:651](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:651).

**Writes:** Goal/Quest single/bulk DELETE.

**Current authority/protection:** Bulk destructive commands require signed confirmation tokens; linked Goal deletion uses deleteUnlinkedGoals transaction and returns before old fallback code; Quest bulk checks links before delete. Tokens establish consent, not lifecycle correspondence.

**Phase 1 seam:** Retain destructive authorization and ownership; explicit linked withdrawal/plan archive route; quiesce execution before erasure.

**C03 — Chat completion**

Sources: [lib/ai/chat-tool-executor.ts:721](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:721), [lib/ai/chat-tool-executor.ts:760](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:760).

**Writes:** Quest.status/completedAt; User progression/currency/HP; reward ledgers/messages.

**Current authority/protection:** Owned Quest and authoritative claim_quest_reward RPC; linked status execution intentionally allowed.

**Phase 1 seam:** Same disposition/version/coordination as Focus completion; no completion for withdrawn originals; evidence of work does not imply mastery.

**C04 — Move, swap, clear-day tools**

Sources: [lib/ai/chat-tool-executor.ts:853](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:853), [lib/ai/chat-tool-executor.ts:890](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:890), [lib/ai/chat-tool-executor.ts:944](/Users/aliumair/Desktop/sylf/lib/ai/chat-tool-executor.ts:944).

**Writes:** Quest.scheduledFor.

**Current authority/protection:** Ownership/date/rest validation, linked rejection preflight; swap/clear updates transaction arrays. Clear scans fourteen days with simple capacity math. No execution-state lock or same-user Planner coordination for ordinary rows.

**Phase 1 seam:** Calendar-only allocator and reviewed linked diff; common global capacity lock; no duplicate date/duration math; non-running check.

### Focus/session

**S01 — Start and lazy recovery API**

Sources: [app/api/sessions/route.ts:62](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:62), [app/api/sessions/route.ts:85](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:85), [app/focus/components/FocusScreen.tsx:919](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:919).

**Writes:** StudySession CREATE/other endedAt; Quest PENDING→IN_PROGRESS.

**Current authority/protection:** Cookie auth→four-argument SQL start_study_session; owned Quest/Subject; capped backdate; adopts matching open row; closes other open rows. No request-key or explicit same-user SQL row/advisory lock in effective body.

**Phase 1 seam:** Durable RUNNING/PAUSED/ENDED and execution version; zero-second start protection; same user coordination; define takeover/adoption instead of implicit close.

**S02 — Heartbeat/finalize/complete API**

Sources: [app/api/sessions/route.ts:120](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:120), [app/api/sessions/route.ts:182](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:182), [app/focus/components/FocusScreen.tsx:479](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:479).

**Writes:** StudySession durationSeconds/minutes/breakSeconds/focusRate/endedAt/rewardsClaimed; Quest elapsed/status/completedAt; SubjectNode progress/mastery; User totals/progression/HP/currency/stats; ledgers/messages.

**Current authority/protection:** Authenticated ownership; SQL Session→Quest→User→Stats→Node locks; cumulative monotonic deltas, wall-clock cap, reward claim anchor. API final flood guard fails open on count failure. No execution generation/pause authority; SQL can auto-complete from elapsed target.

**Phase 1 seam:** Preserve exact delta/reward transaction; completion explicit, readiness separate; fenced transition and withdrawal guards; heartbeat cannot resurrect structural state.

**S03 — Weekly streak award after settlement**

Sources: [app/api/sessions/route.ts:210](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:210), [app/api/sessions/route.ts:247](/Users/aliumair/Desktop/sylf/app/api/sessions/route.ts:247).

**Writes:** User streakDays/lastActiveDate/sylph; InventoryItem decrement; SystemMessage.

**Current authority/protection:** Conditional updateMany elects one weekly winner; reward/consumable/message operations are outside settlement RPC and separate. Weekly sum uses durationMinutes.

**Phase 1 seam:** Preserve claim behavior in writer coordination; do not reset ledgers on plan changes; canonical actual-seconds aggregation and rollback test.

**S04 — Focus Party timer state**

Sources: [lib/focus-party-service.ts:328](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:328), [lib/focus-party-service.ts:358](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:358), [lib/focus-party-service.ts:388](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:388), [app/api/focus-party/[id]/session/timer/route.ts:1](/Users/aliumair/Desktop/sylf/app/api/focus-party/[id]/session/timer/route.ts:1).

**Writes:** FocusSessionMember elapsed/anchor/state; FocusSession/session membership.

**Current authority/protection:** Party membership/ownership and SQL member locks; separate public party RPC state; does not itself write ordinary StudySession/Quest in these bodies.

**Phase 1 seam:** Keep party participation separate; shared FocusScreen session writes still follow S01/S02. Durable study pause cannot be inferred from party member state.

**S05 — Focus Party membership and indirect timer termination**

Sources: [lib/focus-party-service.ts:219](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:219), [lib/focus-party-service.ts:232](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:232), [lib/focus-party-service.ts:252](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:252), [lib/focus-party-service.ts:272](/Users/aliumair/Desktop/sylf/lib/focus-party-service.ts:272), [prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:203](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:203).

**Writes:** FocusParty CREATE/disbandedAt/leaderId; FocusPartyMember CREATE/DELETE; SessionInvite.status; FocusSessionMember timer/leftAt; FocusSession.endedAt via delegated leave_focus_session.

**Current authority/protection:** Latest membership RPCs lock target User then Party; single-active-party/capacity triggers, owned caller/member/leader and invitation checks. Join existing membership is idempotent; leave/remove first call leave_focus_session. These mutate party execution, not StudySession.

**Phase 1 seam:** Retain independent social timer authority; verify mixed User/Party/member lock order and account erasure cascades. Party departure must not imply ordinary study completion or authoritative StudySession pause.

### Availability

**A01 — Weekly schedule settings**

Sources: [app/api/user/study-schedule/route.ts:58](/Users/aliumair/Desktop/sylf/app/api/user/study-schedule/route.ts:58), [app/calendar/components/StudyScheduleModal.tsx:67](/Users/aliumair/Desktop/sylf/app/calendar/components/StudyScheduleModal.tsx:67).

**Writes:** User.dailyGoalMinutes/restDays/enableHpPenalty.

**Current authority/protection:** Cookie auth, schema validation; ordinary User update, no Planner version or global lock; rest changes do not reschedule existing Quests here.

**Phase 1 seam:** Treat goal as preference; canonical availability acceptance/source; invalidate consequential candidate dependencies; reviewed calendar adaptation.

**A02 — Floating rest-day toggle and automatic shifting**

Sources: [app/api/user/study-schedule/floating-rest-day/route.ts:75](/Users/aliumair/Desktop/sylf/app/api/user/study-schedule/floating-rest-day/route.ts:75), [lib/study-schedule-service.ts:126](/Users/aliumair/Desktop/sylf/lib/study-schedule-service.ts:126).

**Writes:** FloatingRestDay CREATE/DELETE; Quest.scheduledFor.

**Current authority/protection:** Auth/date/week quota; create+shift one Prisma transaction; linked preflight blocks cascade; unique race path toggles row off; removal retries swallowed. Cascade includes IN_PROGRESS ordinary tasks and uses no session guard; lookup failures use defaults.

**Phase 1 seam:** Idempotent set-state rather than toggle retry; rest change plus reviewed linked placement; same lock and fail-closed required facts; preserve actual session dates.

**A03 — Deadline sweep**

Sources: [app/api/quests/check-deadlines/route.ts:7](/Users/aliumair/Desktop/sylf/app/api/quests/check-deadlines/route.ts:7), [app/api/quests/check-deadlines/route.ts:47](/Users/aliumair/Desktop/sylf/app/api/quests/check-deadlines/route.ts:47).

**Writes:** Quest.status=FAILED; User.hp; HpLedger/SystemMessage.

**Current authority/protection:** Cron Bearer secret with fail-closed constant-time comparison; GET sweeps all users' overdue PENDING/IN_PROGRESS tasks; per-task transaction; no common Planner lock, status/HP snapshots selected before transaction. Planner structural trigger permits status changes.

**Phase 1 seam:** Explicit execution failure policy and per-user coordinated version; fresh status and HP inside each transaction; no missed-study auto mutation incompatible with proposed recovery; penalties separate from mastery.

**A04 — Lazy daily-study penalty**

Sources: [lib/hp-penalty-service.ts:94](/Users/aliumair/Desktop/sylf/lib/hp-penalty-service.ts:94), [lib/hp-penalty-service.ts:435](/Users/aliumair/Desktop/sylf/lib/hp-penalty-service.ts:435), [app/api/user/heartbeat/route.ts:47](/Users/aliumair/Desktop/sylf/app/api/user/heartbeat/route.ts:47), [app/api/calendar/month/route.ts:40](/Users/aliumair/Desktop/sylf/app/api/calendar/month/route.ts:40).

**Writes:** User HP/lastDailyPenaltyEvaluatedDate; consumable inventory; HpLedger/SystemMessage.

**Current authority/protection:** Daily actual sessions/rest/goal evaluated; idempotency cursor, transaction for penalty application; GET calendar/month and POST heartbeat can trigger evaluation; not a Quest materializer.

**Phase 1 seam:** Retain accounting but audit date/actual-second dependency; separate desired intensity from account punishment target; lock order cannot invert shared execution lock.

**A05 — Timezone changes/onboarding**

Sources: [app/api/user/account/route.ts:102](/Users/aliumair/Desktop/sylf/app/api/user/account/route.ts:102), [app/api/user/onboarding/route.ts:101](/Users/aliumair/Desktop/sylf/app/api/user/onboarding/route.ts:101).

**Writes:** User.timezone.

**Current authority/protection:** Cookie auth and timezone validation; user update/transaction; no migration of existing civil Quest dates or Planner snapshots.

**Phase 1 seam:** Timezone dependency currentness and explicit boundary rules; never reinterpret old session dates silently.

### Subject/evidence

**D01 — Subject creation/onboarding**

Sources: [app/api/subjects/route.ts:124](/Users/aliumair/Desktop/sylf/app/api/subjects/route.ts:124), [app/api/user/onboarding/route.ts:200](/Users/aliumair/Desktop/sylf/app/api/user/onboarding/route.ts:200).

**Writes:** Subject CREATE/upsert academic identity; SubjectNode skeleton CREATE.

**Current authority/protection:** Authenticated user; transaction and unique user/code, active/archived identity checks; onboarding may update existing subject identity.

**Phase 1 seam:** Owned source registry and consequential academic identity generations; no inference that default board/year equals verified assessment.

**D02 — Subject metadata edit/archive/restore**

Sources: [app/api/subjects/[id]/route.ts:167](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/route.ts:167), [app/api/subjects/[id]/route.ts:228](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/route.ts:228), [app/api/subjects/[id]/restore/route.ts:55](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/restore/route.ts:55), [lib/subject-service.ts:20](/Users/aliumair/Desktop/sylf/lib/subject-service.ts:20).

**Writes:** Subject identity/title/description/archivedAt.

**Current authority/protection:** Owned active subject; archive soft-delete retains Quests/sessions/plans; unended StudySession preflight blocks archive, not transactionally coordinated. Dependency counts are advisory. Restore clears archivedAt.

**Phase 1 seam:** Owned source/evidence currentness; acknowledged execution-state check; do not physically cascade active subject history.

**D03 — AI syllabus compilation**

Sources: [app/api/subjects/[id]/compile/route.ts:118](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/compile/route.ts:118), [app/api/subjects/[id]/compile/route.ts:133](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/compile/route.ts:133).

**Writes:** SubjectNode title/description/difficulty/updatedAt; Subject.lastCompiledAt.

**Current authority/protection:** Owned nonarchived subject/cooldown/quota; provider outside transaction; batch node update does not change progress/mastery; cooldown stamp separate.

**Phase 1 seam:** Source-context hash and row generation currentness; freeze accepted scope/evidence instead of relabeling active tasks from fresh node text.

### Rewards

**D04 — Apex, skills, achievements, shop and stat investments**

Sources: [app/api/subjects/[id]/forge-apex/route.ts:100](/Users/aliumair/Desktop/sylf/app/api/subjects/[id]/forge-apex/route.ts:100), [app/api/skills/unlock/route.ts:78](/Users/aliumair/Desktop/sylf/app/api/skills/unlock/route.ts:78), [app/api/achievements/route.ts:111](/Users/aliumair/Desktop/sylf/app/api/achievements/route.ts:111), [app/api/shop/purchase/route.ts:30](/Users/aliumair/Desktop/sylf/app/api/shop/purchase/route.ts:30), [app/api/cognitive-stats/invest/route.ts:158](/Users/aliumair/Desktop/sylf/app/api/cognitive-stats/invest/route.ts:158).

**Writes:** SubjectNode mastery/progress; User/UserStats progression/currency/SP/attributes; UserAchievement/UserSkillNode/UserInventory; reward ledgers.

**Current authority/protection:** Owned server routes; atomic reward RPCs/claim anchors or per-route transactions. Share User/UserStats locks with settlement; unrelated XP/style must not stale proposals.

**Phase 1 seam:** Retain economy authorities; no academic mastery inference from progression. Respect global→Session/Quest→User lock order where relevant; do not rewrite historical rewards.

### Deletion/reset

**D05 — Reset progress**

Sources: [app/api/user/reset-progress/route.ts:69](/Users/aliumair/Desktop/sylf/app/api/user/reset-progress/route.ts:69).

**Writes:** User level/XP/rank/HP/streak/totalStudyMinutes; Quest/StudySession DELETE; SylphLedger/HpLedger DELETE.

**Current authority/protection:** Cookie auth/password or email-verification proof; Prisma transaction; no coordinated timer quiescence; linked Quest SQL guard blocks active-User reset. Does not reset totalStudySeconds/XpLedger/UserStats/Planner state in this body.

**Phase 1 seam:** Explicit coordinated reset policy; cancel attempts and quiesce sessions; preserve or reset all correlated authorities deliberately. This is not normal replan.

**D06 — Account deletion and FK cascades**

Sources: [app/api/user/account/delete/route.ts:65](/Users/aliumair/Desktop/sylf/app/api/user/account/delete/route.ts:65), [prisma/schema.prisma:386](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:386), [prisma/migrations/20260924010000_planner_foundation/migration.sql:224](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:224).

**Writes:** User DELETE; owned children CASCADE; optional academic references SET NULL; Planner links tombstone then cascade.

**Current authority/protection:** Authenticated password/token-confirmed irreversible erasure. Planner triggers explicitly permit account cascade after User disappears. Session/Quest/Goal/revision/link cascade order has DB implications.

**Phase 1 seam:** Cancellation/quiescence and worker fencing before erase; keep full erasure authorized; do not emulate deletion with active-plan withdrawal.

### Maintenance

**X01 — Development seed and QA script**

Sources: [prisma/seed.ts:64](/Users/aliumair/Desktop/sylf/prisma/seed.ts:64), [prisma/seed.ts:77](/Users/aliumair/Desktop/sylf/prisma/seed.ts:77), [prisma/seed.ts:101](/Users/aliumair/Desktop/sylf/prisma/seed.ts:101), [scripts/qa-planner-session.mjs:26](/Users/aliumair/Desktop/sylf/scripts/qa-planner-session.mjs:26).

**Writes:** Synthetic Goal/Quest/StudySession/User CREATE.

**Current authority/protection:** Operator scripts, not production routes; no Planner lifecycle/lock. Not executed for this inventory.

**Phase 1 seam:** Keep isolated disposable fixtures; do not run against user data or use script writes as evidence of production protections.

**X02 — Existing PostgreSQL verification-script writers**

Sources: [scripts/verify-focus-party.mjs:51](/Users/aliumair/Desktop/sylf/scripts/verify-focus-party.mjs:51), [scripts/verify-focus-party.mjs:548](/Users/aliumair/Desktop/sylf/scripts/verify-focus-party.mjs:548), [scripts/verify-single-active-party.mjs:47](/Users/aliumair/Desktop/sylf/scripts/verify-single-active-party.mjs:47), [scripts/verify-realtime-security.mjs:67](/Users/aliumair/Desktop/sylf/scripts/verify-realtime-security.mjs:67), [scripts/verify-phase2-service.mjs:75](/Users/aliumair/Desktop/sylf/scripts/verify-phase2-service.mjs:75), [scripts/confirm-invites-and-rejoin.mjs:47](/Users/aliumair/Desktop/sylf/scripts/confirm-invites-and-rejoin.mjs:47).

**Writes:** Synthetic User INSERT/DELETE; Focus Party/session/member mutation RPCs.

**Current authority/protection:** Operator-run scripts create synthetic users, exercise raw RPCs and delete test users through FK cascades. They use elevated DB paths and have no Planner lifecycle protocol. No script was executed by this inventory.

**Phase 1 seam:** Restrict to disposable fixture database and carry forward useful concurrency checks; source-level presence is not evidence that deployment or cascade tests passed.

## Effective SQL surface, not historical copies

Definitions are resolved in migration-directory lexical order and keyed by normalized input signature; DROP events remove old overloads. This is repository truth conditional on deployment. A hosted `pg_proc`/trigger/grant catalog and migration ledger check remains necessary. Creation order from an unsorted `rg` result is not effective order.

| Function | Effective source | Mutation/claim role |
| --- | --- | --- |
| `public.claim_achievement_reward_atomic(text,text,integer,integer,text)` | [prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:800](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:800) | SylphLedger, User, UserAchievement, UserStats, XpLedger; 2 explicit row-lock statements; no advisory lock in body |
| `public.claim_quest_reward(integer,integer,text)` | [prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:533](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:533) | HpLedger, Quest, SylphLedger, SystemMessage, User, UserStats, XpLedger; 2 explicit row-lock statements; no advisory lock in body |
| `public.commit_focus_progression(integer,integer,integer,integer,integer,integer,integer)` | [prisma/migrations/20260821000000_add_user_stats_and_progression_rpc/migration.sql:37](/Users/aliumair/Desktop/sylf/prisma/migrations/20260821000000_add_user_stats_and_progression_rpc/migration.sql:37) | UserStats; 1 explicit row-lock statements; no advisory lock in body |
| `public.commit_forge_progress(text,integer,integer)` | [prisma/migrations/20260821030000_add_concept_forge_rpc/migration.sql:4](/Users/aliumair/Desktop/sylf/prisma/migrations/20260821030000_add_concept_forge_rpc/migration.sql:4) | SylphLedger, UserForgeCoreMastery, UserForgeProgress, UserStats; 1 explicit row-lock statements; no advisory lock in body |
| `public.complete_study_session(integer,integer,integer,integer,integer,integer,integer,integer,boolean)` | [prisma/migrations/20260827000000_s2_security_hardening/migration.sql:692](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827000000_s2_security_hardening/migration.sql:692) | Quest, StudySession, SylphLedger, SystemMessage, User, UserStats, XpLedger; 2 explicit row-lock statements; no advisory lock in body |
| `public.create_focus_party(integer,text)` | [prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:60](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:60) | FocusParty, FocusPartyMember; 1 explicit row-lock statements; no advisory lock in body |
| `public.enter_focus_session(integer,integer)` | [prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:420](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:420) | FocusSession, FocusSessionMember; 3 explicit row-lock statements; no advisory lock in body |
| `public.forge_apex_node_atomic(text,text,text)` | [prisma/migrations/20260827040000_fix_apex_synthesis_threshold/migration.sql:6](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827040000_fix_apex_synthesis_threshold/migration.sql:6) | SubjectNode, SylphLedger, User, UserStats, XpLedger; 3 explicit row-lock statements; no advisory lock in body |
| `public.join_focus_party(integer,integer)` | [prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:116](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:116) | FocusPartyMember, SessionInvite; 2 explicit row-lock statements; no advisory lock in body |
| `public.leave_focus_party(integer,integer)` | [prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:203](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:203) | FocusParty, FocusPartyMember; 2 explicit row-lock statements; no advisory lock in body |
| `public.leave_focus_session(integer,integer)` | [prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:740](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:740) | FocusSession, FocusSessionMember; 1 explicit row-lock statements; no advisory lock in body |
| `public.pause_focus_timer(integer,integer)` | [prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:591](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:591) | FocusSessionMember; 1 explicit row-lock statements; no advisory lock in body |
| `public.planner_quest_guard()` | [prisma/migrations/20260924010000_planner_foundation/migration.sql:217](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:217) | PlannerQuestLink; 0 explicit row-lock statements; no advisory lock in body |
| `public.purchase_shop_item(integer)` | [prisma/migrations/20260821010000_add_economy_and_inventory_rpcs/migration.sql:4](/Users/aliumair/Desktop/sylf/prisma/migrations/20260821010000_add_economy_and_inventory_rpcs/migration.sql:4) | SylphLedger, User, UserInventory, UserStats; 1 explicit row-lock statements; no advisory lock in body |
| `public.remove_focus_party_member(integer,integer,integer)` | [prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:295](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907030000_focus_party_single_active_membership/migration.sql:295) | FocusPartyMember; 2 explicit row-lock statements; no advisory lock in body |
| `public.resume_focus_timer(integer,integer)` | [prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:669](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:669) | FocusSessionMember; 1 explicit row-lock statements; no advisory lock in body |
| `public.settle_study_session_atomic(integer,integer,integer,integer,integer,integer,boolean,boolean,text)` | [prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:13](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827050000_sp_stipend_level_rank_ups/migration.sql:13) | HpLedger, Quest, StudySession, SubjectNode, SylphLedger, SystemMessage, User, UserStats, XpLedger; 5 explicit row-lock statements; no advisory lock in body |
| `public.start_focus_timer(integer,integer)` | [prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:520](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:520) | FocusSessionMember; 1 explicit row-lock statements; no advisory lock in body |
| `public.start_study_session(integer,integer,integer,integer)` | [prisma/migrations/20260827000000_s2_security_hardening/migration.sql:57](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827000000_s2_security_hardening/migration.sql:57) | Quest, StudySession; 0 explicit row-lock statements; no advisory lock in body |
| `public.unlock_skill_node(integer)` | [prisma/migrations/20260821020000_add_skill_tree_rpc/migration.sql:4](/Users/aliumair/Desktop/sylf/prisma/migrations/20260821020000_add_skill_tree_rpc/migration.sql:4) | UserSkill, UserStats; 1 explicit row-lock statements; no advisory lock in body |
| `public.unlock_skill_node_atomic(text,text,integer,text[])` | [prisma/migrations/20260827000000_s2_security_hardening/migration.sql:1549](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827000000_s2_security_hardening/migration.sql:1549) | UserSkillNode, UserStats; 1 explicit row-lock statements; no advisory lock in body |

Important distinctions:

- `start_study_session(integer,integer,integer,integer)` is the S2 definition at line 57. It bounds carryover, adopts a matching open row and ends other open rows; no explicit locking/unique-open claim establishes race safety in that body. A Phase 1 harness must exercise concurrent starts, not treat the adoption query as idempotency proof.
- `settle_study_session_atomic` and `claim_quest_reward` are superseded by the SP-stipend migration. Preserve exact delta accounting, ownership, ledgers, terminal claim anchors and canonical XP behavior while adding coordination/version/disposition checks.
- `complete_study_session` remains an alternative SQL implementation at S2 line 692; no `app/`/`lib/` runtime caller was found. It is not equivalent to the current settle API. Retire or explicitly restrict it during SQL consolidation.
- `claim_session_reward_atomic(text,text,integer,integer,text,numeric)` is **dropped** by S2 line 51. The Prisma comment mentioning it is stale and does not make it active. The three-argument start overload was dropped by the 20260826050000 migration.
- Legacy `commit_focus_progression`, `commit_forge_progress` and `unlock_skill_node` remain defined in migration history with no runtime caller found in this pass. Their object/grant presence must be checked before cutover; do not conflate them with the current atomic route RPCs.
- Focus-party start/pause/resume mutate `FocusSessionMember`, not `StudySession`; this separate party state cannot prove that ordinary study execution is paused. Latest create/join/leave/remove-member are the single-active-membership migration, not the previous security migration. Leave/remove indirectly call `leave_focus_session`, banking party time and possibly ending its session; no ordinary StudySession write follows inside those bodies.

## SQL guards, privilege boundaries and cascades

The effective `planner_quest_guard` is [prisma/migrations/20260924010000_planner_foundation/migration.sql:217](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:217). It intercepts linked UPDATE/DELETE; structural fields include ownership, title, description, date, both duration aliases, difficulty/rewards, academic references and scopeWeight. Status/completedAt/elapsed writes are nonstructural and pass. A transaction-local per-Quest setting admits manual structural writes. Started title/description changes are currently outside its unsafe-field set. Deletion creates a tombstone; manual update detaches the link. This is weaker than V2 exact-revision correspondence and immutable started content.

The Goal guard at [prisma/migrations/20260924010000_planner_foundation/migration.sql:260](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:260) rejects linked updates/deletes unless the authorized manual setting permits an update. Revision guards at [prisma/migrations/20260924010000_planner_foundation/migration.sql:163](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:163) protect sealed payloads/receipts. Latest `planner_ownership_guard` is [prisma/migrations/20260927100000_planner_reoffer_state/migration.sql:29](/Users/aliumair/Desktop/sylf/prisma/migrations/20260927100000_planner_reoffer_state/migration.sql:29); it includes released/reoffer identity rules. Keep those SQL race backstops rather than relying on frontend conventions.

S2 [prisma/migrations/20260827000000_s2_security_hardening/migration.sql:31](/Users/aliumair/Desktop/sylf/prisma/migrations/20260827000000_s2_security_hardening/migration.sql:31) revokes RPC execution from PUBLIC/anon/authenticated/service_role and table/sequence privileges from anon/authenticated, and establishes secure postgres default grants. Private Planner tables have RLS with no client policies/grants at [prisma/migrations/20260924010000_planner_foundation/migration.sql:272](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:272). Other owned tables have RLS policies but policies alone do not grant PostgREST write access. No direct client Supabase execution-table insert/update/delete/RPC call was found in the inspected web/mobile code. Normal app routes use privileged Prisma SQL. Verify actual deployed roles/grants/function owners; source migration comments are not evidence of live privileges, and privileged server credentials are outside RLS owner filters.

| Parent action | Indirect behavior | Source |
| --- | --- | --- |
| Quest DELETE | StudySession.questId SET NULL; PlannerQuestLink.questId SET NULL; trigger additionally tombstones linked deletion. Actual sessions survive except full user/reset erasure. | [prisma/schema.prisma:597](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:597), [prisma/schema.prisma:489](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:489) |
| Goal DELETE | Quest.goalId and Plan.goalId SET NULL at FK level, but routes often explicitly delete Quests first; linked Goal trigger normally rejects. | [prisma/schema.prisma:387](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:387), [prisma/schema.prisma:416](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:416) |
| Subject hard DELETE | SubjectNode CASCADE; Quest/StudySession/Plan Subject refs SET NULL; deleted nodes null Quest node refs. Normal subject API archives instead. | [prisma/schema.prisma:353](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:353), [prisma/schema.prisma:388](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:388), [prisma/schema.prisma:599](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:599) |
| Plan DELETE | Revisions/links/checks/preferences/friction cascade; Intake plan ref SET NULL; revision reference constraints/active pointers must be respected. No normal Plan hard-delete route found; archive preserves execution. | [prisma/schema.prisma:455](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:455), [prisma/schema.prisma:488](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:488), [prisma/schema.prisma:585](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:585) |
| User DELETE | Goals/subjects/nodes/Quests/sessions/Plans/revisions/links/ledgers and other owned children cascade. Planner Quest/Goal triggers explicitly permit account erasure after parent removal. | [prisma/schema.prisma:386](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:386), [prisma/schema.prisma:595](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:595), [prisma/migrations/20260924010000_planner_foundation/migration.sql:224](/Users/aliumair/Desktop/sylf/prisma/migrations/20260924010000_planner_foundation/migration.sql:224) |

Focus-party member deletion has an ended-session guard ([prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:134](/Users/aliumair/Desktop/sylf/prisma/migrations/20260907010000_focus_party_security_hardening/migration.sql:134)). Single-active-party and capacity triggers lock User/Party rows. These are indirect erasure/lock dependencies: an account cascade through historical party participation must be tested; this inventory does not assert its success. Style-only FocusBackground deletion updates User preference and is excluded from execution authority; its presence must not invalidate educational currentness.

Do not assume SQL cascade ordering or constraint deferral from Prisma types. The deployed FK/trigger catalog and integration fixture must confirm actual behavior; owner erasure, Plan pointers and revision NoAction references are required migration tests.

## Timer/client/mobile call coverage

| Caller | Current behavior | Phase 1 seam |
| --- | --- | --- |
| [app/focus/components/FocusScreen.tsx:479](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:479) | Serializes progress PATCH; primary tab only; exact cumulative seconds, breakSeconds, final/complete flags; keepalive recovery. | Versioned acknowledged execution transitions; withdrawal rejection; no auto-completion from time. |
| [app/focus/components/FocusScreen.tsx:919](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:919) | Lazy POST with initialSeconds; local session ID restoration. | Zero-second authoritative start; idempotent ownership/takeover and reconnect. |
| [app/focus/components/FocusScreen.tsx:1143](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:1143) | Pause/resume banks epoch snapshot, local storage, BroadcastChannel then non-final duration flush. Server never receives paused boolean/state. | Add durable session state/version before remaining work may move; local display follows acknowledged state. |
| [app/focus/hooks/useTimerLeadership.ts:20](/Users/aliumair/Desktop/sylf/app/focus/hooks/useTimerLeadership.ts:20), [lib/timer-leader.ts:23](/Users/aliumair/Desktop/sylf/lib/timer-leader.ts:23) | Web Locks or localStorage four-second lease, primary/mirror tabs. | Retain same-browser assistance; it does not fence another device or PostgreSQL writer. |
| [app/goals/components/QuestsTab.tsx:103](/Users/aliumair/Desktop/sylf/app/goals/components/QuestsTab.tsx:103), [app/goals/components/GoalsTab.tsx:140](/Users/aliumair/Desktop/sylf/app/goals/components/GoalsTab.tsx:140) | Manual create/edit/delete and bulk calls use existing routes. | Shared linked review/apply; truthful errors/cache invalidation. |
| [app/locker/components/CreateNodeQuestModal.tsx:160](/Users/aliumair/Desktop/sylf/app/locker/components/CreateNodeQuestModal.tsx:160) | Node Quest create then Focus navigation. | Canonical time/resource/criterion execution context; maintain standalone support. |
| [app/components/Calendar/StudyCalendar.tsx:428](/Users/aliumair/Desktop/sylf/app/components/Calendar/StudyCalendar.tsx:428), [app/calendar/components/StudyScheduleModal.tsx:67](/Users/aliumair/Desktop/sylf/app/calendar/components/StudyScheduleModal.tsx:67) | Rest toggle and weekly preference edits. | Idempotent set-state and shared availability/currentness. |
| [app/settings/account/services/account-capability.ts:127](/Users/aliumair/Desktop/sylf/app/settings/account/services/account-capability.ts:127) | Reset/delete authenticated routes. | Explicit erasure coordination and stale worker/session invalidation. |
| [mobile/src/components/MobileRouteOutlet.tsx:25](/Users/aliumair/Desktop/sylf/mobile/src/components/MobileRouteOutlet.tsx:25) | Lazy-imports shared Focus/Timer/System/Goals/Quests/Calendar screens; no independent production execution engine. | Same client contract must ship to supported mobile build; /planner dynamic route not presently in explicit route map. |
| [mobile/src/main.tsx:8](/Users/aliumair/Desktop/sylf/mobile/src/main.tsx:8), [lib/api-transport.ts:23](/Users/aliumair/Desktop/sylf/lib/api-transport.ts:23) | Configures API base; shared fetch paths need adapter/resolution audit. | Version admission/retirement responses; cannot drop aliases while supported mobile keeps old wire semantics. |
| [mobile/src/adapters/api/mock-api.ts:1324](/Users/aliumair/Desktop/sylf/mobile/src/adapters/api/mock-api.ts:1324) | Explicit opt-in development mock intercepts session/Quest/Goal/rest writes in memory. | Mock behavior cannot establish SQL integrity; keep production mock gate and real-device verification. |
| [mobile/src/adapters/account/mobile-account-capability.ts:1](/Users/aliumair/Desktop/sylf/mobile/src/adapters/account/mobile-account-capability.ts:1) | Mobile account adapter has documented nonproduction capability limits. | Verify actual reset/delete availability and new route handoff; never infer success from mock screens. |

Planner transport delegates are indexed in JSON: generation, draft edits, commit/recover, rebalance/confirm, milestone expansion, stretch/reoffer, intake/copilot release, preferences/checks/friction. These mostly import shared server services; the route file itself need not contain an ORM mutation. The generic system chat route delegates tool writes to `executeChatTool`; inherited authorization is cookie authenticated and destructive bulk tokens stay necessary.

## Duration/date/reward contract dependencies

- Current Quest has **targetMinutes and requiredMinutes**, default 45; actual elapsed is seconds. Ordinary required-only PATCH, Classic, API creation, Planner mapQuest, Focus countdown and SQL completion disagree on which alias owns behavior. V2 removal must change every reader/writer, not just Prisma. [prisma/schema.prisma:371](/Users/aliumair/Desktop/sylf/prisma/schema.prisma:371), [app/focus/components/FocusScreen.tsx:612](/Users/aliumair/Desktop/sylf/app/focus/components/FocusScreen.tsx:612), [app/api/quests/[id]/route.ts:138](/Users/aliumair/Desktop/sylf/app/api/quests/[id]/route.ts:138).
- Planner writes both aliases equally and calculates rewards from time/difficulty; Classic is a separate Goal/Quest materializer with no modern lineage/idempotency: [app/api/ai-planner/route.ts:148](/Users/aliumair/Desktop/sylf/app/api/ai-planner/route.ts:148), [app/api/ai-planner/route.ts:233](/Users/aliumair/Desktop/sylf/app/api/ai-planner/route.ts:233). Retire it after migration/client cutover; include it in the machine index, not a fallback execution route.
- StudySession stores exact actual seconds and derived whole minutes, break seconds, claim anchor and actual dates. Preserve accepted time/rewards; add remaining estimate as approved future overlay, not planned minus elapsed as mastery. Current SQL settlement can complete when elapsed reaches target even if final=false; update every remaining completion RPC or restrict unused variants.
- Civil Quest dates are strings; Goal targetDate is a representational UTC date; sessions are timestamps; timezone changes affect daily aggregation. Avoid UTC parsing silently shifting user-chosen civil dates. Calendar reads/daily penalties/weekly streak and Planner capacity all need the same actual-versus-future interpretation.
- Session/Quest rewards are authoritative transactional SQL; `calculateQuestRewards`, `awardXP` and session math are pure calculators, not writers. Investments, shop and achievements share progression locks but their unrelated changes must not stale educational drafts.

## Coordination and required migration seams

Current lock domains are separate: Planner takes user advisory namespace 73641 then Plan/affected rows; settle takes Session→Quest→User→Stats→Node; claim takes Quest→User; start has ownership/select/adopt logic but no common user lock. Manual Quest edits lock Quest within Planner transaction; ordinary unlinked edits, schedule setting, deadline sweeps and archive checks do not. SQL guards catch linked structural writes but cannot coordinate a new zero-second session with every semantic diff today.

Phase 1 must establish the documented **user coordination first**, then stable target/Session/Quest ordering before User/Stats/Node economics. Every structural execution transition and linked apply must use it, including existing RPCs. High-frequency cumulative progress may use a narrower safe protocol only if it cannot change running/paused/disposition/completion state. Audit SQL wrappers, trigger order and retry handling together; adding the user lock only to TypeScript leaves independent RPC races.

Retain migration dependencies: canonical XP helpers from the Aug 22/Aug 26 chain; S2 privilege/identity baseline; SP-stipend effective settle/claim; Focus-party SQL; Planner foundation FK/immutability/structural guards; latest reoffer ownership guard; subject archive; intake/check/preference sidecars. Apply additive schema, migrate execution/duration readers and writers, verify source/catalog correspondence and only then contract old aliases/engines. Do not copy historical function text over newer economy fixes.

## Coverage gaps and Phase 0 handoff

1. This report verifies repository source, not deployed function bodies/grants/FKs/migration ledger. The PG-harness/migration owner must check catalog signatures, checksums, role access and trigger/cascade behavior without relying on source comments.
2. Mechanical exact-site scanning cannot prove absence of dynamic SQL, external admin scripts, dashboard-created jobs/triggers or writes outside this repository. Inventory all deployed triggers, scheduled jobs and elevated DB principals before cutover. No such external systems were accessed here.
3. Runtime/database concurrency, cascade rollback, elapsed-overrun behavior and mobile real-network calls were not executed by this read-only inventory. Required fixture cases: concurrent starts, start-vs-apply, paused-vs-resume, settle-vs-withdrawal, manual completion of withdrawn originals, bulk/reset/archive races, duplicate rest toggle, duplicate receipt and final reward replay.
4. Account reset already crosses many authorities and is blocked by linked guards; do not silently broaden it as a Planner fix. Root migration mapping must make its desired history/reset semantics explicit.
5. Owned Subject archive/compile and Goal edits can change context without Planner pointers; Phase 1 dependencies must be value/semantic generations rather than blanket account timestamp hashes. Existing `loadAvailability` hashes whole Quest/session data, causing excessive conflict surface.
6. Actual app/server transport, supported mobile version inventory and privileged roles must be verified by release owners. The mobile mock is deliberately excluded as integrity evidence.

**Handoff:** this inventory supplies source seams and test targets for the contracts, migration mapping and real PostgreSQL harness owners. No application implementation is included.
