# Sylf SVG animation capability test

Open [the development prototype](http://127.0.0.1:3100/companion-prototype), select **Current SVG companion**, and press **Play SVG reaction sequence**. One press runs idle → blink → curious → happy → idle. **Stop sequence** cancels playback; pressing Play again restarts it. The Phase 1 full and Phase 2 layered comparisons remain available. Pixel Phase 3 was not implemented.

1. **Existing rig.** The canonical SVG retains its single masked WebP painting, hood/face, robe/ribbon layers, halo, star, and existing transform origins. There are no new assets, dependencies, renderers, global stores, or animation engines. This review uses the calmer normal motion profile; the landing traveler keeps its existing springs and journey profile.

2. **Reused vocabulary and primitives.** States: `IDLE`, `DISCOVERING`, and `QUEST_COMPLETE`. Action: `FLOATING` throughout. MagicalEyes: `NEUTRAL`, `CURIOUS`, `HAPPY`, and the existing drawn blink lid. CSS supplies ambient float/breathing, eye dissolves, 650 ms pose transitions, ribbon/robe response, and halo/star poses. The happy beat goes through the unchanged per-instance `useCompanionState` reaction controller. Landing continues to use the unchanged `JourneyMovement` and `SecondaryMotion` physics.

3. **New vocabulary.** No semantic state, action, or eye expression was added. A development-only sequence marker cues the existing lid and restrains the existing happy presentation. Its labels describe review timing, not product states. The optional blink cue is threaded through the existing SVG renderer and MagicalEyes; removing it restores the normal CSS blink cadence.

4. **Exact implementation changes.** Modified:

   - `app/components/landing/companion/Companion.tsx`: development/SVG-only cue and attribute; sustained presentation prop documentation.
   - `app/components/landing/companion/CompanionReview.tsx`: one local sequence, cancellation, controls/status, and memoized static reference galleries.
   - `app/components/landing/companion/Companion.module.css`: suppress the repeated happy bounce only during this review; static sequence poses under reduced motion.
   - `app/components/landing/companion/artwork.tsx`: pass the blink cue to the existing eyes.
   - `app/components/landing/companion/MagicalEyes.tsx`: optional drawn-lid cue.
   - `app/components/landing/companion/MagicalEyes.module.css`: cue open/closed lids with a 40 ms opacity transition and suspend competing autonomous eye cadence during playback.
   - `app/components/landing/companion/JourneyCompanion.tsx`: hold the current SVG section's existing presentation across reaction expiry, updating React only at semantic boundaries.
   - `app/components/landing/journey/JourneyPath.tsx`: select nearby SVG section states/messages during travel; preserve the original pixel travel condition and all position/snap calculations.
   - `__tests__/landing/journey-motion.test.tsx`: update the intended SVG scroll behavior and add both pixel travel preservation cases.

   Added `__tests__/landing/svg-reaction-sequence.test.tsx`, `scripts/verify-svg-companion-sequence.mjs`, this report, and evidence in `documentation/svg-companion/capability-test/`. The evidence manifest lists every added report/log/image/result file. No pixel-owned file, contract, source image, extraction script, old report/evidence, model, reaction hook, spring implementation, or geometry/snapping helper was changed.

5. **Timeline.** All times are relative to Play:

   | Time | Beat |
   | --- | --- |
   | 0–1000 ms | Real calm idle/floating |
   | 1000–1150 ms | Existing drawn lid closes; opening begins at 1150 ms, with 40 ms opacity transitions |
   | 1150–1400 ms | Open neutral eyes |
   | 1400–2200 ms | `DISCOVERING`: curious eyes and subtle existing pose |
   | 2200–3300 ms | `QUEST_COMPLETE`: warm happy eyes and gentle lift |
   | 3300–4050 ms | `IDLE`: existing 650 ms pose return, followed by a 100 ms settling margin |
   | After 4050 ms | Every review cue released; normal SVG idle and autonomous eye cadence |

6. **Notice.** Existing asymmetric curious eyes supply most of the expression. The rig adds its existing −3° head tilt, 0.8° body orientation, small ribbon/robe changes, and slight halo/star offset. No surprise expression, new arm action, particles, or exaggerated motion was introduced.

7. **Happy.** Existing warm upward eye curves carry the reaction. The existing state pose lifts by 12 SVG units, about 2.5 CSS px at the 180 px LARGE size or 4.4 px at the 320 px review size. Existing ribbon, robe, head, and star pose changes provide secondary response. The normal two-cycle happy bounce is suppressed only for this sequence; existing Happy reaction and Celebrate controls keep their behavior.

8. **Return guarantee.** At 3300 ms the review clears the reaction and requests real `IDLE`, with no eye override. Existing CSS transitions resolve the same pose transforms back to their normal values. At 4050 ms it removes the marker and blink cue. SVG/hood nodes remain mounted; no additive transform or inline pose displacement is written. Normal ambient float continues, so its phase can differ after playback; the base geometry and expression return exactly.

9. **Replay and cancellation.** Six local one-shot timers cue beats. Replay clears all previous sequence timers and the current reaction before starting a fresh IDLE run with a fresh reaction ID. Stop, manual base/eye/reaction controls, Pause, renderer changes (including history events), and hidden tabs cancel playback. Unmount clears timers/listeners, and the existing reaction hook clears its expiry timer. There is no queue or frame-driven React sequence loop. Static galleries reuse their rendered elements instead of rerendering on each beat. Both sequence buttons occupy the same space throughout playback and the status reserves two lines to avoid moving the canvas.

10. **Reduced motion.** Existing `prefers-reduced-motion` CSS continues to disable animations/transitions. Sequence-specific pose layers remain static while drawn blink, curious eyes, and happy eyes communicate the same beats. No separate accessibility store or motion engine was introduced. Existing hidden/offscreen pausing remains active.

11. **Size and device findings.** The review is measured at the existing named 48/96/180 px SMALL/MEDIUM/LARGE sizes through temporary browser-only sizing overrides, across 1440×1000 DPR 1 desktop, 820×1180 DPR 2 tablet, and 390×844 DPR 3 phone. Product layouts are unchanged. LARGE makes both eye expressions and restrained pose changes clear. MEDIUM retains readable eyes and a subtler lift. SMALL retains recognizable asymmetric curious eyes and happy curves, while fine highlights and physical movement become difficult to see. Native screenshot crops show the halo, robe, and shadow without clipped anatomy. Browser checks also cover the live landing traveler and repeated playback. These are emulated Chrome viewports, not physical-device/Safari validation.

12. **Rig weaknesses.** Pose amplitudes are in SVG units, so small placements naturally lose visible secondary motion. The painted/masked body has finite detail and cannot support unlimited deformation. Autonomous eye cadence needed a temporary scoped pause to make a deterministic one-shot blink readable. Eye dissolves and pose transitions have different durations; notice must last long enough for the 650 ms pose transition. The existing happy reaction combines a static lift with a repeated bounce, so the review scopes that bounce out for restraint. These limits did not require replacing the rig.

13. **Technical effort: moderate.** The expressions, poses, and reaction controller already existed. Work was mainly a local six-timer review cue, one optional blink presentation input, scoped CSS, cancellation, and validation. No animation architecture rewrite was necessary. The additional production landing request required preserving a section presentation independently of a timed reaction's expiry, while maintaining the existing per-frame imperative motion path.

14. **Future reuse.** Thinking, studying/reading, sleeping, greeting, celebration, and level-up already have corresponding states/actions/eyes/props. Encouragement can use the warm happy vocabulary, with an appropriate semantic trigger supplied by the product. Their timing can reasonably reuse this rig and reaction controller. This task adds none of those production sequences and makes no product-direction recommendation.

15. **Harder work.** Bespoke hand/arm gestures, walking cycles with planted feet, strong squash/stretch, turning around, large perspective changes, lip sync, and complex prop interactions would need new artwork/geometry or deeper rigging. The current mask-based painted body and fixed action arms have no articulated skeleton or inverse kinematics. Tiny placements cannot communicate subtle facial detail merely by adding more animation.

16. **Pixel preservation.** Frozen file SHA-256 checks cover 76 files: all Phase 1/2 sources/runtime assets, renderer/helper/CSS, pixel tests/scripts, old reports/evidence/contract, plus model/reaction/spring/geometry files and the original rig texture. All remain byte-identical. The new QA runner executes the original Phase 2 assertions with evidence redirected into this task's folder; it never rewrites frozen evidence. Full/layered comparisons, six eye swaps, discrete blink, development/production isolation, and DPR 1/2/3 raster-only snapping are checked. The SVG trajectory continues to use its original fractional coordinates.

17. **Validation.** **153 tests in 18 files passed; targeted ESLint passed with zero errors/warnings; 79 SVG browser checks and the preserved 317 pixel browser checks passed.** SVG QA includes nine size/viewport cases and 750 live scroll-frame samples. Final results and logs are linked in [validation.json](capability-test/validation.json). Landing/onboarding unit coverage includes replay under StrictMode, stable rig/hood, all beats, zero retained sequence/reaction timers, manual/hidden/unmount cancellation, both renderer switches, production isolation, sustained section expressions, and no per-frame React commits. Full TypeScript reports the same 12 generated route/page contract errors as the frozen Phase 2 log; none concern these changes. The prior production Webpack build compiled but failed on the unrelated `CURATED_SOUNDSCAPES` route export. No full successful production build is claimed here, and unrelated repository problems were left unchanged.

18. **Next improvement, if further sequences are approved.** A small per-instance presentation cue inside the existing reaction controller could coordinate a blink and expression with a named duration and consistent cancellation. That would remove the need for local review timer lists when multiple production sequences exist. It should reuse this model/CSS/rig rather than introduce another engine. One experiment does not justify implementing it now; it has not been implemented.

The extra landing request is implemented for SVG: the companion retains the nearest waypoint's existing section expression and message while moving through that waypoint's range. Happy/greeting presentation lasts until the range changes, rather than disappearing after a short reaction timer. Focus and planning props remain visible during scroll. Hidden/paused/reduced-motion paths retain their existing suspension behavior. Both pixel previews retain their original idle-on-travel behavior and device-pixel snapping.

[SVG browser evidence](capability-test/svg-browser-results.json) · [Pixel regression evidence](capability-test/pixel-regression/results.json) · [Frozen-file and shared-code integrity](capability-test/frozen-integrity-after.json)

Representative native crops (180 px desktop):

![Curious SVG companion](/Users/aliumair/Desktop/sylf/documentation/svg-companion/capability-test/1440-large-notice.png)

![Warm happy SVG companion](/Users/aliumair/Desktop/sylf/documentation/svg-companion/capability-test/1440-large-happy.png)
