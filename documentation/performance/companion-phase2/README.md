# Sylf companion — Phase 2 review

Review route: `/companion-prototype`. Production `/` still uses the existing videos. This phase refines the same Pixi mesh mock and canonical texture; it does not introduce a production rig or special reactions.

## 1. Locomotion

The controller now holds a planted preparation pose for 140 ms on desktop / 120 ms on mobile, then accelerates into a progressively blended stride. Cadence follows actual distance, with speed-aware stride length and a governor that accounts for horizontal path travel. Torso/hip opposition, shoulder/arm motion, stabilized head movement and bounded spring follow-through add weight without large bounce. Braking begins while travelling; the airborne foot lands before the body finishes settling. Wrapper coordinates remain owned by JourneyPath.

## 2. Idle

Low-amplitude breathing, shoulder movement and secondary motion continue at rest. A bounded look/tilt/weight shift occurs at deterministic, uneven intervals (6.8, 10.1, 8.4 and 12.3 seconds), eases toward nearby content, then returns to neutral. Departure fades the idle variation smoothly. No section-specific emotes were added.

## 3. Foot contact

Stance soles counter actual two-dimensional wrapper displacement independently of body blending. Swing feet use eased placement and lift; supporting feet retain their offsets through stopping. Reach limits protect the flattened artwork.

The same prescribed forward–stop–reverse trajectory reduced consecutive-stance sole displacement RMS from **0.6944 to 0.0000075 model units/frame**. Contact durations differ (707 vs 1,068 samples); neither trace reached the clamp. This measures two fully bound sole vertices, **not true IK or complete visual foot quality**. See [contact-comparison.json](contact-comparison.json).

## 4. Turns

Reversals brake through zero, prepare, then ease facing and weight into the new direction. Both dwell and remaining-distance thresholds suppress scroll jitter. Head/torso lead and recovery remain subtle; no instant mirroring or invented side profile. Gait phase survives turning, pausing and rebasing.

## 5. Personality and mobile

One reusable `SYLF_MOTION` profile centralizes energy, stride, contact timing, lift/reach, bounce, lean, arms, head stabilization, secondary strength, anticipation, settle and turn thresholds. Mobile is independently quieter: secondary strength 0.42 vs 0.8; bounce 0.8 vs 1.25 model units; turn dwell 170 vs 140 ms. Canvas size/resolution caps remain 270 × 152 / 110 × 62 CSS px and DPR 2 / 1.5 respectively. No frame-rate cap was added.

## 6. Stall investigation

**The historical 12–15 FPS stalls were not reproduced or conclusively root-caused. That acceptance criterion remains open.** Controlled traces ruled out recurring resize/texture churn and duplicate RAF callbacks during the sampled workload. No per-frame React state updates were introduced. Measurement and DOM writes were inspected; unchanged style/data writes are avoided.

The old skin loop created approximately 5,083 temporary objects per frame by source count. The new loop has no per-vertex temporary objects, precomputes trigonometry and neck weights, reuses pose/contact state, and dirties only changed position data. One guarded RAF owner handles pause/resume/reentrant scheduling. These address measured overhead; they do not prove that garbage collection caused the historical stalls.

Five full-page screenshot captures triggered five JourneyPath remeasurements but **did not reproduce a long task or >50 ms frame gap**. A cold, uncontrolled session did show a 66.7 ms gap and 91 ms long task; sustained historical stalls remain unconfirmed. GPU time, browser scheduling policy, React attribution and physical low-end phones were not exhaustively profiled.

The final integration check also found the app shell incorrectly locking this route to a static viewport. Document scroll stayed at zero while an inner container scrolled, so JourneyPath received no movement. Removing only `/companion-prototype` from that classifier restores the existing document-scroll architecture. A route-transition regression test covers cleanup of the viewport lock. This explains that separate reproducible movement failure, not the historical frame stalls.

## 7. Before / after measurements

Matched 12-second traces: 2 s idle, 3 s forward, 2 s stop, 3 s reverse, 2 s settle; desktop 1440 × 1000 and mobile 390 × 844. Profiling is opt-in at `?motion-debug=1` and exposes a visible trace button. Values below are milliseconds. Skin includes pose computation; upload measures buffer dirty-marking; submit is CPU render submission, not GPU duration.

