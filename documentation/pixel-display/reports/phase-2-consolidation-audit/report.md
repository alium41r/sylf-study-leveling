# Pixel Companion: Phase 2 consolidation audit and implementation plan

Audit date: 7 October 2026. Status: **audit and planning only; no application fixes or legacy removal implemented**. “Phase 2” here means the requested product consolidation, not the historical engine Phase 2.

## 1. Decision and scope

The Pixel system can become Sylf's sole in-app companion system, but the current experience is not ready for that transition. Its main failures are artwork fidelity, stale previews, fragmented persistence and responsive composition. Making the cards larger alone would expose those failures more prominently.

Recommended release order: **correct the document/render/save contracts → rebuild Dashboard, Customizer and Studio around those contracts → migrate every legacy consumer → remove obsolete UI and sprite dependencies after verification**.

The built-in Sylf artwork remains the existing artwork. No new anime forms, final character redesign, professional graphics suite, procedural user code or public creation marketplace belongs in this phase. The entire separate landing companion tree remains untouched, including its SVG rig, raster variants and development preview plumbing.

This review used the [current contract](../../pixel-display-contract.md), [authoring guide](../../authoring-guide.md), historical Phase 0–8 reports, the root product vision, relevant design/documentation indexes, and the latest [DeepSeek engineering audit](../engineering-audit/report.md). Source and the fresh browser observations below resolve discrepancies. In particular, the Pixel index's “not connected to production” paragraph is obsolete: the dashboard, Hub, Customizer and Studio already use Pixel Display.

## 2. What was actually tested

Chrome against the real local Next.js app, with an isolated QA account and ordinary authenticated creation/customization API writes. The client hydrated and the production canvas/runtime ran successfully; the previous audit's browser hydration blocker did not recur.

The flow was exercised repeatedly: **Dashboard → Identity Studio Hub → Customizer → Pixel Studio → draw/edit/animate → Save → Equip → save the configuration → change each Pixel Size → Dashboard**. The obsolete Character Studio was also opened with a Pixel creation equipped.

| Coverage | Actual work |
| --- | --- |
| Desktop | 1440 × 1000, with intermediate 1024 and 820 widths |
| Mobile browser | 390 × 844 touch viewport, additional 320 width and 844 × 390 landscape layout checks |
| Real touch input | Chrome CDP touch dispatch; `pointerType=touch`, `maxTouchPoints=1`, DPR 3 |
| Appearance | Dark, light, yellow custom accent `#facc15`, mint background `#d9eee7` through Appearance settings |
| Drawing | Draw, slow/fast strokes, Erase, Fill, Pick, Mirror, Undo/Redo, every 4×/6×/8×/12× zoom option, right-click and leave/re-enter capture checks |
| Animation | Add, duplicate, delete, reorder, select, duration change, onion skin, Play/Pause, Once/Repeat, reduced motion |
| Persistence | Actual Save/Equip, save-before/after-equip, empty creation, nonexistent equipped reference, leaving an unsaved draft, duplicate save clicks, two-tab freshness |
| Failure states | Delayed POST, creation-list HTTP 500 and configuration-save HTTP 500 injected at the browser network boundary; interceptions removed afterwards |
| Density | Chunky 32, Balanced 40, Detailed 48, Finest 64 on built-in and authored content; saved Dashboard/Customizer framebuffer comparisons |

Baseline verification: `npx vitest run __tests__/pixel-display __tests__/dashboard` → **457 tests passed across 20 files**. Those passes do not cover the browser failures discovered here. Existing JSDOM canvas/local-storage and Vite warnings appeared. No build, typecheck or application lint was rerun for this audit-only document work. The earlier engineering audit's build/mobile results remain evidence of its own run.

The [evidence index](evidence/README.md) links screenshots, interaction scripts and measured JSON results. Mobile means the real web app under touch/device emulation, not a physical Android/iOS device or a Capacitor runtime. Multi-user social/party flows were traced through their consumers and authorized data owners; another person's account was not used. No user screenshots were attached in this turn, so the supplied issue descriptions and repository evidence were starting points rather than unverified visual claims.

## 3. Confirmed failures and root causes

Priority **P1** means required before the sole-companion cutover because artwork, data or advertised behavior is wrong. **P2** means required product usability/accessibility work in the same phase. “Browser” denotes reproduction; “source” denotes a direct code defect or integration risk without a live reproduction of that particular edge case.

### 3.1 Rendering, preview and catalog failures

