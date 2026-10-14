# Phase 3 — Dashboard integration

**Status:** complete.
**Scope:** the Sylf Pixel Display's first real application surface — the
dashboard character card — with one real application signal wired end-to-end.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. What was integrated, and where

The dashboard's character card previously rendered the sprite pipeline
(`CharacterRenderer`) at 110 px. It now renders the Pixel Display Sylf.

| | |
| --- | --- |
| Surface | The dashboard card slot at `/dashboard`, 110 px |
| Replaced | `CharacterRenderer` in **that one slot** |
| Untouched | The sprite pipeline, `characterConfig`, and all 11 other `CharacterRenderer` consumers |
| Preserved | The card's frame, sizing, link and navigation behaviour, and the surrounding name/rank/level UI |

The card is a drop-in: same frame, same 110 px box, same click target, same
`Customize` link. `avatarFrame` was left exactly as it was, so the layout is the
same layout.

`CharacterRenderer` still renders in Social, Focus Party, Shop, Locker, Public
Profile, Friend Requests, `dashboard-design`, and the two Studio views. Nothing
about it changed.

### Files

| File | Role |
| --- | --- |
| `app/dashboard/pixel-companion-adapter.ts` | **New.** The only module that knows both vocabularies |
| `app/dashboard/components/PixelCompanionCard.tsx` | **New.** The card's display surface |
| `app/dashboard/components/PixelCompanionCard.module.css` | **New.** The 110 px square slot |
| `app/dashboard/components/DashboardScreen.tsx` | Card slot now renders the display; dropped one now-unused destructure |
| `app/components/LevelUpProvider.tsx` | **Additive:** exposes `lastLevelUp` |
| `lib/pixel-display/react/PixelDisplay.tsx` | **Additive:** a `content` prop |
| `lib/pixel-display/content/sylf/parts.ts` | **Defect fix:** spans derived from snapped edges |

`useDashboardData`'s `characterCfg` is unchanged — `dashboard-design` still
consumes it. Persistence, Prisma, the cosmetics system and API storage were not
touched.

---

## 2. The adapter boundary

```
application signal → dashboard adapter → Sylf state → runtime → framebuffer → renderer
                     ^^^^^^^^^^^^^^^^^
```

`app/dashboard/pixel-companion-adapter.ts` is the seam, and it is the **only**
module that imports both an application module and the Pixel Display content
layer. That is not a convention here; it is asserted. Four new boundary tests
scan real source:

- no dashboard file imports `pixel-display/engine`, `pixel-display/renderers`, or
  the character-plane modules;
- the dashboard reaches the display only through the React host and content
  *types*;
- the adapter is the single module importing both `@/app/**` and
  `pixel-display/content`;
- `engine/**` and `content/**` import nothing from `@/app/**`.

**All four were proven to fail.** Injecting an engine import and a
`content/sylf/parts` import into the card failed three of them; reverting
restored a pass. A boundary test that cannot fail proves nothing.

The mapping is a pure exported function — `reactionForLevelUp(reducedMotion)` —
so the translation is something a reviewer can read rather than something buried
in an effect.

### A reaction, not an animation system

There is exactly one reaction, so the adapter holds one timer, one base state and
one run id. There is no queue, no priority scale, no interruption algebra, and no
new scheduler. The roadmap forbids Phase 4 architecture in Phase 3, and inventing
priority resolution for a single reaction would have been exactly that.

---

## 3. The real signal path

The signal is the **existing level-up owner**, `LevelUpProvider` — the module the
roadmap pointed at, which already detects genuine level increases from canonical
progression data (focus settlement, quest reward, achievement claim, weekly
milestone, admin grant).

It needed one **additive** change: it now also exposes `lastLevelUp`, a durable
record of the last observed level-up.

Why a second field rather than reusing `isLevelUpVisible`: the overlay closing
must not erase the fact that a level-up *happened*, because a surface reacting to
the event is not the same as a surface displaying the overlay. The record carries
a `runId`, so a consumer cannot react twice to one event — including across a
remount — or miss two that arrive close together.

Why not derive it in the dashboard from `user.level`: that would duplicate the
baseline, login-suppression and downgrade-repair logic that already lives in the
provider. The provider is the owner; the dashboard is a consumer.

