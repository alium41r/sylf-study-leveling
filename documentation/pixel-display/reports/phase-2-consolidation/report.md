# Pixel Companion consolidation — implementation report

**Completed:** 8 October 2026. Work packages **2A–2G** from the [approved audit](../phase-2-consolidation-audit/report.md) are implemented. Pixel is the sole in-app companion presentation. The separate landing companion, its artwork and preview dependencies remain unchanged. No final Sylf artwork was redesigned.

The [current contract](../../pixel-display-contract.md#current-product-contract) owns rendering, identity, playback and authorization. [Browser results](evidence/browser-results.json), [screenshots/check logs](evidence/README.md) and the [removal inventory](evidence/legacy-removal.json) provide implementation evidence. Historical audits retain their original measurements.

## Result and work packages

| Package | Delivered |
| --- | --- |
| 2A — Contract/catalog | Four independent quantities: immutable authored grid, presentation density, physical CSS size and editor zoom. One real built-in Sylf choice plus owned drawings. Original fidelity for drawings, truthful compatibility rules and black display backdrop. |
| 2B — Rendering | Native grid copy; deterministic destination-center sampling at other densities; immutable geometry/palette/timing identity; same-ID refresh; explicit frame/playhead; occupied-mask effects; reduced-motion autoplay freeze; no full artwork JSON serialization on unrelated React renders. |
| 2C — Persistence | Stable UUID identity independent of name; revision conflicts/idempotent retries; shared owner-locked save/equip/delete/quota transactions; blank/missing/unowned equip rejection; subscribed owner library, cross-tab invalidation, shared mobile transport, safe Auth merges/read ordering, recovery and logout cleanup; RLS migration. |
| 2D — Editor | Continuous Draw/Erase; mirror Draw/Erase/Fill/cursor; truthful Pick/onion guides; square Fit/zoom/pan; horizontal timeline; correct selected Add/Copy/reorder; Once/Repeat/Pause/Replay; grouped bounded history, keyboard shortcuts, recoverable drafts and focused dialogs. |
| 2E — Composition | Large companion-led Dashboard, one-system Hub, fluid Customizer with five equal-size drawing comparisons and Apply/Reset, cohesive Studio with reachable save actions and responsive inspector/timeline. Semantic appearance tokens. |
| 2F — Migration | All old renderer consumers migrated to explicit Pixel presentation, including authorized target-user profile/friend/party data. Obsolete Studio/renderer/catalog helpers and 17 unused character PNGs removed after dependency verification. Inventory/profile/progression retained. |
| 2G — Release | Real development, production and built mobile browser flows; failure/recovery/cross-tab/density evidence; required tests/typechecks/builds and real PostgreSQL/RLS checks; current docs and legacy/landing preservation searches. Remaining baseline warnings and physical-device limits are recorded below. |

## Final UI refinements requested during implementation

Dashboard now shows only the large Pixel Display and a Locker link above it; the surrounding identity container and repeated name/rank/level information are removed. Existing display sizes and XP/HP information remain. Studio uses the full available width with approximately two-thirds workspace and one-third inspector on desktop; Fit fills its column rather than imposing a viewport-height cap. The measured desktop canvas is736px square, inspector316px; phone Fit is348px square. Smaller layouts stack deliberately. Buttons, tabs, timeline, sticky header and entrance/press transitions use shared appearance/motion rules, including reduced motion.

The editor checkerboard is removed. A black background and accurate authored-cell borders replace it. Native drawing displays no longer inherit rounded clipping or default inter-pixel gaps: full edge pixels remain visible. A solid48-grid test rendered all278×278 backing pixels correctly, with zero black gaps or missing edge pixels. Optional border color is an external outline, so it does not reduce artwork size. Pixel spacing0–30% is an explicit presentation setting; Original drawings default to0%, built-in Sylf retains12%. Both settings persist in CharacterConfig and are shared by Studio/Customizer/Dashboard and authorized target-user descriptors, never baked into artwork.

The final paint selector is intentionally simple: choose any six-digit RGB hex or native spectrum color, then draw; recent colors select the brush for future strokes. There are no Use color/Replace selected actions. Selection alone changes no pixels, palette, dirty status or undo history. A new palette entry is allocated with the first actual stroke and undoes with that stroke. Existing painted colors seed the recent row; order updates only when painting. Spectrum dragging never adds unused choices, and erasing/Undo removes colors no longer used in any frame. The existing bounded16-color document contract remains; a fully used palette refuses a new seventeenth painted color rather than recoloring old pixels, and unused slots may be safely reused. [Final desktop/mobile picker evidence](evidence/simple-color-selection.json) records saved strokes and zero unexpected changes to existing artwork.

A further real rendering/data defect was discovered: the declared16-color limit only encoded indices0–9. The version-1 row alphabet now consistently uses0123456789abcdef, preserving existing digit-only documents. Editor decode, asset palette lookup and nonblank checks all use the same alphabet. Round-trip/render regressions and the real database test verify color16 survives Save/equip/reopen. Final rapid-spectrum checks sent20 consecutive changes on desktop and mobile: recent colors and saved status stayed unchanged until painting; Save returned200 with zero existing-pixel changes.

## Rendering and persistence contract changes

A drawing retains its entire authored 32/40/48/64 grid, transparent border, palette indices and frame geometry. Native conversion uses scaleShare 1. Original selects that grid, including when an older drawing configuration lacks density. Built-in Sylf keeps its artwork and receives a presentation-only 0.9 framing share.

Chunky/Balanced/Detailed/Finest mean 32/40/48/64 logical cells. For deliberate resampling, destination-cell centers select source cells deterministically. Collapsed source intervals paint zero cells; forced minimum-one-cell overlap is gone. No display setting or zoom operation writes sampled pixels back to storage. Native and Detailed 48 match on a 48-grid drawing. Physical size/DPR only change presentation/backing size.

Every production surface uses the existing resolver, asset conversion, painter, React host and Canvas2D renderer through the shared explicit PixelCompanion presenter. Studio Artwork uses native density/current playhead. Studio Dashboard uses saved composition/density/current playhead, scaled into its available square. Customizer and comparison cards hold frame one and explain that animation plays on Dashboard. Equal owner/revision/frame/density/parts produce equal logical bytes across surfaces. Content identity includes geometry, palette, framing and timing; it is never ID-only.

User drawings expose stage ground only. Unsupported hand/neck/core equipment is hidden with compatibility feedback while ownership and bonuses persist. Effects remain within the drawing's occupied mask; Sylf pulse preserves authored eye ink. Diagnostic referenceWrites counts source writes, not surviving framebuffer pixels; old diagnostic aliases remain compatible.

PixelCreation gains positive revision metadata without changing document format version 1. New identities are UUID-based; existing user: slugs remain readable. Rename preserves identity; Save as copy creates another identity. Existing edits require expected revision; identical lost-response retries avoid duplicate writes/revisions. Deletion requires the reviewed revision, rejects stale versions and atomically falls back to Sylf/Detailed when equipped. Quota 24, save, selection and deletion serialize on the same owner row.

Save persists artwork and changed display styling; Save & equip then persists the owned selection. An equip failure says that artwork was saved and offers a safe retry. A newly selected drawing defaults to Original; an existing equipped drawing retains its chosen density. Blank documents remain editable/savable but cannot equip or replace equipped content with empty artwork. Pre-consolidation blank selections now resolve safely instead of producing an empty companion.

The owner-scoped subscribed library deduplicates reads, retains last-loaded artwork on refresh failure, invalidates mounted consumers, sends owner-only BroadcastChannel invalidations and refreshes on focus/visibility. All Pixel writes/reads use shared transport/cache boundaries. Generic local cache does not persist artwork. Recovery stores the full owner-keyed document, timing, selected frame, saved baseline and revision; logout/session epochs clear it without resurrection from delayed unmounts.

Auth customization patches merge into full stats. An additional confirmed race was fixed: an older in-flight stats response could roll back a successful Pixel Size/equip mutation. Generation/sequence guards reject stale reads and prevent restoring a previous owner after login/logout.

## Closure of the 30 audit findings

| Finding | Fix and verification |
| --- | --- |
| F01 stale same-ID previews | Immutable full content identity/revision. Live same-ID save changed the mounted second-tab dashboard hash from 1196981056 to 545697611; Studio/Customizer matched the new hash. |
| F02 native artwork distortion | scaleShare 1 and deterministic center sampling. Native fidelity/resampling regressions and all five live density comparisons pass without changing stored artwork/revision. |
| F03 untrustworthy Studio preview | Explicit Artwork/Dashboard contexts, real catalog resolution, saved density and shared selected playhead. Equal-context framebuffer parity verified. |
| F04 secondary Dashboard display | Companion hero approximately 278–300px desktop/258px phone; XP/HP remain textual supporting information. Production measurement: 278px, DPR1. |
| F05 tiny Customizer preview | Fluid square stage. Equal physical comparison thumbnails remain 96px and avoid inherited full-width expansion. |
| F06 fake forms/no drawing selection | One Sylf card plus real owned nonblank drawings, selected state, Edit/Create. Fake anime choices and placeholder promises removed. Old keys are read aliases. |
| F07 stale mounted/two-tab artwork | Shared subscribed library, mutation epochs and BroadcastChannel/focus invalidation. Mounted second-tab update verified without reload. |
| F08 blank/invalid equipped references | Owned saved nonblank selection validation, useful loading/error/fallback state; legacy blank safe fallback. API invalid/missing/unowned selection checks and DB coverage. |
| F09 unsafe accessories/effects | Stage-only ground anchor, compatible attachments, occupied-mask effects, visible degradation feedback; ink/effect regressions. |
| F10 fast Draw/Erase gaps | Coalesced samples plus complete interpolated cell segments. Sparse mouse and actual CDP touch strokes/erase tested. |
| F11 inconsistent Mirror | Draw/Erase/Fill and cursor share semantics; overlapping mirrored seeds deduplicate. Live symmetric draw/erase and model coverage. |
| F12 distortion/cursor drift | Nonshrinking square stage, Fit from available width, percentage cursor from actual bounds, deliberate pan. All 35 pre-expansion viewport/zoom combinations square with no document overflow; the expanded layout and final picker were checked at desktop and real mobile/touch sizes. |
| F13 confusing onion residue | Cyan previous/pink next guides, local explanation, current frame drawn last. Ghosts never serialize; disabling Onion removes guide pixels. |
| F14 wrong new-frame selection | Add/Copy insert after selection and select the inserted frame; reorder preserves the chosen frame. Live/model checks. |
| F15 independent/incorrect playback | One editor playhead drives editor and preview; Once finishes/replays, Repeat loops and Pause holds. Live/browser and engine regressions. |
| F16 reduced-motion autoplay | Automatic animation freezes on frame one and schedules no automatic frames; explicit editor Play remains available. Live zero frames over 1100ms. |
| F17 fragmented history/shortcuts/limits | Full-document bounded history grouped by gesture/field; tool/Undo/Redo/Space shortcuts scoped to workspace/text/dialog focus; final-frame Delete disabled; 60–2000ms supported. Digit-by-digit duration commits on blur/Enter. |
| F18 secondary/multiple-pointer edits | Primary-button guard, one active pointer, capture/lost-capture cleanup. Right-click leaves art unchanged; touch ownership checks. |
| F19 fragmented Studio | Unified header/workbench/tools/palette/Fit/grid/horizontal timeline/compact inspector; library/new-grid dialogs; responsive composition. |
| F20 lost unsaved drafts | Owner recovery, debounced/unmount flush, recovery prompt and explicit replacement/leave confirmation. Reload/navigation/touch recovery and logout cleanup tested. |
| F21 name-based identity loss | Stable ID and revision separate from name; Unicode rename, equal names and copy/retry no longer collide by name. Real DB and browser checks. |
| F22 fragmented equip | Save and Save & equip finish their complete operations with success/failure state. Customizer Apply is immediate; no hidden parent save requirement. |
| F23 duplicate submissions | Immediate operation lock plus disabled busy controls and idempotent server retry. Two dispatched Save clicks produced one POST. |
| F24 silent failures | Loading/empty/error distinguished; retained artwork/draft, Retry, explicit saved-but-equip-failed feedback. 503 boundary injection and subsequent real 200 retries. |
| F25 destroyed HUD stats | Partial Auth merge preserves HP/currency/appearance; stale read guards protect later mutations. QA HP85 retained and red-before/green-after Auth regressions. |
| F26 unsafe deletion/quota/concurrency | Confirmed reviewed-revision deletion, owner-locked transactions, active-reference repair and optimistic conflicts. Eight disposable real PostgreSQL tests pass. |
| F27 duplicate systems/navigation | One Companion Hub; route query identifies subview/creation; browser history and legacy bookmark alias; direct Customize/Edit links without nested card actions. |
| F28 custom-color contrast | Semantic foreground/accent-foreground/surface tokens, including the shared Locker navigation. Light/yellow/mint and dark/custom appearance visually checked with preserved stats. |
| F29 dirty/draft resets | Normalize drawn fields/legacy aliases; reconcile relevant saved config while retaining unapplied edits. Hub/Customizer agree and Auth refresh does not reset local choices. |
| F30 mobile transport/logout ownership | Shared API transport and session-scoped subscribed store; owner/logout epochs; real built mobile flow with mocks disabled and no bundled server symbols/secrets. |

## UI and interaction evidence

Desktop QA covered 1440×1000, 1024 and 820 widths. Phone checks used 390×844 and 320 width, plus 844×390 landscape and 390×500 keyboard-height simulation. The pre-expansion 35-case Fit/4×/6×/8×/12× sweep retained square canvas geometry, visible square previews and zero document overflow. An inspector min-content track that hid 19px of preview was fixed; the phone Studio header now starts below the 56px app bar. Desktop Customizer actions now stay in document flow so they cannot cover the Finest label; phone actions remain reachable at the bottom. Shared Locker tabs use safe accent text/surface tokens instead of pale glowing text on a fixed dark bar.

Actual touch used Chrome CDP with DPR3, isMobile, maxTouchPoints1. The real production mobile bundle, with mocks false, served on a local QA host against the real API. The latest sparse touch stroke from x4 to x24 followed by Erase x12–17 left the exact expected 15-cell row. Save/equip/Apply all returned 200; authored grid remained 48 and Dashboard used Balanced40. Touch Fit/zoom/pan, Fill/Pick, history, animation and recovery were also exercised during the broader run. This is browser/device emulation, not a physical Capacitor device.

The full Dashboard → Hub → Customizer → Studio → draw/erase/animate → Save → Save & equip → all Pixel Sizes → Dashboard flow passed. A real optimized Next production run returned 200 for stats/save/equip/Apply with no page errors, correct owner/art/density and no overflow. Production dev Pixel routes and progression endpoint return 404; measurement probes are absent.

Failures were deliberately injected at the QA browser network boundary and removed afterwards: delayed/duplicate Save, list failure, Save503, equip503 after saved artwork, retained Unicode draft and real retries. Stale revision409, missing/unowned reference400, blank equip refusal and active deletion fallback were verified. Missing DELETE revision now returns400. QA logout returned to login, removed recovery keys and subsequent creation API access returned401.

Animation testing includes Add/Copy/selection/reorder/delete, timing, Onion, Once finish/Replay, Repeat, Pause and explicit Play under reduced motion. Automatic Repeat rendered four frames over 1100ms; offscreen content rendered zero over 700ms, then resumed; reduced motion rendered zero over 1100ms. A late typing check reproduced1200 → 2000, was captured red in a regression test, and now saves1200 correctly and undoes to 240 in one step.

## Legacy migration, ownership and landing boundary

Migrated every old renderer consumer: own Social card, friend rows/request cards, public profile, party Invite/Lobby/MemberStage/Room, Shop try-on, Items preview and Dashboard Design. Collection now names Sylf/current drawing/Pixel Size truthfully; Archive preserves earned historical records without promising retired forms.

Authorized owners resolve selected companion descriptors on the server after existing profile/friend/party authorization, including current privacy and bilateral blocks. Reads are batched across target owner IDs; one selected creation is returned, never a private library. Config is scalar-whitelisted; small thumbnails receive frame one, full permitted profiles receive bounded animation. The pure target presenter has no viewer Auth/library/reaction dependency.

Live QA used distinct owners 1147/1148 with unmistakably different white/green artwork; their libraries include the same legacy slug, and the disposable DB checks also equip equal slugs for two owners. The authorized target profile and party room showed target 1148 green content and viewer 1147 white content. Private profile delivery withheld artwork; permitted party membership retained access; bilateral block behavior was tested on disposable PostgreSQL because live blocking would sever the QA friendship. Friend/request/Invite/Lobby integration is covered by owner-descriptor and migrated component regressions in addition to shared presenter/source checks.

Removed CharacterRenderer, CharacterStudioView, old form arrays/URL/layer/randomization helpers and two dead canary scripts. Removed 16 obsolete anime PNGs plus the unused test hunter base: **380,914 bytes**. Four tier form PNGs remain as owned inventory product icons; pedestals, relics, consumables, rewards/unlocks, profile photos/banners/frames/titles/name colors and persisted config fields remain intact. Legacy form keys map safely to Sylf as read compatibility aliases; they are not visible catalog options.

Searches find zero obsolete renderer/Studio/helper symbols or “Character Studio” UI copy in live app/lib/mobile source, scripts and tests. The lower-case character-studio bookmark alias is deliberately retained. Historical documentation references are preserved.

[Landing preservation](evidence/landing-preservation.json) confirms **53 protected files** match their pre-task SHA256 inventory, **14 additional SVG/preview/pipeline source dependencies** match the baseline, and original-rig.webp matches its unchanged tracked blob. Landing SVG/raster variants, lib/sylvs, its workbench and vectorization pipeline remain intact.

## Database changes

[Migration 20261007000000](../../../../prisma/migrations/20261007000000_pixel_companion_consolidation/migration.sql) adds revision default1/positive constraint, enables PixelCreation RLS, installs JWT owner USING/WITH CHECK and keeps anon/authenticated direct grants revoked. Protected cookie APIs still enforce ownership. Existing rows are retained. Prisma was generated; SCHEMA_BUILD_VERSION is29.

The additive migration was tested unchanged against a disposable PostgreSQL17 baseline and then applied only to the configured development DB, with its migration ledger resolved. No unrelated pending migrations were applied. Deployments still need to run the migration before the new server code; this task did not deploy production.

Real DB coverage: stable rename/idempotence; equal owner-scoped slugs and unowned equip; reviewed-revision deletion/fallback;25 concurrent quota requests accepting 24; two stale writers accepting one; RLS isolation under a temporary external grant/anonymous denial; target privacy/block delivery; legacy blank safety. Eight test cases cover these scenarios, including saving and equipping an all-16th-color document.

## DeepSeek decisions and meaningful clarifications

| Recommendation | Disposition |
| --- | --- |
| B1–B7 prior fixes | Preserved and rechecked through existing suites. |
| R1 auto-blink | Remains disabled in production; no timer polling added. |
| R2 composition fill | Included for Sylf presentation only; native user grids remain unchanged. |
| R3 anchors | Included as stage-relative ground and explicit compatibility; no invented anatomy. |
| R4 degradation | Included in Customizer/Hub/equipment preview loading/fallback feedback. |
| R5 serialization | Included with immutable full identity, never ID-only cache keys. |
| R6 per-plane clipping | Deferred: no migrated consumer needs mixed clipped/unclipped planes. |
| R7 own drawing selection | Included as real owned gallery, selected/equipped state and Edit. |
| R8 reduced motion | Included; automatic freeze and intentional editor playback distinguished. |
| R9 eye ink | Included as an existing-art readability regression. |
| R10 RLS | Included additive migration plus real role/policy tests. |
| R11 dead helpers | Removed within migration scope, with landing dependencies preserved. |
| R12 long-delta architecture | Deferred; existing bounded timing/suspension retained and resume tested. |
| R13 backdrop | OLED black consistently documented and used. |

Studio Dashboard preview represents the exact logical composition/density/playhead at its available physical size, rather than falsely promising a fixed dashboard pixel size. Customizer is deliberately frame-one static so density comparisons cannot disagree because independent animations chose different frames. No layers, drag timeline, resize conversion, marketplace/sharing, procedural content, anatomy editor or new character artwork were added.

## Verification and limits

| Gate | Result |
| --- | --- |
| Required Pixel/Dashboard/three migrated Focus Party suites | **529 passed, 8 skipped** in ordinary run across 27 files. DB suite's eight cases executed separately against real disposable PostgreSQL. Final selector/recent-color adjustment:11 focused regressions passed. |
| Disposable PostgreSQL/RLS | **8 passed**; migration/quota/revision/owner/privacy/block/delete/blank checks. |
| Next route typegen / strict TypeScript / engine typecheck | Passed. |
| Changed-file ESLint |74 files run:46 errors/43 warnings versus50 baseline errors; **zero added error counts** by file/rule. Remaining inherited any/hooks issues mean this is not a clean lint gate. |
| Web production build | Passed using isolated build directory; optimized server browser flow passed. |
| Mobile build/verify | Passed; mocks fail closed, no server-only symbols/secrets. Built-client real-touch flow passed. |
| Diff/document links/obsolete symbol and asset checks | Passed; landing preserved. |

Two broader optional suites retain pre-existing failures. The mobile settings-navigation harness expects obsolete headings and omits LevelUpProvider; the same two failures/unhandled harness error reproduce on preserved pre-task source. A broad Focus Background DB suite failed four remote integration cases with restricted Supabase DNS. These are distinct from the required passing Pixel/party regressions and disposable RLS checks; no unrelated app/test rewrites were made to hide them.

Performance: on the real 1440px/DPR1 native48 card,300 synchronous runtime/Canvas2D ticks measured p50≈0.10ms,p95≈0.40ms,max1.50ms. This excludes browser layout/GPU composition and is not a forced full-dirty benchmark. Static idle produced zero frames over 1500ms. Social thumbnails hold static frames; selected-art reads/payloads are bounded and no full artwork serialization runs on unrelated React renders.

Physical Android/iOS/Capacitor execution and production deployment were not performed. The native API/CORS configuration remains unchanged; mobile browser QA uses the real shared transport through a local same-origin API proxy. R6/R12 and advanced authoring systems remain deliberately outside this phase. The existing unrelated dirty planner/generated working-tree work was preserved.