| ID / priority | Finding and evidence | Root cause and implication |
| --- | --- | --- |
| F01 / P1 / browser | Editing pixels or deleting frames under the same creation name leaves Studio's Pixel preview showing the old content. Renaming immediately refreshes it. [Measured sequence](evidence/preview-and-save-results.json). | [`sameComposition`](../../../../lib/pixel-display/content/sylf/character.ts) compares base/part IDs and states, not geometry, palette, framing or animation revision. React detects serialized changes, but content `configure` refuses the replacement. This is an independent stale-content bug, not density or screen size. |
| F02 / P1 / browser | An authored 48 × 48 diagnostic drawing changes line thickness, colors and occupied cells at every density, including Detailed 48. [Measurements](evidence/density-flow-results.json) and four `desktop-pattern-*.png` screenshots. | [`creationToAsset`](../../../../lib/pixel-display/content/asset/creation-asset.ts) applies `scaleShare: 0.9`; even “native” 48 maps the 48-cell source into a 43-cell footprint. [`referenceCellRect`](../../../../lib/pixel-display/content/asset/paint.ts) floors leading edges, rounds trailing edges and forces a minimum one-cell footprint. Adjacent footprints overlap; downsample collisions resolve by paint order. Thin strokes can thicken and neighboring colors overwrite one another. |
| F03 / P1 / browser + source | “110px — dashboard size” is physically 110px, but Studio's preview does not represent the chosen dashboard density and can show a different frame. | [`PixelStudio`](../../../../app/locker/components/studio/PixelStudio.tsx) supplies `draft.grid` as resolution, while Dashboard uses `characterConfig.density`. New documents use 32 only for Chunky and 48 for every other option. Preview playback runs independently from selected editor frame/Play state; Once can park on a sparse final frame while the editor shows an earlier drawing. Its accessory lookup also returns the draft asset for every requested ID instead of the real catalog. The trust claim is false even after F01 is repaired. |
| F04 / P2 / browser | Dashboard display is 110px, occupying a secondary avatar slot. The body is smaller again inside that display. [Dashboard](evidence/desktop-dashboard.png). | [`DashboardScreen`](../../../../app/dashboard/components/DashboardScreen.tsx) explicitly embeds a 110px card. The compositional path uses the built-in asset's 0.63 framing and ignores the card's 0.9 `characterFill`. The earlier measured 29 × 22 body extent at density 48 corresponds to approximately 66 × 50 CSS pixels at 110px. Physical slot size and content framing are two separate problems. |
| F05 / P2 / browser | Customizer's 288px desktop / 366px mobile stage surrounds a fixed 180px display. The display cannot use the available box. [Desktop](evidence/light-desktop-customizer.png), [mobile](evidence/mobile-customizer.png). | [`PixelCustomizer`](../../../../app/locker/components/identity/PixelCustomizer.tsx) passes `size={180}` while its CSS stage expands independently. Excess framing/glow space and fixed size constrain the actual preview. |
| F06 / P1 / browser | Tanjiro, Gojo and Tengen are three names/descriptions for exactly the same Pixel figure; saved drawings are not selectable in Customizer. All three built-in options produced the same framebuffer hash. | [`PIXEL_COSMETIC_REGISTRY`](../../../../app/dashboard/pixel-cosmetic-registry.ts) deliberately maps three legacy forms onto the one Sylf asset. Customizer derives names/rarities from `FULL_BODY_FORMS`, then counts 13 missing forms as “still being drawn.” An equipped `user:` drawing has no selected Character card. This is a false catalog, not missing image loading. |
| F07 / P1 / browser | Another tab's mounted dashboard stays on the previous artwork after Save and focus. Reload shows the new artwork. [Two-tab hashes](evidence/cross-tab-cache-results.json). | [`useScholarCreationAssets`](../../../../app/dashboard/pixel-companion-adapter.ts) fetches on mount; invalidation only drops module cache/bumps an epoch. Mounted readers do not subscribe to it, and focus does not revalidate. The 30-second freshness number is not a polling interval. |
| F08 / P1 / browser + source | Blank creations save and equip successfully, yielding a genuinely empty dashboard framebuffer. An unsaved `user:ghost-audit` reference also persists with HTTP 200, then silently renders Sylf. [Results](evidence/save-flow-results.json), [blank dashboard](evidence/mobile-empty-dashboard.png). | Structural validation accepts an all-transparent document; the configuration API accepts arbitrary JSON without requiring an existing owned creation. Resolver fallback cannot distinguish pending load, missing art, bad selection and intentional emptiness for the user. “No configuration produces a blank card” is not currently true. |
| F09 / P1 / source + DeepSeek | Accessories on user drawings silently disappear, and creation effects still assume built-in geometry. | Creations declare no anchors; attachment diagnostics are discarded by the surfaces. DeepSeek measured up to eight invented lit cells during a drawing's sparkle wave. The reusable painter is not sufficient to establish creation compatibility. |

The controlled source contained **41 occupied pixels: 20 white, 10 green, 10 purple, one cyan**. Output observations were:

| Density | Occupied output cells | Green / purple / white / cyan | Meaning |
| --- | ---: | --- | --- |
| Chunky 32 | 27 | 6 / 7 / 13 / 1 | Color/detail loss from collapse |
| Balanced 40 | 31 | 5 / 10 / 15 / 1 | Different color loss pattern |
| Detailed 48 | 58 | 10 / 8 / 36 / 4 | Even matching authored density is not a native copy |
| Finest 64 | 104 | 22 / 28 / 50 / 4 | Enlargement produces overlapping, uneven footprints |

Raw occupied counts across resolutions are not themselves a fidelity metric; greater counts during enlargement are expected. The decisive evidence is the matching-grid mutation, changed color runs and visible geometry changes. At each fixed density, **Customizer and dashboard had identical framebuffer hashes once the same asset loaded**, despite their different physical sizes. The renderer successfully kept 180px CSS / 540px backing at DPR 3. Therefore the repaired density prop/resize path is working; logical sampling, preview inputs, content freshness and CSS composition are the failures to fix.

### 3.2 Drawing and animation failures

