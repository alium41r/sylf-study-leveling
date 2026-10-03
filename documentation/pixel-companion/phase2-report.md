# Sylf pixel companion — revised Phase 2

The prototype now stacks one eyeless body and six full-canvas eye layers at the same origin. The source-resolution canvas is retained because a smaller logical grid cannot be recovered losslessly. The SVG and Phase 1 full-art comparisons remain available; Phase 3 has not been implemented.

Open the [layered comparison](http://127.0.0.1:3100/companion-prototype?companion=pixel-layered&eyes=neutral), select **Layered pixel companion**, and use **Pixel eye expression** or **Test blink**. Links carry the selection to landing and onboarding. `?companion=pixel` selects the Phase 1 full artwork; removing the parameter restores SVG. All switches are development-only and persist no account or browser preference.

1. **Logical-grid findings.** The body has 89,391 visible RGB colors. Apparent edge spacing peaks near 13–14 source pixels, but exact-color runs have median length 1: 85.00% of horizontal and 83.68% of vertical opaque neighbor pairs differ in color. At the strongest projected origins, every fully opaque 12-, 13-, and 14-pixel block contains color variation, with median 70, 80, and 89 distinct colors respectively. There is no reliable uniform cell grid or single authoring origin to recover. See the reproducible [grid audit](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/grid-audit.json).

2. **Canonical canvas.** All composable runtime layers use **1254 × 1254 RGBA, origin `(0,0)`** at the top left. This preserves the supplied body's coordinate space and appearance. It is a source-resolution master canvas, not a claimed recovered 96/128-pixel native grid. The short [asset contract](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/pixel-asset-contract.md) defines the same rule for future frames and layers.

3. **Why no lower-resolution normalization.** Nearest-neighbor reduce/restore experiments at 96 and 128 changed 466,097 and 463,029 appearance pixels, including 27,765 and 27,202 alpha pixels. Even exact 2× reduction to 627 changed 309,654 appearance pixels. None of the 12 tested native sizes preserved appearance exactly. No normalized body derivative was created; forcing a low-resolution grid would discard real supplied detail.

4. **Source preservation and selection.** All nine current root PNG hashes match their values collected before resumed asset preparation. The body and full-art runtime copies are byte-identical to their sources. Used `sylf pixel companion without eyes no bg.png`, retained `sylf pixel companion.png` for Phase 1, and extracted only six pairs from `eye batch 1 (1).png`, `eye batch 2 (1).png`, and `eye batch 4 (1).png`. All seven sheets were inspected; sheets 3, 5, 6, and 7 supply no runtime assets. See [source integrity](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/source-integrity.json) and [source inspection](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/source-inspection.json). The user's deletion/replacement of older opaque files happened before resumed work; this implementation did not overwrite or move source art.

5. **Transparency and import method.** The older Phase 1 full PNG was RGB without alpha. The user's replacement body, full art, and selected sheets arrived as genuine RGBA with binary alpha, 0/255; no background removal was needed. Body/full preparation copies file bytes exactly. Eye crops first copy all source RGBA bytes unchanged into a registered 600 × 300 intermediate pair. A one-time nearest conversion copies source `(2x+1,2y+1)` to a 300 × 150 pair, then embeds it at master coordinate `(475,480)` in the full transparent canvas. This bakes in the intended half-size eye placement. It discards unsampled pixels and **is not lossless or unresampled**. Every retained visible RGBA tuple comes from the selected source crops, with zero generated colors or interpolation; only added padding is transparent zero. Source edge colors/fringe remain as supplied. Exact crops, sample rule, palette checks, and hashes are in the [eye audit](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/eye-asset-audit.json); the [base audit](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/base-asset-audit.json) confirms byte copies.

6. **Runtime structure.** All files inside `pixel/sylf/` are 1254 × 1254. The full reference remains separate.

   ```text
   public/companions/
     sylf-pixel-companion.png
     pixel/sylf/
       base/body.png
       eyes/neutral.png
       eyes/happy.png
       eyes/thinking.png
       eyes/focused.png
       eyes/sleepy.png
       eyes/blink.png
   ```

7. **Shared dimensions and origin.** Body and every eye PNG share exactly the same full dimensions and top-left origin. Eye layers are transparent outside their eye artwork. Registration is baked into the assets; renderer layers use identical `inset: 0`, width, height, and display scale. No eye-specific CSS offsets or scales remain. Future accessories/effects can follow this contract without changing the two-layer renderer's positioning model; those systems were not built.

8. **Six expressions.** Neutral is sheet 1 **Neutral / Idle**; happy is sheet 1 **Soft Happy**; thinking and focused are sheet 2 **Thinking** and **Focused**; sleepy and blink are sheet 4 **Sleepy** and **Resting / Closed eyes**. Sheet 7 also has **Blink / Transition**, but its extra flourishes were unnecessary for a clean closed-eye frame. Remaining expressions were not extracted.

9. **Renderer.** `PixelCompanion` accepts an `eyeState` and renders unoptimized Next Image body + eyes inside one centered square canvas. Switching the source preserves the body node and eye node. The full-art Phase 1 branch remains selectable. The existing `Companion` provides the experimental development switch while the original SVG branch, state/reaction controller, artwork, expressions, and animations remain functional. No engine, atlas, global companion store, or product preference was added.

10. **Swap alignment.** Each expression uses the same layer rectangle and baked pair anchors corresponding to base `(550,555)` and `(700,555)`. Browser measurements verify coincident body/eye rectangles and stable nodes across all six choices. Medium and large swaps show no body jump, spacing drift, clipped eyes, or background box; the shapes themselves vary as intended. Existing dark fringe is visible in focused, sleepy, and closed eyes at large sizes.

11. **Scaling.** Both layers preserve aspect ratio and use `image-rendering: pixelated`; no filter, blur, rotation, perspective, independent layer scaling, or pixel morphing is applied. Practical UI sizes take priority: a 1× source display would require a 1254 px slot. Diagnostic 114 and 209 CSS px displays test exact 11:1 and 6:1 source reductions at DPR 1, alongside the real sizes. Both remain aligned; 209 preserves more expression detail than 114. Neither ratio reveals a uniform logical grid or warrants resizing the UI. Larger displayed characters/high DPI retain more detail; browser downsampling still discards source pixels. See [scale comparisons](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/scaling-eyes.png).

12. **Real-size verdict.** The tested landing slots are 56 × 70, 96 × 120, and 144 × 180 CSS px; onboarding Welcome is 130 px; review is 260/320 px. All six states are tested at DPR 1/2/3, with landing viewports 1440, 820, 390, and 320 px wide. Medium and large expressions read clearly and remain aligned. Small rendering is crisp and the silhouette recognizable, but expression detail is reduced. Checks use installed headless Chrome with emulated viewport/DPR, not physical devices or Safari. Browser screenshots provide the visual evidence.

13. **Small eye variants.** The smallest 56 × 70 slot leaves a visible body about 37 × 48 CSS px and open eyes roughly 4–5 px wide. Neutral, happy, and focused converge at DPR 1, highlights simplify/disappear, and closed eyes are faint. Spacing remains stable; high DPI retains more samples but cannot enlarge the CSS footprint. Simplified artist-authored small-size eye variants may be useful if expressions must communicate reliably there. None were created in Phase 2.

14. **Fractional motion finding.** Forced device-pixel phases `0`, `0.25`, `0.5`, and `0.75` on the real small landing traveler change the sampled edge pattern, strongest at DPR 1. All 39,016 sampled bright pixels match the current runtime source palette; zero added interpolation colors were detected. This supports hard-edge sampling shimmer in the tested Chrome path, rather than broad smoothing blur. Dark edge colors, other compositors, and physical hardware are outside that palette check's scope. See [fractional sampling](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/fractional-sampling.json).

15. **Pixel-only snapping and blink.** Journey travel now snaps the final raster canvas viewport origin to device-pixel boundaries, accounting for the container position, inner canvas offset, scroll, and DPR. Each correction is at most half a device pixel. Geometry is cached during existing layout/variant measurements, avoiding per-frame layout reads. The SVG path keeps its original unsnapped transform; trajectory, velocity, semantic behavior, and spring calculations stay continuous. Discrete **Test blink** shows neutral, switches to the preloaded closed frame after 100 ms, and returns at 240 ms; manual choices cancel pending timers. No blank frame or body remount is observed. It reads well at medium/large sizes and is faint when tiny. Future animation frames must use the same canvas/origin and discrete artwork changes.

16. **Semantic compatibility.** The existing `CompanionState` and per-instance reaction model can later select these eye sources through a small presentation mapping, without another global state system. Proposed mapping only; it is not connected in Phase 2:

| Existing concept                     | Pixel eyes |
| ------------------------------------ | ---------- |
| `IDLE`, `GREETING`                   | neutral    |
| `QUEST_COMPLETE`                     | happy      |
| `AI_THINKING`, `READING`, `PLANNING` | thinking   |
| `FOCUSING`                           | focused    |
| `REST`                               | sleepy     |

Blink is a temporary visual frame, not a gameplay state. Remaining states and action/prop animations need later decisions. Dashboard, locker, social, profile, `CharacterRenderer`, and other companion systems were untouched.

17. **Files added/modified.** Relative to completed Phase 1, modified six files in `app/components/landing/companion/`: `Companion.tsx`, `PixelCompanion.tsx`, `PixelCompanion.module.css`, `pixel-preview.ts`, `CompanionReview.tsx`, and `CompanionReview.module.css`; added pixel-only snapping in `journey/JourneyPath.tsx` and `journey-geometry.ts`, with three cases in the existing geometry test. Updated the full runtime PNG and historical Phase 1 report note. Added seven layered PNGs, the layering test, base/eye preparation scripts, grid audit script, browser QA script, asset contract, this report, and evidence. The exact list is [file-manifest.json](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/file-manifest.json). Superseded cropped runtime assets created during the earlier Phase 2 draft were removed after full-canvas replacements passed checks.

18. **Validation.** All **140 tests in 17 files** passed for landing and onboarding, including six swaps, stable nodes, SVG/full-art restoration, development isolation, discrete blink cancellation, and fractional-origin snapping at DPR 1/2/3. Targeted ESLint passed with zero errors/warnings. Browser QA passed **317 checks across 150 expression cases**, with no runtime exceptions. Scroll samples stay on device-pixel boundaries, with maximum measured rounding residual 0.0000611 device pixels at DPR 3. Results are recorded in [validation.json](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/validation.json) and [results.json](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/results.json). Protected onboarding uses a synthetic identity, intercepted reads, and blocked non-read API requests in an isolated browser, with no real account writes. Full TypeScript continues to report the same 12 pre-existing generated route/page contract errors recorded after Phase 1; none concern Phase 2 files. Production Webpack compilation succeeds, then route validation fails on the existing invalid `CURATED_SOUNDSCAPES` export in `app/api/acoustics/route.ts`. Full type/build success is not claimed. Logs: [tests](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/tests.log), [typecheck](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/typecheck.log), [build](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/build.log).

19. **Recommended Phase 3.** Validate the current canvas contract and movement in Safari/physical high-DPI devices. Decide whether tiny placements need simplified artist-authored eyes; obtain a genuine low-resolution master only if a future native grid is desired, instead of reconstructing this source. Then connect only the existing semantic concepts above behind the development flag and add a restrained discrete blink cadence. Keep remaining eye sheets, accessories, equipment, customization, avatars, atlases, and a full animation engine outside that scope. Phase 3 has not been implemented.

Columns below are neutral, happy, thinking, focused, sleepy, blink. These are native browser screenshot crops with no screenshot resampling.

![Large layered comparison](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/review-large-eyes.png)

![Small landing placement at DPR 1, 2, and 3](/Users/aliumair/Desktop/sylf/documentation/pixel-companion/phase2/landing-small-eyes.png)
