# Celestial landing decorations — light mode

Implemented 2026-10-03. The supplied screenshots showed washed-out ornaments and a gray cast in light mode. The implementation previously applied 0.63 opacity to the whole decoration layer while keeping its dark SVG materials.

## Change

[CelestialDecor.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialDecor.module.css) now defines light-only `--decor-*` material aliases beneath the existing `data-surface="light"` landing owner. Colors derive from the landing's `--accent`, `--ink`, `--surface`, and `--gold`, with a lilac art tint. This retains the existing landing appearance/persistence boundary; it does not introduce theme state or alter the app's custom appearance flow.

The whole-layer opacity reduction is removed. Vines/strings use restrained indigo ink; leaves retain distinct pale facets; lanterns use pale glass, a defined indigo star core, white highlights, and bronze fittings; books have lavender covers and warm ivory pages. Per-material opacity keeps the decorations secondary to page content. Stars and distant dots follow the light decorative ink.

[CelestialMotifs.tsx](/Users/aliumair/Desktop/sylf/app/components/landing/journey/CelestialMotifs.tsx) consumes those aliases in the existing SVG fills, strokes, gradient stops and material opacity. Every property retains its previous dark color/value as a fallback. All SVG paths, unique gradient IDs, composition coordinates, responsive density/hiding, animation, scrolling, reduced-motion handling, and the companion are preserved. No runtime, filters, assets or packages were added. Only the landing imports these motifs; no mobile shared-screen owner changed.

[Journey.module.css](/Users/aliumair/Desktop/sylf/app/components/landing/journey/Journey.module.css) adds a light-only `topGlow` rule: the dark gray/navy haze becomes two subtle accent washes at 7% and 5%. The dark glow is unchanged.

## Verification

- `npm run test -- --run __tests__/landing`: 152 tests across 18 files passed.
- Seven new regression cases in [celestial-appearance.test.tsx](/Users/aliumair/Desktop/sylf/__tests__/landing/celestial-appearance.test.tsx): four motifs rasterize identically to the pre-change dark SVG fixtures; light lantern core/glass and book cover/page separation passes with blue, teal, and rose accent aliases. These are decorative material checks, not WCAG content compliance claims.
- `npx eslint` on the changed TSX and QA helper/test: passed. CSS was parsed by PostCSS and formatted with Prettier.
- `npm run build`: passed, including production TypeScript and all 89 prerendered pages.
- `npx tsc --noEmit`: blocked by existing errors in `.next/dev/types/app/api/acoustics/route.ts` and `.next/dev/types/app/api/quests/route.ts`, rejecting the unrelated `CURATED_SOUNDSCAPES` / `calculateScopeWeight` exports. `npx next typegen` succeeded but did not remove those errors. No errors were reported in the changed landing/test files. API files were not edited.

The supplied desktop dark/light screenshots and the new [offline material comparison](evidence/material-comparison.png) were visually inspected. Individual SVG/PNG renders and resolved aliases are in [evidence/](evidence/). [celestial-palette-qa.ts](/Users/aliumair/Desktop/sylf/__tests__/landing/celestial-palette-qa.ts) resolves source sRGB mixes for Sharp, which does not support CSS variables itself. Run the landing tests with `SYLF_CELESTIAL_ARTIFACTS=1` to regenerate this evidence.

This is source-based material rendering, not a screenshot of the webpage. Live browser verification remains blocked by the earlier browser URL-policy restriction; no alternative browser route was used. Full desktop/mobile composition, actual browser CSS interpolation, and persisted custom appearance combinations remain unverified in this run. Responsive rules and motion code were reviewed and retained, and custom accent values were tested only at the material-alias level. The landing continues to own its existing page palette independently of outer app background preferences.

## Files

Production changes are limited to the three linked source files. New QA files are the linked test/helper and four pre-change SVG fixtures under `__tests__/landing/fixtures/celestial-dark/`. This report/evidence and the landing index document the pass.