| ID / priority | Finding | Root cause and evidence |
| --- | --- | --- |
| F10 / P1 / browser | Fast drawing skips cells; erasing a 20-cell line leaves 18 cells when the pointer jumps between its ends. | [`EditorCanvas`](../../../../app/locker/components/studio/EditorCanvas.tsx) paints only cells received in pointer events, without segment interpolation/coalesced-event processing. Slow drawing works; the fill algorithm and point eraser also work. [Desktop probes](evidence/desktop-editor-results.json). |
| F11 / P2 / browser | Mirror On mirrors Draw but not Erase; one symmetric partner remains after erasing. | `paintAt` passes mirror only for pencil, and cursor mirroring follows the same restriction. Fill also ignores mirror. The single global “On” control does not communicate those semantics. [Desktop](evidence/desktop-editor-results.json), [touch](evidence/mobile-touch-results.json). |
| F12 / P1 / browser | Editor pixels become rectangles at 1024, 390 and 320 widths. At 390, the 8× canvas is 340 × 384; at 12× it is 340 × 576. Hover cursor can miss its target by 36.7px. | CSS `.canvasStage` shrinks as a flex item in width but keeps its explicit height. Cursor uses nominal `--studio-cell=zoom`, while input mapping uses actual bounding-box dimensions. The top-level 1000px breakpoint ignores the 280px app sidebar. [Responsive measurements](evidence/responsive-results.json), [touch cursor/zoom](evidence/mobile-touch-results.json). |
| F13 / P2 / browser | Onion pixels seem unerasable when they remain after erasing the active frame. | This is correctly noneditable neighboring-frame content, not retained drawing data. Ghosts are painted in the original colors at low alpha, with no distinct previous/next tint or local “ghost” indicator. Controls/explanation are far from the canvas on mobile. Turning Onion off removed the apparent residue. |
| F14 / P1 / browser | Add from an earlier frame appends a new frame but selects an existing one. Copy inserts a duplicate but leaves the original selected. | Add uses “current index + 1” although the model appends; Copy never updates selection. [Frame probe sequence](evidence/desktop-editor-results.json). Users can paint over the wrong frame immediately. |
| F15 / P1 / browser + source | Editor Play continues cycling when Once is selected; the display preview follows its own playback and can animate while editor playback is paused. | The editor timer always uses `(index + 1) % frameCount`, ignoring `draft.playback`. Studio does not drive the preview's frame/playhead. One-shot finish, replay and pause are not defined consistently. |
| F16 / P1 / browser | A looping preview changes framebuffer repeatedly with `prefers-reduced-motion: reduce`, even with content's reduced-motion flag true. | Composition frame advancement bypasses the reduced-motion branch. [Measured hashes](evidence/reduced-motion-results.json). The editor effect itself also has no preference check, contrary to current documentation; explicit user-requested playback should be treated separately from autoplay. |
| F17 / P2 / browser + source | Undo/Redo buttons work for strokes and frame edits, but there are no editor keyboard shortcuts and duration/playback/name changes have no dedicated history step. “Delete” on the only frame clears its drawing. | History is pushed by selected event handlers instead of by a consistent document-command boundary. No keyboard handler exists; last-frame deletion has a surprising model fallback. Slider UI is limited to 1000ms although the validated format permits 2000ms. |
| F18 / P2 / browser | Right-click draws two mirrored pixels. | PointerDown has no primary-button guard. [Pointer edge results](evidence/pointer-edge-results.json). Pointer capture did allow leaving/re-entering while held in the tested mouse case, so capture itself was not demonstrated broken. Active-pointer/multi-touch ownership remains a source-level risk to cover. |
| F19 / P2 / browser + source | Tools, color, preview, frames, repeat mode, name/save and library form disconnected panels; timeline uses small reorder targets and stacks down a long right rail. | At 1440 the workbench is 716px wide while the controls rail is 352px and roughly 1452px tall, leaving most lower left space unused. At 390 color/animation/save begin below the canvas, and a 504px tool row is hidden inside 366px with no scrollbar affordance. There is no visible logical cell grid, fit-to-workspace control or new-document grid choice. [Studio](evidence/light-desktop-studio.png), [mobile](evidence/light-mobile-studio.png). |

### 3.3 Persistence, navigation and appearance failures

| ID / priority | Finding | Root cause and evidence |
| --- | --- | --- |
| F20 / P1 / browser | Leaving Studio and reopening silently loses the unsaved drawing. | Draft/history exist only inside the unmounted Studio component. No saved baseline, exit guard or recoverable session draft. [Failure probes](evidence/error-and-draft-results.json). Opening another saved drawing has the same unguarded replacement boundary by source. |
| F21 / P1 / source | Rename changes identity; equal normalized names overwrite each other. Non-Latin names collapse to `my-companion`. | [`draftToCreation`](../../../../app/locker/components/studio/pixel-studio-model.ts) creates the ID from the display name every time. API upserts by owner + slug. Renaming saves another row rather than editing the original; name collision replaces prior artwork without an explicit overwrite action. Existing database row IDs are not used as stable editor identity. |
| F22 / P1 / browser | Equip only changes a parent draft, requiring another save elsewhere. Studio points to a nonexistent save bar; its subtitle says equip in Customizer, which cannot select drawings. | Artwork POST, config PATCH and sibling-view draft ownership are disconnected. The Hub owns Save All; it is not rendered above Studio. Equip also allows unsaved documents. [Save flow](evidence/save-flow-results.json). |
| F23 / P1 / browser | Save remains enabled during its POST; two clicks send two requests. | Studio's `saving` prop tracks Identity configuration PATCH, not its artwork request. A delayed real POST reproduced two writes. [Failure probes](evidence/error-and-draft-results.json). |
| F24 / P1 / browser | Creation-list HTTP 500 is presented as “Nothing saved yet”; config-save HTTP 500 has no failure message. | List handling does not distinguish an unsuccessful response from empty data. `handleSaveAll` handles only `res.ok`, and catch logs to console. The global Next alert in the probe is not a save-error message. |
| F25 / P1 / browser | Saving Pixel Size changes the mobile HUD to HP `0/100`; server HP remains `100/100`. | Identity calls `mutateUser(data.user)` with the customization API's partial user projection. [`AuthProvider`](../../../../app/components/AuthProvider.tsx) replaces the whole stats record. HP, currency and other omitted stats disappear in memory. [Response keys and HUD](evidence/auth-mutation-results.json). This is a client state regression, not lost server HP. |
| F26 / P1 / source | Delete is immediate/permanent and can leave the server's equipped creation reference dangling. Concurrent saves can race quota or overwrite revisions. | API DELETE does not reconcile `characterConfig`; Studio changes only its local draft fallback. Count/check/upsert has no transaction protecting the 24-row limit and no expected revision. Delete network exceptions are not handled. |
| F27 / P2 / browser + source | Hub exposes both systems; dashboard says Enter Character Studio. Back/direct navigation cannot identify a specific Pixel subview. | Identity stores Hub/Customizer/Studio in local `viewMode`, all at the same `/locker?tab=identity` URL. Reload starts Hub; normal browser history does not represent the editor flow. Dashboard wraps a link inside a role=button container and Space handling lacks `preventDefault`. |
| F28 / P2 / browser | Yellow-accent Save has white text at approximately **1.53:1** contrast; active labels are weak in light mode. | Pixel Customizer/Studio CSS hardcodes `#fff` for primary buttons and uses `--accent-text-light` on light surfaces. The actual app token correctly supplies black `--accent-foreground`; the Pixel UI ignores it. [Enabled Save](evidence/custom-color-customizer.png), [mint background](evidence/custom-background-desktop-customizer.png). |
| F29 / P2 / source | Dirty state can disagree between Hub and Customizer, and a new Auth user object can reset an unsaved customization. | Hub compares whole JSON; Customizer compares drawn fields, including legacy aliases. Identity's `[user]` effect recopies saved and draft fields on every user-object replacement. Normalize resolved presentation and reconcile only relevant server revisions, without discarding local edits. |
| F30 / P2 / source | The new Pixel fetches bypass shared API transport, and the creation cache is separate from logout/cache ownership. | Studio/adapter use relative `fetch('/api/...')` instead of the configured mobile transport. Normal web logout reloads the page, mitigating cache reuse today; session scoping/subscription still needs to be explicit. Capacitor API origin/credentials are a release risk that viewport emulation cannot close. |

