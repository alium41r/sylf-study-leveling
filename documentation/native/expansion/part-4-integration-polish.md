# Expansion Part 4 — Integration, optimization and polish

**Brief for a fresh session, updated by Part 1 on 1 November 2026. Not started, and it needs the owner's authorization.** Later handoffs update this page, and theirs win. The [stage plan](README.md) holds the rules and gates.

## Goal

Turn Parts 2 and 3 into one product. Prove it end to end, secure and optimize it on evidence, and finish it so nothing reads as a feature added later. This part closes what remains. Defects found earlier were fixed where they were found.

## Prerequisites

- Parts 2 and 3 are approved.
- For hosted work: the owner has completed the [deployment checklist](../backend/deployment-checklist.md), or chosen what stays unverified.
- A tablet authorization for this part's whole run.

## Read first

[Stage plan](README.md), the Part 2 and Part 3 handoffs, [feature map](feature-map.md), [Stage 3 handoff §5 and §8](../handoffs/stage-3.md#5-for-the-owner-in-order), [Phase 11 report](../reports/phase-11/report.md) §4 and §5, [tablet checklist](../handoffs/tablet-checklist.md).

## Order

```
A End-to-end ─► B Security and RLS ─► C Database and API ─► D Client performance ─► E Cohesion ─► F Final run
```

Measure before changing anything. **No optimization without a number that justifies it,** as in Stage 3.

---

## Slice A — End-to-end verification

| Journey | Covers |
| --- | --- |
| New student | Sign-up, onboarding, a first week, a first session |
| Planner | A goal, a plan through confirmation on fixtures, quests in Today, studying one |
| A hard week | A rest-day refusal, a missed deadline, HP, replanning |
| Study | All seven modes, breaks, environment entry from every surface, kill, offline, restart |
| Friends | Two students on Native and web: request, chat, group, party, block |
| Sylvie | A question, a proposal, a confirmation, a stale confirmation |
| Account | Privacy changed and seen by a friend, a device ended, a change of account with no trace, deletion |
| Across Spaces | Every path between Home, Workspace and World with a session running. World's guard |

Every journey runs in real Electron, twice with no retry. Each failure is a defect, not a flake, until shown otherwise.

**Cross-feature checks.** A quest deleted while it is the session's plan. A subject archived mid-session. A plan applied while a quest from it is being studied. A blocked friend in a party. Each must end in a stated, truthful place.

---

## Slice B — Security and RLS

| Audit | Method |
| --- | --- |
| Authorization | Every route Native now reaches: ownership, blocked, non-member, a second account |
| RLS and grants | `node scripts/test/test-rls-audit-postgres.mjs`, extended to anything new. Realtime publications with an outsider |
| Realtime | A token outside a conversation sees nothing. Rotation and sign-out |
| Secrets | No token in Electron's renderer, in logs, or in a Realtime URL. Journey and `backend-check.mjs` |
| AI | `securitymaxxing:llm` over Sylvie and Planner rendering. Output is untrusted |
| Local data | What sits on the device after sign-out and deletion. ADR 0011's table is complete |
| Dependencies | `securitymaxxing:deps` on everything this stage added |
| Changed code | `securitymaxxing:diff` against the entry baseline |
| Hosted | **Owner only.** The read-only queries, then a compare against the disposable result |

Decide E-10 (I-2) with the owner here, along with anything left from S-13 to S-16. Finish rate limits: Part 1 found 14 of 155 routes limited, and 53 routes that write with none. Step 0 of Part 2 covers the social ones, and this covers the rest.

---

## Slice C — Database and API

Measure with `node scripts/test/test-backend-postgres.mjs --out <dir> --label x --measure <file> measure-routes` on the realistic seed (2,001 people, 61,500 quests, 7,000 sessions).

| Check | Target |
| --- | --- |
| Every route Native reaches | SQL count, p50, bytes, in a table beside Phase 11's |
| N+1 and unbounded reads | None on a Native path |
| New indexes | Justified by a number, with `CONCURRENTLY` where a table is large. P-5's is already written |
| Static flags to measure | 27 routes with an unbounded `findMany` in [`route-inventory.json`](../reports/expansion-part-1/evidence/route-inventory.json), and P-10, P-11. Empty-data timings from Part 1 prove nothing about these |
| Caching | P-7's leaderboard value at scale |
| Response size | Native fields only. Additive small reads where a screen pulls too much |
| Web | Any shared route change keeps web's numbers |

Migrations stay additive, go through `test-native-migrations-postgres.mjs`, and join the deployment checklist in order.

---

## Slice D — Client performance

| Area | Work |
| --- | --- |
| Lazy loading | Every sub-view, catalog and Realtime are separate chunks. Check the bundle report. First Home paint waits for none of them |
| Startup | Cold start to Home on the tablet, against ≤ 2 s |
| Memory | Each destination on the tablet: first visit, every sub-view, 100 switches. Release after the environment, after Plan, after a long chat. R15's sweep. Layout switching's 0.6 MB per cycle |
| Lists | Long messages, calendar years, sessions and Codex search are virtualized where measurement says so |
| Scrolling | Today's jank explained or closed. Every page under the budget |
| Requests | Opening each destination, with no duplicates. Nothing in the background while idle |
| Battery | Realtime, heartbeat and audio over a long session. Thermal behavior noted |
| Images | Backgrounds, avatars and banners at the size shown, released when unseen |

**Rule.** Reduce work before adding caches. Keep every Phase 5 to 10 performance rule.

---

## Slice E — Cohesion

A pass across the whole app, not surface by surface.

- The same words for the same things, across Today, Plan, Focus, Sylvie and web. Run `design:ux-copy` over errors and empty states.
- Hierarchy, spacing, type voices and the Marker, in every theme and mode, plus custom colors.
- Motion: one system, nothing unmotivated, reduced-motion equivalents.
- Every empty, loading, offline and failed state, written for a real person.
- Transitions between Plan, Focus, the environment and Workspace feel like one app.
- Sample data: none in a build with `DEV_TOOLS` off. Check by building one.
- Accessibility: `design:accessibility-review`, TalkBack by hand, large text, keyboard paths on desktop.
- Gamification stays subtle (master plan §2.1).
- Web's traces: nothing that reads as a ported page.

Remove anything that does not earn its place, and record what went.

---

## Slice F — Final run

The whole local set on a named commit: root tests, `native` verify, journeys, integration, backend, timer, Planner, Planner V2, HTTP smoke, RLS, migrations, calendar, notes, Electron checks, mobile, root typecheck, ESLint, a production build. Then the tablet checklist rewritten for this stage, run with the owner's authorization, covering everything added, in portrait and landscape.

Rewrite the [tablet checklist](../handoffs/tablet-checklist.md) and the [deployment checklist](../backend/deployment-checklist.md). Update the master plan, native index, every guide, and write `handoffs/expansion.md` with the Phase 14 requirements restated: what Workspace now is, `LIMITED_TOOLS`, G-6, G-7, G-13, and how Sylvie and Focus connect to Notes when it arrives.

---

## Dependencies

Parts 2 and 3. The owner for hosted checks, real OAuth, and a tablet run.

## Risks

| Risk | Response |
| --- | --- |
| Polish without end | The slices are lists, and each has a stop. New ideas go to the feature map as Later |
| Optimizing on guesses | No change without a measurement before and after |
| Hosted never verified | Report it as unverified, in the first lines of the handoff |
| A late security finding is large | Stop, tell the owner, and do not ship around it |
| Regressions in web | Web's suites run in every final set |

## Deliverables

Journeys, audits and measurements with evidence. A cohesive app. `reports/expansion-part-4/report.md`, `handoffs/expansion.md`, rewritten tablet and deployment checklists, and a final [feature map](feature-map.md) showing every row's end state.

## Testing

Everything above, on one commit. Every skipped suite and every thing not run goes in the report's first section, in plain words.

## Completion criteria

1. Every journey passes twice in a row, with no retry.
2. No known critical or high defect is open.
3. RLS, authorization, secrets and dependency audits pass, or the owner accepted what remains.
4. Budgets are met on the tablet, or the owner accepted the difference.
5. The whole local set passes on a named commit, with no new failure.
6. The [stage completion list](README.md#14-stage-completion) is true.
7. The owner has approved moving on. **Phase 14 does not start before that.**
