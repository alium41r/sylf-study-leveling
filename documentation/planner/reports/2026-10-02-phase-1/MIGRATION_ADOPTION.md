# Phase 1 duration and lineage adoption

The only new migration is `prisma/migrations/20261002000000_planner_v2_durable_core/migration.sql`. Historical migrations and frozen contracts remain unchanged. This is the expand/adoption implementation of [the Phase 0 map](../2026-10-02-phase-0/MIGRATION_MAP.md); it does not run a hosted backfill or retire distributed clients.

## Expand and execution authority

Only IntentVersion and Attempt are new durable entities. Existing Plan/Revision/Quest/link/StudySession/AI telemetry receive additive contract, identity, sealed-artifact, remaining-work, execution-version and accounting fields. Old IDs, revisions, rewards and timebox aliases are retained. Prisma generation and schema build version are updated. V2 linked timers use acknowledged RUNNING / PAUSED / ENDED; legacy null-ended timers are not interpreted as paused. Session time stays in the existing timer/economic authorities.

For V2, `plannedMinutes` is the approved original total timebox. Remaining work is an explicit forecast with an actual-seconds basis. Accepted subsequent progress reduces that forecast; an incomplete overrun remains positive and requests reassessment. Completed/withdrawn work reserves zero. Elapsed seconds never prove mastery or work completion. Read adapters expose the approved timebox and derived remaining work without mutating sealed artifacts on GET. Calendar capacity counts accepted actual effort on its frozen civil date plus eligible remaining commitments once. Moving future placement does not move actual history. Daily read/penalty/weekly settlement use accepted session civil dates, with legacy timezone fallback only where no accepted attribution exists.

## Reviewed adoption

`AdoptionService.inspect` inventories the owned Plan or Classic Goal, all live Goal work (including missing old links), link/tombstone/revision provenance, sessions, duration conflicts and actual-history discrepancies. The digest pins review. `adopt` requires an explicit review for every Quest and executes under the same user/session/Quest locks as apply. Repeated identical requests return the original receipt; changed execution or request identity fails.

| Classification | Implemented treatment |
| --- | --- |
| Valid unstarted work | Import exact live content/identity/date/timebox; create activity/link identity once. |
| Conflicting `requiredMinutes` / `targetMinutes` | Preserve both originals in migration evidence; use audited `requiredMinutes` execution baseline, never the larger alias. |
| Started unfinished work | Drain old open timer first; review remaining estimate explicitly; retain original content, sessions, rewards and accepted actuals. |
| Completed valid work | Preserve completion/reward history, zero future remaining; fabricate no session/mastery/check evidence. |
| Invalid unfinished date/timebox/history | Block adoption and retain an explicit exception; no clipping, splitting or invented duration. |
| Invalid completed historical record | Preserve untouched as history-only, record the exception and protect it against generic edits or legacy timer revival after Goal adoption. |
| Revision/live divergence | Baseline derives from actual live Quests; old sealed revisions remain inspectable and unchanged. |
| Roadmap/expansion state | Keep original strategic/expansion revisions and lineage IDs; baseline all live expanded work, including orphan Goal commitments. |
| Removed/detached work | Keep permanent tombstones; detached live work needs explicit adoption authorization. No silent reattachment. |
| Work linked to another Plan | Reject ambiguous ownership; do not reassign provenance. |
| Open old timer / PREPARING old operation | Require explicit drain/quiescence and old reservation settlement before adoption. No running V2 conversion. |
| Missing owned Goal | Create a truthful owned Goal in the transaction; no foreign or guessed Subject assignment. |
| Oversized imported envelope | Fail closed and retain protected legacy work until a reviewed segmentation resolves it; no silent truncation. |

The baseline carries `LEGACY_UNREVIEWED`, original duration pairs, original link/session digests, original revision IDs, preserved descriptions and the cutover attribution basis. Imported remaining/effort summaries are legacy estimates, **not** an AI-quality recommendation. No passed reviewer or LearningBlueprint is fabricated. Historical zero AI-cost estimates remain stored unchanged and are reported as unverified without a durable priced-dispatch receipt; nullable new prices remain explicitly unknown, while a settled priced zero remains distinguishable. Original instants remain intact; if historical timezone is unavailable, evidence explicitly records cutover-timezone attribution rather than claiming historical certainty. Baseline/migration evidence is immutable.

## Apply after adoption

One ApplyService handles all new/replan/joint proposals. Kept Quest rows are not rewritten. An unstarted semantic edit keeps identity and updates exact content/specification. Started content/original timebox/economics remain frozen; acknowledged pause permits only reviewed placement/remaining changes. Withdrawal preserves original history with zero remaining and prohibits completion rewards. A continuation is a distinct linked activity; it never copies actual seconds or pretends the old Quest was completed. New cross-plan prerequisites can materialize in one joint transaction; unselected dependencies remain pinned and protected.

SQL requires canonical capabilities/currentness for adopted work. Generic structural Goal/Quest/chat/calendar requests fail explicitly. Old service paths cannot mutate adopted Plans. Classic refuses adopted users before provider dispatch and at final write. Disabling admission preserves owned workspace/revision/operation reads, cancellation and Quest/Focus execution. Alias/legacy endpoint removal is deferred until supported-client release; no adopted Goal can switch back to a legacy engine.

## Qualification versus release

Local tests cover matching/conflicting baselines, duplicate adoption, invalid history/future exceptions, drain refusal, injected rollback, real live-versus-revision divergence, repeated replans, Roadmap expansions, UTF-8 envelope sizes, missing old links, continuation reward integrity and account erasure. They compare original rows/ledgers and actual instants rather than only status codes.

The harness installs the audited schema bootstrap plus actual dependency migrations and the new migration. It deliberately does **not** claim a full historical migration-chain replay: the pre-existing bootstrap gap remains. Phase 5 must rehearse the actual migration ledger on a disposable representative copy, enumerate distributed web/Android builds and external writers, qualify runtime grants, compare row/lineage/session/ledger totals, resolve exceptions, and demonstrate rollback. No hosted user records or historical migration files were changed here.
