# Corrected C01 — preparation and unpaid qualification

29 October 2026, Asia/Karachi. **Corrected preparation; fresh spending approval required. No paid calls, production configuration changes or deployment occurred in this phase.** The [first stopped C01 experiment](../2026-10-28-phase-c-c01-live/README.md) and its original evidence remain unchanged.

The proposed experiment is now `C01-CORRECTED-2`, with a **30 October** study anchor, Chemistry on **20 November** and Biology on **23 November**. The previous corrected draft and rehearsals used the earlier 29 October anchor; their bytes and results are retained, and the [explicit rebase](evidence/input-rebase.json) records the new dates. No earlier approval authorizes these corrected inputs. See [the exact approval request](APPROVAL_REQUEST.md), [protocol](PROTOCOL.md), [input](PILOT_INPUT.json) and [prepared manifest](evidence/prepared-manifest.json).

## Civil-day, Calendar and deadline correspondence

The fixture now declares `MONDAY_ZERO` and validates named civil days independently of numeric schema checks. All weekly windows, ceilings and rest indices were corrected together.

| Civil day | Accepted window | Daily ceiling |
| --- | --- | ---: |
| Monday–Thursday | 17:00–19:00 | 120 minutes |
| Friday | Rest; no window | 0 |
| Saturday | 09:00–12:00 | 180 |
| Sunday | 10:00–12:00 | 120 |

The weekly ceiling remains 660 minutes with a 10% recovery margin. Both goals retain their four accepted areas, fixed dates and exam-day exclusion. The Chemistry exam falls on Friday; this does not grant Friday study permission. The first usable window is Saturday 31 October.

`c01-profile.mjs` rejects the old encoding, shifted schema-valid windows/ceilings/rest, changed deadlines, broadened scope or web permission. Before any model call, `auditC01Calendar` checks the stored canonical availability, actual existing Calendar projection, all 16 commitment intervals, both deadlines and the first-Sunday English commitment. It uses the current Calendar/Planner owners rather than another scheduler or event store.

The capacity audit inspects all dates through both deadlines, actual UTC intervals, rest, daily ceilings, recovery and the existing-task ledger. Each Saturday's 10:00–11:00 travel and 10:30–11:30 family appointment remove **90 minutes once**, leaving 09:00–10:00 and 11:30–12:00, with **72 minutes** available after the 18-minute recovery margin. Tuesday's two 30-minute gaps cannot hold an indivisible 40-minute task despite 48 total available minutes after recovery. Sunday 1 November has **73 minutes** left after the English task and recovery; English is reserved once.

Before buying review, the candidate audit checks the actual joint interval allocation against the compiled activities, original Calendar commitments, both exact deadline boundaries, dependencies and one English reservation. It independently checks no overlapping slots or booked Friday, while reusing canonical interval validation. Negative tests corrupt rest, windows, event placement, exam-date placement, duplicate booking, dependency order and English reservation; each is rejected.

The current five-case rehearsal exercises eight 40-minute activities across both subjects, **320 target minutes**, a joint witness including English, immutable publication and actual Apply/replay. It does not constrain the future real strategist to eight activities, 40 minutes or this workload.

## Versioned Research verification correction

New Research captures include server-owned `input.verificationVersion:2` in their immutable input digest. Verification receives the complete exact accepted request, intents, student context/history, answers and accepted document metadata, plus matching actually read owned document IDs and content hashes. Its semantic judgment can now distinguish an accepted student's identity from a name absent in an anonymous diagnostic excerpt.

The prompt requires identity-neutral source claims and separate contextual attribution with the actual accepted-context basis. Ownership/selection alone is insufficient to establish whose performance a document records. Literal excerpts, support, applicability, contradictory contents and ownership are still checked. Limited diagnostic strengths survive without turning confidence, videos, completion or one result into general mastery. No provenance or source-adoption assertion was weakened.