Detection logic, `triggerLevelUp`, `dismissLevelUp`, `isLevelUpVisible` and the
overlay are all unchanged, and the existing level-up celebration suite still
passes (5 tests).

**The mapping:** level-up → `CELEBRATING` for 4 s (1.8 s under reduced motion) →
back to `IDLE`. One Phase 2 state, reused. No new animation was invented.

Verified in a real browser against the real card, by applying the same state the
adapter applies and reading the display model back:

| | State | Eye cells | Blush cells |
| --- | --- | --- | --- |
| Resting | `IDLE` | 30 | 0 |
| Reacting | `CELEBRATING` | 12 | **8** |
| Back to rest | `IDLE` | 30 | 0 |

The blush appears only while reacting, and the display returns to rest on its
own.

---

## 4. Production performance

Measured on the real card: 110 px frame, 48 × 48 logical, `characterFill` 0.90,
2.292 device pixels per cell, 564 lit cells.

| Metric | Value |
| --- | --- |
| Frame cost p50 | **0.3 ms** (200 samples) |
| Frame cost p95 | **0.5 ms** |
| Frame cost max | 4.9 ms (single-frame outlier) |
| Phase 1 baseline p50 | 0.1–0.2 ms on the dev surface |

The p50 rose from ~0.15 ms to 0.3 ms. That is not a regression in the engine: the
character now fills more of the matrix than the placeholder did, so there is more
to composite and rasterise. **p95 is unchanged**, which is the number that
matters for frame budget.

### Idle behaviour, and the one production decision it forced

| Configuration | 4 s window | Frames | Rate |
| --- | --- | --- | --- |
| Auto-blink **on** | 4 004 ms | **217** | 54 fps |
| Auto-blink **off** | 4 006 ms | **0** | — |

An idling auto-blink kept the runtime at ~54 fps continuously, and produced one
visible blink in that four-second window. At 0.3 ms a frame that is roughly
16 ms of CPU per second, permanently, on a surface that is never absent.

**Self-triggered idle animation is therefore off on the production card**, from
this measurement rather than taste. The doc is explicit that a display which is
not changing should not be working (§16), and a companion that is always mounted
is the case that rule exists for. Re-measured after the change, the
permanently-mounted display produced **0 frames over 5 seconds** while resting in
`idle` — the zero-work guarantee still holds with the display in production.

Reactions still animate. Only the self-triggered idle loop is suppressed.

---

## 5. Visual findings at the real card size

Captured at 1440/1024/820/390 CSS px, in dark, and in light with a custom accent
(`#0f766e`); see [evidence/](evidence/).

| Finding | Detail |
| --- | --- |
| The canvas is crisp | Exactly **110 × 110 device pixels** in a 126 px frame at DPR 1 — a square matrix, no stretching, no fractional scaling, no horizontal overflow at any tested width. |
| The card is unchanged | Frame, links, keyboard activation, name, rank pill and level badge all behave as before. On mobile the card stacks and the display keeps its 110 px box. |
| Light mode is correct | Under light mode with a custom accent the matrix keeps its own dark backdrop inside a light card frame, which is what a screen should do. |
| The character read as **lost** at the old fill | At the Phase 0 candidate `characterFill` of 0.63 the character occupied **50%** of the matrix height — 66 px of art in a 110 px frame. Measured across candidates, the card now uses **0.90** (73% height, 83% width, nothing clipped). At 1.0 the sprout reaches the top edge. |

### A real production defect, found only at production size

Dumping the logical grid from the real card showed the body rendering as uneven
bands — some rows one device pixel tall, others three.

The cause was in the Phase 2 mapping: `createPlaneMapping` scaled a run's *width*
independently of where the run *started*, so adjacent reference rows could round
to the same logical cell or leave a one-cell seam between them. At the
development surface's sizes the result looked acceptable; at 110 px it was
plainly visible.

The fix gives the reference grid one way into the logical grid — a single
`snap()` — and measures every span between two snapped edges. A row's end is now
the next row's start, so **the grid cannot develop a seam at any scale**. The
logical grid re-dumped from the real card confirms consecutive rows tiling
exactly.

This is exactly what the roadmap meant by "unless production integration exposes
a concrete defect". It is a `content/sylf/parts.ts` change: the engine, renderer,
runtime and React host needed no change at all.

### The face does not read at 110 px

The clearest finding of the phase, and the least comfortable one.

