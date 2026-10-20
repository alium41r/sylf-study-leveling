# Repository reorganization — 19 October 2026

## Outcome and scope

This pass audited the whole repository and reorganized it around the existing
Next.js, Prisma, mobile, and documentation conventions. It did not change
application behavior, dependency versions, database migrations, route structure,
or the in-progress calendar/notes work.

The goals were a smaller root, one predictable home per kind of file, and enough
repository-level documentation for a developer or coding agent to find that home
without a search. Source, configuration, and documentation moves are summarized
below; the user's pre-existing working-tree changes were preserved.

## Resulting layout

```text
app/                 Next.js routes, route-local UI, API handlers
lib/                 shared engines, contracts, services, catalogs
__tests__/           Vitest suites
prisma/              schema + ordered migrations
public/              runtime static assets
assets/              source/design artwork (not served)
scripts/             build/ assets/ db/ dev/ qa/ security/ test/ verify/
config/              alternate TS/Vitest/SVGO configuration
tools/               independent development packages (ai-agent)
documentation/       contracts, indexes, reports, evidence, security,
                     research, specifications, design-system reference set
archive/             dormant source material
mobile/, android/    Capacitor client and native project
```

## Major organizational changes

| Change | From | To |
| --- | --- | --- |
| Security history consolidated into documentation | `security/` (7 files) | `documentation/security/` |
| Research consolidated into documentation | `research/spikes/` (1 file) | `documentation/research/spikes/` |
| Content specification consolidated into documentation | `specifications/features/` (1 file) | `documentation/specifications/features/` |
| Design reference set consolidated under the design index | `design-system/` (6 files) | `documentation/design/design-system/` |
| Pre-implementation Pixel Display vision archived | `Sylf Pixel Display.md` | `documentation/pixel-display/archive/sylf-pixel-display-vision.md` |
| Generated Planner corpus moved with its owner | `planner-phase5-corpus-results.json` | `documentation/planner/corpus/` |
| Source/design artwork consolidated | 14 loose root files + `login design/` | `assets/branding/`, `assets/design-references/`, `assets/pixel-companion/` |
| Scripts organized by purpose | 62 tracked + 3 untracked flat files | `scripts/{build,assets,db,dev,qa,security,test,verify}/` |
| Alternate configuration isolated | 7 root config files | `config/` (framework configs stay at root) |
| Standalone dev package grouped | `ai-agent/` | `tools/ai-agent/` |
| Lone root hook moved to the client-hook home | `hooks/useDebounce.ts` | `app/hooks/useDebounce.ts` |

New indexes keep these areas discoverable: `assets/README.md`,
`config/README.md`, `scripts/README.md`, and `tools/README.md`. The root
`README.md` was replaced with a Sylf-specific overview and repository map;
`AGENTS.md` gained a compact repository-layout table and updated command paths.

## Duplicate review

Deletions were limited to byte-identical or unreferenced copies, verified before
removal:

- Root `stats view.png` and `collection view.png` matched
  `public/landing/screenshots/` byte-for-byte.
- `landing screenshots/` (12 files) duplicated the public runtime screenshots;
  every file matched by SHA-256.
- The 12 kebab-case screenshot pairs in `public/landing/screenshots/` were
  byte-identical to the spaced filenames used by the app and tests, and had no
  references.
- Five create-next-app template SVGs (`next.svg`, `vercel.svg`, `file.svg`,
  `globe.svg`, `window.svg`) had no source references.

No report, evidence image, contract, fixture, or user-generated content was
deleted. Historical reports that mention old paths are retained unchanged.

## Configuration and reference repairs

- `package.json` script commands now point at the categorized scripts;
  `typecheck:engine` points at `config/tsconfig.pixel-engine.json`.
- Moved TypeScript/Vitest configs were rebased (`extends`, `include`, `rootDir`,
  `outDir`, alias paths) for their new directory.
