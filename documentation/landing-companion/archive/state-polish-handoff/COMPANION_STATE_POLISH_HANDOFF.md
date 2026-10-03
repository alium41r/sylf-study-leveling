# Companion State Polish — Handoff for Astra

**Scope: 6 expressions + 6 actions on the landing-page companion.** This is a
*visual polish* task on existing states. Nothing here authorises regenerating the
character, changing the semantic state contract, or touching the in-app avatar.

Written from a direct read of the implementation at the time of writing. Every
coordinate below was taken from the source, not from memory. Where I am
inferring rather than quoting, I say so.

---

## 0. Orientation — read this before anything else

### 0.1 Where the code lives

| File | Role |
| --- | --- |
| `app/components/landing/companion/model.ts` | Expression/action enums, the state→presentation map, reaction timings, sizes, palette |
| `app/components/landing/companion/Companion.tsx` | The renderer. Props, `data-*` attributes, visibility observer |
| `app/components/landing/companion/artwork.tsx` | **The whole SVG.** Mattes, layer stack, eyes, props, arm |
| `app/components/landing/companion/Companion.module.css` | **All keyframes, transforms, transform-origins, state rules** |
| `app/components/landing/companion/useCompanionState.ts` | One reaction at a time, priority, expiry |
| `app/components/landing/companion/JourneyCompanion.tsx` | Travel→CSS-variable bridge. Not your concern |
| `app/components/landing/companion/secondary-motion.ts` | 22 travel springs. Not your concern |
| `app/components/landing/companion/CompanionReview.tsx` | `/companion-prototype` review surface — **your test bench** |
| `app/components/landing/journey/journey-motion.ts` | `stateForWaypoint(pose)` used by the journey |
| `app/components/landing/journey/BotanicalTrail.module.css` | Traveller host sizes per breakpoint + mobile prop hiding |

**Your two working surfaces:** `/companion-prototype` for isolated state review
(it has a state selector, reaction buttons, pause, and two galleries that render
all 6 expressions and all 6 actions at `size="LARGE"` with `motion="none"`), and
`http://localhost:3000/` for the states in situ on the journey.

### 0.2 Coordinate space and unit conversion — the single most important fact

The SVG is `viewBox="180 28 630 865"`. All matte paths, clip paths and prop
geometry are authored in the painting's **1000 × 1000** space.

The host box is set by `BotanicalTrail.module.css .characterBody`, **not** by the
`size` prop:

| Breakpoint | Host box | `preserveAspectRatio` scale | **1 SVG unit =** |
| --- | --- | --- | --- |
| desktop | 144 × 180 | `min(144/630, 180/865)` = 0.2081 | **0.208 CSS px** |
| ≤ 1100 px | 120 × 150 | 0.1734 | 0.173 CSS px |
| ≤ 900 px | 96 × 120 | 0.1387 | 0.139 CSS px |
| ≤ 700 px | 56 × 70 | 0.0809 | **0.081 CSS px** |

Horizontal centring offset at desktop = `(144 − 630 × 0.2081) / 2` ≈ **6.45 px**.

**Worked example of why this bites.** The current `TIMER_MODE` body change is
`translateY(3px)` — 3 SVG units. That is **0.6 CSS px on desktop and 0.27 px on
mobile.** It is invisible. Always convert a proposed value to screen px before
deciding whether a user could possibly see it.

### 0.3 The layer stack (document order = paint order, later is on top)

```
<defs>                                     mattes, masks, gradients, one <image>
[data-part="shadow"]                       ellipse, world-anchored (OUTSIDE float)
[data-part="float"]                        .float        bob        6.4s
  [data-part="float-drift"]                .floatDrift   drift      9.3s  (journey only)
    [data-part="float-roll"]               .floatRoll    roll      14.6s  (journey only)
      .reaction                            (no data-part) — reaction transforms
        [data-part="ribbons"]
          [data-part="ribbon-left-lag"]  > .ribbonLeft  > use(leftRibbon)
          [data-part="ribbon-right-lag"] > .ribbonRight > use(rightRibbon)
        [data-part="body"]                 .body         breathe    5.6s
          use(torso mask)
          [data-part="lower-body-lag"] > [data-part="lower-body"] > legLeft / legRight
          [data-part="cape-lag"] > [data-part="cloak"]
              > [data-part="cloak-travel-left"]  > [data-part="cloak-left"]
              > [data-part="cloak-travel-right"] > [data-part="cloak-right"]
          [data-part="chest-clasp"]
        [data-part="halo-lag"]  > [data-part="halo"]
        [data-part="hood"]      .head  > use(hood clip) > [data-part="face"] > [data-part="eyes"]
        [data-part="star-lag"]  > [data-part="star"]
        [data-part="greeting-arm"]         HELLO | CELEBRATING
        [data-part="book"|"tablet"]        READING | USING_TABLET
        [data-part="timer"]                TIMER_MODE
        [data-part="sparkles"]             CELEBRATING
[data-part="wind"]                         sibling of float → painted on top
```

**Occlusion consequences you must respect:**

1. **Ribbons are behind everything.** They are drawn *before* `body`, and the
   torso matte has ribbon-shaped holes cut out of it, so the ribbons show *through*
   the torso. Their inner ends are always partly hidden — never design a ribbon
   detail near its inner edge.
2. **The hood is drawn after the halo and after the body.** It covers the torso's
   hood-shaped hole, and it also covers the halo's lower half.
3. **The star is drawn after the hood** — it is never occluded.
4. **`greeting-arm`, props, timer and sparkles are drawn after the hood**, i.e.
   they paint on top of the head and robe. This is deliberate and is what lets a
   raised hand read; keep it.
5. **`[data-part="shadow"]` sits outside `.float`**, so it does not bob with the
   character. That is what makes the float read as spatial.
6. **The wind layer is a sibling of `.float` and comes last**, so it paints over
   the character.

### 0.4 The state → presentation contract (do not change)

`model.ts` `PRESENTATIONS` is the only mapping. `Companion.tsx` resolves a state
through `useCompanionState` and writes three attributes onto the host `<span>`:

- `data-state` — the *resolved* state (a live reaction wins over the base state)
- `data-expression` — one of the 6 expressions
- `data-action` — one of the 6 actions

| State | Expression | Action |
| --- | --- | --- |
| `IDLE` | NEUTRAL | FLOATING |
| `GREETING` | NEUTRAL | HELLO |
| `FOCUSING` | THINKING | TIMER_MODE |
| `READING` | THINKING | READING |
| `PLANNING` | CURIOUS | USING_TABLET |
| `AI_THINKING` | THINKING | USING_TABLET |
| `DISCOVERING` | CURIOUS | FLOATING |
| `QUEST_COMPLETE` | HAPPY | FLOATING |
| `TIMER_COMPLETE` | EXCITED | CELEBRATING |
| `LEVEL_UP` | EXCITED | CELEBRATING |
| `REST` | SLEEPY | FLOATING |
| `ERROR` | CURIOUS | FLOATING |

Other `data-*` on the host:

- `data-motion`: `"full" | "quiet" | "none"`. **Forced to `"quiet"` whenever
  `state === "FOCUSING"` and motion is `"full"`.** This is easy to miss.
- `data-motion-profile`: `"journey"` on the landing only. Gates the intensified
  idle and the wind layer.
- `data-compact`: `pixels <= 64`. **Currently never true** — the journey and both
  prototype galleries all pass `size="LARGE"` (180), and onboarding passes
  110–140. Every `[data-compact="true"]` rule in the CSS is therefore dead in
  practice. Don't rely on it; the real mobile prop-hiding is the media query in
  `BotanicalTrail.module.css`.
- `data-animation`: `"active" | "paused"` from an `IntersectionObserver` plus
  `visibilitychange`.

### 0.5 Expression geometry — the shared facts

`artwork.tsx` computes two booleans that select the whole eye rendering:

```ts
const closed = expression === "HAPPY" || expression === "EXCITED" || expression === "SLEEPY";
const prop   = action === "READING" || action === "USING_TABLET";
```

There are **three mutually exclusive eye bodies**, selected by `closed` and then
`expression === "THINKING"`:

**(a) Open eyes** — NEUTRAL, CURIOUS. For `x ∈ [416, 568]` (left, right):

| Element | Geometry |
| --- | --- |
| glow | `ellipse cx=x cy=437 rx=37 ry=59 fill=url(#id-eyeGlow)` |
| eye | `ellipse cx=x cy=437 rx=16 ry=38 fill=#f7fcff` — **CURIOUS right eye only:** `rx=14 ry=32` |
| highlight | `ellipse cx=x-2 cy=432 rx=6 ry=24 fill=#fff7e8 opacity=.3` |
| wrapper | `transform="translate(0 ${CURIOUS && i===1 ? -9 : 0})"` — **CURIOUS lifts the right eye 9 units (≈1.9 CSS px)** |