The eyes are authored at a fixed share of the body, so they are a fixed share of
the art. At the real card they occupy roughly **12 device pixels**, with the
glint a single device pixel. Enlarging the art does not help: at 0.90 fill the
eyes are ~12 px, and at 1.0 fill they are still ~12 px, because the eye-to-body
ratio is what sets them.

`REST`'s sleeping eyes and a mid-blink `closed` beat are consequently hard to
tell apart at a glance. The states *are* distinct in the model and in the tests —
the eyes genuinely differ — but at 110 px the difference is near the limit of
what a viewer can resolve.

That is not a bug, and it is not something this phase should paper over by
redesigning the character. It is the strongest evidence yet that the eye
vocabulary needs either a larger slot or a deliberately different small-size
treatment, and it belongs to the open decisions rather than to a quiet fix.

---

## 6. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **231 passed / 12 files**, 0 failed |
| Companion regression (`__tests__/landing`, `__tests__/sylvs`, `__tests__/components`) | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors — the engine is still DOM-free and Sylf-free |
| `npx eslint` on changed files | clean |
| `npm run build` | succeeds |
| `npm run mobile:build` + `mobile:verify` | succeeds / **PASSED** |
| `GET /dev/pixel-display` in production | **404** |
| `GET /dev` in production | **404** |
| `GET /dashboard` in production | 307 (still protected) |

New tests: **15** adapter and signal-path tests, **6** dashboard boundary tests.
The adapter tests deliberately do **not** mock the engine or content — a mocked
content layer would let the suite pass while the real path was broken.

---

## 7. What Phase 3 did not do

No landing adapter. No migration of Social, Focus Party, Shop, Public Profile,
`dashboard-design`, or the landing/onboarding surfaces. No particles, procedural
effects or Phase 4 animation architecture. No change to `characterConfig`,
persistence, Prisma/Supabase schema, Shop/Locker cosmetics or API storage. No new
dependency.

`CharacterRenderer` is unchanged and still serves all 11 of its other consumers.

The sprite pipeline remains the companion system for every surface that has not
been deliberately migrated — Phase 3 migrated exactly one.

---

## 8. Open decisions

No decision was closed. Two became materially better informed, and this phase
produced the sharpest evidence yet for one of them.

| # | Decision | Status after Phase 3 |
| --- | --- | --- |
| O1 | Logical resolution | **Open, better informed.** 48 × 48 at 110 px is a 2.29 device-pixel cell pitch and the grid still reads as a display. Whether the face needs more is now a question about the *slot*, not the resolution — see O15. |
| O2 | Inactive-cell presentation | **Open, re-confirmed.** Inactive cells fully off reads correctly against both a dark card and a light one. |
| O12 | Presentation size range | **Open, better informed.** The real card is exactly 110 px CSS with a 110 × 110 backing store at DPR 1, stable from 390 to 1440 CSS px with no overflow. Only 110 px is exercised in production. |
| O14 | Character proportions and fill | **Open, sharpened.** 0.90 fill suits the card and 0.63 does not — that part is now measured. But the face's readability at 110 px is set by the character's authored proportions, not by the fill, so this is no longer only a fill question. |
| O15 | Eye-glint behaviour at small sizes | **Open, materially informed — the phase's key finding.** At the real card the eyes are ~12 device pixels and the glint is a single device pixel; `REST` and a blink are not distinguishable at a glance. Either the slot grows or the small-size eye treatment needs its own design. |
| O16 | Production presentation range | **New.** The engine's verified range (108–595 px) is not the same question as which sizes a *production* surface will actually be placed at. Only 110 px has been exercised. |
| O3, O4, O5, O11, O13 | — | **Unchanged.** Production integration created no pressure on frame representation, the scheduling model, the renderer backend, the framebuffer packing, or live high-DPI observation. |

### Honest limits

- **High-DPI remains unobserved** (O13). The browser reported `devicePixelRatio`
  1, so every production capture is a 1× rasterisation.
- Frame cost was measured in headless Chrome with CPU rasterisation — not a
  GPU-accelerated production profile.
- The end-to-end signal was verified at browser level by applying the state the
  adapter applies; the mapping itself is verified by tests. Triggering a genuine
  level-up would have required mutating a real scholar's progression, which this
  phase declined to do. QA used a read-only session for an existing local account
  and modified no user data.