- More than 50 script files had root-resolution (`import.meta.dirname`,
  `__dirname`, `new URL("../")`) and locator paths updated. Asset pipelines now
  read source art from `assets/pixel-companion/`.
- Tests and source comments that execute or locate moved files were updated:
  model-migration check, Pixel engine boundary config, interpretation corpus
  output, and the opt-in PostgreSQL harness comments.
- Current documentation indexes and contracts were repaired: root README,
  `AGENTS.md`, `documentation/README.md`, the design, planner, timer, calendar,
  and pixel-display indexes, and the security audit index.
- SQL/env references now point at `scripts/db/supabase-realtime-setup.sql`.
- ESLint now ignores generated build output (`dist/`, `mobile/dist/`), the
  independent `tools/` package, and local agent harness directories, so a full
  `npx eslint .` does not scan bundles or vendored tooling.
- The secret scanner now ignores runtime-interpolated disposable PostgreSQL
  fixtures (`postgres:${password}@127.0.0.1`) while still flagging literal
  `user:password` pairs; the two DB harness templates were false positives that
  would otherwise fail the audit once tracked.

## Tracking hygiene

- `dist/`, `mobile/dist/`, `.playwright-mcp/`, and `.dsh-presets/` are no longer
  tracked (1,696 files). They remain on disk and are now ignored. `dist/` and
  `mobile/dist/` are reproducible with npm scripts; the other two are local agent
  and QA state, not project source.
- `.env.example` is now tracked (it was ignored by `.env*` despite being the
  documented template) after confirming it contains placeholders only.
- `.gitmodules` now registers the pre-existing `antigravity project template`
  gitlink; it previously had no submodule mapping, so clones could not resolve it.
- `.gitignore` covers the ignored build output, agent state, and the template
  exception. Regenerable root caches (`*.tsbuildinfo`) and `.DS_Store` files were
  removed from the working tree.

## Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed. |
| `npm run typecheck:engine` | Passed. |
| `npx tsc -p config/tsconfig.planner-v2-phase0.json` | Passed. |
| `npx tsc -p config/tsconfig.planner-v2-phase2.json` | Passed. |
| `npm run build` | Passed; routes generated normally. |
| `npm run mobile:build` + `npm run mobile:verify` | Passed; zero server-only symbols/secrets in the bundle. |
| `npm run test -- --run` | Identical to the pre-change baseline: 23 failed files, 36 failed tests, 4,063 passed, 299 skipped. No new failures. |
| `npx eslint scripts` | 0 errors, 12 pre-existing warnings. |
| `npm run audit:secrets` | Passed; no credential patterns in tracked files. |
| `npm run audit:models` | Passed; 0 active retired-model references. |
| Script syntax (`node --check`, all `.mjs`/`.cjs`) | Passed. |
| Local Markdown links (395 links, 38 current files) | All resolve. |
| Staged snapshot (`git checkout-index`, `next typegen`, `tsc --noEmit`, `typecheck:engine`, `npm run build`, `npm run mobile:build`, `npm run mobile:verify`) | All passed without the unstaged calendar/notes work (dependencies cloned for Turbopack). |
| Staged documentation links (213) | Resolve to indexed paths; only local `scratch/` and submodule-local paths are exempt. |
| `git diff --check` | Only a pre-existing blank line at EOF in `lib/color-utils.ts` (user work). |

The 23 failing test files are the same ones that failed before this pass: social
connected-account migrations, several auth/settings/mobile/planner flows, the
opt-in PostgreSQL suites embedded in historical reports, and a scratch calendar
check. The Planner worker TypeScript config also fails on a pre-existing
`@/lib/prisma` alias in `lib/ai/usage-logger.ts`; the configuration from `HEAD`
fails identically, so it is not a move regression. The legacy pixel raster
preparation `--check` reads the relocated source art correctly but still expects
`public/companions/...` outputs that later product work retired; that failure is
pre-existing and the script was not changed beyond its source paths.