Additional appearance integration observation: saving accent and background together once left the root/local background white while `/api/cosmetics` reported mint; applying again synchronized it. The Appearance page concurrently writes both fields but mutates Auth from the theme response only, which can carry the previous background. `/api/user/stats` does not project appearance fields. This belongs in the existing Appearance/Auth integration owner, scoped to preserving appearance during companion saves; it is not a reason to build a second theme system.

## 4. Rendering contract to establish before redesign

### Four independent quantities

| Quantity | Meaning | Phase 2 rule |
| --- | --- | --- |
| Authored grid | Stored source pixel coordinates and frames | Fixed document property; never changed by viewport, zoom or equipping |
| Logical display density | Destination sampling/matrix choice | An explicit presentation decision with deterministic sampling; cannot promise lossless downsampling |
| Physical display size | CSS dimensions of the containing screen | Responsive and square, driven by the surface; never rewrites the document |
| Editor zoom | Workspace magnification | Editor-only; Fit plus explicit magnification/pan; never a density or document conversion |

**Recommended fidelity policy:** built-in authored/composed content retains the four density presets. A user drawing defaults to **Original pixels**, which renders its authored grid without logical resampling. Keep the four presets available as deliberate presentation alternatives with a truthful live comparison; mark the matching native grid as Original where applicable and explain that coarser modes can merge detail. Existing saved densities are read compatibly rather than silently rewriting artwork. Use the authored grid as the native framebuffer and apply surrounding physical padding consistently across surfaces.

Do not promise that an arbitrary 64-cell drawing can keep every one-cell feature after collapsing to 32. If the product requires identical source topology under all four labels, those labels must describe a different presentation effect, not lower logical resolution. This is a product-contract decision, not a CSS fix. The recommendation above preserves the existing meaning and adds an honest fidelity default.

Required implementation behavior:

1. Native placement copies palette indices one-for-one, including transparent cells. Remove the 0.9 logical shrink from the native creation path. Put visual breathing room outside the native artwork region; do not stretch/crop to nontransparent bounds as the user draws, because framing would jump between frames.
2. For deliberate resampling, use a destination-driven nearest-neighbor rule or equivalent consistent shared boundaries. Specify pixel-center sampling and transparency/overlap behavior. Do not force every collapsed source pixel into a minimum one-cell rectangle. Effects and clipping must use that same mapping.
3. Keep one shared resolver/painter/renderer. Distinguish native raster placement from built-in compositional framing in the existing content contract, without parallel preview math.
4. Carry stable asset/document identity **and content revision** through editor conversion, cache, composition comparison and React host. A same-ID edit must replace geometry, palette, framing and animation. Do this before the JSON-stringification optimization.
5. Preview descriptors must include the same creation revision, resolved density/fidelity mode, framing, backdrop, compatible parts and playback policy as the target surface. Physical enlargement alone may differ.
6. Adopt OLED black as the initial display backdrop because that is the production behavior tested here; use it consistently and update the recorded candidate. Theme the surrounding UI with Sylf semantic tokens. Avoid altering authored palette colors as a side effect of app appearance.
7. Surface pending asset load separately from a missing/deleted/incompatible selection. Preserve last valid rendered content while revalidating where appropriate; show a clear fallback explanation and recovery action. Never label network failure as an empty library.
8. For drawings, support stage-relative ground/framing independently of optional anatomy. Do not blindly copy Sylf's hand/neck anchors onto arbitrary user art. Offer only compatible accessories; later explicit anchor authoring can be an optional extension, not a prerequisite to drawing.
9. Effects over drawings must stay within the authored occupied mask unless an explicitly supported ambience plane supplies content. Preserve user colors/geometry; verify pulse ink behavior without redesigning the final artwork.

## 5. Proposed user-facing composition

### Dashboard

Replace the avatar-slot treatment with a companion-led panel. The display is the largest visual in that panel; name/equipped label and concise current state support it. Keep study/progression information readable but subordinate inside this panel, without changing the rest of the dashboard's data calculations.

Start visual trials at **240–320px desktop** and **200–280px phone**, constrained by the available panel width and height, with square aspect ratio. These are candidate ranges to verify, not fixed implementation promises. Adjust built-in composition framing after enlarging the slot; changing a currently ignored `characterFill` value alone cannot deliver the result. Reserve ground/effect safe area and preserve the character's proportions.

Use an explicit Customize action opening the Customizer directly, and an Edit drawing action for an equipped creation. Avoid a whole card button containing links. Give companion state a useful accessible label; essential XP/HP information stays textual. Loading, fallback and reduced-motion static states must remain understandable.

### Studio Hub