Wrapper classes: left `.eyeLeft` (origin `416px 437px`), right `.eyeRight`
(origin `568px 437px`). The outer group is `.idleNeutral` **only when NEUTRAL**.
NEUTRAL additionally renders a sibling `.idleHappy` group holding the happy arcs.

**(b) Closed eyes** — HAPPY, EXCITED, SLEEPY. Group class **`.closedEyes`**, which
**has no CSS rule at all** in `Companion.module.css` (verified: the only
occurrence of the string is the reference in `artwork.tsx`). Consequences: no
transform-origin, **no blink**, no state styling hooks. Two stroked arcs at
`stroke=#f7fcff strokeLinecap=round`:

| Expression | Left arc | Right arc | strokeWidth |
| --- | --- | --- | --- |
| HAPPY | `M397 446Q416 420 435 446` | `M549 446Q568 420 587 446` | 7 |
| EXCITED | *(identical)* | *(identical)* | **9** |
| SLEEPY | `M397 442Q416 459 435 442` | `M549 442Q568 459 587 442` | 7 |

(SVG y is down: control `y=420` bows the curve **up** = smiling ∩; control
`y=459` bows it **down** = closed sleepy ∪.)

**(c) Thinking eyes** — two *filled* slivers, `fill=#f7fcff`:
`M392 440L440 446Q434 484 392 440Z` and `M544 446L592 440Q552 484 544 446Z`.

### 0.6 All keyframes and durations

| Keyframe | Duration / easing / count | Owner | Effect |
| --- | --- | --- | --- |
| `float` | 6.4s ease-in-out infinite | `.float` | translate ±`--float`, rotate −0.35°→0.5° |
| `float-drift` | 9.3s ease-in-out infinite | `.floatDrift` | translateX ∓`--drift` |
| `float-roll` | 14.6s ease-in-out infinite | `.floatRoll` | rotate ∓`--roll` |
| `breathe` | 5.6s ease-in-out infinite | `.body` | `scaleY(1 → 1.016)` |
| `fabric` | 7.4s ease-in-out infinite | `.cloakLeft` / `.cloakRight` | rotate ±0.75°, skewX ±0.22° |
| `ribbon` | 6.1s ease-in-out infinite | `.ribbonLeft` / `.ribbonRight` | rotate ±`--sway` |
| `halo` | 11.7s ease-in-out infinite | `.halo` | rotate ±2°, translate(−2,−4) |
| `star` | 8.9s ease-in-out infinite | `.star` | translate(2,−7), scale 1.025 |
| `shadow` | 6.4s ease-in-out infinite | `.shadow` | scaleX 1→0.86, opacity .13→.08 |
| `blink` | 24s linear infinite | `.eyes` | scaleY→0.06 at 10/34/35.6/64/90% |
| `curious-glance` | 19s ease-in-out infinite | `.eyeRight` | translate(6,−4) scaleY .88 |
| `neutral-moment` | 24s linear infinite | `.idleNeutral` | opacity 1→0 |
| `happy-moment` | 24s linear infinite | `.idleHappy` | opacity 0→1 |
| `wind-drift` | var-driven, linear infinite | `.windStreak` | translateY +122 → −122 |
| `happy` | 1.1s ease-in-out 2 | `.reaction` | translateY −12, rotate −2° |
| `celebrate` | 1.4s ease-in-out 2 | `.reaction` | translateY −21, rotate 3° |
| `hello` | 1.1s ease-in-out 2 | `.greetingArm` | rotate 0 → −12° → 0 |
| `thinking` | 9s ease-in-out infinite | `.prop` (AI_THINKING only) | rotate ±1° |
| `sparkles` | 1.4s ease-out 2 | `.sparkles` | opacity 0→.85, scale .95→1 |
| `positive-star` | 1.4s ease-out 2 | `.star` (CELEBRATING) | scale 1→1.08 |

Three ambient rules are gated on
`[data-state="IDLE"][data-expression="NEUTRAL"][data-motion="full"]`:
`neutral-moment`, `happy-moment`, `curious-glance`. **They do not run for
CURIOUS**, because CURIOUS only ever arrives via `DISCOVERING` or `ERROR`, so
`data-state` is not `IDLE`. Worth knowing before you tune "curious idling".

### 0.7 Every transform-origin (SVG user units)

| Element | Origin |
| --- | --- |
| `.float`, `.floatDrift` | `491px 640px` |
| `.floatRoll` | `491px 720px` |
| `.body`, `.lowerBody`, `.cloak`, `.lowerBodyLag` | `491px 617px` |
| `.head` | `491px 550px` |
| `.halo`, `.haloLag` | `491px 166px` |
| `.star`, `.starLag` | `491px 105px` |
| `.shadow` | `491px 871px` |
| `.reaction` | `491px 670px` |
| `.eyes` | `491px 437px` |
| `.eyeLeft` / `.eyeRight` | `416px 437px` / `568px 437px` |
| `.halo` uses `rotate(2 491 166)` inline on its ellipse | — |
| `.ribbonLeft`, `.ribbonLagLeft` | `425px 562px` |
| `.ribbonRight`, `.ribbonLagRight` | `557px 562px` |
| `.cloakLeft` | `414px 607px` |
| `.cloakRight` | `568px 607px` |
| `.cloakTravelLeft`, `.cloakTravelRight`, `.capeLag` | `491px 605px` |
| `.legLeft` / `.legRight` | `444px 721px` / `538px 721px` |
| `.prop` | `491px 700px` |
| `.greetingArm` | `617px 644px` |
| `.sparkles` | `491px 530px` |

### 0.8 The mattes — what is cut out of what, and where it is safe

The torso `<use>` is masked by `#id-torso`, which is a white rect over
`x180 y548 w630 h320` (i.e. **y 548–868 only**) with these subtractions:

1. `HOOD` — no backing
2. `LEFT_RIBBON + RIGHT_RIBBON + LEFT_CLOAK + RIGHT_CLOAK` — filled black with a
   **`stroke="white" strokeWidth="2"` underlap** (a 1-unit margin either side of
   the boundary, purely to hide antialias seams)
3. **inset `LEFT_CLOAK`** — `scale(0.9)` about `(377.3, 686.7)` — seam underlayer
4. **inset `RIGHT_CLOAK`** — `scale(0.9)` about `(604.7, 686.7)` — seam underlayer
5. legs rect `x398 y708 w186 h157`
6. **inset legs rect** — `scale(0.86)` about `(491, 786.5)` — seam underlayer
7. clasp diamond `M490 558L537 602L490 648L444 603Z` — no backing

`#id-withoutCloak` is a second mask (white rect over the same band, minus the two
cloaks with the same 2-unit underlap) used by both legs.

**Why the underlayers exist.** The cape and legs are *cut out* of the torso, so
any movement of those panels used to expose the page background through the gap.
The inset copies leave a band of the same painting underneath — invisible at rest
because the moving panel is drawn on top of it, but it fills the opening once the
panel swings.

**Measured seam tolerance** (from a CDP pixel rig that forces a transform, renders
the page over a magenta backdrop and counts background pixels appearing *inside*
the silhouette):

| Displacement | Interior gap vs noise floor |
| --- | --- |
| resting | +33 px noise floor |
| full travel pose (cape tilt 3.4°, skew 8.5°, per-side ±3°, stretch 0.085, lower tilt 4.8°) | **+10.6 px — below the noise floor** |

**The hood has no underlayer.** It is the fragile one. See §4.1.

---

## 1. Per-state dossiers

Format per state: the 15 requested axes. Where a value is shared, it is stated
explicitly rather than cross-referenced, so this section can be read alone.

Because the 12 states compose 6 expressions × 6 actions with heavy sharing, the
**expression** dossiers (§1.1–1.6) carry the eye/head facts and the **action**
dossiers (§1.7–1.12) carry the prop/limb facts. A state is always the union of
one of each — e.g. `FOCUSING` = THINKING + TIMER_MODE.

---

### 1.1 NEUTRAL

1. **Mapping.** Reached by `IDLE` and `GREETING`. `data-expression="NEUTRAL"`.
2. **Elements involved.** `[data-part="eyes"]` (`.eyes`), `.idleNeutral` wrapper,
   sibling `.idleHappy`, `[data-part="face"]`, `[data-part="hood"]` (`.head`).