## Deliberately left unchanged

- Application behavior, dependencies, Prisma schema/migrations, routes, and
  `public/` runtime assets (except verified duplicate deletion).
- The in-progress calendar/notes source, migrations, documentation, and tests.
  A few path comments and setup locators in that work were repaired; no behavior
  changed.
- Historical reports, evidence, and their pre-reorganization paths. They record
  their own run; `scripts/README.md` and the current indexes are authoritative
  for today's locations.
- `sylvs/` (source art and metadata with its own tests/pipeline), `archive/`
  (dormant source), and the `antigravity project template` submodule content.
- Large documentation evidence (about 240 MB) and the `public/landing`
  screenshot sources; only proven duplicates were removed.
- `codegraph.json` and `supabase.cordis.yml` stay at the root because their
  tools discover configuration there.
- `npm run lint` still calls the removed `next lint`; use `npx eslint` directly.
- `scratch/`, local `.env*` files, build outputs, and agent-state directories
  remain local and ignored.

## Post-reorganization integrity review

A final review verified the moved tree and the index before commit:

- **File accounting:** the 154 tracked source removals contain 111 moves and 43
  verified duplicate deletions. Git records 108 of the moves as renames and three
  config files as additions because their content changed enough; all 111
  destinations exist. The two em-dash login SVGs and the renamed vision document
  were checked explicitly.
- **Generated exclusions:** the 1,696 staged removals are `dist/` (89 compiled JS
  files), `mobile/dist/` (238 Vite outputs and copied public assets, including 15
  upload copies whose originals remain in `public/uploads/`), `.playwright-mcp/`
  (26 MCP page/console artifacts), and `.dsh-presets/` (1,343 vendored agent-plugin
  files). Each directory is ignored, is not referenced by application code, and
  contains no unique source file. `dist/` was already stale relative to
  `lib/planner/v2` and must be rebuilt before the worker is run.
- **Submodule:** `.gitmodules` maps `antigravity project template` to its GitHub
  remote, and the parent gitlink (`80d4aa2`) matches the checkout's HEAD.
- **References and assets:** npm script targets, literal script/config/doc paths,
  the 12 dynamic landing screenshots, and 395 local Markdown links resolve. Of 65
  source-referenced public asset literals, the only misses are the pre-existing
  notification-icon paths listed below (plus one regex false positive). No CI/CD
  pipeline exists in the repository; the Next build, mobile build, and Android
  lifecycle scripts are the deployment paths and were verified. Pre-existing
  issues remain: the `/icon-192.png` and `/icon-512.png` notification icons (the
  files live under `public/icons/`), the missing
  `public/landing/screenshots/home.webp` referenced by a test, the worker
  TypeScript alias, and the 23 failing test files.
- **No unrelated staging:** the user's calendar/notes working-tree changes are not
  staged. `package.json`, `.gitignore`, `documentation/README.md`, `README.md`,
  `scripts/README.md`, and `.env.example` are partially staged so the index
  contains only reorganization changes; their working-tree versions retain the
  uncommitted calendar additions. Seven untracked calendar script/fixture files in
  the new `scripts/` layout remain untracked with the rest of that work.

## Review state

The staged index is the reorganization only, grouped as documentation moves;
asset moves and verified duplicate removals; script/config/tool relocations;
reference, test, and configuration repairs; tracking hygiene; submodule metadata;
and the new repository documentation. Generated artifacts and agent state account
for the 1,696 staged removals. `.env.example` is staged as a secret-free template.

The staged partial files exclude uncommitted calendar lines while retaining the
full versions in the working tree: `package.json` (script paths only),
`.gitignore` (reorganization ignore rules only), `documentation/README.md` (link
repairs only), `README.md`, `scripts/README.md`, and `.env.example` (external
calendar environment block excluded). The staged snapshot has no references to
the unstaged calendar scripts. Nothing was committed.
