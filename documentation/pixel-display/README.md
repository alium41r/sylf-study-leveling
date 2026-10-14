# Pixel Companion / Pixel Display

**Current status:** the Pixel system is the sole in-app companion presentation.
Dashboard, Studio Hub, Customizer, Pixel Studio, profiles, friends, Focus Parties,
Shop, Items and Collection use the shared Pixel presenter. Users supply all character artwork; built-in Pixel characters and raster
previews are retired. Empty displays invite creation or show a neutral placeholder.
The separate landing SVG illustration remains.

Start with the [current contract](pixel-display-contract.md) and
[authoring guide](authoring-guide.md). The [consolidation implementation report](reports/phase-2-consolidation/report.md)
records fixes, database protections, browser evidence and verification limits.
The [approved audit](reports/phase-2-consolidation-audit/report.md) is the design input;
its findings describe the pre-consolidation application.

## Current owners

| Concern | Owner |
| --- | --- |
| Logical geometry, framebuffer, scheduling | [engine](../../lib/pixel-display/engine/) |
| Canvas presentation and DPR | [renderers](../../lib/pixel-display/renderers/) |
| React lifecycle/visibility | [React host](../../lib/pixel-display/react/) |
| Native creation conversion and sampling | [asset](../../lib/pixel-display/content/asset/) |
| Immutable content identity/animation/effects | [Sylf content](../../lib/pixel-display/content/sylf/character.ts) |
| Explicit reusable presentation | [PixelCompanion](../../app/components/companion/PixelCompanion.tsx) |
| Own progression reactions | [dashboard adapter](../../app/dashboard/pixel-companion-adapter.ts) |
| Compatibility/canonical catalog | [resolver](../../app/dashboard/pixel-modular-character.ts), [registry](../../app/dashboard/pixel-cosmetic-registry.ts) |
| Owner library subscriptions | [pixel-creations-client](../../lib/pixel-creations-client.ts) |
| Artwork transactions/revisions | [pixel-creation-service](../../lib/pixel-creation-service.ts), [API](../../app/api/pixel-creations/route.ts) |
| Authorized target-user descriptors | [pixel-companion-service](../../lib/pixel-companion-service.ts) |
| Customizer and Hub | [identity](../../app/locker/components/identity/) |
| Drawing/history/timeline/recovery | [Studio](../../app/locker/components/studio/) |
| Database integration | [disposable harness](../../scripts/test-pixel-postgres.mjs) |
| Regressions/boundaries | [Pixel tests](../../__tests__/pixel-display/), [dashboard tests](../../__tests__/dashboard/), `npm run typecheck:engine` |

Use explicit target-user descriptors on foreign-user surfaces. Never substitute
an Auth-backed own-library adapter for another person's companion.

The [dashboard presentation report](reports/dashboard-presentation/report.md)
records the compact overview, segmented meters, responsive framing, and theme QA.
The [Pixel Studio workspace report](reports/studio-workspace/report.md) records
the bounded canvas, persistent drawing controls, mobile settings drawer and QA.

The [user artwork report](reports/user-artwork-only/report.md) records retirement
of both built-in characters, empty-display onboarding, selection behavior and QA.

## Historical evidence

[Engineering audit](reports/engineering-audit/report.md),
[Phase 0](reports/phase-0/report.md), [Phase 1](reports/phase-1/report.md),
[Phase 2](reports/phase-2/report.md), [Phase 3](reports/phase-3/report.md),
[Phase 4](reports/phase-4/report.md), [Phase 5](reports/phase-5/report.md),
[Phase 6](reports/phase-6/report.md), [Phase 7](reports/phase-7/report.md),
[Phase 8](reports/phase-8/report.md). Reports describe their own run; current source,
tests and the current contract resolve discrepancies.

The older [layered PNG contract](../pixel-companion/README.md) is historical.
The [landing companion contract](../landing-companion/README.md) remains a separate
active system. Keep reports/evidence under `reports/<task-or-phase>/`; preserve
historical writer paths rather than revising old measurements.