| Mean per frame | Desktop before | Desktop after | Mobile before | Mobile after |
| --- | ---: | ---: | ---: | ---: |
| Pose + skin | 0.244 | 0.092 | 0.326 | 0.099 |
| Buffer marking | 0.012 | 0.011 | 0.011 | 0.007 |
| Render submit | 0.152 | 0.149 | 0.196 | 0.150 |
| Combined CPU | 0.408 | 0.252 | 0.533 | 0.256 |
| RAF interval | 32.789 | 32.789 | 33.240 | 33.059 |

The browser delivered approximately 30 Hz in both matched runs; the independent trace RAF matched actor callbacks. There were no long tasks or >50 ms gaps in these traces. Skinning cost fell about 62% desktop / 70% mobile, and combined sampled CPU about 38% / 52%. These are single-session comparisons, not a universal FPS guarantee. World frame/measure maxima in JSON are lifecycle maxima; frame/measure counts are trace deltas. Raw evidence is saved beside this report, including isolated skin benchmarks and screenshots.

After the shell fix, the final desktop smoke trace exercised all five states at approximately **60 Hz** (16.667 ms mean interval, 18.8 ms maximum), with 0.199 ms combined mean CPU, zero long tasks and zero >50 ms gaps. This later session is not a matched before/after comparison: browser callback delivery changed between sessions, so the 30-to-60 Hz difference is not attributed to the refinements. See `desktop-final-smoke.json`; `scroll-lock-regression.json` preserves the earlier failed idle-only trace.

The final mobile smoke trace also exercised all five states at about 60 Hz (16.669 ms mean interval, 18.7 ms maximum), with 0.294 ms combined mean CPU and no long tasks or >50 ms gaps. Document scrolling and zero horizontal overflow were confirmed at 390 × 844. See `mobile-final-smoke.json`.

## 8. Payload

No dependency or character-asset additions in Phase 2. The canonical WebP remains **55,296 bytes**. See [measurements.json](measurements.json) for production chunk files and local gzip/Brotli estimates.

| JavaScript scope | Raw bytes | Gzip bytes | Change from Phase 1, gzip |
| --- | ---: | ---: | ---: |
| Deferred renderer, observed branches | 407,029 | 114,190 | +1,709 |
| Optional profiling panel | 3,118 | 1,673 | Separate debug-only download |
| Initial entry + shared boot snapshot | 1,382,595 | 400,738 | +3,335 |

The initial snapshot includes concurrent unrelated application changes and is not an isolated attribution to companion code. Pixi is excluded from initial entry manifests and imported when the actor is active near the viewport; it can therefore load immediately when the initial viewport includes the actor. The debug module is absent without the flag. No video elements exist on the prototype. Reduced motion keeps the canonical static image and skips runtime initialization/import when enabled before loading; later preference changes suspend it. Hidden/offscreen/pause lifecycle and context-loss fallback remain intact.

## 9. Remaining visual limitations

This is one flattened front-view image. It cannot reveal hidden joints, articulate overlapping armor independently, preserve every edge during leg deformation, or produce a convincing side-facing turn. Reach limiting can still sacrifice contact on extreme paths; large anchor jumps can outrun the capped actor. The image's baked ground detail cannot behave like an independent physical shadow. Screenshots show identity continuity, not proof of finished animation quality.

## 10. Recommendation and verification

**The movement direction is strong enough to justify a small artist-authored layered-rig trial after review. It is not ready to replace production videos.** The next asset investment should solve joints, clean foot contacts and authored turns; no full animation library was started. Historical stall attribution and real-device profiling remain promotion gates.

Changed motion files: `JourneyPath.tsx`; `prototype/{movement,locomotion,rig,pixi-runtime,types}.ts`. Added `prototype/{personality,feet,frame-loop,diagnostics}.ts`. `SylfAppShell.tsx` has the route-classification correction. Tests added/updated: `prototype-{locomotion,host,frame-loop,diagnostics,shell}.test.ts(x)`. Focused cases cover anticipation, braking, settle, reversal hysteresis, phase continuity, bounded idle, contact compensation, duplicate RAF prevention, offscreen/hidden behavior, reduced motion and shell scroll ownership.

Final validation: **78 tests across 12 landing files**, standalone TypeScript, targeted ESLint and production build passed. Browser checks confirmed all four existing video URLs on `/`, zero video elements on the prototype, and no profiling panel on the clean review URL. Reduced-motion runtime gating is covered by tests; the OS preference was not changed during browser checks. Temporary viewport overrides were reset after testing.
