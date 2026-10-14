# System Hub documentation

This area covers **Collection, Achievements, and Archive**. Current entry points are [Collection](../../app/settings/collection/), [Achievements](../../app/settings/achievements/), [Archive](../../app/settings/archive/), [collection logic](../../lib/system-collection.ts), [achievement catalog](../../lib/achievements-catalog.ts), [archive catalog](../../lib/archive-catalog.ts), and [achievement API](../../app/api/achievements/route.ts).

The [1 October refresh audit](reports/2026-10-01/system-hub-audit-2026-10-01.md) is a historical implementation/audit report. It records retired content, reward changes, coverage, and its test/build results; it is not a standalone current feature specification. No separately associated evidence files were found for this report.

The `/system` conversation/Planner workspace is a distinct source area: [Sylvie screen](../../app/system/components/SystemScreen.tsx) and [Planner documentation](../planner/README.md).

The AI companion is **Sylvie**. The sidebar, conversation headers and authors, quick assistant, focus tool, planner guidance, and AI persona prompts use that name. Its shared [crescent-and-sparkle icon](../../app/components/icons/SylvieIcon.tsx) replaces the old AI aperture. The app remains Sylf; progression, currency, System Hub, API routes, and stored message role identifiers keep their existing meaning.
