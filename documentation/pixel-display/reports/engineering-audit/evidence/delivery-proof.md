# Delivery proof — Pixel Display engineering audit

Consolidated from this audit session. The audit's own findings are in
[../report.md](../report.md); this file records how the delivery was proven.

## Committed spec

- **Goal** — deliver an evidence-backed audit of the whole Sylf Pixel Display
  system (Phase 0–8) that fixes directly-provable bugs with regression tests and
  reports everything else without implementing broader changes.
- **Scope** — `lib/pixel-display/**`, the dashboard integration, the Locker
  surfaces, the `PixelCreation` persistence seam, the dev surface and the
  pixel-display docs. Out of scope: visual polish, the landing SVG companion,
  `CharacterRenderer`, schema migrations against the live database.
- **Acceptance criteria** — (1) every fixed bug has a red-then-green regression
  test; (2) existing suites stay green with no weakened assertions; (3) typecheck,
  engine boundary typecheck, lint and build clean; (4) the report names root
  cause, evidence and fix/recommendation per finding; (5) improvements requiring
  approval are recommended, not implemented.
- **Non-goals** — no UI/visual redesign, no architecture refactor, no new
  features, no dependency or schema changes, no rewriting tests to pass.

## Red → green timeline

| Fix | Red evidence | Green |
| --- | --- | --- |
| B1 state reaches the drawing | `expected 0 to be greater than 0` (0 cells differ through the props; 0 on the composition path); card-level: no blush while `data-state="CELEBRATING"` | 4 tests |
| B2 density change | `expected +0 to be 110` (new renderer never fitted; 0 draws) | 2 tests |
| B3 pedestal erased | `expected +0 to be 9` (0 of the pedestal's cells survive) | 1 test |
| B4 declared effect | `expected false to be true` (`isEffectRunning()` after construction) | 1 test |
| B5 effects over a composition | `expected 13 to be +0` (ground cells), `expected 4 to be +0` (invented cells) | 2 tests |
| B6 creation → asset | `expected [ …(3), …(3), …(3), … ] to deeply equal []` | 1 test |
| B7 previews + catalogue cache | `expected 0 to be greater than 0` (preview shows the built-in figure), `expected +0 to be 1` (no catalogue re-read) | 3 tests |
| Blink guard (behaviour introduced by B1) | `expected 'IDLE' to be 'BLINK'` with the guard removed | 2 tests |

Each red state was produced by running the test against the un-fixed code (or by
temporarily reverting the fix), and each was restored and re-run green.
Baseline before any change: **441 tests / 17 files, 0 failed**.

## Verification

| Gate | Result |
| --- | --- |
| `npx vitest run __tests__/pixel-display __tests__/dashboard` | 457 passed / 20 files, 0 failed (`tests.log`) |
| `npx tsc --noEmit` | 0 errors (`typecheck.log`) |
| `npm run typecheck:engine` | 0 errors (`typecheck-engine.log`) |
| `npx eslint` (pixel system, Locker surfaces, API route, tests) | 0 errors, 10 pre-existing warnings (`eslint.log`) |
| `npm run build` | succeeds; `/api/pixel-creations` and `/dev/pixel-display` present |
| `npm run mobile:build` / `mobile:verify` | pass (`mobile-build.log`, `mobile-verify.log`) |
| Production `npm run start` | `/` 200, `/dev` 404, `/dev/pixel-display` 404, `/dashboard` 307 |
| Live browser density flow | not achieved in this environment (dev client did not hydrate) — recorded as a risk in the report |

## Adversary review (delivery-review skill)

Objections raised and answered:

1. *"Does the audit cover the whole system?"* — Engine, renderers, React host,
   content, asset contract, composition, customizer, studio, persistence seam and
   the dev surface's wiring were read in full; the two large dev-only components
   were reviewed where they touch production paths. Stated as a coverage limit in
   the report rather than claimed as complete.
2. *"Is every fix red-then-green?"* — Yes; the table above, plus the two
   re-verifications performed by reverting a fix and restoring it.
3. *"Did anything out of scope change?"* — Only one existing test file was
   touched (a pre-existing lint error, `let`→`const`), three documentation links
   were repaired, and docs were updated. No visuals, no schema, no dependencies.
4. *"Were the other failing suites caused by this pass?"* — No: reproduced with
   this pass's app-layer changes reverted (`tx.$queryRaw` Prisma mocks, and a
   mobile test harness that renders the dashboard card without
   `LevelUpProvider`).
5. *"Did the fixes introduce new behaviour nobody tested?"* — The only new
   behaviour is the blink guard, which has a red-then-green test of its own.
