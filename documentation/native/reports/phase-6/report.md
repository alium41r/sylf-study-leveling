# Sylf Native — Phase 6 report: Home Interface Template

**30 October 2026. Status: complete, awaiting approval.** Decisions are in [ADR 0005](../../decisions/0005-home-interface-template.md), the contract is the [Home guide](../../home/README.md), and the entry point for the next session is the [Phase 6 handoff](../../handoffs/phase-6.md). The code is in [`native/apps/sylf/src/spaces/home`](../../../../native/apps/sylf/src/spaces/home/) and [`native/packages/spaces/src/home.ts`](../../../../native/packages/spaces/src/home.ts).

## Summary

| Deliverable | Result |
| --- | --- |
| Rail with four destinations | Built. A left rail under the Spaces icon, and a bottom bar under 600 pt |
| Today, Focus, Circle, Progress | Built as templates, each with loading, empty and sample states |
| Theme integration | All six themes in both modes, on Electron and the tablet, plus custom colors. No theme branching |
| Local navigation state | Destination and per-destination scroll survive Space changes, reloads and process kills |
| Typed mock adapters | Built. Each result carries `provenance`, and a build without development tools cannot show sample content |
| Backend compatibility (added during the phase) | Every Home feature mapped to an existing owner. Three things in the template changed as a result ([Home guide §4](../../home/README.md#4-backend-compatibility)) |
| Memory | Destination changes add nothing. Home re-entry levels off. **R15 itself stays open.** See §5 |
| Accessibility | Audit and tree checks pass. **TalkBack was not run** |
| Regression | Phase 3, 4 and 5 checks pass on the final code |
| iOS and iPadOS, Windows | **Not run** |
| Web app, backend, database | Unchanged. Nothing is committed |

## 1. What was built

```
native/packages/spaces/src/home.ts      destinations, snapshot, createHomeNavigation, rail keys (no React)
native/apps/sylf/src/spaces/home/
├── HomeSpace.tsx                       rail plus destination layers
├── HomeRail.tsx                        one element: column or bottom bar
├── HomePage.tsx                        strip, scroller, restoration, columns, sections
├── format.ts                           greeting, durations, day summary
├── data/                               contracts, sample and empty adapters, binding
└── destinations/                       Today, Focus, Circle, Progress
native/apps/desktop/src/home-check.mjs  Electron check
native/tooling/checks/android-home-check.mjs   tablet check
```

Other changes: `TravellingMarker` gained `axis="y"`. `ListRow` details and `Readout` labels and units moved from `faint` to `soft`. `android-memory-check` gained `destinations`, `homeEntry` and `homeThemeDestinations` sweeps, `--wait` and `--budget-native`. App links gained `home` and `homeData`. The Phase 5 checks now look for the Spaces tab list by test id, because Home has a tab list too.

**Owner direction during the phase.** Sylf Native is a redesigned frontend over the existing backend. This is recorded as Confirmed in [master plan §7.3](../../master-plan.md#73-scope-boundaries) and applies to all later phases.

## 2. Unit and static checks (`native/`)

| Check | Result |
| --- | --- |
| `npm run verify` | Pass: typecheck, lint, boundaries, single-copy, web build |
| `npm run test` | Pass: 110 tests in 10 files (Phase 5: 80 in 8) |

Root web checks were not run, because no root file was edited.

## 3. Electron on macOS (Electron 45.1.0, Chromium 156)

| Check | Result |
| --- | --- |
| Home check | **71/71** ([results](evidence/electron/electron-home-check.json)) |
| Spaces check (regression) | **52/52** ([results](evidence/electron/electron-spaces-check.json)) |
| Design check (regression) | **19/19**. Marker p95 17.3 ms, theme switch 48 to 57 ms |
| Security self-test | **11/11** |

The Home check covers: first launch, mouse, keyboard-only use, focus order, disabled actions, the Spaces bar over the rail, restoration across a Space change and a reload, migration of a Phase 5 record, a corrupt record, quick actions, six window sizes down to 340 pt, a live resize across the compact line, a 260 pt window where labels drop, hover tooltips, every theme in both modes, two hard custom color pairs, empty and loading states, reduced motion, and an accessibility audit.

| Measure | Value |
| --- | --- |
| Click to a destination being visible | Median 25 ms |
| Frames during rail changes | p50 16.7 ms, p95 18.0 ms, max 18.6 ms (60 Hz) |
| Space switch (regression) | Median about 22 ms. The first switch to World took 238 ms |
| Retention, 96 destination changes after a forced GC | DOM nodes flat at 772, heap +0.2 MB |
| Retention, 12 Home re-entries after a forced GC | DOM nodes flat at 772, heap +0.2 MB |
| Working set | 406 MB after the full run |

## 4. Android on Galaxy Tab S9 FE (SM-X510, Android 16, font scale 1.15)

| Check | Result |
| --- | --- |
| Home check, landscape | **40/40** with real taps, swipes and Back, including all 48 theme renders ([results](evidence/android/android-home-check.json)) |
| Home check, portrait | **40/40** without the theme sweep, on the final build ([results](evidence/android/android-home-check-portrait.json)) |
| Spaces check (regression) | **34/34** |
| Interaction check (regression) | **9/9** |
| Design check (regression) | Pass: 12 themes rendered, 0 crashes |
| Smoke | Cold start 246 ms median, 101 MB, APK 30.3 MiB |
| Pop-up window, live resize | 1029, 743, 486 and 349 pt wide in landscape, and 777, 663, 469 and 331 pt in portrait: rail inside, bottom bar when compact, nothing remounted |
| Hardware keys | Sent by `adb input keyevent`, not a real keyboard: Tab and D-pad moved focus, the focus ring showed, Enter selected |

| Frames | Result |
| --- | --- |
| Rail changes (24, clean of accessibility dumps) | 1233 frames, 0.73% janky. p50 8 ms, p90 9 ms, p99 13 ms |
| Page scrolling in a pop-up window | Landscape: 618 frames, 3.72% janky, p50 14 ms, p90 24 ms, p99 34 ms. Portrait: 720 frames, 2.64% janky, p50 13 ms, p90 24 ms, p99 34 ms |
| Showcase scrolling (design check) | 708 frames, 0.14% janky |

**Scrolling needs a look.** Home's scrolling is measurably worse than the Showcase's, but it was measured in a resized pop-up window, so the comparison may not be fair. One full-screen attempt in portrait recorded 0 frames, because Today fits that screen and nothing scrolled, so no full-screen figure exists. The cause is not established, and how it feels is for the owner to judge.

First mount of each destination took 7 to 19 ms on the tablet. Each mounted once and never again.

## 5. Memory

All figures are PSS in MB on the tablet. "Native" is native heap.

**Keeping pages mounted works.** 240 destination changes, from launch:

| Point | Keep mounted (final): total / native | Remount each page (temporary build): total / native |
| --- | --- | --- |
| Launch | 120 / 33 | 122 / 35 |
| After 60 changes, rest | 158 / 56 | 198 / 87 |
| After 120, rest | 156 / 55 | 197 / 82 |
| After 180, rest | 154 / 55 | 173 / 73 |
| Idle, then trim | 156, then 155 / 55 | 174, then 173 / 77 |

Keeping pages mounted costs about 22 MB of native heap and then stays flat: 56 to 55 MB. Remounting cost more and was less steady, peaking near 94 MB. **It did not grow without limit in this run,** so the case for keeping pages mounted is lower and steadier memory, not avoiding a runaway.

**Leaving and re-entering Home levels off.** Each cycle visits Workspace, returns to Home and visits all four destinations.

| Point | 48 cycles: native | 120 cycles: total / native |
| --- | --- | --- |
| Launch | 33 | 117 / 32 |
| Early | 68 after 1, 100 after 5 | 108 native after 11 |
| Rests | 110, 114, 108 | 220 / 104, 209 / 104, 200 / 101 |
| Idle, then trim | 102, 102 | 202 / 103, 201 / 103 |

Native heap climbs by about 70 MB over the first 10 or so cycles and then holds. Across about 110 further cycles it stayed between 102 and 110 MB. Graphics stayed at 24 MB.

**Themes.** 72 renders per sweep, three sweeps: native 88.5 to 89.2 MB at rest. No growth from theme changes.

### What this means for R15

**Risk R15 stays open.** Phase 5 saw a straight line per Space switch, and these runs level off instead. The reason is not established. Phase 5 rule 6 also warns that a high peak can hide a small leak, because new allocations reuse free memory, so this is not proof that nothing leaks. What it does show is that ordinary use of Home does not grow without limit in 120 re-entries. The climb itself, about 70 MB, is still more than the placeholders suggested, and **Home costs more memory than a plain page while open** (about 155 MB against about 100 MB at launch). **A bare-app reproduction was not done** and remains due before Phase 8.

**Regression use:** `npm run android:memory-check -- --sweep=destinations --cycles=60 --rest-every=15 --wait=350 --budget-native=5`, and `--sweep=homeEntry --cycles=48 --rest-every=12 --wait=500 --budget-native=10`. Evidence is in [`evidence/memory/`](evidence/memory/).

## 6. Accessibility

| Check | Result |
| --- | --- |
| Named controls | 0 unnamed on Electron and in the tablet's accessibility tree |
| Rendered text contrast (Signature, dark) | Lowest 4.61:1 |
| Headings | One level 1 per page, level 2 below it |
| Touch targets | Rail items 68 × 59 pt |
| Keyboard | Spaces icon, rail, page. Hidden pages never take focus |
| Hidden pages | Gone from the accessibility tree on the tablet, and from the tab order on Electron |
| Reduced motion | Destinations change with no travel |
| Selection | Marker position, icon mark and label ink, so never color alone |
| Screen readers | **TalkBack and VoiceOver not run.** Tree audit only |

The contrast audit was run on Signature in dark mode only. The palette solver's guarantees cover the rest, but other themes were not measured by this audit.

## 7. Defects that verification found

| Where found | Defect | Resolution |
| --- | --- | --- |
| Audit | `ListRow` and `Readout` small text at 4.46:1 | Moved to `soft` in the design system |
| Review | Timeline nodes became large squares in Student and Studio, because line-shaped Markers are wide | Fixed size |
| Review | Strip out of line with the page, chart labels off-center, Begin and Invite not centered | Fixed |
| Backend check | Template implied a friend's subject, scheduled parties and a server summary | Changed ([Home guide §4](../../home/README.md#4-backend-compatibility)) |
| Code review | Phase 5's scroll timer dropped the last position if Home left within 160 ms | Written on leaving |
| Harness | Saved state planted in a running page was overwritten at unload | Planted from an empty page |
| Harness | Portrait window sizes used in landscape, and no pixel tolerance | Fixed |
| Harness | Scroll frames measured where the page barely scrolls (22 frames, invalid) | Moved to a tall window |

## 8. Limitations and untested behavior

- **iOS and iPadOS: not built or run.** **Windows: not run.**
- **R15:** open, and no bare-app reproduction (§5).
- **Scrolling jank:** not explained, and not measured full screen (§4).
- **TalkBack not run.** S Pen, a real keyboard and a mouse on the tablet were not exercised. Key events came from `adb`.
- **Split-screen was not re-run.** Only pop-up windows.
- **Tablet theme captures are landscape only.** The portrait run skipped them.
- **Android More contrast and other font scales:** not tested.
- **Rotation during a destination change:** not tested.
- **Error states are not built** (Phase 13). Today's date and greeting are computed when Home mounts, so they can go stale past midnight.
- **Sample data is invented,** and is shown only with development tools on.
- **Security warnings on the tablet.** Avast One flagged the test build as "Suspicious app" (Detection ID 5c17dc0e62da), and Google Play Protect asked to send it for a check. The owner handled both and chose not to send it. The APK uses Android's public debug key and carries the template's `SYSTEM_ALERT_WINDOW` permission, which are plausible triggers, not confirmed ones. **A real signing key and removing that permission belong to the release work.** Later builds may raise the same dialogs and block automated runs.
- **Performance figures** are single-device measurements. The tablet's battery fell from 41% to about 20% over the runs, and USB was not charging it.

## 9. Reproducing

From `native/`: `npm run verify`; `npm run desktop:self-test`; `SYLF_DESIGN_CHECK_OUT=<dir> npm run desktop:design-check`; `SYLF_SPACES_CHECK_OUT=<dir> npm run desktop:spaces-check`; `SYLF_HOME_CHECK_OUT=<dir> npm run desktop:home-check`; then with the tablet connected and no security dialog on screen, `npm run android:build`, `npm run android:smoke`, `npm run android:home-check -- --out=<dir>`, `npm run android:spaces-check -- --out=<dir>`, `npm run android:interaction-check -- --out=<file>`, `npm run android:design-check -- --out=<dir>`, and the memory sweeps in §5.

## 10. Handoff

See the [Phase 6 handoff](../../handoffs/phase-6.md). **Phase 6 stops here. Phase 7 needs the owner's approval.**
