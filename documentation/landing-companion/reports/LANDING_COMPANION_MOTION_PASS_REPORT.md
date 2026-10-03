# Sylf Landing Companion — Motion / Life Pass

Landing-only motion work on the journey companion. No redesign, no new animation
runtime, no change to the artwork, silhouette, palette or proportions.

> **Verification caveat, stated up front.** The model that implemented this pass
> cannot accept image input: `read_image` fails with *"model deepseek-v4-flash
> does not declare image input"*, and no vision-capable model is reachable
> (only DeepSeek is credentialed, and adding another provider would need a paid
> API key, which the brief forbids). "Look at it and judge" was therefore
> replaced with **measurement of rendered pixels**: a CDP rig that screenshots
> the companion, decodes the PNG, and reports real on-screen displacement per
> layer, silhouette area, and interior-gap (seam) counts. That is objective and
> is what the numbers below come from, but **final aesthetic sign-off still
> belongs to a human eye.** Screenshots are on disk for that review.

---

## 1. What visually felt dead before

Measured, not assumed. Over 20 s of true idle at the desktop journey size
(144×180 CSS px) the whole character moved **1–3 screen px peak-to-peak**:

| layer | idle px-pp (before) |
| --- | --- |
| body / hood | 1.56 × 1.87 |
| cape left / right | 1.18 × 2.63 / 1.07 × 0.95 |
| ribbon left / right | 0.52 × 2.57 / 0.52 × 1.17 |
| halo / star | 1.86 × 6.02 / 2.09 × 3.04 |

Two root causes, both found by measurement:

1. **Unit confusion.** `--float: 9px` looks like 9 screen px but the float is an
   SVG `<g>`, so it is **9 user units**. At 144 px wide over a 630-unit viewBox
   that is **2.06 CSS px**. The entire idle was ~2 px of travel.
2. **A hidden halving.** `JourneyCompanion` scaled cape and ribbon before
   presentation by **0.42 / 0.45**. Combined with small spring bounds, a fast
   scroll produced a cape response of **0.61°** — and with the cape tip ~318
   units from its pivot, that is **0.66 screen px**. The single highest-priority
   effect in the brief was sub-pixel.

## 2. What was observed through Chrome DevTools

The real page (Next 16 dev server) and `/companion-prototype` were driven
through the Chrome DevTools MCP: stationary idle ≥20 s, slow scroll (250 px/s),
fast scroll (1300 px/s), upward scroll, rapid reversal, abrupt stop, a full
descent to exercise every path bend, and mobile emulation at 390×844 and 320 px.

Because the model is blind, observation was numeric: per-layer screen-pixel
displacement via `getScreenCTM` probes taken relative to the companion host (so
page travel cancels out), plus the CDP screenshot rig for seam and silhouette
analysis.

## 3. Body float changes

The single bob became **three nested layers at unrelated durations** so the idle
never reads as one sine wave: bob 6.4 s, lateral drift 9.3 s, roll 14.6 s.

| idle, 20 s | before | after | factor |
| --- | --- | --- | --- |
| body / hood | 1.56 × 1.87 | **9.29 × 7.08** | ~4.8× |
| cape left / right | 1.18 × 2.63 | **4.57 × 8.75** / **4.48 × 8.34** | ~3.5× |
| ribbon left / right | 0.52 × 2.57 | **3.53 × 8.86** / **3.54 × 8.21** | ~4× |
| halo / star | 1.86 × 6.02 | **8.90 × 11.50** / **10.14 × 8.30** | ~3× |
| eyes | 1.02 × 2.06 | **5.71 × 7.54** | ~4× |

Total distance travelled per layer over the same 20 s rose from **11–21 px** to
**51–61 px**, and the layers now have *different* totals (cape L 55.3 vs R 52.8),
i.e. they are genuinely out of phase rather than one transform.

Breathing went from `scaleY(1.007)` / 7.3 s to `scaleY(1.016)` / 5.6 s.

## 4. Body bank changes