Expose one **Companion** destination with Customize and Draw/Edit actions, a substantial current companion preview and clear equipped status. Keep Profile Studio for banner/photo/bio/social links. The user-created companion does not replace a person's profile photo, purchased frame/title/name color or academic gear inventory.

Remove the Character Studio card, fake hunter-form marketing, duplicate save promises and “13 still being drawn” content in the implementation phase. Provide sensible direct navigation/return paths and a visible way to resume an unsaved drawing. Persisted legacy keys continue through a compatibility resolver; they do not become user-facing choices.

### Customizer

Use a balanced preview-and-options layout based on **available content width**, not viewport width alone. The preview should occupy most of its stage with consistent frame padding; it scales fluidly instead of remaining at 180px. Keep a compact “Dashboard view” toggle/example when actual context sizing matters.

The catalog contains one accurately named built-in Sylf companion plus **Your drawings**, with actual thumbnails, selected/equipped state, Edit and Create actions. Deduplicate identical asset aliases. Hide categories with no real supported choices; a single finished default is acceptable and needs no fake alternatives to justify the screen. Show compatible ground/equipment only when there is a meaningful choice. Unknown old selections get a migration/fallback note, not a false anime name.

Pixel Size cards must show the **same selected character at the same physical thumbnail size** under each setting, with clear selection, concise tradeoff and native-fidelity labeling. Tiny generic grid glyphs are insufficient. Correct the “Balanced default” and “Finest softest edges” copy; nearest-neighbor rendering does not make edges soft. Keep one Apply changes action with draft/saving/applied/failed states and Reset. On phone, put the options and action within reach instead of making users traverse a large preview before changing anything.

### Pixel Studio

Recompose as one workspace:

- **Header:** document name, saved/unsaved/recovered status, Save, Save & equip, Back. Primary persistence actions remain visible while working.
- **Workspace:** square drawing viewport, nearby tools/color/mirror/history, visible cell grid toggle and Fit/zoom controls. Fit computes a square cell pitch; deliberate magnification pans inside the viewport rather than compressing one axis.
- **Timeline:** horizontal below the workspace, consuming its width. Frame thumbnails, durations, playhead, Add/Copy/Delete, reorder, Play/Pause/Replay and Onion form one control group.
- **Inspector:** compact context preview, playback policy and secondary settings. The saved library opens as a gallery/drawer rather than elongating the permanent inspector.

On phones, compose a square workspace with a reachable tool/history strip and color palette, a compact timeline directly below, a collapsible Preview/settings sheet and persistent Save actions that respect the software keyboard and safe areas. Landscape needs a height-aware arrangement, not the portrait stack squeezed under a desktop sidebar. At intermediate widths, collapse the inspector before compressing the drawing viewport.

For new documents, choose a supported authored grid explicitly, defaulting to a sensible drawing size independently of equipped Pixel Size. Existing document grids are immutable during normal editing. Any future resize is an explicit, previewed conversion/copy, outside ordinary zoom.

Keep the editor approachable: improve the existing four tools and history before adding selection/layers/scene scripting. Provide an editable compact palette only if included as a small bounded extension; otherwise align UI/format limits and clearly name swatches. Do not advertise inaccessible colors or grid sizes.

## 6. Interaction and animation requirements

**Drawing:** interpolate complete cell segments between input samples for Draw and Erase; apply one undoable command per stroke. Handle pointer cancel/lost capture and a single active pointer. Ignore secondary mouse buttons. Use actual square geometry for input and brush cursor. Preserve drawing on page scroll and keyboard focus changes. Mirror should apply consistently to Draw/Erase; define mirrored Fill as bounded fills from the original/mirrored seed, deduplicating overlap. The cursor must show the action's actual footprint. Pick on transparency needs clear feedback and must not silently select black.

**History:** strokes, fill, frame operations, timing/playback changes and naming should have coherent, bounded undo behavior. Group a duration drag into one edit. Prevent no-op history pollution. Add platform-appropriate Undo/Redo, tool shortcuts and Space playback only when focus is in the workspace; do not hijack text inputs or page navigation. Dirty status derives from the document's saved revision, not a transient success toast.

**Timeline:** Add/Copy inserts at a defined location and selects the new frame. Reorder preserves stable frame identity and selection. Show frame number, thumbnail, duration and selected playhead; support scrubbing/selecting and accessible button/keyboard reordering alongside pointer drag if implemented. Delete last frame is either unavailable or an explicit Clear frame action, with undo. Preserve the 16-frame bound and truthful duration/total limits; the UI must expose the same supported duration range as validation.

**Playback:** one selected frame/playhead drives authoring playback and preview. Once stops on the final frame and offers Replay; Repeat loops; Pause holds the current frame. If a separate “Live dashboard” preview follows production autoplay, label that mode explicitly. A stopped editor must not have a mysterious independently playing preview. Mark previous/next onion frames with distinguishable tint/opacity controls and an obvious local ghost indicator; onion pixels never serialize into artwork.

**Reduced motion:** automatic creation loops freeze on an explicitly chosen static frame, initially frame one. Explicit Play remains a user action with a clear Pause control. Keep short static progression acknowledgments and avoid invented pixels over drawings. Existing hidden/offscreen suspension, bounded scheduling and zero-work static idle are retained; do not introduce a permanent 60fps editor/dashboard loop.

**Preview:** provide clearly labeled **Artwork** and **Dashboard** contexts rather than several unexplained small canvases. Artwork uses the authored grid/current frame; Dashboard uses the exact target descriptor and responsive panel size. Enlarging either context changes presentation only. Show incompatibility and loading beside the preview, not hidden in an engine diagnostic.

## 7. Save/equip and persistence design

Keep the existing separation: artwork belongs in `PixelCreation`; equipped selection belongs in `User.characterConfig`. Consolidate user actions around those owners rather than merging artwork into stats/config payloads.