3. **Eye geometry.** Open-eye branch. Both eyes identical: glow `rx37 ry59`,
   eye `rx16 ry38`, highlight `rx6 ry24` at `(x−2, 432)`, `x ∈ {416, 568}`,
   `cy=437`. No wrapper translate.
4. **Head/body transforms.** `.head` has **no** state rule → only its
   `transition: transform 0.65s ease` and origin `491px 550px`. `.body` runs
   `breathe`. This is the only expression with a genuinely neutral head.
5. **Cape/ribbon/halo/star.** Idle only: `fabric` ±0.75°, `ribbon` ±`--sway`,
   `halo` 11.7s, `star` 8.9s. Travel response comes from the 22 springs via CSS
   variables and is identical for every expression.
6. **Props rendered.** None — unless the action renders one. `FLOATING` renders
   nothing.
7. **Arm/hand.** None for `FLOATING`.
8. **Origins.** As §0.7.
9. **Layer order.** As §0.3.
10. **Keyframes.** `breathe`, `fabric`, `ribbon`, `halo`, `star`, `shadow`,
    `blink`, `curious-glance`, `neutral-moment`, `happy-moment`, `float*`.
11. **Safe to change.** Yes, freely. The whole open-eye branch is independent
    vector geometry with no raster involvement.
12. **Fragile boundaries.** None specific to this state.
13. **Transform limits.** Head rotation is the only risk — see §4.1.
14. **Mobile.** All eye geometry scales with the SVG: at ≤700 px the eye is
    `16 × 0.081 = 1.3 px` wide. Highlights (`rx6`) become 0.5 px and read as
    noise. **Any new eye detail below ~8 units is desktop-only.**
15. **Reduced motion.** Every animation is disabled by the blanket
    `@media (prefers-reduced-motion: reduce) .companion * { animation: none }`.
    Neutral renders as a static open-eyed pose. `.idleHappy` stays at its base
    `opacity: 0`, so the happy beat is simply absent.

---

### 1.2 HAPPY

1. **Mapping.** `QUEST_COMPLETE` (a reaction, 2200 ms, priority 1).
2. **Elements.** `[data-part="eyes"]` with class **`.closedEyes`**; the arcs are
   rendered by the `closed` branch.
3. **Eye geometry.** Two stroked arcs, `stroke=#f7fcff strokeWidth=7
   strokeLinecap=round`, `M397 446Q416 420 435 446` and
   `M549 446Q568 420 587 446`.
4. **Head/body transforms.** No `.head` rule. `[data-state="QUEST_COMPLETE"]
   .reaction { animation: happy 1.1s ease-in-out 2 }` → `translateY(−12px)`
   (= −2.5 CSS px) and `rotate(−2deg)` about `491px 670px`.
5. **Cape/ribbon/halo/star.** Idle only.
6. **Props.** None. (`action` is FLOATING.)
7. **Arm/hand.** None.
8. **Origins.** `.reaction` at `491px 670px`.
9. **Layer order.** As §0.3.
10. **Keyframes.** `happy` (1.1s ×2). **Not** `celebrate`.
11. **Safe to change.** Yes.
12. **Fragile.** None.
13. **Transform limits.** N/A.
14. **Mobile.** Arc strokeWidth 7 → 0.57 px at ≤700 px. The arcs are `38 units`
    wide = 3 px. **They nearly vanish on mobile** — this is the main reason HAPPY
    is hard to read on a phone.
15. **Reduced motion.** No animation, but the arcs still render, so the happy
    *pose* survives; only the bounce is lost.

---

### 1.3 EXCITED

1. **Mapping.** `TIMER_COMPLETE` (2800 ms, priority 2) and `LEVEL_UP` (3200 ms,
   priority 3). Both use action `CELEBRATING`.
2. **Elements.** `.closedEyes`, `.reaction`, `.star`, `.sparkles`.
3. **Eye geometry.** **Identical paths to HAPPY.** The only difference in the
   entire eye system is `strokeWidth={expression === "EXCITED" ? 9 : 7}`.
4. **Head/body.** `.reaction` → `celebrate 1.4s ease-in-out 2`
   (`translateY −21px`, `rotate 3°`). `.star` → `positive-star 1.4s ease-out 2`
   (`scale 1 → 1.08`).
5. **Cape/ribbon/halo/star.** Star gets `positive-star`; the rest idle.
6. **Props.** `[data-part="sparkles"]` — one `<path>` holding three four-pointed
   stars at approximately `(229,372)`, `(763,352)`, `(729,735)` in painting
   space; `fill=#ffe4b6 stroke=#f1b58c strokeWidth=1.5`; `opacity` animated
   `0 → .85`.
7. **Arm/hand.** `[data-part="greeting-arm"]` renders (action CELEBRATING) — see
   §3.
8. **Origins.** `.reaction 491px 670px`, `.sparkles 491px 530px`,
   `.star 491px 105px`.
9. **Layer order.** Sparkles are last inside `.reaction`, so they paint over
   everything including the hood.
10. **Keyframes.** `celebrate`, `positive-star`, `sparkles`.
11. **Safe to change.** Yes.
12. **Fragile.** None.
13. **Transform limits.** N/A.
14. **Mobile.** `@media (max-width: 700px) .characterBody [data-part="sparkles"]
    { display: none }` — **sparkles are removed entirely on mobile**, and the
    timer glyph with them. So on a phone EXCITED loses its only distinguishing
    element and becomes HAPPY-with-a-bigger-bounce.
15. **Reduced motion.** `.sparkles { opacity: 0.6 }` is explicitly re-set, so the
    sparkles remain visible as a static pose. Both arcs render statically.

---

### 1.4 CURIOUS

1. **Mapping.** `PLANNING` (with `USING_TABLET`), `DISCOVERING` (with `FLOATING`),
   `ERROR` (with `FLOATING`).
2. **Elements.** `[data-part="eyes"]` (`.eyes`, open branch), `.eyeLeft`,
   `.eyeRight`, `.head`.
3. **Eye geometry.** Right eye shrunk and lifted:
   - left eye: `rx16 ry38` at `(416, 437)`
   - right eye: **`rx14 ry32`** at `(568, 437)`, wrapper
     `translate(0 −9)`
   - both glows and highlights unchanged (`rx37 ry59`, `rx6 ry24`)
4. **Head/body.** `.companion[data-expression="CURIOUS"] .head { transform:
   rotate(-2deg) }` about `491px 550px`, with the `0.65s ease` transition.
5. **Cape/ribbon/halo/star.** Idle only.
6. **Props.** `FLOATING` → none; `PLANNING` → `[data-part="tablet"]`.
7. **Arm/hand.** None.
8. **Origins.** `.head 491px 550px`, `.eyeRight 568px 437px`.
9. **Layer order.** As §0.3.
10. **Keyframes.** `blink` (24s) applies via `.eyes`. **`curious-glance` does NOT
    apply**, because it is gated on `[data-state="IDLE"]` and CURIOUS never
    coincides with `IDLE`. This is almost certainly unintended.
11. **Safe to change.** Yes — and this is the state most in need of it.
12. **Fragile.** None.
13. **Transform limits.** `.head` rotation is bounded by §4.1; keep ≤3°.
14. **Mobile.** The entire CURIOUS delta is: right eye `2 units` narrower,
    `6 units` shorter, `9 units` higher, plus a `2°` head tilt. At ≤700 px that
    is **0.16 px, 0.49 px, 0.73 px and 2°.** Nothing survives.
15. **Reduced motion.** All animations off; the shrunk/lifted eye and the 2° head
    tilt persist, so CURIOUS survives reduced motion better than most.

---

### 1.5 THINKING

1. **Mapping.** `FOCUSING` (+`TIMER_MODE`), `READING` (+`READING`),
   `AI_THINKING` (+`USING_TABLET`).
2. **Elements.** `[data-part="eyes"]` (`.eyes`, filled-sliver branch), `.head`.
3. **Eye geometry.** Two **filled** slivers, `fill=#f7fcff`:
   `M392 440L440 446Q434 484 392 440Z` and `M544 446L592 440Q552 484 544 446Z`.
   Top edge is a **straight line** from inner to outer; bottom edge curves down.
4. **Head/body.** `.companion[data-expression="THINKING"] .head {
   transform: translateY(2px) rotate(2deg) }` — a down-and-right tilt.
5. **Cape/ribbon/halo/star.** Idle, except: `FOCUSING` forces
   `data-motion="quiet"` → `--float: 3px`, `--sway: 0.7deg`, float and shadow
   stretch to 9 s, **`.star` and `.body` animations are set to `none`**. For
   `AI_THINKING` the `.prop` gets `thinking 9s` (±1° rotation).