For the accepted GENERAL school-mock goal, a private teacher packet can support its own COURSE_OUTCOME and RESOURCE contents. Its issuer remains UNKNOWN and `completeAssessedScope` remains false. The server's existing official adoption rules for ASSESSED_SCOPE, ASSESSMENT_STRUCTURE and WEIGHTING remain unchanged; EXAM goals still require governing identity, applicable official scope and consequential clarification where necessary. The new instructions distinguish semantic quotation support from official authority, and do not demand an irrelevant external board for a private school mock.

The real PostgreSQL case verifies the complete accepted attribution packet, local course adoption without official certification, durable version pin and rejection of input mutation. Existing source ownership, stale document/context, contradiction, clarification, linked continuation, uncertain spending and recovery tests remain in the full bank.

Historical Research without the marker keeps its exact original prompt and packet interpretation. Tests read the **actual failed-run checkpoint and responses**, verify their digests and compare original Research/verification/synthesis prompts and canonical verification packet bytes. No saved response is reparsed as the new prompt contract. Compiler-v1 behavior and old revisions remain protected; no migration or schema deployment was needed.

## Operator cancellation and truthful failure reporting

The current caller writes `control.json` with run/root identities. `operator-control.mjs cancel /absolute/run-output "reason"` writes a single identity-bound request. The journey polls it and invokes the existing `AttemptService.cancel`; manual database access is unnecessary. Runner SIGINT/SIGTERM requests that stop, or a stop before admission if no root exists yet.

A transport abort following explicit cancellation retains **OPERATOR_CANCELLED** as its primary cause and the operator's reason. A separate scripted provider rejection retains **PROVIDER_OR_PROTOCOL_FAILURE** and sanitized provider type/code/status. No raw credential-bearing provider error or hidden reasoning is retained. Before-dispatch cancellation never invokes the adapter; in-flight cancellation retains an UNKNOWN_SPEND receipt and stops further calls. Neither path fabricates zero usage, refunds a reservation or resets deadlines.

The long-review safeguard remains: let a complete response finish, preserve actual usage, cancel when its Calendar input expired and do not buy a repeated clock-only review. The normal complete/refinement cases use existing publication, fencing, source/currentness and atomic ApplyService; cancellation, malformed/incomplete output, uncertainty and no-progress stops cannot publish a substitute result.

## Spending reconciliation and fresh admission

[Reconciliation evidence](evidence/spending-reconciliation.json) preserves the previous synthesis request as **UNKNOWN_SPEND**, with null actual usage/cost and up to **$0.1032822** peak liability. Three complete receipts and their exact usage remain available. The documented account-balance GET supplies rounded account totals, not a per-request settlement. No request-specific completed provider receipt was recovered, no undocumented endpoint was probed and no paid retry was made. Aggregate changes cannot prove that the interrupted request was free or charged.

Fresh approval proposes one new **$1.75** ceiling with the unchanged quality-first profile: Flash/HIGH, 65,536 completion tokens per call, 500,000 conservative input units per call, 48 root calls, 3 million aggregate input units, 700,000 completion tokens and the original four-hour deadline. Downstream translation/review escrow remains intact. The published peak/cache-miss root bound is **$1.74**; reasoning is counted once within completion.

The old authorization is consumed and cannot satisfy the corrected profile. Fresh LIVE admission requires matching corrected hashes, a new private single-use approval, fresh official model/price/account checks, an explicit acknowledgment of prior uncertain spending and available balance covering the new ceiling **plus** the old reserve: at least **$1.8532822**. Unknown spending is never cleared by starting a new root. The original root is not resumed or replayed. Preparation itself is not spending authorization.

## Verification record

**Final gates: 619 PostgreSQL checks (all 618 retained identities plus one new case), 5 current-date rehearsals plus 225 legacy checks, 488 Planner/Calendar unit tests, 23 no-network Node tests, full typecheck, zero lint findings, compiled worker and isolated Next build all pass.**

The final machine-readable record is [final-verification.json](evidence/final-verification.json). Its retained exact evidence is authoritative for command outcomes and source preservation.