1. Use stable server-backed creation identity independent of display name. Distinguish **Save existing**, **Save as copy** and Rename. Maintain compatibility for existing owner-scoped `user:<slug>` references; a slug alone is never global identity. Keep document-format version separate from content revision.
2. **Save** persists artwork only. **Save & equip** first saves a valid revision, then commits the owned saved reference/config. **Equip saved** is immediate for a clean existing document. If the equip step fails after save, say “Drawing saved; could not equip” and offer retry without recreating the document. Do not leave another hidden Save All step.
3. Reject nonexistent/unowned creation references on the server. Decide blank policy explicitly: saving a blank work in progress can be allowed, but equipping an entirely empty companion should prompt an explanation or be disabled. Provide a deliberate “hide companion” setting only if wanted, rather than letting empty art accidentally express it.
4. Protect the quota and delete/equipped reconciliation transactionally in the existing creation/config services. Add expected-revision conflict handling so another tab cannot silently overwrite changes. Deleting an equipped creation must choose/persist a valid fallback as part of the operation. Confirm permanent deletion or provide a small recoverable undo period; handle errors visibly.
5. Track independent pending states for save, equip, delete and list loading. Disable duplicate submission, retain drafts after failure, distinguish authentication/validation/conflict/quota/network errors and provide retries.
6. Retain a session/user-scoped recoverable draft and guard Back, opening another document, reload and route exit when unsaved. Recovery must include frames/timing/palette, not just name. Extend existing draft/cache ownership with explicit logout cleanup; do not leave private artwork in a cross-user browser cache.
7. Use shared `lib/api-transport.ts` for web/mobile requests and `lib/client-data-cache.ts` ownership/invalidation patterns. Deduplicate in-flight reads, update subscribed mounted consumers after writes and revalidate on focus/visibility with owner/revision guards. A broadcast invalidation can coordinate tabs without transmitting the whole artwork. Preserve existing realtime/polling and Redis fallback behavior elsewhere.
8. Fix the partial Auth mutation contract: merge an explicit customization patch safely or call the existing `refreshStats` owner, retaining full stats and appearance. Do not let generic background user refresh replace an unsaved customization draft. Normalize aliases for dirty comparison and authoritative writes.
9. Add PixelCreation RLS in an ordered additive migration, verify policies/grants/roles and authenticated API ownership. Extend schema only where stable revision/selection requirements justify it; run Prisma generation and bump `SCHEMA_BUILD_VERSION` for field changes. Do not edit a migration already applied to live databases.

## 8. Legacy removal and migration dependency tree

The source inventory contains **12 JSX uses of `CharacterRenderer` across 11 files**, plus catalog/persistence/asset helpers. Removing `CharacterStudioView` alone leaves broken rendering around the app.

Opening legacy Studio while `user:audit-pattern` was equipped requested `/sprites/character/forms/user:audit-pattern.png`, returned 404 and hid the form image. The pedestal remained, and UI labeled it Tanjiro. [Screenshot](evidence/legacy-studio-equipped-creation.png). This confirms the shared config is already crossing incompatible renderer boundaries.

| Consumer | Phase 2 treatment |
| --- | --- |
| [`identity/StudioHubView`](../../../../app/locker/components/identity/StudioHubView.tsx) | Remove legacy card/preview; keep companion and independent profile destinations |
| [`identity/CharacterStudioView`](../../../../app/locker/components/identity/CharacterStudioView.tsx) | Retire view, route-mode branch and dedicated UI/styles after equivalent supported customization exists |
| [`PublicProfileModal`](../../../../app/components/PublicProfileModal.tsx) | Pixel presentation of target user's selected asset under existing profile visibility/block rules |
| [`FriendRequestsModal`](../../../../app/components/FriendRequestsModal.tsx) | Target user's permitted companion thumbnail; explicit static/pause policy |
| [`SocialScreen`](../../../../app/social/components/SocialScreen.tsx), two uses | Migrate own and other-user representations independently; no viewer-owned asset lookup for friends |
| [`FocusPartyMemberStage`](../../../../app/social/components/focus-party/FocusPartyMemberStage.tsx) | Render each member's descriptor; currently it ignores member config and passes a default figure, an additional source-confirmed bug |
| [`FocusPartyInviteModal`](../../../../app/social/components/focus-party/FocusPartyInviteModal.tsx) | Migrate permitted friend previews |
| [`FocusPartyLobby`](../../../../app/social/components/focus-party/FocusPartyLobby.tsx) | Migrate member avatars, preserving timers/presence/poll fallbacks |
| [`ItemsTab`](../../../../app/locker/components/ItemsTab.tsx) | Replace character visualization, retain inventory ownership/equipment/stat mechanics and item art |
| [`ShopScreen`](../../../../app/shop/components/ShopScreen.tsx) | Use truthful compatible Pixel try-on; retain prices, unlocks, purchases, ownership and product icons |
| [`DashboardDesignScreen`](../../../../app/dashboard-design/components/DashboardDesignScreen.tsx) | Migrate its remaining renderer if this route stays reachable; do not silently abandon a shipped route |

Supporting dependencies:

- [`CharacterRenderer → getSpriteLayers → asset-manifest sprite URL helpers`](../../../../app/components/character/CharacterRenderer.tsx): remove only after all migrated consumers are verified. `asset-manifest` also owns non-character/consumable assets; do not delete the whole file or `/sprites` tree by name.
- [`character-traits`](../../../../lib/character-traits.ts): retain shared config types and compatibility reads initially. Separate actual Pixel content metadata from the obsolete 16-form selector, defaults, randomizer and image paths. Canonical visible default is **Sylf**, even when an old key resolves to it. Do not falsely convert old form labels into newly authored assets.
- [`system-collection`](../../../../lib/system-collection.ts) and [`archive-catalog`](../../../../lib/archive-catalog.ts): migrate current character-style selections, descriptions and navigation. Preserve earned records/item ownership and historical archive meaning rather than rewriting ledgers or claiming existing inventory disappeared.
- Profile photos, banners, frames, titles and name colors remain separate profile cosmetics. Companion visual retirement does not authorize deleting these systems.