Bank is now driven by three terms instead of one: travel direction, steady
lateral lean, and **turn rate** (lateral acceleration), plus the acceleration
impulse. Bound raised 4.6° → **7.4°**, with softer damping so the bank settles
visibly.

A full slow descent (360 px/s) across every bend in the journey path:

| | before | after |
| --- | --- | --- |
| peak bank | 1.36° (fast scroll) | **6.27°** at the bend (y≈1899) |
| median bank on straights | — | 1.37° |
| 90th percentile | — | 3.99° |

So it banks hard into corners and stays calm on straights — a **4.6× stronger
peak**, concentrated where the path actually turns rather than applied uniformly.

## 5. Cape changes

The cape's attachment line is where the panel meets the torso, and the torso
matte **cuts that exact shape out**, so any cape movement used to expose the page
background through the gap. Empirical seam testing (forcing a rotation and
counting magenta background pixels inside the silhouette) put the tolerance at
essentially zero: a **4° rotation produced a +48 px interior gap** against a
~152 px noise floor, scaling roughly linearly to +369 px at 12°.

Rather than kill the amplitude, the cape was rebuilt around three seam-safe
components plus an underlayer:

- **shear (`capeSkew`)** about the attachment line — carries most of the visible
  swing while the anchored edge barely moves;
- **small rotation (`capeTilt`)** ≤ 3.4°;
- **outward-only billow (`capeStretch`)**, clamped ≥ 0 so the panel can only
  grow outward and can never open a gap behind itself;
- **per-side asymmetry** (`capeLeft/RightTilt`, `capeLeft/RightSkew`) at
  different frequencies and damping, so the halves never move as one plate;
- **a seam-safety underlayer**: an inset copy of each cloak panel retained in the
  torso mask. Invisible at rest (the cape is drawn on top of it), it fills the
  opening once the cape swings. The legs got the same treatment.

Result at full travel displacement: interior gap **+10.6 px** — *below the
+33.1 px noise floor* — and silhouette change **0.09%**. The cape now moves ~6×
further with no measurable tearing.

Rendered response (peak degrees, before → after):

| | before | after |
| --- | --- | --- |
| cape rotation | 0.61° (after ×0.42) | 1.95° lag + **4.58° shear** (fast down) / **6.69°** (reversal) |
| cape tip on screen | 1.84 px (fast down) | **3.97 px**, and **13.35 px** on reversal |

## 6. Ribbon changes

Ribbons are the liveliest layer: lightest springs, largest bounds, own impulse
gain, and the largest turn bias. The hidden 0.45 presentation scale was removed.

| | before | after |
| --- | --- | --- |
| ribbon rendered rotation | 0.78° | **5.64° / 4.67°** (fast down), **10.40° / 8.46°** (reversal) |
| ribbon tip on screen | 2.11 px | **6.06 px**, **12.66 px** on reversal |

Left and right differ in bound (14° vs 12°), frequency, damping and turn bias, so
they visibly do not move together.

## 7. Acceleration response

The system previously used velocity only. It now derives a bounded
change-in-velocity signal, low-passed with a **time constant** (not a per-frame
blend, so it stays frame-rate independent) and saturating through `tanh`, then
feeds short impulses into the cape, ribbons, halo and star.

A sudden reversal now produces a materially larger reaction than constant-speed
travel: at the same nominal speed, reversal drives cape shear to **6.69°** and
ribbons to **10.4°**, versus 4.58° / 5.64° for steady travel.

One real bug surfaced here: an exponential decay never reaches exactly zero, so a
non-zero impulse kept `active` true forever and the travel RAF would never have
parked. Fixed by snapping the smoothed acceleration to rest below a threshold
that cannot move any spring.

## 8. Stopping and settling

Damping was set **below critical** on the fabric layers (ζ ≈ 0.44–0.57) so they
overshoot and catch up late, giving the character visible mass. The settle tail
is deliberately longer than before — light damping was chosen for the look, then
retuned upward slightly so the whole system still parks inside the harness's
3.75 s window. Settling converges to **exact zero** (all pose fields 0, `active`
false) and the RAF stops; verified by test and in-browser (`moving: false`,
every lag variable `0.00`).