6. **Props.** `FOCUSING` → timer; `READING` → book; `AI_THINKING` → tablet.
7. **Arm/hand.** None.
8. **Origins.** `.head 491px 550px`, `.prop 491px 700px`.
9. **Layer order.** As §0.3.
10. **Keyframes.** `blink` still applies (it is on `.eyes`, which THINKING uses) —
    so the slivers blink. `thinking` for the AI_THINKING prop only.
11. **Safe to change.** Yes; this is the second-most in need.
12. **Fragile.** None for the eyes.
13. **Transform limits.** `.head` ≤3° (see §4.1).
14. **Mobile.** The slivers are ~48 units wide = 3.9 px at ≤700 px.
15. **Reduced motion.** Immobile but fully posed.

---

### 1.6 SLEEPY

1. **Mapping.** `REST` only, with action `FLOATING`.
2. **Elements.** `.closedEyes`, `.float`, `.shadow`, `.head`.
3. **Eye geometry.** Downward-bowing arcs
   `M397 442Q416 459 435 442` / `M549 442Q568 459 587 442`, strokeWidth 7.
4. **Head/body.** `.companion[data-expression="SLEEPY"] .head {
   transform: translateY(3px) rotate(3deg) }` — the largest head deviation of any
   expression.
5. **Cape/ribbon/halo/star.** `.companion[data-expression="SLEEPY"] .float {
   animation-duration: 9.8s; --float: 5px }` and `.shadow { animation-duration:
   9.8s }`. The float slows and shrinks; ribbons/halo/star keep their own
   durations (they are not retimed), which is a small inconsistency.
6. **Props.** None.
7. **Arm/hand.** None.
8. **Origins.** `.head 491px 550px`, `.float 491px 640px`.
9. **Layer order.** As §0.3.
10. **Keyframes.** `float` (retimed), `shadow` (retimed).
11. **Safe to change.** Yes.
12. **Fragile.** None.
13. **Transform limits.** The 3-unit translateY already eats most of the 1-unit
    antialias underlap at the hood hem; **do not stack more head translation
    without reading §4.1.**
14. **Mobile.** 3 units = 0.24 px at ≤700 px. The head tilt is the only mobile
    signal.
15. **Reduced motion.** Static closed-eye pose; no float.

---

### 1.7 FLOATING

1. **Mapping.** `IDLE`, `DISCOVERING`, `QUEST_COMPLETE`, `TIMER_COMPLETE`,
   `LEVEL_UP`, `REST`, `ERROR`.
2. **Elements.** No action-specific elements are rendered at all.
3. **Eyes.** Whatever the expression says.
4. **Head/body.** Expression-driven only.
5. **Cape/ribbon/halo/star.** Idle + travel springs.
6. **Props.** None.
7. **Arm/hand.** None.
8. **Origins.** N/A.
9. **Layer order.** Unchanged.
10. **Keyframes.** Ambient only.
11. **Safe to change.** This is the *base* action — changes here affect 7 of the
    12 states. Prefer expressing identity through the expression instead.
12. **Fragile.** None.
13. **Transform limits.** N/A.
14. **Mobile.** N/A.
15. **Reduced motion.** Ambient off.

---

### 1.8 HELLO

1. **Mapping.** `GREETING` — reaction, **2400 ms**, priority 0.
2. **Elements.** `[data-part="greeting-arm"]` with class `.greetingArm`. Eyes are
   NEUTRAL (open).