### Cross-user asset delivery is a prerequisite

Friends/profile/conversation/party payloads currently transport `characterConfig` but not target users' PixelCreation artwork. `/api/pixel-creations` is correctly owner-only. Two people can have the same `user:<slug>`. Simply replacing `<CharacterRenderer>` with the current dashboard wrapper can show a fallback, the viewer's artwork or the viewer's progression reaction.

Extend the existing authorized data owners—[`lib/profile-service.ts`](../../../../lib/profile-service.ts), friends/request endpoints and [`lib/focus-party-service.ts`](../../../../lib/focus-party-service.ts)—to supply a bounded **selected companion descriptor**: owner identity, stable selection, permitted asset revision/data, density and supported parts. Enforce privacy/block/party membership before resolving artwork. Keep private draft/library access owner-only. Batch selected-art reads to avoid N+1 queries and do not place every creation into every stats response.

Refine the existing reusable Pixel presenter so it accepts explicit composition/density/sizing/playback/signals. Keep the current-user Auth/LevelUp adapter as a wrapper for own surfaces. Other users' thumbnails must not subscribe to the viewer's own creation library or level-up event. This extends the present system rather than creating another renderer.

A full public sharing/import/export marketplace remains deferred; showing the legitimately equipped companion on existing authorized social surfaces is essential migration work.

### Safe removal gate

After migration, run a complete import/JSX/path search, inspect residual dynamic sprite references, migrate affected mocks/tests, verify all web/mobile bundles and authorized profiles, and then delete the renderer/view plus truly dead character assets/helpers. Keep legacy config aliases readable through the compatibility adapter until data migration and rollback requirements are settled. No generic raster, inventory icon or landing dependency is removed without a checked consumer inventory.

Explicit exclusion: **`app/components/landing/companion/**` and its callers/rig/art assets remain untouched**, including the separate landing SVG companion. DeepSeek's landing cleanup recommendation is not authorized by this consolidation.

## 9. DeepSeek recommendation disposition

| Recommendation / risk | Decision for this consolidation |
| --- | --- |
| B1–B7 already fixed | Preserve their regression coverage. Live hydration, saved density transitions and high-DPI rendering now work; do not repeat old fixes as new work. F01/F02 are distinct defects still present. |
| R1 timer-driven auto-blink | Conditional. Production currently disables auto-blink. If the enlarged hero enables it, use bounded scheduled wakes and suspension rather than continuous polling; otherwise leave it off. |
| R2 composition fill | Include. Resolve built-in per-surface framing explicitly and measure the new hero. Do not apply a generic fill override that destroys native user raster fidelity. |
| R3 creation anchors | Include compatibility support, revise the proposed solution. Stage-relative ground and explicit capability rules are safer than copying hand/neck anchors to arbitrary drawings. |
| R4 degradation diagnostics | Include as useful user-facing compatibility/loading/fallback messages, especially Customizer/Hub/Studio. |
| R5 serialized content per render | Include after revision correctness. **Reject ID-only structural keys:** that would reproduce/amplify F01. Use stable immutable content identity/revision and verify live same-ID edits. |
| R6 per-plane clipping | Defer unless migrated real content mixes clipped/unclipped planes. Cover if such an asset enters this phase; don't expand the renderer spec without a consumer. |
| R7 own drawing selected | Include a real Your drawings gallery and equipped card, rather than only a note. The sole-character system needs actual selection/equipping. |
| R8 looping reduced motion | Include; now browser-confirmed. Freeze automatic playback, retain explicit user-controlled preview playback. Correct the editor documentation claim. |
| R9 eye-ink pulse | Include as an effects/readability acceptance check. Preserve ink via palette/mask roles if necessary; no final-art redesign. |
| R10 RLS | Include additive migration and role/policy tests. Prior revoked grants mean missing RLS is not evidence of a present public data leak. |
| R11 dead helpers/imports | Remove only in files touched by this work. Exclude all landing preview plumbing and unrelated cleanup. |
| R12 long-delta effects | Defer new catch-up/timing architecture. Retain documented bounded timing; test suspension/resume and record any perceptible effect stretch. |
| R13 black vs navy backdrop | Decide/document black consistently for the production contexts tested here; remove/deprecate an unused candidate token only when its consumers are checked. |
| Creation sparkle invents cells / built-in ambience assumptions | Include occupied-mask/compatible-effect rules and creation-specific tests; a required sole-system correctness gap. |
| Catalog freshness | Include subscribed mutation updates and cross-tab/focus revalidation; browser-confirmed stale dashboard. |
| `paintedCells` is write count | Include accurate diagnostic naming plus surviving-framebuffer/mask assertions. Never use write count as visual correctness evidence. |
| O13 high-DPI live gap | Partly closed: touch/DPR 3 real browser tested successfully. Physical device/Capacitor and zoom/DPR changes remain implementation acceptance gates. |
| O21 missing 13 forms / O24 empty cosmetics | Remove placeholder promises/fake choices; no art production in this phase. Existing real assets may be exposed only with compatibility/ownership checks. |
| O23 remaining legacy consumers | Fully in scope, with the inventory and data prerequisites above. |
| O26 sharing | Selected equipped art on authorized existing surfaces in scope; general sharing/import/library distribution deferred. |
| GPU backend, packed buffers, nested scenes, procedural behavior, expanded artwork | Deferred. Profile before adding infrastructure; the current bugs do not require these systems. |

## 10. Implementation sequence and completion gates

