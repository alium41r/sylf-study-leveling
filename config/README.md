# Auxiliary configuration

Framework configuration that a tool discovers at the repository root stays there:
`next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`,
`eslint.config.mjs`, `postcss.config.mjs`, `prisma.config.ts`,
`capacitor.config.ts`, and `proxy.ts`.

This directory holds alternate or opt-in configuration:

| File | Used by |
| --- | --- |
| `tsconfig.pixel-engine.json` | `npm run typecheck:engine` (DOM-free engine boundary check). |
| `tsconfig.planner-worker.json` | `npm run planner:worker:build` (emits `dist/planner-worker/`). |
| `tsconfig.planner-v2-phase0.json`, `tsconfig.planner-v2-phase2.json` | Historical Planner V2 phase qualification. |
| `vitest.planner-v2-postgres.config.ts`, `vitest.planner-v2-live.config.ts` | Opt-in Planner V2 PostgreSQL/live suites. |
| `svgo.config.mjs` | Sylv SVG vectorization/optimization scripts. |

Paths inside these files are relative to `config/`; the repository root is `..`.
