# Sylf companion prototype

Historical Phase 1 report. The latest refinement results are in [Phase 2 review](../companion-phase2/README.md).

Review at `/companion-prototype`; the normal `/` route still uses the existing videos. No WebMs were removed. This is a prototype, not an approved replacement.

## 1. Technology and decision

PixiJS 8.21.0, WebGL, with a small procedural skeletal/mesh **mock**. There was no layered character, Rive file, Spine project, or confirmed Spine Editor license available. The mock uses Pixi's real-time mesh rendering to prove the actor/controller interface without creating another character design. It is not a finished Spine rig. Rive would also require authoring the detailed armor as a rig; it does not eliminate that asset work. A licensed, artist-authored Spine rig remains a suitable next step if the prototype direction is approved. No Three.js was added.

References: [Pixi meshes](https://pixijs.com/8.x/guides/components/scene-objects/mesh), [Spine + Pixi](https://esotericsoftware.com/spine-pixi), [Spine runtime license](https://esotericsoftware.com/spine-runtimes-license).

## 2. Character asset

One lossless, transparent 640 × 360 WebP, converted from the existing walking poster. The visible decoded pixels are unchanged; provenance and source SHA-256 are in `public/landing/prototype/provenance.json`. All states use this same texture, UVs, and topology. No new character artwork, independently generated poses, clips, or sprite sequences were created.

The mesh has 1,925 vertices with bindings for the head, torso, arms, legs, hair, and ground. It preserves the source's ground pixels. This single flattened source lacks hidden joints and side-view artwork; spatial bindings are deliberately a mock of a layered production skeleton.

## 3. State machine

`idle → start (160 ms) → walk → stop/settle (280 ms) → idle`

An intentional direction reversal enters `turn` for 280 ms, then returns to walk or settle. Direction hysteresis suppresses small input reversals. Gait phase persists through state changes; stance/swing is advanced by distance travelled, while pose weights and facing ease continuously. Idle has restrained breathing only. No special states were added.

## 4. Movement controller

`scroll → existing JourneyPath destination → bounded, damped velocity → CSS wrapper position → local rig pose`

JourneyPath retains its anchors, SVG geometry, responsive measurements, section messages, and botanical journey. Only the opt-in branch uses acceleration/deceleration instead of the video controller's old response curve. The renderer reads position samples and never sets webpage coordinates. Resize/visibility rebases are marked so they do not become fake gait distance. No per-frame React state updates.

A full-weight stance foot mathematically counteracts travelled distance. This is not full inverse kinematics: turns, acceleration blends, the flat artwork, and high scroll speeds can still produce sliding/deformation. Large scroll or anchor jumps can outrun the actor; it continues along the path and pauses rendering while outside the viewport instead of teleporting into view.

## 5. Files

Created:

- `app/companion-prototype/page.tsx` — opt-in, no-index review route.
- `app/components/landing/journey/prototype/` — host, scoped styles, types, movement controller, locomotion, mesh bindings, and lazy Pixi runtime.
- `public/landing/prototype/` — canonical WebP and provenance.
- `__tests__/landing/prototype-locomotion.test.ts` and `prototype-host.test.tsx`.
- This report, measurements, and desktop/mobile screenshots.

Modified:

- `JourneyLanding.tsx` and `JourneyPath.tsx` — default-video mode flag and prototype integration.
- `SidebarWrapper.tsx` and `SettingsPanel.tsx` — classify the review route like the public landing page, preserving its layout.
- `package.json` and `package-lock.json` — pinned Pixi dependency.
- `__tests__/landing/walking-companion.test.tsx` — type the existing canvas mock for the added WebGPU context overload.

No landing-page copy, section layout, journey geometry algorithm, or video assets were redesigned.

## 6. JavaScript and load impact

Production build measured 2026-09-23. Sizes below sum minified files; compressed figures use local gzip/Brotli and are estimates of transfer bytes, not a network waterfall or LCP benchmark. Details are in `measurements.json`.

| Measurement | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| Before: landing entry + shared boot JS | 1,360,672 | 394,497 | 337,566 |
| After: same manifest scope | 1,366,760 | 397,403 | 340,153 |
| Snapshot difference | +6,088 | +2,906 | +2,587 |
| Deferred renderer: five files observed in browser | 401,546 | 112,481 | 97,285 |
| All compiled renderer branches, including unused alternative | 423,791 | 119,246 | 103,387 |

The initial difference is a working-tree snapshot comparison, not an isolated dependency-size guarantee: unrelated work was already present and changed during this session. The pre-prototype compiler produced assets but its full build hit an unrelated type error; the final full build passed. Both current landing routes share the same entry JS. The Pixi renderer is absent from initial script tags and loads only when the actor becomes visible and animation is allowed. Its initial cost at the top of the tested page was **zero renderer JS requests**. Prototype DOM contains zero video elements; the video route retains all four.

The full deferred browser JS plus the one image is about **446 KiB raw / 164 KiB with JS gzipped**. Image caching shares the poster and GPU texture request. There are no video downloads on the prototype route. The existing video files total 12,003,403 bytes and remain available for fallback.

## 7. Asset and rendering cost

Canonical asset: **55,296 bytes (54 KiB)**. The canvas is character-sized: 270 × 152 CSS px on large desktop; 110 × 62 on mobile. Resolution is capped at 2 on desktop and 1.5 on mobile, further limited by actual device DPR. Desktop DPR 2 produced a 540 × 304 backbuffer. No full-page WebGL surface, animated blur, or filter effects are used by the rig.

Production browser checks reached about 60 fps at both desktop and a 390 × 844 mobile viewport, but some later samples fell to 12–15 fps. The diagnostic mean CPU skin/update/render-submit cost ranged roughly 0.6–2.4 ms during the session. Long outliers occurred while browser/tool/build activity was also running (up to 287 ms measured CPU cost and 532 ms between callbacks). Their cause was not isolated; these measurements do not establish consistently smooth performance. This is not a controlled low-end-phone or GPU benchmark. Profiling the intermittent stalls and physical mobile devices is still required before promotion.

## 8. Accessibility and fallbacks

Reduced motion displays the same canonical static image in the existing hero fallback and skips importing/initializing Pixi. Changing the preference after loading suspends animation and hides the canvas; already downloaded code stays cached. Existing Pause/Resume works, and hidden/offscreen actors cancel their render loop. Failed asset/WebGL initialization or context loss retains the static image. Context-loss recovery currently requires reload. The companion is decorative and hidden from assistive technology.

Reduced-motion loading and lifecycle behavior are covered by automated tests; the OS preference was not changed during browser testing. Browser pause verification showed the frame counter remained unchanged while paused.

## 9. Acceptance and limits

| Requirement | Result |
| --- | --- |
| Same character in every state | Pass: one immutable source texture; no clip swaps. |
| Idle/start/walk/settle continuity | Implemented and tested; phase and wrapper remain continuous. |
| Natural turns | Partial: eased frontal pivot/weight shift; no authored side profile. |
| Stable position / normal-scroll movement | Pass in controller tests and browser scroll checks. |
| No obvious foot sliding | Not approved: approximate stance, no layered joints/IK; fast movement needs artist tuning. |
| Desktop/mobile layout | Checked at 1440 × 1000 and 390 × 844; no horizontal overflow. |
| Initial bundle / deferred loading | Measured above; no eager renderer or video payload in the prototype. |
| Reduced motion | Static canonical fallback and runtime gating tested. |
| Performance | Mixed: reached 60 fps, with intermittent stalls; real low-end mobile remains unverified. |

Validation: production `npm run build`, TypeScript, targeted ESLint, and **65 tests across 9 landing test files** passed. Production browser reported no console warnings/errors during the captured runtime check. Browser scrolling observed start, walk, turn, and idle; unit tests cover all five states, distance-driven phase, braking/reversal, texture invariance, pause, initialization failure, and reduced-motion gating. Existing video behavior tests still pass.

## 10. Replacement decision

**Do not replace the video system yet.** The prototype demonstrates one persistent actor, separate world movement, runtime loading, and state continuity with a small payload. It does not demonstrate finished game-character animation. Approval should first cover this architecture and canonical visual. Proper layered artwork, authored turns, foot-contact tuning, and device profiling are needed to meet the full visual acceptance bar. Those steps and the full animation library were not implemented.