| Work package | Scope / owners | Completion condition |
| --- | --- | --- |
| 2A — Contract and catalog | Content asset/creation contracts, cosmetic registry, compatibility resolver, current docs | Native-fidelity and resampling rules recorded; one truthful built-in choice; creation identity/revision and preview descriptor specified; landing boundary fixed |
| 2B — Rendering correctness | `paint.ts`, `creation-asset.ts`, Sylf content configure/animation, existing React host | Native round-trip fidelity; deterministic deliberate resampling; same-ID edits refresh; exact-context preview parity; reduced-motion/occupied-mask guarantees; existing B1–B7 pass |
| 2C — Persistence and shared data | Existing creation/config APIs, Identity/Auth, transport/cache, schema/migrations if needed | Rename cannot lose art; Save/Save & equip complete and retry correctly; invalid owned references refused; delete and quota safe; mounted/two-tab updates; full stats/appearance retained; RLS verified |
| 2D — Editor interactions and animation | Existing Studio model/canvas/timeline | Gap-free draw/erase; correct mirror/cursor; stable new-frame selection; coherent history; Once/Repeat/Pause parity; draft recovery; accessible keyboard/touch behavior |
| 2E — Dashboard/Hub/Customizer/Studio layout | Shared screens and semantic styling | Prominent fluid dashboard; honest catalog and useful size comparisons; workspace/timeline composition; 320–1440 layouts preserve square pixels; light/dark/custom colors and motion verified |
| 2F — Legacy consumers and removal | Profile/friends/party owners, Shop/Items/Collection/Archive, mobile adapters | Target-owner Pixel descriptors respect privacy; every consumer migrated; legacy sprite UI/imports gone after dependency checks; inventory/progression/profile cosmetics preserved |
| 2G — Release audit | Browser evidence, regression suites, docs, production/mobile builds | Full flow plus errors/recovery passes in web and mobile client; production dev routes stay hidden; no stale artwork/wrong owner/404 character PNGs; no landing change |

2A is the first design gate. 2B and the stable identity portion of 2C precede visual polish. 2D/2E can follow shared contracts, but legacy deletion waits for 2F data delivery and the final acceptance pass. Keep each package reviewable; do not bundle engine fixes, schema changes, UI redesign and dead-asset deletion into one opaque cutover.

### Regression and browser acceptance matrix

| Area | Required checks |
| --- | --- |
| Fidelity | Static and animated fixtures at authored 32/40/48/64; isolated pixels, horizontal/vertical lines, alternating colors, transparent holes, edge cells. Matching native grid is byte/palette-index faithful. Coarse sampling follows the documented rule with no overlapping-cell write bias. |
| Preview parity | Same owner/revision/frame/density/composition produces identical framebuffer hashes in Studio Dashboard mode, Customizer and real dashboard; different physical sizes change only presentation. Pending load/missing/invalid/blank states are visibly distinct. |
| Live edits | Same-ID pixel, palette, duration, frame count/order and playback edits refresh immediately. Name change does not become the refresh mechanism. |
| Pointer/tools | Sparse high-speed events still form continuous strokes; fast erasing removes the full path; mirror semantics; Fill/Pick; primary-button guard; mouse/touch/pen, active-pointer cancel; correct hover at every zoom and fit size. |
| History/animation | One stroke/slider drag = one history step; copy/add select new frame; reorder keeps selection; last-frame behavior clear; Once completes/replays; Repeat loops; Pause holds; onion never persists. |
| Persistence | New/existing/rename/copy/name collision/non-Latin name; double clicks/slow requests; save succeeds/equip fails; 401/409/validation/500/offline retry; unowned/missing equip refused; active delete fallback; concurrent quota/revision conflicts. |
| Recovery/cache | Back/reload/open another drawing preserve or explicitly discard unsaved work; full draft recovery; mutation updates already mounted consumers; focus/two-tab updates; logout/account switch never replays another user's library. |
| Responsive | 320/390 phone, 820 intermediate, 1024 sidebar desktop, 1440 desktop, landscape and software keyboard. Square workspace/display; pan/fit without inaccessible clipped origins; reachable Undo/Redo, timeline and save; no document overflow. |
| Appearance/accessibility | Light/dark plus pale yellow/mint and dark custom colors; foreground/accent tokens on the actual surface; keyboard/radio/tab semantics, visible focus, labels, touch targets and non-color selection. Reduced motion freezes autoplay and retains static state information. |
| Social/privacy | Two owners with identical old slugs; public/friends/private/blocked profile visibility; permitted party membership; correct target art/density; viewer level-up does not animate every friend's card; bounded selected-art payloads/query counts. |
| Runtime/performance | Static idle zero work, scheduled loops on authored timing, hidden/offscreen pause, resume without timers leaking; repeated mount/dispose; no full-frame serialization per unrelated render; many social thumbnails remain bounded. |
| Compatibility | Existing legacy forms/config aliases, current Pixel creations, item equipment/rewards/unlocks, profile photo/banner/cosmetics, mobile API base URL/credentials and mock fixtures; landing SVG/art/imports unchanged. |

Run relevant Vitest regressions, `npx tsc --noEmit`, `npm run typecheck:engine` and ESLint on changed files. Read installed Next.js 16 guides before routing/server-client changes; run `npx next typegen` for route changes. Build web and run `npm run mobile:build` / `npm run mobile:verify` for shared client work. Use direct ESLint, not the obsolete `npm run lint`. Database revisions need disposable integration tests for ownership, transactions, quota, RLS and migration compatibility; do not claim those from mocked component tests. Record fresh browser screenshots/results alongside the implementation report.

## 11. Release judgment

The consolidation should ship only when a user can draw and animate a companion, trust the preview, save/equip it in one clear flow, change presentation without silently rewriting artwork, and see the correct companion throughout existing authorized surfaces. Correctness work is the critical path. The visual redesign then makes the system prominent and usable, and dependency-gated removal makes it the sole in-app system.

This audit changed no application source, schema, migrations, final artwork or landing companion. It used isolated QA records for live persistence testing and added only the report/evidence artifacts. No native-device, production deployment, multi-user social session or database concurrency/RLS execution is claimed; those are explicit implementation release gates rather than assumed successes.
