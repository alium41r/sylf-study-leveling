# Level-up celebration ("Ascension")

Status: current. Source, tests, and the app itself resolve any disagreement with this report.

## What it is

One presentation surface for every real level-up in Sylf: `app/components/LevelUpOverlay.tsx`
(`LevelUpOverlay.module.css`) driven by `app/components/LevelUpProvider.tsx`.

Before this pass the celebration was a small modal owned by the Timer screen only. It is now
owned globally, watches canonical progression data, and plays a layered ~4.2 s sequence.

## Entry points

| Concern | Owner |
| --- | --- |
| Sequence, choreography, reduced-motion branch | `app/components/LevelUpOverlay.tsx` |
| Visual layers and tokens | `app/components/LevelUpOverlay.module.css` |
| Real level-up detection, `triggerLevelUp()` | `app/components/LevelUpProvider.tsx` |
| Mount point | `app/components/GlobalSystemWrapper.tsx` (inside `AuthProvider`, so `useAuth()` supplies the scholar) |
| Regression coverage | `__tests__/components/level-up-celebration.test.tsx` |

## Detection contract

`LevelUpProvider` observes `user.level` / `user.hunterRank` from `AuthProvider`. It never writes
XP, level, rank, or stats, and it makes no network request of its own.

- The **first** observation for a scholar (initial load, login, account switch) records a
  baseline and stays silent — signing in never celebrates.
- A later `user.level` **increase** plays the sequence, deriving the previous rank with
  `rankForLevel()` from `lib/game-engine.ts` so the rank ladder is not duplicated.
- A **decrease** (admin correction / data repair) re-baselines quietly without celebrating.
- A **different `user.id`** re-baselines without celebrating.

Because it watches shared auth state, a level-up plays on whichever screen the scholar is on —
focus-session settlement on `/timer`, a quest claim, an achievement claim, or a weekly milestone.

## Sequence

≈ 4.2 s on screen, then auto-dismiss. Click anywhere or press Escape to end it early.

| Time | Beat |
| --- | --- |
| 0.00 s | Scrim (`--overlay-bg`) and ambient accent bloom fade in |
| 0.10 s | Scanner line sweeps down the viewport once |
| 0.16 s | Sigil: hexagon draws itself, dashed and arc rings begin slow counter-rotation |
| 0.24 s | "LEVEL UP" letters rise into place with a staggered blur-to-sharp |
| 0.30 s | Particle motes rush in from the edges and gather in a ring |
| 0.46 s | Level odometer rolls previous → new; halo brightens; pressure-wave ring releases |
| 0.52 s | Accent rule opens outward beneath the headline |
| 0.78 s | Reward strip: rank-promotion badge, or the XP awarded |
| 0.90 s | Dismiss rail drains to the auto-dismiss deadline |

Re-triggering while the sequence is open restarts it from the top (`runId` re-keys the content
layer); the overlay never stacks.

## Appearance

Every colour is a semantic token, so custom accents, custom canvas colours, light/dark mode and
custom-background polarity all keep working:

- Scrim `--overlay-bg`, panel `--surface-1`, text `--text-primary` / `--text-secondary` — all
  derived together from the real canvas luminance by `lib/color-utils.ts`, which keeps surface
  and foreground on the same side of the polarity split.
- Accent **text** uses `--accent-text` (contrast-safe against the surface); rings, rules, glows
  and the bloom use `--accent-primary` / `--accent-primary-light`.
- The promotion badge reuses the global `.rank-badge .rank-<X>` classes, with a local fallback
  for `NATIONAL` / `MONARCH`, which have no colour rules in `globals.css`.

## Reduced motion

`useReducedMotion()` branches the JS choreography, and the global
`@media (prefers-reduced-motion: reduce)` block in `app/globals.css` neutralises the ambient CSS
loops. Under reduced motion the sequence drops the scanner, rotation, shockwave, particles and
the odometer roll, and fades straight to the final state. It still auto-dismisses.

## Development replay control

The temporary `DevLevelUpTrigger` preview buttons have been removed. To replay the sequence
locally, call `triggerLevelUp()` from `useLevelUp()` with a synthesized payload.

## Verification

Run against `npm run dev` at `http://localhost:3000`, signed in as a throwaway QA account.

| Check | Result |
| --- | --- |
| Desktop 1280×800 and 1440×900 | Card 540×338, centred, no overflow |
| Mobile portrait 390×844 | Card 358×306, centred, `scrollWidth - innerWidth === 0` |
| Short landscape 844×390 | Card 540×358 fits a 390 px viewport; dev control hidden |
| Dark mode, default accent | `evidence/desktop-dark-*.png` |
| Light mode | `evidence/desktop-light-rank-promotion.png` |
| Custom accent + custom canvas (`#ef4444` on `#1a7775`) | `evidence/desktop-custom-accent-and-canvas.png` |
| Light canvas while `data-mode="dark"` (polarity flip) | `evidence/desktop-light-canvas-dark-mode.png` |
| Rank promotion branch | `evidence/desktop-dark-rank-promotion.png`, `evidence/mobile-portrait-rank-promotion.png` |
| Repeated triggering | One dialog node at all times; replay resets the letters to opacity 0 |
| Real level-up event (end to end) | `evidence/desktop-real-level-up-event.png` — see below |
| Reduced motion | No particles, no scanner, no roll; `evidence/desktop-reduced-motion.png` |
| Auto-dismiss | Closed 4.2 s after the last trigger (+ exit) |
| Dismissal | Click anywhere and Escape both close it |
| Production bundle | Dev control absent from `.next/static`; `npm run build` passed |
| Mobile bundle | `npm run mobile:build` + `npm run mobile:verify` passed |

### Real event, end to end

Exercised through the app's own production path rather than the dev control:

1. The QA scholar was loaded on `/dashboard` at level 1, letting `LevelUpProvider` record its
   baseline.
2. The canonical progression row was advanced to level 2 with a `LEVEL_UP` `SystemMessage` —
   the same shape a settled session or a claimed quest writes.
3. The existing `Sidebar` notification poll (30 s) saw the new unread message and called
   `refreshStats()`.
4. `LevelUpProvider` observed `user.level` 1 → 2 and played the sequence — `LV. 1 → LV. 2`,
   rank `E` unchanged, no promotion strip. The sequence appeared 18.1 s after step 2, and the
   sidebar and level tile both then read level 2.

Automated: `npx vitest --run __tests__/components/level-up-celebration.test.tsx` (7 tests) plus
`__tests__/components`, `__tests__/timer`, `__tests__/system` and `__tests__/game-engine.test.ts`
(95 tests across 14 files). `npx eslint` clean on the changed files; `npx tsc --noEmit` reports
only the two pre-existing `.next/dev/types` route-validator errors for `app/api/acoustics/route.ts`
and `app/api/quests/route.ts` (both exports exist at `HEAD` and are untouched here).

Not covered: a level-up caused by a quest or focus-session reward claim. The QA database is
missing the `Quest.plannedMinutes` column, so `/api/quests` returns 500 locally. Those paths reach
the same `refreshStats()` → `user.level` increase → provider detection chain verified above.
