# System Hub documentation

This area covers the **System Hub**, including Main, Appearance, Collection, Achievements, and Archive.

## Main

- [Stats](../../app/settings/stats/components/StatsSettingsScreen.tsx) presents study rhythm, subject allocation, objectives, recent sessions, level progression, and expandable cognitive investments. The activity chart supports 7- and 30-day views and keyboard, pointer, and touch inspection. Daily activity uses the API's user-local calendar dates; session timestamps use the account timezone. The chart covers 30 days, recent sessions and subject summaries cover 35 days, and lifetime focus is labeled separately.
- [Rankings](../../app/settings/rankings/components/RankingsSettingsScreen.tsx) combines personal standing with the global or friends ladder. Level, focus hours, weekly streak, and quest ordering still use the existing API. Friends standing uses `friendRank`; the global ladder shows up to 50 entries while retaining personal standing outside that list. Loading and failed requests cannot display a previous sort's scores. Unranked accounts have no invented percentile.
- [Modes](../../app/settings/modes/components/ModesSettingsScreen.tsx) retains all seven study modes and their timer setting keys, defaults, and ranges. Browsing a mode does not activate it. Configuration edits save automatically to the existing device-local `study_mode_config`; activation selects the mode for the next Focus session. The chooser sits beside settings on desktop and scrolls horizontally above settings on smaller screens. Failed storage writes are reported without claiming a successful save.

These screens share [Main Hub navigation and controls](../../app/settings/components/MainHubLayout.tsx), with page-specific CSS Modules and existing appearance tokens. Appearance-category screens and their shared stylesheet are separate and unchanged by the Main redesign. The [16 October redesign report](reports/main-redesign/report.md) includes verification, screenshot evidence, and known unrelated test failures.

## Appearance category

- [Appearance](../../app/settings/appearance/components/AppearanceSettingsScreen.tsx) is a color studio with visual mode choices, preset and recent colors, hex entry, optional keyboard-accessible HSV controls, and a live schematic preview. Draft changes stay inside the preview until applied. Existing local preferences, legacy preset resolution, cross-tab events, global contrast tokens, and the cosmetics API remain the persistence/application owners. Failed account synchronization is identified separately from a successful device-local save and can be retried.
- [Backdrops](../../app/settings/focus-backgrounds/components/FocusBackgroundsSettingsScreen.tsx) replaces the **Focus Environments** display name. The existing `/settings/focus-backgrounds` route and preference contracts are unchanged. Browsing previews an image before explicit activation. Discover shows the official catalog; Your library retains private uploads, naming, focal-point editing, timer style/placement, quota, and deletion. The existing [focus background hook](../../app/focus/hooks/useFocusBackground.ts) owns loading, selection, signed URLs, and synchronization. Its library response now also exposes the existing API quota and load error to this screen. Timer previews reuse the inert layout adapter and never start a session.
- Calendar remains outside this phase. Its existing page and the three Main pages are unchanged.

These screens use [Appearance Hub navigation](../../app/settings/components/AppearanceHubLayout.tsx), the existing Main control tokens, and native modal dialogs with focus restoration. Backdrops is also the label in System Hub, Collection, and the timer picker. The [17 October implementation report](reports/appearance-backdrops/report.md) records responsive, appearance, interaction, and build verification.

## Collection, Achievements, and Archive

Current entry points are [Collection](../../app/settings/collection/), [Achievements](../../app/settings/achievements/), [Archive](../../app/settings/archive/), [collection logic](../../lib/system-collection.ts), [achievement catalog](../../lib/achievements-catalog.ts), [archive catalog](../../lib/archive-catalog.ts), and [achievement API](../../app/api/achievements/route.ts).

The [1 October refresh audit](reports/2026-10-01/system-hub-audit-2026-10-01.md) is a historical implementation/audit report. It records retired content, reward changes, coverage, and its test/build results; it is not a standalone current feature specification. No separately associated evidence files were found for this report.

The `/system` conversation/Planner workspace is a distinct source area: [Sylvie screen](../../app/system/components/SystemScreen.tsx) and [Planner documentation](../planner/README.md).
Its conversational runtime, selective Archive retrieval and confirmation/Planner boundaries are described in the [Sylvie contract](../sylvie/README.md).

The AI companion is **Sylvie**. The sidebar, conversation headers and authors, quick assistant, focus tool, planner guidance, and AI persona prompts use that name. Its shared [crescent-and-sparkle icon](../../app/components/icons/SylvieIcon.tsx) replaces the old AI aperture. The app remains Sylf; progression, currency, System Hub, API routes, and stored message role identifiers keep their existing meaning.