## 9. Lower-body follow-through

A motion hierarchy now exists: **torso leads → lower body follows → ribbons
follow later → halo/star drift independently.** Lower body has its own softer
springs on the same signal (ω 5.2 vs 7.4, ζ 0.52 vs 0.66) and reaches **4.81°**
against the torso's 6.27°, so it visibly lags through a turn.

## 10. Halo / star

Halo is heavy and slow (ω 3.0, ζ 0.7, ±3.4°); star is lighter and more playful
(ω 4.2, ζ 0.5, ±5.2° plus larger positional lag). They use different frequencies
and different gains on the same input, so they never share a phase — asserted in
tests (`starX !== haloX`, `starY !== haloY`).

## 11. Blink and expression cadence

Cycles were shortened and made irregular, measured live over 42 s:

| channel | before | after | measured |
| --- | --- | --- | --- |
| blink | 19.7 s cycle | 24 s cycle, 5 blinks incl. 2 doubles | **9 in 42 s**, gaps 4.8/5.8/**0.4**/6.8/6.3/4.8/5.8/**0.4** |
| micro glance | 31 s cycle | 19 s cycle, 2 glances | **5 in 42 s**, gaps 9.67/9.34/9.65/9.35 |
| micro expression | 43 s cycle | 24 s cycle | **2 in 42 s**, every 24 s |

**In the first 10 seconds a viewer sees a micro-expression at 2.1 s, a glance at
3.7 s, and a blink at 5.9 s** — three distinct signs of life.

## 12. Shadow behaviour

The shadow is world-anchored (it sits outside `.float`) and was retimed from
7.7 s to **match the new 6.4 s float exactly**, so rise and shrink stay in phase.
Amplitude increased slightly (scaleX 1 → 0.86, opacity 0.13 → 0.08 at peak lift)
— enough to make the float read as spatial without being noticed as a trick.

## 13. Forward pitch and turn bank (added after first review)

**Forward pitch.** A uniform `scaleY` squash was the wrong instrument: it shrinks
the whole figure and does not read as leaning. It is now a real 3D pitch —
`perspective(400px) rotateX(...)` on the character wrapper, pivoting at the hips
(50% 62%) — so the head swings toward the viewer and the feet away.

Measured on rendered pixels at −13°, band by band:

| band | 0° | −13° | delta |
| --- | --- | --- | --- |
| top (head) | 893.8 | 958.9 | **+65.1** |
| upper | 2372.2 | 2676.1 | **+303.9** |
| mid | 4775.6 | 4824.8 | +49.2 |
| lower | 4856.3 | 4572.9 | **−283.4** |
| bottom (feet) | 311.3 | 102.2 | **−209.1** |

Head shows more (+369 px across the top two bands), legs and feet minimise
(−492 px across the bottom two). Live during fast travel the pitch reaches
**−11.49°** (bound 13°); the sign matters and is documented in the source — a
*positive* CSS `rotateX` tips the bottom forward and shrinks the head instead.

**Turn bias on the fabric.** Turns now push the cape and ribbons **outward** from
the corner (cape shear +3.2, per-side tilts +1.3/+1.0, ribbons +3.4/+2.7, star
+2.2 on the turn signal).

## 14. Wind streaks

A **radial burst**, not a vertical conveyor. A fixed set of **11 rays and 4
specks** — a hard cap of 15 elements. Intensity scales opacity, drift speed and
how many of the fixed set switch on (each has its own `--t` threshold); it never
adds elements.

Each ray starts on an ellipse just outside the silhouette and flies **directly
away from the character's centre**, so the field reads as air parting around the
character and streaming off in every direction. Bearing is measured from straight
up; a ray's tilt and its travel axis are the same thing, so the animated
`translateY` carries it outward along the bearing it points in. Verified: for all
15 elements the drawn bearing, the start bearing and the measured travel bearing
are **identical**, and every one starts outside the body (nearest is 63.0 px from
centre against a 58.7 px silhouette half-width).

This replaced two failed designs, both worth recording:

1. **Vertical streaks** swept up the page *through* the character, which read as
   a conveyor rather than as wind.
2. **A uniform lean** (−20° to −36°) swung every streak out past the character's
   left edge, so the whole field appeared to slide off to one side. Reducing it
   to −7°…−14° and splaying it by side of centre fixed the asymmetry but still
   sent the streaks through the body rather than around it.

- **Only during travel.** Floor 200 px/s, full 1100 px/s, hard-capped at 1.
  Measured: intensity **0** and group opacity **0.00** at rest over 8 s of idle,
  and a clean fall from 1.0 to 0 in **0.41 s** after a genuine stop (verified with
  the traveller confirmed moving at the moment the scroll stopped). During a
  1500 px/s scroll it is present on **78%** of frames. A `data-wind="off"`
  attribute also removes the layer from painting entirely, so a residual value can
  never leave wind running at rest. It is driven by the *companion's* velocity,
  not the page's, so when the journey path clamps at its last stop the wind
  correctly switches off even though the page is still scrolling.
- **Tapered and glowing.** Each ray has its own `userSpaceOnUse` gradient fading
  to transparent at both ends, with a periwinkle body (reads against the cream
  robe) and an ivory hot centre (reads against the navy body).
- **Direction follows travel** via `animation-direction` on a `[data-wind-dir]`
  switch.
- Measured ink: ~**360 px** median / 559 px max of soft streak over a ~13,000 px
  character — a handful of wisps, not a particle storm.

Four real bugs were found and fixed here. The first three were mine and each made
the layer render as *nothing at all* while the numbers claimed it was fully on:

1. It was painted **behind** the character (`<g class="float">` comes earlier), so
   an opaque body occluded most of it.
2. Streaks are straight lines, whose **object bounding box has zero width** — an
   `objectBoundingBox` gradient on a zero-width box **paints nothing**.
3. Sizing was in SVG user units where 1 unit ≈ 0.208 screen px, so the streaks
   were 13 × 1 px slivers.
4. Two harness checks and two of my own measurement scripts were themselves
   wrong: one direction metric sampled less than a single animation cycle and
   read pure phase noise, and another averaged in the animation's wrap-around
   frame — one huge jump per cycle that dominated the mean and inverted the
   apparent direction.

## 15. Responsive tuning

All amplitudes are in SVG user units, so they scale down with the artwork; a
`--lag-boost` multiplier and larger `--float` values are applied at the 1100 /
900 / 700 px breakpoints to compensate.

Measured at 390×844 (companion 57×70): idle cape **10.72 px**, ribbon **9.73 px**,
star 6.8 px — motion still clearly reads at phone size. **No horizontal overflow
at 390 px or 320 px** (390 = 390), asserted by the harness at three sections on
three widths.

## 16. Seam / artwork protection

No artwork was regenerated and the silhouette is unchanged. Seam risk was handled
by transform origins at the attachment lines, shear over rotation, outward-only
billow, restrained asymmetry, and the mask underlayers described in §5.

At full travel displacement the interior gap grows **+10.6 px** against a
**+33.1 px** noise floor, with a **0.09%** silhouette change. The underlayers are
invisible at rest because the moving panels are painted on top of them.

## 17. Performance

- `JourneyPath` still owns page/world coordinates; `JourneyCompanion.present()`
  remains a local-motion bridge. **`JourneyPath.tsx` was not modified.**
- No per-frame React state: values are written straight to CSS custom properties
  on the surface element.
- RAF runs only while travelling or settling, then parks (guaranteed by the
  acceleration snap-to-rest fix in §7).
- No animation runtime added; no animated blur or filter. Transforms and opacity
  only.
- Harness RAF cadence: **median 16.7 ms, p95 16.7 ms** over 90 samples.
- Offscreen/hidden pause and reduced motion unchanged.

## 18. Reduced motion

Preserved and strengthened. All travel-driven layers resolve to `transform: none`,
every animation and transition is disabled, the character wrapper's pitch is
reset, and the wind layer is `display: none` — removed rather than slowed. The
harness's three reduced-motion checks pass.

## 19. Tests

**85 passing across 10 files** (was 78). Key changes:

- `secondary-motion.test.ts` — rewritten around the **exported
  `SECONDARY_MOTION_LIMITS`** instead of hard-coded aesthetic constants. Asserts
  bounds at eight extreme inputs, monotonic no-runaway behaviour, reversal
  inertia, **that every layer moves at least 50% of its declared bound** (the
  regression guard for the sub-pixel defect this pass fixed), that the cape
  halves and halo/star stay out of lockstep, frame-rate consistency, NaN/Infinity
  safety, exact settling, and reset hygiene. Wind adds three tests: absent at and
  below the floor, monotonic and hard-capped at 1, sign-tracking and
  invalid-input safe.
- `journey-companion.test.tsx` — the stale `|cape| < 2` assertion (an artefact of
  the removed 0.42 scale) now asserts against the declared bound and requires the
  shear to be present.

## 20. Browser QA

`scripts/verify-landing-companion.mjs` — **41 checks, 0 failures**, covering
expression/action identity, single painted master, no video/canvas, persistent
SVG identity across 8 states, persistent happy/curious idle motion, bounded
reactions and priority, offscreen pause, reduced motion (3 checks), no horizontal
overflow at 1440/390/320 px, stable visible character at three sections on three
widths, cape/ribbon inertia without remounting, continuous page movement on
reversal, complete settle after travel stops, no retired video/Pixi/atlas
requests, and no runtime exceptions.

Two harness checks were themselves repaired, because they encoded stale
assumptions rather than real defects:

- The happy/glance probe hard-coded `currentTime` values tied to the old 43 s/31 s
  cycles. It now derives the sample point from each animation's **own keyframes**,
  so retuning the cadence cannot silently invalidate it.
- The halo check sampled two wall-clock moments 800 ms apart, which can land
  entirely inside a flat region of an 11.7 s ease-in-out and return a
  byte-identical matrix. It now compares two points on the animation's own
  timeline.

Note: the sandbox here blocks Chrome's internal sandbox, so the harness and the
pixel rig launch Chrome with `--no-sandbox` (disposable test browsers only). The
tracked harness was left otherwise byte-identical.

## 21. Files changed

Motion core and presentation:
- `app/components/landing/companion/secondary-motion.ts` — rewritten: 21 springs,
  exported bounds, acceleration + turn signals, forward pitch, wind helper.
- `app/components/landing/companion/JourneyCompanion.tsx` — 22 CSS variables,
  wind writes, `data-wind-dir` / `data-wind` gates, journey motion profile.
- `app/components/landing/companion/JourneyCompanion.module.css` — 3D forward
  pitch, reduced-motion reset.
- `app/components/landing/companion/Companion.module.css` — layered float, cape
  shear/stretch, per-side travel groups, lower-body lag, retimed blink/glance/
  expression cadence, shadow sync, wind layer, responsive boosts.
- `app/components/landing/companion/artwork.tsx` — float layering, cape/lower-body
  travel groups, two seam-safety underlayers, tilted tapered wind layer.
- `app/components/landing/companion/Companion.tsx` — `motionProfile` prop.

Verification:
- `scripts/verify-landing-companion.mjs` — two flaky/stale checks made
  deterministic.
- `__tests__/landing/secondary-motion.test.ts`, `journey-companion.test.tsx`.
- `documentation/landing-companion/qa/*` — refreshed by the harness.
- `scratch/motion-qa/pixel-probe.mjs` — new, gitignored: the screenshot/PNG-decode
  measurement rig used throughout.

**Not touched:** `JourneyPath.tsx`, `Journey.module.css`,
`BotanicalTrail.module.css`, `model.ts`, `useCompanionState.ts`,
`journey-motion.ts`, `CompanionReview.*`, and everything outside the landing
companion (`app/components/character/**`, Planner, Focus, Shop, Character Studio).

## 22. Scope containment

`Companion` is also rendered by four onboarding steps. The intensified motion is
therefore gated behind `data-motion-profile="journey"`, set only by
`JourneyCompanion`. Verified live: a non-journey instance keeps `--float: 9px`,
`--drift: 2px`, `--lag-boost: 1`, **no wind layer**, and no extra float layers.
Travel-driven variables default to 0, so they are inert anywhere else.

## 23. Remaining limitations

- **The final aesthetic judgement is unverified by the implementer** (no image
  input). Every claim here is backed by pixel measurement, but "does it look
  good" needs a human or a vision-capable model.
- The cape still cannot rotate far. Beyond ~6–8° the torso cut-out starts to show
  measurably, and the underlayers trade tearing for a static ghost of the cape
  that would become visible at larger swings. True cloth deformation still needs
  repainted overlap or a mesh asset — unchanged from the handoff.
- Forward pitch is a **2.5D illusion** (perspective projection of a flat
  illustration), not a real turn. It reads as leaning, but the character has no
  side or back view and never will under this rig.
- Wind is deliberately sparse and capped. It is a handful of streaks, not a
  system; it does not respond to turn direction, only to speed and travel sign.
- Headless RAF cadence is not a low-end mobile paint benchmark. Sustained frame
  time, memory and battery on a real low-end phone remain unmeasured.
- The settle tail is longer than before by design; the RAF runs for roughly 2–3 s
  after a fast scroll at amplitudes already below one pixel.

---

## Direct answers to the brief

| Question | Answer |
| --- | --- |
| Does the character now visibly float while idle? | **Yes.** 1–3 px → **7–11 px** peak-to-peak on a 144 px character, across three layered durations. |
| Does the cape visibly react to scroll direction? | **Yes.** Rendered cape response 0.61° → **4.58–6.69°** (3.97–13.35 px on screen); it trails 9.7 px up on descent and 10.4 px down on ascent. |
| Does rapid reversal create visible inertia? | **Yes.** Reversal drives ribbons to 10.4°/8.46° and cape shear to 6.69°, versus 5.64°/4.58° for steady travel — a distinct, acceleration-triggered kick. |
| Do ribbons visibly lag the body? | **Yes.** 2.11 px → **6.06 px** on fast travel (**12.66 px** on reversal), with different bounds, damping and turn bias per side. |
| Does the character visibly settle after movement stops? | **Yes.** Fabric damping is sub-critical (ζ ≈ 0.44–0.57) so layers overshoot then converge; settling terminates at exact zero and the RAF parks. |
| Will a user likely see a blink/expression within ~10 s? | **Yes.** Measured in the first 10 s: micro-expression at 2.1 s, glance at 3.7 s, blink at 5.9 s. |
| Are body/cape/ribbons/halo/star perceptually independent? | **Yes.** Different durations, damping, phase, impulse gains, turn bias and per-side asymmetry; idle path lengths differ per layer (51–61 px) and tests assert non-lockstep. |
| Were any character assets regenerated? | **No.** One canonical WebP, untouched; no new images, video or sprite sheets. |
| Was any new animation library added? | **No.** No Motion/Framer Motion, Rive, Pixi, Three.js, GSAP or Spine; no new dependency at all. CSS transforms, opacity and SVG only. |
| Is reduced motion preserved? | **Yes**, and strengthened: all animations/transitions off, lag transforms neutralised, pitch reset, wind removed rather than slowed. Three harness checks pass. |
| Is mobile still correct? | **Yes.** No overflow at 390 px or 320 px; at 57×70 the cape still moves 10.72 px at idle and ribbons 9.73 px. |
| Did the existing CDP harness pass? | **Yes — 41 checks, 0 failures.** |
