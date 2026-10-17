# System Hub Main redesign

16 October 2026

## Delivered

Stats, Rankings, and Modes have new purpose-specific layouts, shared direct navigation, quieter typography, restrained accent treatments, and responsive controls. No Appearance-category pages, global appearance code, backend APIs, database schema, or timer engine were changed.

Stats leads with recent focus and a comparison of the last seven calendar days against the preceding seven. A 7/30-day chart supports pointer, touch, and arrow/Home/End keyboard inspection. Lifetime totals, recent session statistics, weekly streak, subject allocation, quest/goal progress, paged session history, and XP remain available. Cognitive investments are disclosed on demand and retain the existing GET/POST endpoints, costs, currencies, caps, and perk descriptions. Successful investment refreshes shared balances and invalidates related client caches. Session durations preserve seconds; session timestamps use the account timezone. The different API reporting windows are explicitly labeled.

Rankings places personal standing alongside a quieter ladder, preserving all four server orderings and both scopes. Friends use their local position consistently; personal standing remains visible outside the global top 50. Empty friends lists, a circle containing only the current scholar, unranked accounts, loading, retries, and rapidly changed sort requests have explicit behavior. Hunter rank remains available on mobile below the scholar name. Decorative rings are hidden at widths of 900px and below, resolving the reported overlap with percentile and level. The sort control also fits at 320px and the compact study action occupies its own row.

Modes separates browsing from activation. All seven modes retain their setting keys and defaults consumed by FocusScreen. A live rhythm preview explains focus/recovery durations, planned rounds, and Pomodoro's long break. Settings remain device-local and automatically saved; activation applies to the next focus session. Storage failures are visible, malformed settings fall back safely, and the compact chooser scrolls horizontally to keep configuration nearby. Switches, sliders, and selected choices have accessible names and states. Motion is limited to control feedback and respects reduced-motion preferences.

## Verification

| Check | Result |
| --- | --- |
| New Main screen regressions, existing Hub navigation, timer mode transitions | 22 tests passed across 3 files |
| Existing mobile Modes route test | 1 passed; 17 unrelated cases excluded in the focused run |
| TypeScript | `npx tsc --noEmit` passed |
| ESLint on implementation and new tests | Passed |
| Production build | Passed, including TypeScript and static generation |
| Mobile build and bundle verification | Passed with mocks disabled; no server-only symbols or secrets |
| Browser checks | 45 passed; [structured results](evidence/browser-results.json) |

Browser verification covered 1440, 1024, 390, and 320px layouts; compact Rankings geometry was additionally checked at 768px. Every page was rendered in dark and light appearances, with mint on a dark canvas, a gold accent and dark teal canvas while light mode was selected, and a green accent and pale canvas while dark mode was selected. Screenshot inspection covered layout, wrapping, clipping, chart detail, and custom color polarity. Compact Rankings checks confirmed the decoration is hidden and the sort control stays within the viewport at 320, 390, and 768px.

Interactions covered persistent mode edits and activation, reload recovery, Free Flow and Flowtime controls, weekly ranking units and friends scope, session expansion, cognitive investment requests, 7-day chart switching, loading/empty/error screens, retries, direct Main navigation, and returning to the System Hub overlay. Existing authenticated local data was inspected read-only. Populated screenshots and simulated investment/error states use isolated browser fixtures from [the QA harness](evidence/browser-qa.mjs). They are never imported by the application; all API requests in that context are intercepted, with zero API writes sent to the server.

The first sandboxed production build stalled; it was stopped. The production build completed successfully with local process access. Generated mobile output was verified, then restored to its initial state to keep generated bundles out of this source change.

## Existing broader-suite failures

The broader run produced four failures in `__tests__/economy/cognitive-stats.test.ts`: its transaction mock lacks `$queryRaw`, now used by the unchanged execution coordinator. The full mobile settings-navigation suite also failed its Account case and emitted a missing LevelUpProvider error from a dashboard redirect. The affected backend, account, and dashboard owners are unchanged. These were not repaired as part of the Main UI scope. The focused mobile Modes case passes. The existing mobile test file also has an unrelated unused `MOCK_STUDENT_USER` lint warning.

## Representative evidence

- Stats: [desktop dark](evidence/stats-desktop-dark.png), [desktop light](evidence/stats-light.png), [mobile](evidence/stats-mobile-dark.png), [empty](evidence/stats-mobile-empty.png), [attributes](evidence/stats-mobile-attributes.png).
- Rankings: [desktop](evidence/rankings-desktop-dark.png), [mobile](evidence/rankings-mobile-dark.png), [320px](evidence/rankings-small-mobile-dark.png), [friends](evidence/rankings-mobile-friends.png), [reported overlap fixed](evidence/rankings-mobile-overlap-fixed.png).
- Modes: [desktop](evidence/modes-desktop-dark.png), [mobile](evidence/modes-mobile-dark.png), [Sprint](evidence/modes-mobile-sprint.png), [Free Flow](evidence/modes-mobile-freeflow.png), [Flowtime](evidence/modes-mobile-flowtime.png).
- Opposite-polarity custom backgrounds: [dark canvas in light mode](evidence/modes-custom-dark-in-light.png), [light canvas in dark mode](evidence/rankings-custom-light-in-dark.png).