3. **Eyes.** Open branch, both eyes `rx16 ry38`.
4. **Head/body.** No `.head` rule for GREETING. `.reaction` gets no animation
   (the QUEST_COMPLETE / CELEBRATING rules don't match).
5. **Cape/ribbon/halo/star.** Idle.
6. **Props.** None.
7. **Arm/hand.** **One** arm, right side. `M583 656 C624 627 631 580 659 564
   C676 554 681 568 676 587 L656 648 L622 682 Z`, `fill=#272c4c`, no stroke.
   Origin `617px 644px`, `animation: hello 1.1s ease-in-out 2`
   (rotate 0 → −12° → 0). Full analysis in §3.
8. **Origins.** `.greetingArm 617px 644px`.
9. **Layer order.** Drawn **after** the hood and star → paints over the head.
10. **Keyframes.** `hello` 1.1s ×2 = 2.2 s, then it stops and reverts to
    `transform: none` (no `forwards`). Reaction length is 2.4 s, so there is a
    ~0.2 s static tail.
11. **Safe to change.** Yes — this is the highest-value target.
12. **Fragile.** Nothing raster: the arm is independent vector drawn on top.
13. **Transform limits.** Unconstrained by seams. Constrained by the hood's
    **silhouette**, though: the hood spans x 207–771 and y 168–563, so a raised
    hand inside that box paints over the face. See §3.
14. **Mobile.** The arm is a flat navy wedge; on mobile it merges into the navy
    robe completely.
15. **Reduced motion.** The arm renders statically at `rotate(0)` — i.e. it just
    floats there beside the body, which reads as an artefact.

---

### 1.9 READING

1. **Mapping.** `READING` state. Expression is **THINKING**.
2. **Elements.** `[data-part="book"]` with class `.prop`, wrapping
   `[data-part="eyes"]` slivers.
3. **Eyes.** THINKING filled slivers (see §1.5) — *not* a reading expression.
4. **Head/body.** THINKING head tilt (`translateY(2px) rotate(2deg)`).
5. **Cape/ribbon/halo/star.** Idle.
6. **Props.** The book:
   - cover `M91 224Q111 217 132 228Q152 211 178 216L164 264Q146 259 129 274Q111 263 93 267Z`
     `fill=#353a60 stroke=#f1b58c strokeWidth=1.8`
   - pages `fill=#fff7e8 stroke=#f1b58c strokeWidth=.8`
   - spine `M132 235L129 273 stroke=#f1b58c strokeWidth=2`
   - two four-pointed `#ffe4b6` sparkles
   - two small navy blobs `fill=#272c4c` at the outer edges (vestigial hands)
7. **Arm/hand.** **None of its own** — only the vestigial blobs *inside* the
   prop group. See §6.
8. **Origins.** `.prop { transform-origin: 491px 700px }`, no standalone
   animation.
9. **Layer order.** Inside `.reaction`, after the greeting-arm slot → paints over
   the body, cape and hood hem.
10. **Keyframes.** None for READING. (`thinking` applies only to
    `[data-state="AI_THINKING"] .prop`.)
11. **Safe to change.** Yes, the prop is fully independent vector.
12. **Fragile.** None.
13. **Transform limits.** Unconstrained.
14. **Mobile.** The book is `#353a60` on a navy robe with a `0.8`-unit gold
    stroke → 0.065 px on mobile. It disappears.
15. **Reduced motion.** Static; fully posed.

---

### 1.10 USING TABLET

1. **Mapping.** `PLANNING` (**CURIOUS**) and `AI_THINKING` (**THINKING**). Same
   prop, two different expressions.
2. **Elements.** `[data-part="tablet"]` with `.prop`.
3. **Eyes.** CURIOUS (shrunk/lifted right eye) for PLANNING; THINKING slivers for
   AI_THINKING.
4. **Head/body.** CURIOUS `rotate(-2deg)` for PLANNING; THINKING
   `translateY(2px) rotate(2deg)` for AI_THINKING.
5. **Cape/ribbon/halo/star.** Idle. For AI_THINKING the prop itself sways ±1° on
   a 9 s loop.
6. **Props.** The tablet:
   - body `M91 220L179 203L171 259L88 273Z` `fill=url(#id-panel)`
     (blue→periwinkle, .9→.85 opacity) `stroke=#c8dcff strokeWidth=1.5`
   - inner screen `M98 226L170 212L164 252L96 263Z` `stroke=#f7fcff strokeOpacity=.7`
   - a `#f7fcff` four-pointed sparkle at `opacity=.9`
   - the same two vestigial navy hand blobs
7. **Arm/hand.** None of its own.
8. **Origins.** `.prop 491px 700px`.
9. **Layer order.** As READING.
10. **Keyframes.** `thinking` only under `AI_THINKING`.
11. **Safe to change.** Yes.
12. **Fragile.** None.
13. **Transform limits.** Unconstrained.
14. **Mobile.** The tablet is the brighter of the two props, so it survives better
    than the book, but it is still ~1.5 px of screen at the smallest breakpoint.
15. **Reduced motion.** Static.

---

### 1.11 TIMER MODE

1. **Mapping.** `FOCUSING` only. Expression is **THINKING**. **`data-motion` is
    forced to `"quiet"`.**
2. **Elements.** `[data-part="timer"]`, `.lowerBody`, `.legLeft`, `.legRight`,
   `.cloak`.
3. **Eyes.** THINKING slivers.
4. **Head/body.** THINKING tilt. Plus `[data-action="TIMER_MODE"] .lowerBody {
   transform: translateY(3px) }` — **0.6 CSS px on desktop**.
5. **Cape/ribbon/halo/star.** `[data-action="TIMER_MODE"] .cloak {
   transform: translateY(2px) scale(1.01, 0.985) }`; `quiet` mode disables the
   star and body animations and slows float/shadow to 9 s.
6. **Props.** The timer glyph: `circle cx=737 cy=535 r=40 strokeOpacity=.65`,
   `path d="M737 509V535L754 546M729 486H745"`, `circle cx=737 cy=535 r=4`
   (filled). Colour `#8d97f3`, `strokeWidth=6`, linecap round.
7. **Arm/hand.** None.
8. **Origins.** `.lowerBody` `491px 617px`; `.legLeft`/`.legRight`
   `444px 721px` / `538px 721px`; `.cloak` `491px 617px`.
9. **Layer order.** The timer paints last inside `.reaction` (only sparkles come
   after, and they don't co-occur) → on top of everything.
10. **Keyframes.** None of its own. Only the `quiet`-mode ambient retiming.
11. **Safe to change.** Yes — this state needs it most after HELLO.
12. **Fragile.** None for the timer glyph. **Careful with `.cloak`:** it has
    `transition: transform 0.65s ease` and is a child of `.capeLag`; the
    travel-driven transform lives on `.capeLag`, not `.cloak`, so a state rule on
    `.cloak` is safe — but do not move the travel variables onto `.cloak`.
13. **Transform limits.** Legs have an inset underlayer at 0.86, so ±7° leg
    rotation is within the measured-safe envelope. Do not exceed ~10°.
14. **Mobile.** `@media (max-width: 700px) .characterBody [data-part="timer"]
    { display: none }` — **the glyph is deleted on mobile**, and the body changes
    are 0.24 px. On a phone, FOCUSING is visually identical to THINKING+FLOATING.
15. **Reduced motion.** The glyph renders statically; the quiet-mode retimings are
    moot.

---

### 1.12 CELEBRATING

1. **Mapping.** `TIMER_COMPLETE` (2800 ms, priority 2) and `LEVEL_UP`
   (3200 ms, priority 3). Expression is **EXCITED**.
2. **Elements.** `[data-part="greeting-arm"]`, `[data-part="sparkles"]`,
   `.reaction`, `.star`.
3. **Eyes.** EXCITED arcs (strokeWidth 9).
4. **Head/body.** `.reaction` → `celebrate 1.4s ease-in-out 2`
   (`translateY −21px` = −4.4 px, `rotate 3°`). `.star` → `positive-star`.
5. **Cape/ribbon/halo/star.** Star scaled; the rest idle.
6. **Props.** The three-sparkle path (see §1.3).
7. **Arm/hand.** **The same single right arm as HELLO**, with the same
   `hello 1.1s ×2` animation. So "celebrating" and "hello" currently use an
   identical limb and an identical gesture.
8. **Origins.** `.reaction 491px 670px`, `.star 491px 105px`,
   `.sparkles 491px 530px`, `.greetingArm 617px 644px`.
9. **Layer order.** Sparkles last; both arms and sparkles paint over the hood.
10. **Keyframes.** `celebrate`, `positive-star`, `sparkles`, `hello`.
11. **Safe to change.** Yes — this is where a second arm pays off most.
12. **Fragile.** None.
13. **Transform limits.** Unconstrained.
14. **Mobile.** Sparkles and the timer are hidden at ≤700 px, so CELEBRATING
    loses its sparkles; the −21 unit rise (1.7 px) remains.
15. **Reduced motion.** `.sparkles { opacity: .6 }` keeps them visible; arms
    static.

---

## 2. Answers to the specific questions

### 2.1 Why Hello's hand looks cut off / attached to the robe

Five compounding causes, all verifiable in the source:

1. **There is no hand.** `[data-part="greeting-arm"]` is a single closed path
   with no mitten, no wrist and no cuff. Its upper end terminates in a **point**
   at approximately `(676, 587)`.
2. **It is the same colour as the robe.** `fill={p.body}` = `#272c4c`, which is
   the torso's own navy. Where the arm overlaps the right cloak
   (`RIGHT_CLOAK` covers x 510–724, y 599–832) there is no tonal edge at all, so
   the lower half of the arm reads as part of the cape.
3. **Its tip emerges from under the hood hem.** `(676, 587)` sits just below the
   hood's lower-right boundary (the hood runs through `(755,455) → (710,535) →
   (551,548)` and ends at y 563). A pointed navy shape appearing right at the hem
   with no hand on the end reads as a torn flap of robe.
4. **The gesture is invisible.** The origin is `(617, 644)`, which is *inside* the
   shape's lower half. The distance from the origin to the tip is
   `√(59² + 57²) ≈ 82 units`. At the animation's peak of `rotate(−12°)` the tip
   travels an arc of `82 × 0.2094 ≈ 17 units`, and `17 × 0.208 = **3.6 CSS px**`.
   The entire wave is a 3.6-pixel twitch of a pointed tip.
5. **It then stops.** `hello` runs twice (2.2 s) with no `forwards` fill, so it
   snaps back to `transform: none`; the 2.4 s GREETING reaction leaves ~0.2 s of
   a frozen, meaningless shape. Under reduced motion it is frozen for the whole
   duration.

### 2.2 How to replace it with a reusable cream-sleeve + navy mitten-hand

The character wears a **cream robe with a navy face and navy inner robe** (per the
reference screenshot), so the sleeve should be cream and the mitten navy — which
is also exactly what separates it from the robe.

Build **one** module in a local space with the **shoulder at the origin and the
arm extending along −Y**, so a single `rotate()` poses it for every action:

```
SLEEVE (cream, #f5e9df or #fff7e8)
  M -25 6  C -28 -28 -24 -62 -17 -92  L 17 -92  C 24 -62 28 -28 25 6 Z
CUFF (fold, #d9cddb)
  M -19 -92 L 19 -92 L 18 -110 L -18 -110 Z
MITTEN (body, #272c4c)
  M -20 -110 C -24 -134 -14 -154 0 -154 C 14 -154 24 -134 20 -110 Z
THUMB (body)
  M -20 -114 C -33 -118 -37 -130 -30 -136 C -23 -140 -17 -128 -15 -118 Z
MITTEN RIM (cream, stroke only, strokeWidth 2.5, fill none)
  <same d as MITTEN>
HIGHLIGHT (bodyLight #42486e, opacity .55)
  <ellipse cx="-6" cy="-130" rx="5" ry="10" transform="rotate(-12 -6 -130)" />
FOLD LINE (foldDeep #b1acd1, strokeWidth 2.5, fill none)
  M -15 -40 Q 0 -50 15 -40
```

Extent: x −37…28, y −154…6. Arm length ≈ 160 units (33 CSS px at desktop).

**Two rules that make it read:**
- The **cream rim on the navy mitten** is what stops the hand merging into the
  navy robe. Do not omit it.
- The **cream sleeve** is what makes the shoulder join look intentional rather
  than torn. Draw the sleeve so its root sits inside the robe silhouette; a cream
  sleeve overlapping a cream robe needs no other trick.

**Placement.** Shoulders at approximately **`(598, 660)`** right and
**`(384, 660)`** left (mirror about x = 491; the current arm roots at
`(583, 656)`, so this is a small nudge outward). Pose with
`transform="translate(x y) rotate(deg)"` where **positive `deg` swings the right
arm outward/up-right** — `rotate(θ)` maps local `(0,−1)` to `(sin θ, −cos θ)`:

| Action | Right | Left | Hand lands near |
| --- | --- | --- | --- |
| HELLO | `rotate(56)` | — | `(598 + 160·sin56, 660 − 160·cos56) ≈ (731, 570)` — just clear of the hood, which ends at y 563 |
| CELEBRATING | `rotate(38)` | `rotate(-38)` | `(697, 534)` / `(285, 534)` — **these paint over the hood**, which is correct because the arm group is drawn after it |
| READING | `rotate(-24) scale(0.45)` at `(592, 690)` | mirrored at `(390, 690)` | ≈ `(621, 624)` / `(361, 624)` — on the book's top edge, which runs `y ≈ 638` from `x 375` to `658` |
| USING_TABLET | `rotate(20) scale(0.5)` at `(650, 700)` | mirrored at `(332, 700)` | ≈ `(623, 674)` / `(359, 674)` — near where the vestigial blobs already sit |

**Wave gesture for HELLO:** animate the rotation between `rotate(48)` and
`rotate(64)` over ~1.1 s, 2–3 iterations. Because the module is 160 units long,
48°→64° swings the hand through `160 × 0.279 ≈ 45 units ≈ 9 CSS px` — roughly
2.5× the current tip travel, and on a shape that actually looks like a hand.

**Mirroring.** `scale(-1 1)` reuses one geometry for the left arm. The thumb
mirrors too; for a mitten that is fine.

### 2.3 How the same hand could support Reading, Tablet and Celebrating

Because the module's origin is the shoulder and it is posed entirely by
`translate`/`rotate`/`scale`, all four actions are the *same markup* at different
transforms:

- **HELLO** — one arm, `rotate(56)`, waving.
- **CELEBRATING** — two arms, `rotate(±38)`, plus a small outward rotation impulse
  synced to `celebrate` so they punch up together.
- **READING** — two arms, scaled to ~0.45 and rotated inward so the mittens meet
  the book's top edge; a tiny `translateY` bob synced to `thinking` reads as page
  turning.
- **USING_TABLET** — two arms at ~0.5 scale, rotated so the mittens sit at the
  tablet's side edges.

Implementation shape: extract a `CompanionHand({ mirror })` returning the `<g>`,
and render it from a small per-action table. Keep the `data-part` names distinct
(e.g. `hand-left` / `hand-right`) — **do not reuse `greeting-arm` for the new
system unless you keep exactly one element with that name**, because nothing in
the tests asserts `greeting-arm`, but a duplicate is confusing.

### 2.4 Why Thinking currently reads angry / suspicious

The THINKING eye is `M392 440L440 446Q434 484 392 440Z` (mirrored on the right).
Read it as a shape: the **top edge is a dead-straight line** from the inner corner
`(392,440)` to the outer corner `(440,446)`, while the **bottom edge curves down
to y 484**. That produces a wedge that is thick at the inner corner and tapers to
a point at the outer corner — i.e. a **glare**: a straight, lowered brow-line over
a narrowed eye, angled inward toward the nose. That is the universal cartoon
signifier for anger or suspicion, not contemplation.

It is compounded by:
- the head tilting **down and right** (`translateY(2px) rotate(2deg)`), which adds
  a downward, appraising look;
- the slivers being **pure white with no pupil**, so there is nowhere for the gaze
  to point;
- and on the AI_THINKING state the tablet sits in front of the chest, so the
  figure appears to scowl at a screen.

**Directions that would read as thinking** (all achievable in the eye branch
alone): raise the gaze rather than lower it; break the straight top edge; add an
asymmetry between the two eyes so the figure looks up-and-away; or replace the
sliver with a small pupil displaced toward the upper outer corner with the upper
lid slightly lowered.

### 2.5 How Happy and Excited currently differ

**In the eye geometry: not at all.** Both use the identical arcs
`M397 446Q416 420 435 446` and `M549 446Q568 420 587 446`. The *only* difference
in the entire eye system is:

```tsx
strokeWidth={expression === "EXCITED" ? 9 : 7}
```

Everything else is the **action**:

| | HAPPY (`QUEST_COMPLETE` + FLOATING) | EXCITED (`TIMER_COMPLETE`/`LEVEL_UP` + CELEBRATING) |
| --- | --- | --- |
| `.reaction` | `happy` 1.1 s ×2, −12 units, −2° | `celebrate` 1.4 s ×2, −21 units, +3° |
| `.star` | ambient `star` | `positive-star`, scale → 1.08 |
| sparkles | none | three, fading in to .85 |
| arm | none | one raised arm (identical to HELLO's) |

So the two expressions are **2 units of stroke width apart**. A user cannot tell
them apart unless the action also differs — and on mobile the sparkles are hidden,
so the difference collapses further.

### 2.6 Why Curious is too similar to Neutral

The complete delta:

| Property | NEUTRAL | CURIOUS | Screen delta at desktop | at ≤700 px |
| --- | --- | --- | --- | --- |
| right eye `rx` | 16 | 14 | 0.42 px | 0.16 px |
| right eye `ry` | 38 | 32 | 1.25 px | 0.49 px |
| right eye lift | 0 | −9 units | 1.87 px | 0.73 px |
| `.head` | none | `rotate(-2deg)` | 2° | 2° |
| `.idleNeutral` class | present | absent | no blink-adjacent beat | — |
| `.idleHappy` | rendered | not rendered | — | — |

And the one animation that would have sold it — `curious-glance`, which is keyed
to `.eyeRight` — **is gated on `[data-state="IDLE"][data-expression="NEUTRAL"]`
and therefore never fires for CURIOUS**, since CURIOUS only arrives through
`DISCOVERING` or `ERROR`.

Net: CURIOUS is NEUTRAL with a 2° head tilt and a right eye a pixel and a half
different, with no idle behaviour.

### 2.7 Why Timer Mode is difficult to identify without its label

1. **The only identifier is a glyph, and it is deleted on mobile.**
   `BotanicalTrail.module.css` hides `[data-part="timer"]` below 700 px. On a
   phone TIMER_MODE is indistinguishable from any other THINKING state.
2. **Every body change is sub-pixel.** `lowerBody translateY(3px)` = **0.6 px**;
   `cloak translateY(2px) scale(1.01, 0.985)` = 0.4 px of movement and a 1 %
   squash; legs `rotate(±7deg) scaleY(0.98)`. At three-figure widths none of this
   survives.
3. **`quiet` mode actively suppresses everything else.** `FOCUSING` forces
   `data-motion="quiet"`, which sets `--float: 3px`, `--sway: 0.7deg`, slows
   float and shadow to 9 s, and **switches off the `.star` and `.body`
   animations entirely**. So the state that most needs a readable cue has had its
   motion deliberately removed.
4. **The glyph is a generic clock.** A clock ring reads as "timer" only to
   someone already expecting one; there is no pose, no prop interaction and no
   hand — nothing that says "this creature is timing something".
5. **It does not interact with the body.** The timer floats at `(737, 535)`, which
   is to the right of the shoulder at mid-body height, disconnected from the
   figure. It is not held, not looked at, not attached.

The highest-value fix is a **pose**, not a bigger glyph: fold the legs, drop the
lower body, bring a hand up, and direct the gaze at the clock. Even a 10–15 unit
change in those elements is 2–3 CSS px and would beat a 0.6 px nudge.

### 2.8 How Reading and Tablet props are attached and layered

Both are rendered from one conditional:

```tsx
{prop && (
  <g data-part={action === "READING" ? "book" : "tablet"} className={s.prop}>
    <g transform="translate(79 -90) scale(3.25)">
      {action === "READING" ? (…book…) : (…tablet…)}
      <path d="M86 231C78 237 85 249 98 244L103 236C99 230 94 229 86 231Z
               M171 225C180 218 185 229 179 237L170 243Z" fill={p.body} />
    </g>
  </g>
)}
```

- **Placement.** The inner group applies `scale(3.25)` then `translate(79, −90)`.
  The prop art is authored around `x 86–185, y 203–274`, so after the transform
  it occupies roughly **x 358–680, y 570–800** — across the lower chest and
  waist, overlapping the cape and the lower body.
- **Layering.** Inside `.reaction`, after the greeting-arm slot and after the
  hood → it paints over the body, the cape and the hood's hem.
- **Animation.** `.prop { transform-origin: 491px 700px }` and nothing else.
  `thinking 9 s ±1°` applies **only** under `[data-state="AI_THINKING"]` — so
  READING has no animation at all, and PLANNING has none either because it is
  CURIOUS+tablet, not AI_THINKING.
- **Hands.** The only hand-like geometry is those two small navy blobs **inside**
  the prop group. They are ~25 and ~15 local units wide, become ~80 and ~50 units
  after the 3.25 scale, sit at the prop's outer edges, share the prop's transform
  so they cannot be posed independently, and are the same navy as the robe. They
  read as smudges, not hands.
- **Why the two are hard to tell apart.** They occupy **identical coordinates**
  and differ only in fill and flatness: the book is dark navy `#353a60` with a
  thin gold outline; the tablet is a blue→periwinkle gradient with a `#c8dcff`
  outline. Under `AI_THINKING` vs `READING` the expression is *also* identical
  (both THINKING), so the only difference between those two states is the prop's
  fill colour.

---

## 3. Which parts can safely be visually changed

**Completely safe — independent vector, drawn on top, no raster involvement:**

- the entire eye system (`[data-part="eyes"]`, `.eyeLeft`, `.eyeRight`,
  `.idleNeutral`, `.idleHappy`, and the closed/thinking branches);
- `[data-part="face"]`;
- `[data-part="timer"]`;
- `[data-part="sparkles"]`;
- `[data-part="greeting-arm"]` and any replacement hand system;
- `[data-part="book"]` / `[data-part="tablet"]`;
- `.head` **rotation and translation within the limits in §4.1**;
- `.reaction` keyframes;
- `.halo` / `.star` / `.ribbon` ambient keyframes and amplitudes.

**Safe but coordinated — these carry travel-driven CSS variables written every
frame by `JourneyCompanion`:**

- `.capeLag` (`--cape-lag`, `--cape-skew`, `--cape-lift`, `--cape-stretch`)
- `.cloakTravelLeft` / `.cloakTravelRight`
- `.lowerBodyLag` (`--lower-tilt`, `--lower-lift`)
- `.ribbonLagLeft` / `.ribbonLagRight`
- `.haloLag` / `.starLag`
- `.reaction` (`--journey-shift`)

You may add **state** rules to `.cloak`, `.lowerBody`, `.legLeft`, `.legRight`
(that is what TIMER_MODE already does) because the travel transform lives on the
`-lag` wrappers. You may not move travel variables onto the inner elements.

**Do not restyle:** `[data-part="body"]`, `[data-part="cloak"]` geometry,
`[data-part="hood"]` geometry, `[data-part="ribbons"]` geometry, the shadow
ellipse's place in the stack, or anything in `<defs>` relating to the painting.

---

## 4. Fragile boundaries and transform limits

### 4.1 The hood is the fragile one

The torso matte subtracts `HOOD` with **no underlayer** and only the 1-unit
antialias underlap from the shared `strokeWidth="2"`. So **any head movement
drags a cut-out across a hole with almost no margin.**

Working the numbers: the hood hem points are close to the head's origin
`(491, 550)` — e.g. `(551, 548)` is 60 units away and `(349, 552)` is 142 units
away. A rotation of θ moves a hem point by `r·θ`:
- 1° at r = 60 → **1.05 units** — already consumes the entire 1-unit underlap;
- 1° at r = 142 → 2.5 units.

Current usage is CURIOUS `−2°`, THINKING `+2° + 2 units`, SLEEPY `+3° + 3 units`.
Those are already at the edge of the envelope.

**If a state needs a stronger head pose, add a hood underlayer first** — it is the
established pattern in this file and takes three lines:

```tsx
{/* inside the #id-torso mask, after the HOOD subtraction */}
<path d={HOOD} fill="white" transform={insetAbout(489, 366, 0.9)} />
```

`(489, 366)` is the hood's approximate centroid. Verify visually afterwards: at
rest the inset copy must be completely covered by the hood `<use>`.

Prefer, in order: (1) moving the whole character via `.reaction`, (2) moving the
eyes, (3) adding the hood underlayer and then rotating the head.

### 4.2 Measured-safe envelopes (do not exceed without re-measuring)

| Layer | Measured-safe | Notes |
| --- | --- | --- |
| Cape (`capeTilt` / `capeSkew` / `capeStretch`) | 3.4° / 8.5° / 0.085 | has a 0.9-inset underlayer; measured interior gap **below the noise floor** |
| Cape per-side (`capeLeft/RightTilt`, `…Skew`) | ±3.0° / ±3.4° | has the same underlayer |
| Lower body (`lowerTilt` / `lowerLift`) | 5.4° / 5 units | legs have a 0.86-inset underlayer |
| Ribbons | ±14° | drawn **behind** the torso, so inner ends are occluded |
| Halo / star | ±3.4° / ±5.2° plus positional lag | independent vector, no seam risk |
| Head (`rotate` / `translateY`) | **≤3° / ≤3 units** | **no underlayer — §4.1** |

### 4.3 Other fragile details

- The torso/withoutCloak mask rects cover **y 548–868 only**. Nothing masked is
  painted outside that band, so do not move the body far enough to leave it.
- The ribbons and cloaks are subtracted from the torso, so any **new** element
  drawn between `body` and `capeLag` in paint order will be hidden.
- `[data-part="shadow"]` is outside `.float`; if you move it inside, the float
  stops reading as lift.
- `.eyes` carries the `blink` animation and `.eyeRight` carries `curious-glance`.
  Adding a transform to either element in a state rule will **override the
  animation** rather than compose with it — put new poses on a **wrapper** `<g>`,
  as the CURIOUS right-eye lift already does.
- `.reaction` carries `transform: translateX(var(--journey-shift))`, and the
  `happy`/`celebrate` keyframes replace that transform entirely for their
  duration. That is intended, but it means a reaction temporarily loses the bank
  shift.

---

## 5. Mobile, reduced motion, and the prototype

### 5.1 Mobile

- Host box and unit scale: see §0.2. A value under ~12 SVG units is **below one
  CSS pixel at the smallest breakpoint** and effectively desktop-only.
- `@media (max-width: 700px)` in `BotanicalTrail.module.css` **hides
  `[data-part="timer"]` and `[data-part="sparkles"]` entirely.**
- `@media (max-width: 1100 / 900 / 700px)` in `Companion.module.css` boosts
  `--float`, `--drift`, `--roll`, `--sway`, `--lag-boost` for the journey
  profile. These affect **travel** amplitude, not expression geometry.
- `data-compact` is **never true** in any current usage (see §0.4). Do not build
  a plan around it.
- The `size` prop does **not** control the journey's on-screen size — the host
  box does. `size="LARGE"` (180) is only the internal `--companion-size`.

### 5.2 Reduced motion

`@media (prefers-reduced-motion: reduce)` does all of the following:

```css
.companion * { animation: none !important; transition: none !important; }
.sparkles { opacity: 0.6; }
.capeLag, .cloakTravelLeft, .cloakTravelRight, .lowerBodyLag,
.ribbonLagLeft, .ribbonLagRight, .haloLag, .starLag { transform: none; }
.wind { display: none; }
```

plus, in `JourneyCompanion.module.css`, `.surface` and `.character.character`
get `transform: none`.

**Implications for your work:**
- Every state must be **readable as a still**. Design the pose so it works with
  all animation stripped — this is the single most common way a state polish
  regresses.
- Because `animation: none` is applied with `!important`, an element whose pose is
  only expressed *inside* a keyframe reverts to its **base** style. If a pose
  matters, put it in the base rule, not only in the keyframes.
- `.sparkles { opacity: 0.6 }` is set explicitly precisely so sparkles survive as
  a static pose. Follow that precedent for any new celebratory accent.
- `.greeting-arm` reverts to `transform: none` and simply sits there. A new hand
  system should have a sensible **base pose per action** so reduced motion shows a
  meaningful still.

### 5.3 The prototype is your test bench

`/companion-prototype` renders:
- a `size="HERO"` stage with a state `<select>` (8 states), three reaction
  buttons and a pause toggle;
- a 6-cell grid of **all expressions** at `size="LARGE" motion="none"` via the
  `preview` prop;
- a 6-cell grid of **all actions** at `size="LARGE" motion="none"`, with
  expressions chosen as `CELEBRATING → EXCITED`, `READING|TIMER_MODE → THINKING`,
  else `NEUTRAL`.

The `preview` prop bypasses the state map entirely and sets `data-expression` /
`data-action` directly — so **the galleries are the fastest way to see all 12
states side by side without touching the landing page.**

Note that `motion="none"` disables every animation, so the galleries show base
poses only. Use the HERO stage (which uses `motion="full"`) to judge motion.

---

## 6. Suggested implementation path

Ordered so each step is independently verifiable and none requires a later one.

**Step 1 — Build the hand module.** Add a `CompanionHand` `<g>` in
`artwork.tsx` with the geometry from §2.2. Render it for HELLO first, leaving
`CELEBRATING` on the old arm until you are happy. Verify on
`/companion-prototype` (the HERO stage with the "Hello" reaction) and on the
landing at `#study-ai`, where a `pose="wave"` waypoint exists.

**Step 2 — Port CELEBRATING to two mirrored hands**, and sync their rotation to
the `celebrate` keyframe. Verify with the "Celebrate" reaction button.

**Step 3 — Remove the vestigial navy blobs from the prop group** and pose two
scaled hands for READING. Then repeat for USING_TABLET against the tablet's side
edges. Verify in the action gallery and on the landing at a `pose="read"`
waypoint.

**Step 4 — Redesign the THINKING eye** (§2.4). This is a pure change to the
filled-sliver branch in `artwork.tsx`. Verify in the expression gallery at both
`size="LARGE"` and a small size, because this is the state you must not make
worse on mobile.

**Step 5 — Differentiate HAPPY from EXCITED** by giving EXCITED its own eye
geometry rather than a stroke width (§2.5). A raised-arc "sparkle eye" with a
small gap, or an eye with a visible lower lid, are both cheap and survive at
small sizes.

**Step 6 — Give CURIOUS a real identity** (§2.6). The cheapest high-impact fix is
to make `curious-glance` reachable for CURIOUS — the gate currently requires
`data-state="IDLE"`, which CURIOUS never satisfies. Either widen the selector or
add a CURIOUS-specific ambient rule. Then widen the eye asymmetry.

**Step 7 — Give TIMER_MODE a pose** (§2.7): a folded/curled lower body, a hand
raised toward the clock, and the gaze directed at it. Because the timer glyph is
hidden on mobile, **the pose must carry the state on its own.**

**Step 8 — Re-verify.** In order:
```sh
npx tsc --noEmit -p tsconfig.json
npx vitest run __tests__/landing          # expect 85 passing / 10 files
SYLF_QA_BASE=http://localhost:3000 node scripts/verify-landing-companion.mjs   # expect 41 / 0
```
Then look at every state on `/companion-prototype` at `size="LARGE"` **and** at a
small size, with **reduced motion enabled**, and on the landing at 1440 / 390 /
320 px.

**Constraints that apply to every step:** no new dependency; no new `<image>`,
`<canvas>` or `<video>`; every new `id` must be prefixed with the component's
`useId`-derived `id`; every new `url(#…)` reference must point at an id that
exists; and every new element must be a child of a group the state rules can
reach.

---

## 7. DO NOT BREAK

### 7.1 Files you must not touch at all

| Path | Why |
| --- | --- |
| `app/components/landing/journey/JourneyPath.tsx` | Sole owner of page/world coordinates |
| `app/components/character/**` | The in-app avatar/chibi renderer. Out of scope |
| `app/components/landing/companion/secondary-motion.ts` | Travel spring tuning, already measured and balanced |
| `app/components/landing/companion/JourneyCompanion.tsx` | The travel→CSS-variable contract |
| `app/components/landing/journey/Journey.module.css`, `BotanicalTrail.module.css` | Page layout and traveller sizing |
| `public/landing/companion/original-rig.webp` | The canonical painting. Never regenerate |
| `package.json` / `package-lock.json` | No new dependencies |

### 7.2 Frozen contracts

**`model.ts`**
- `EXPRESSIONS` and `ACTIONS` arrays: names, spelling, count.
- `PRESENTATIONS`: keys are the 12 states, and each maps to exactly one
  expression + action. A test iterates every key and asserts both attributes.
- `REACTIONS`: names, `duration`, `priority`.
- `COMPANION_SIZES` and `ORIGINAL` palette keys/values.
- `normalizeState` must keep falling back to `IDLE`.

**`Companion.tsx`**
- The host `<span>` must keep `data-sylf-companion="original"` and `aria-hidden="true"`.
- `data-state`, `data-expression`, `data-action`, `data-motion`,
  `data-motion-profile`, `data-compact`, `data-animation` — names and meanings.
- The `motionProfile="journey"` gate that keeps onboarding on its quieter idle.
- Exactly **one** `useId()`-derived `id` per instance, used to prefix every SVG id.

**`artwork.tsx`**
- `CANONICAL_ART` must remain `/landing/companion/original-rig.webp` and be the
  **only** `<image>`.
- Every moving part must remain a `<use href={source}>` sampled through a clip
  path or mask from **that one** painting. Do not add a second raster.
- These `data-part` names must exist and keep their meaning (a test asserts each
  is present): `hood`, `face`, `eyes`, `body`, `lower-body`, `cloak`, `ribbons`,
  `chest-clasp`, `halo`, `star`.
- `data-part="book"` must render **exactly once** for READING and **zero** times
  otherwise; likewise `tablet` / `timer` / `sparkles`. A test asserts the exact
  counts.
- The hood `<use>` element and its `clip-path` attribute must be **identical
  across all six expressions** — the renderer may not swap the hood per state.
- All `id`s must be unique across two `Companion` instances on one page; every
  `fill="url(#…)"` must resolve.

**`Companion.module.css`**
- Class names used by the `data-*` selectors. In particular, keep `.closedEyes`
  **only if you give it a rule** — right now it is referenced but undefined, and
  the closed-eye expressions get no origin or blink. Fixing that is allowed and
  probably desirable; removing the reference is also allowed as long as the
  closed-eye branch still renders.
- The travel CSS variables (`--cape-lag`, `--cape-skew`, `--cape-lift`,
  `--cape-stretch`, `--cape-left/right-tilt`, `--cape-left/right-skew`,
  `--lower-tilt`, `--lower-lift`, `--ribbon-left/right-lag`,
  `--ribbon-left/right-lift`, `--halo-lag`, `--halo-x`, `--halo-y`, `--star-lag`,
  `--star-x`, `--star-y`, `--journey-lean`, `--journey-shift`) and the `--lag-boost`
  multiplier.
- The `prefers-reduced-motion` block, including `.sparkles { opacity: .6 }`.

**Tests that must keep passing** (85 across 10 files; the relevant ones):
`__tests__/landing/landing-companion.test.tsx` (30 — anatomy, one shared texture,
per-expression hood identity, per-action prop counts, state mapping, reaction
priority/expiry, offscreen pause), `journey-companion.test.tsx` (asserts
`--cape-lag` against `SECONDARY_MOTION_LIMITS.capeTilt` and that `--cape-skew` is
present), `secondary-motion.test.ts` (14 — iterates the exported
`SECONDARY_MOTION_LIMITS`, so a new spring would need a limit entry),
`landing-companion-motion.test.ts`, `journey-motion.test.tsx`, `journey.test.tsx`,
`journey-geometry.test.ts`.

**Harness** — `scripts/verify-landing-companion.mjs`, 41 checks, currently 0
failures. Load-bearing for your work:
- *Every character part uses the same painted master* — one distinct `image`
  href, and it must be `CANONICAL_ART`.
- *No video/canvas or whole-character frame playback*.
- *Six expressions and six actions share the canonical renderer*.
- *Occasional happy and curious eye motion uses the persistent character* — this
  samples `happy-moment`, `neutral-moment` and `curious-glance` at offsets derived
  from **each animation's own keyframes** and the **its own duration**. If you
  retime or rename those three animations, the check follows automatically; if you
  **remove** any of them it will fail. Keep all three names alive.
- *Persistent SVG/hood through <state>* for 8 states — the hood `<use>` must
  survive every state change.
- *Landing 390px / 320px has no overflow* and *Stable visible character and clear
  controls* at three sections on three widths.

### 7.3 Things that are allowed even though they look risky

- Adding new `<g>` wrappers, new classes, new keyframes, new gradients in
  `<defs>` (with `useId`-prefixed ids).
- Replacing `[data-part="greeting-arm"]` with a different element **provided** you
  keep either the same `data-part` or remove it cleanly — nothing asserts it.
- Editing the vestigial navy blobs inside the prop group.
- Giving `.closedEyes` an actual CSS rule.
- Changing any keyframe duration or amplitude.
- Adding a `HOOD` inset underlayer to the torso mask (§4.1), which *increases*
  what the head can safely do.

---

## 8. One honest caveat

The agent that produced this document could not see the rendered result: the
model in use does not accept image input, and screenshots it takes are discarded
by the harness. Everything above was read from the source or measured through a
CDP pixel rig that counts real on-screen displacement and background pixels
appearing inside the silhouette.

That means the **numbers are reliable and the aesthetic judgements are not.**
Specifically these are inferences from geometry rather than from looking:

- §2.4 "why Thinking reads angry" — read off the path data (straight brow edge
  over a down-curved lower lid); I did not see it.
- §2.5 "Happy and Excited are 2 units of stroke width apart" — that is exact and
  verifiable from the source.
- §2.6 "Curious is too similar to Neutral" — the per-property deltas are exact;
  the claim that this reads as "too similar" is the client's, and I agree with it
  on the numbers.
- The hand geometry in §2.2 is a **proposal**, designed against the existing
  coordinates but never rendered. Expect to tune the shoulder positions and the
  per-action rotations by eye.

The fastest way to get a state right is to render it, screenshot it, and attach
the image to the conversation — the receiving model can see attached images even
though it cannot see ones it captures itself.