| Gate | Evidence |
| --- | --- |
| Full retained PostgreSQL bank plus new context regression | [Baseline results](evidence/baseline-postgres/postgres-harness-run.json); all 618 previous required case identities must remain present, plus the new case |
| Five current-date C01 rehearsals and 225 legacy PostgreSQL checks | [Rehearsal gate](evidence/qualification-ready/harness/focused/postgres-harness-run.json) |
| Full Planner contract/intelligence unit bank and independent Calendar corruption checks | [Unit results](evidence/planner-unit.txt) |
| No-network metadata, civil-input, funding, cancellation and long-review guard tests | [Node tests](evidence/node-tests.txt) |
| Full TypeScript, changed-file ESLint, compiled worker and isolated Next production build | [Final verification](evidence/final-verification.json) and adjacent command records |
| Baseline-byte preservation, old experiment integrity, link/whitespace and credential checks | [Final verification](evidence/final-verification.json) |

The five rehearsals produce these actual durable outcomes:

| Case | Outcome |
| --- | --- |
| Complete journey | 7 settled scripted calls; SUCCEEDED; two reviewed revisions; disposable Apply/replay |
| Translation refinement | Grounded criterion defect → TRANSLATOR correction → second complete review; OPEN → ADDRESSED → VERIFIED_RESOLVED; both translations/reviews retained; Apply/replay |
| Expired completed review | 7 settled scripted calls; CANCELLED; no revision/Apply or second review |
| Operator cancellation during synthesis | Operator reason retained; one unknown dispatched receipt; no downstream calls/publication |
| Provider rejection | Separate provider failure classification; one unknown dispatched receipt; no automatic retry/publication |

All rehearsal physical/external provider requests are **zero**. The intentionally injected refinement defect exists only in the scripted adapter. It is not placed in the future live strategy and does not qualify reviewer sensitivity or natural educational improvement.

Intermediate failures are retained. The first restricted-shell rehearsal could not bind loopback (`EPERM`); a network-enabled process with no credentials performed the genuine disposable run. An initial expanded schedule audit used the wrong reviewer-packet path; the unpaid guard stopped it, the path was corrected and all cases rerun. The first aggregate PostgreSQL attempt timed out and recorded test timeouts; it was preserved and rerun serially with sleep prevention, without relaxing assertions, leases or deadlines. TypeScript initially compiled archived `.ts` source captures as application code; the narrow `documentation/**/evidence/executed-sources/**` exclusion preserves those evidence bytes and compiles the actual source files normally. Local annotation/SQL-string errors were repaired before final checks. The initial isolated web build omitted shared mobile adapters; that copy error was preserved and the complete source copy rebuilt successfully. No failed result was relabeled as a pass.

## Affected owners and limits

- `lib/planner/v2/intelligence/schemas/understanding.ts`: optional version pin, exact legacy prompt branch, complete new verification context and provenance/local-content instructions.
- `lib/planner/v2/server/understanding.ts`: fresh capture pin and version-routed verification/synthesis inputs using existing durable capture, dispatcher and receipts.
- `scripts/qa/planner-phase-c/`: corrected profile, actual Calendar/candidate audit, existing caller/guard improvements, operator stop channel and immutable unpaid manifest writer.
- `__tests__/planner-v2/`: version compatibility, context/provenance, independent Calendar witnesses and actual PostgreSQL rehearsal coverage.
- `tsconfig.json`: exclude archived source snapshots only; current source/test checking stays enabled.
- Current Planner foundation/index and operator guide: updated contracts and handoff. No existing migration, provider route, public compiler admission, execution engine, Calendar database or production configuration changed.

Technical rehearsals do not establish model educational quality. No real strategy/review was purchased here. The unchanged rubric still requires independent whole-result assessment; this assistant authored the case, so its future source-based audit remains provisional and cannot establish human-expert qualification or consistency. Live delivery, real semantic review/refinement, source/tool delivery and the five-minute Calendar freshness risk remain observable future outcomes, not claimed successes.

The phase ends at the concrete [fresh approval request](APPROVAL_REQUEST.md). A future run must use that exact prepared version, refresh all preflight evidence, and stop if the dated anchor is stale. No additional experiment or deployment is implicit.
