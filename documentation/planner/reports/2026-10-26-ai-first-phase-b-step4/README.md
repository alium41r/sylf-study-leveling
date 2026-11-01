# Phase B Step 4 — Calendar-Aware Capacity

26 October 2026. Implements the [Step 4 handoff](../2026-10-26-ai-first-phase-b-step3/STEP_4_HANDOFF.md) under the [approved direction](../../AI_FIRST_PLANNER_HANDOFF.md), [foundation contract](../../AI_FIRST_FOUNDATION.md#calendar-capacity) and [Phase B plan](../2026-10-25-ai-first-phase-a/PHASE_B_PLAN.md).

## Result

Admitted compiler-v2 research now proceeds into real Calendar capacity through the existing compiler, Attempt, owner transaction and allocator. It retains realistic available minutes and a verifiable joint allocation of existing commitments before any strategy generation. Exact accepted study windows, native/shared/external events, actual study, competing tasks, protected work, rest dates, deadlines, daily/weekly/per-goal limits and recovery margins govern the result.

This completes Step 4. Natural strategy/translation, independent review/refinement and confirmation remain gated. Public admission remains compiler v1. No UI, paid call, production routing change, deployment or migration deployment occurred.

## Completed guarantees

| Area | Implemented behavior |
| --- | --- |
| Accepted availability | Optional versioned `availability.studyWindows` with Monday-indexed weekly civil intervals and dated overrides. Empty windows mean unavailable; absent windows require an explicit v2 decision. Calendar's daytime display window/time blocks and AI inferences do not grant study availability. Historical intents/hashes remain compatible. |
| Calendar reuse | A transaction adapter reads canonical private/shared/external tables and reuses existing DTO, recurrence/override, timezone and cache-coverage owners. It reads no credentials/notes, requests no sync and calls no provider. Native/shared membership and external planning inclusion are versioned; visibility cannot hide a planning commitment. |
| Geometry | Union overlapping accepted windows; subtract unioned busy intervals once. Transparent events are ignored; busy/tentative commitments block; all-day busy commitments block their civil dates. Rest/blocked dates bind. DST uses canonical local-time conversion and actual elapsed UTC minutes. Nonexistent accepted clock boundaries require a decision. Past current-day time cannot be promised. |
| Workload | Reuse canonical accepted actual/remaining ledgers. Actual study stays on its session civil date. Selected unstarted work is replaceable; started selected and competing remaining work are retained once. Daily physical and accepted-minute bounds apply concurrently, with one recovery margin. Existing same-week outside-window usage and per-goal ceilings remain authoritative. |
| Allocation | Extend the existing allocator with bounded joint interval packing and date backtracking. Indivisible activities cannot span gaps or reuse another task's time. Same-day hard prerequisites retain order, including external reservation references. Protected remaining work participates without charging its approved timebox again. Zero new activities still require a verified baseline. |
| Honest outcomes | READY means verified baseline capacity, not proof an unwritten strategy fits. Missing availability, overdue/protected constraint conflicts and unknown durations/reestimates require a decision. Disconnected, stale, incomplete or pending external changes remain INCOMPLETE. Checked mathematical bounds support CAPACITY_SHORTFALL; bounded search failure remains ALLOCATION_UNRESOLVED. |
| Durable correspondence | CAPACITY value v2 retains full evidence, facts, status/reasons and currentness digests. DOSSIER value v3 refers to the exact complete research dossier v2 and capacity version. Capture plus both writes is atomic under the existing owner/lease/fence/deadline checks. Immutable v1/v2 historical artifacts remain readable. |
| Recovery/currentness | Separate owned live revalidation from historical inspection; check again after retention before advancing. Explicit CAS refresh appends capacity/dossier versions, retaining original research/root/deadline/accounting. It cannot rebind reserved/dispatched/authored strategy, translation or review. Learning/source/intent changes require a research continuation. Cancellation and stale workers cannot write capacity. |
| Compatibility | Existing compiler-v1 execution, authorization, rewards, Quest/Focus, immutable revisions, currentness and atomic ApplyService remain protected. A new additive worker capability guard preserves older research/compiler guard meanings. No existing migration, Prisma field or schema cache version changed. |

Availability is an as-of snapshot: at most five minutes, earlier at current-day minute changes or included-source expiry. External coverage retains Calendar's existing 30-minute rule. Cache-only capacity can use fresh cached evidence offline; missing/stale coverage is incomplete. Finite range/size/search bounds fail explicitly. Internal witness instants are feasibility evidence, not clock appointments or permanent external conflict guarantees. The current 28-day detail window does not invent a deadline for NONE goals.

## Affected owners

- [Accepted intent extension](../../../../lib/planner/v2/contracts/intent.ts), [Calendar transaction adapter](../../../../lib/calendar/planning.ts), and [shared canonical projections](../../../../lib/calendar/projection.ts). Existing personal/external readers import/re-export the same DTOs and coverage calculation. Pure Calendar imports use equivalent relative paths for the ordinary Node worker; no client/server boundary was moved.
- [Capacity stage](../../../../lib/planner/v2/server/calendar-capacity.ts), existing compiler/Attempt/worker and foundation persistence. The existing append owner now supports atomic retention inside its already leased transaction.
- [Allocator](../../../../lib/planner/v2/intelligence/allocator.ts), existing capacity upper bounds, scheduling/allocation schemas and external prerequisite reservation refs. Foundation contracts/readers retain CAPACITY v1/v2 and DOSSIER v1/v2/v3 with validated lineage, ancestry, digests and witnesses.
- [Additive SQL fence](../../../../prisma/migrations/20261026020000_planner_calendar_capacity/migration.sql), existing disposable harness, [capacity unit checks](../../../../__tests__/planner-v2/intelligence/calendar-capacity.test.ts) and [capacity PostgreSQL checks](../../../../__tests__/planner-v2/postgres/calendar-capacity.postgres.ts).
- Current foundation, Planner index and Calendar index document the headless capability. Unrelated dirty Notes/Calendar work, earlier migrations and all prior report evidence are retained; see the preservation manifest.

## Verification

The final commands, counts, source pins and build results are in [verification.json](evidence/verification.json). [Evidence index](evidence/README.md) distinguishes development diagnostics and final gates.

- **517 required Planner PostgreSQL checks pass:** all 488 retained checks plus 29 capacity cases, zero required skips, frozen source pins with no drift. The existing optional paid qualification remains excluded.
- **748 selected unit/regression checks pass in 67 active files.** The broader invocation also discovers 33 opt-in Calendar checks; all 33 pass separately on genuine disposable PostgreSQL in three files, with zero skips there.
- Full typecheck, scoped ESLint (26 files, zero errors/warnings), Prisma validation, worker build and 15 ordinary-Node credential-free module imports pass. Production web and mobile builds plus mobile bundle verification pass under Node 24.21.0. PostgreSQL is native 18.4. The web build uses the existing 6 GiB process allowance.
- Cases include overlapping/recurring/shared/provider commitments, sparse exceptions, transparent/all-day events, missing/stale/offline coverage, inclusion and membership changes, pending provider writes, accepted windows/overrides/rest dates, actual/remaining accounting, protected/running and replaceable work, indivisibility, independent packing oracles, date backtracking, interval collision/order/forged-proof rejection, concurrent capture/Calendar/Focus changes, atomic crash rollback, ancestry/CAS, reservations/unknown dispatch, ownership, deadlines, cancellation and retained execution gates.

The retained Research compiler-boundary fixture now supplies explicit accepted windows and asserts the next closed downstream boundary. The old Step 2 worker guard still produces its original rejection; the new Step 3-worker guard has a separate assertion. A new refresh test was corrected to follow version references instead of PostgreSQL JSON object insertion order. No deadline, protection, old test or execution assertion was relaxed.

Development diagnostics exposed and fixed the new guard's precedence over the retained research guard, worker type imports pulling web-only modules, and JSON-object-order assumptions in the new test. The final source audit also corrected the new capacity stage to derive civil dates from the verified account-wide Research context when a selected Plan retains older availability; a dedicated PostgreSQL case preserves that distinction. The full retained 488 checks passed before the final added refresh/correspondence safeguards. No retained production regression remains. Repository-wide `git diff --check` still reports pre-existing CRLF/trailing whitespace in the unrelated dirty Notes license notices; task-scoped whitespace checks pass and that file is byte-identical to task start. The optional Calendar runner initially required an unavailable `psql` binary; its retained diagnostic is followed by a passing run using the existing `pg` client and the same Calendar migrations/tests. No database coverage remains blocked.

## Remaining requirements

Step 4 establishes a complete deterministic capacity stage, not educational model quality or an executable plan. The baseline is not a final educational workload. Before activation, later stages must preserve full strategy/translation correspondence, revalidate changed capacity with actual reallocation, independently review the whole result, and install complete live source/Calendar/currentness checks at publication and atomic apply. Those gates remain closed.

Next: [Step 5 — natural strategy and faithful translation](STEP_5_HANDOFF.md). Stop after Step 4; no later role or UI is implemented here.
