# Phase 7 — Character Customizer

**Status:** complete.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md).

---

## 1. The Customizer UX

**Where it lives:** Locker → Identity → Studio Hub → **Companion** → *Customize Companion*.

A scholar sees a live preview of their companion beside two tabs:

| Tab | What it offers |
| --- | --- |
| **Character** | Three visual cards — Tanjiro Kamado, Satoru Gojo, Tengen Uzui — with each entry's own rarity and description |
| **Pixel size** | Four presets — Chunky, Balanced, Detailed, Finest — as radio cards with a grain swatch |

Nothing else appears, and that is the design rather than an omission. **A category
is shown when it offers a real choice** — more than one option — **or when it has
finished content with more on the way.** Ground, Aura and Held each hold only an
*unequipped* entry alongside one authored asset, so none of them is a choice, and
showing them would be furniture.

**Nothing implementation-facing reaches a scholar.** No asset ids, no planes, no
anchors, no pivots, no coordinates, no state names, no matrix sizes. A test
asserts that every category label, hint and option label fails to match
`/asset|plane|anchor|pivot|matrix|framebuffer|renderer|state|form_|pedestal_|relic_|aura_/i`.
Unlock requirements are rephrased too — `RANK E` becomes **Rank E**, a thing a
scholar has rather than a code.

### The gap is stated, not hidden

> *13 companion looks are still being drawn and will appear here later.*

A scholar who owns one of the thirteen forms the companion cannot draw yet is told
so, rather than left wondering whether the page is broken. That is the honest
counterpart of hiding them.

---

## 2. Draft, save and reset

The customizer **shares the Identity tab's existing draft model** rather than
introducing one:

```
characterConfig (draft) → live preview → Save changes → PATCH /api/profile/customization
savedConfig             → Reset restores the draft from it
```

It is **not a writer**. It raises changes upward through `onChange` and asks to
save through `onSave`; the application still has exactly one persistence path,
and this phase did not add a second.

**One thing was added:** a *Save changes* button inside the customizer. The only
save bar lived on the hub, so a scholar editing the companion would have had to
navigate away to keep their work. Verified in the browser: load `dirty=false`,
select `dirty=true`, reset `dirty=false`.

### The dirty flag needed fixing, and the bug was mine

My first comparison was a whole-object `JSON.stringify`, which reported **Unsaved
to every scholar who had never opened the customizer** — because the preview
resolves a `density` the saved configuration does not carry, and legacy keys like
`skin` and `hairStyle` are in one object and not the other.

"It says unsaved before I touched anything" is the kind of thing that teaches a
scholar to distrust the save button. It now compares **only the fields the
companion draws from, with density resolved on both sides**, so "Unsaved" means
*the companion would look different*. Four tests pin it: a legacy config with no
density reads as saved, fields nothing draws are ignored, a real change is
reported, and key order does not matter.

---

## 3. Pixel density

Four presets, each a resolution **every phase since Phase 0 has measured and
tested at**:

| Preset | Resolution | Hint |
| --- | --- | --- |
| Chunky | 32 | Biggest pixels, boldest shapes |
| Balanced | 40 | The default — clear at any size |
| **Detailed** | **48** | Finer pixels, more definition |
| Finest | 64 | Smallest pixels, softest edges |

Bounded rather than a slider, deliberately: a continuous value between them has
never been looked at, and a range would invite scholars to find the settings that
look worst. No preset id is numeric and no label contains a digit — asserted.

**Physical size is untouched, verified end to end.** I saved *Finest* for the QA
account and measured the production dashboard:

| | 48 columns | 64 columns (saved) |
| --- | --- | --- |
| Canvas CSS | 110 px | **110 px** |
| Backing store | 110 px | **110 px** |
| Cell pitch | 2.292 | **1.719** |

Density changed; the card did not move. Attachment offsets are asserted identical
across all four presets, so nothing shifts relative to anything else.

---

## 4. Persistence: no migration

**No schema change. No migration. No `SCHEMA_BUILD_VERSION` bump.**

Density lives at `CharacterConfig.density`, inside the existing `characterConfig`
JSON — the same field that already carries `outfit`, `pedestal`, `aura`, `relic`
and `accessory`. It is a preference about how the companion is *drawn*, like the
appearance mode; nothing prices it, unlocks it or gates it.

Every configuration written before this phase has no density at all and is read
through a default (`resolutionForDensity(undefined) === 48`), so **no scholar had
to re-equip or migrate anything**.

Verified in the database: the save wrote `density: "finest"` into
`User.characterConfig`. The QA account was then restored by removing that one key
and touching nothing else.

---

## 5. Category support

| Category | Status | Evidence |
| --- | --- | --- |
| **Character** | **Supported** — 3 keys | `form_tanjiro`, `form_gojo`, `form_uzui` |
| Ground | **Deferred** | `PEDESTAL_OPTIONS` holds one entry |
| Aura | **Deferred** | `AURA_PRESETS` holds only `none` — **O24** |
| Held | **Deferred** | `RELIC_OPTIONS` holds only the unequipped relic |

### An honest trade I made, and want on the record

Phase 6 mapped all sixteen form keys to the base figure. Phase 7 found that this
made the customizer **dishonest**: sixteen cards that all painted the same
companion is a choice that does nothing, and a scholar who picked Gojo and saw
Sylf would reasonably call that a bug.

I kept the three most-used keys mapped, because unmapped the category would offer
a single option and read as broken rather than as early. **Those three currently
render the same figure**, and the report says so rather than letting it be
discovered. Each becomes its own asset in one line when the artwork lands — that
line is O21, and it is the whole remaining migration.

---

## 6. Locked and legacy handling

**Ownership is borrowed, not reimplemented.** The customizer calls the existing
`isRankSufficient` and the existing level comparison — the same rule the Character
Studio and the collection screen use. If those rules change, this changes with
them. Four availability states are distinguished: **equipped**, **available**,
**locked** (with its requirement spelled out), and *not shown* for content the
companion cannot draw.

### The live configuration is a legacy configuration

The QA account's real stored config is:

```json
{ "aura": "aura_obsidian", "outfit": "form_deadpool",
  "accessory": "circlet_heroic", "skin": "olive", "hairStyle": "3" }
```

Three of those keys are ones the companion cannot draw. Verified outcome: the
page **loads with no unsaved changes**, paints **381 lit cells**, offers no
option it cannot render, and shows `form_tanjiro` as equipped — because that is
what is on screen.

That last point is a deliberate semantic: **equipped means what the companion is
showing, not what string is stored.** When a stored key cannot be drawn the figure
falls back to the base, so the base reads as selected. Marking nothing would leave
a scholar looking at a figure with no card highlighted and no way to tell what
they are wearing.

No definition was fabricated for O24's missing aura or relic entries, as required.

---

## 7. Responsive and accessibility

| Check | Result |
| --- | --- |
| Horizontal overflow at 390 px | **none** |
| Layout | Reflows from a stacked column to a sticky preview beside the options at ≥ 900 px; options go single- to two-column at ≥ 560 px |
| Keyboard | Verified — focusing an option and pressing **Enter** selects it |
| Density semantics | A `radiogroup` of `role="radio"` with `aria-checked`; measured state matches the selection |
| Selected state | Carried by `aria-pressed` / `aria-checked` **and** a check icon, so it never depends on colour alone |
| Reduced motion | Verified under `prefers-reduced-motion: reduce` — the preview renders and the state is legible; selection never requires animation |
| Focus visibility | Focus rings on every interactive element, including the tabs, cards and save/reset |
| Appearance | Every colour is a semantic token, so light, dark and custom accents all follow |

---

## 8. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **382 passed / 16 files**, 0 failed (Phase 6: 356/15) |
| Shop / Locker / companion regression | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors |
| `npx eslint` on new files | 0 errors — the 6 remaining errors in the two edited files are pre-existing and unchanged (verified by stashing) |
| `npm run build` | succeeds |
| `npm run mobile:build` + `mobile:verify` | succeeds / **PASSED** |
| `GET /dev/pixel-display` in production | **404** |
| `GET /dashboard`, `GET /locker` in production | 307 (still protected) |

New: **26 customizer tests** covering what is offered, what a scholar can read,
lock semantics, density bounds and fallback, the draft/save comparison, and four
legacy configurations.

### Boundary change, and why

The dual-vocabulary list grew from **two modules to five**, each with its reason
written into the test:

| Module | Why |
| --- | --- |
| the adapter | resolves the production card's configuration |
| the dev review panel | must show the same resolution a scholar gets |
| the card | receives a resolved composition and passes it to the display |
| `pixel-customizer-options` | turns catalogues into scholar-facing choices |
| the Locker hub | previews the draft the Identity tab holds |

The boundary test caught this itself: my first attempt had the **card** resolving
an explicit config, which would have made it a second interpreter of cosmetics. It
now receives an **already-resolved composition**, and resolution stays at the
surface. Every module on the list resolves or presents; **none rasterises**.

---

## 9. What Phase 7 did not do

No Pixel Studio, no drawing, no frame editing, no animation authoring, no custom
asset creation, no user-defined anchors, no scripting, no sharing, no marketplace
work, no landing/onboarding migration, and no Sylf redesign.

No new parallel cosmetics or configuration model: the registry, the resolver, the
ownership rule and the persistence path are all the ones Phase 6 and the existing
Locker established. `CharacterRenderer` and its 11 other consumers are untouched.
Shop pricing, rarity, ownership, rank/level requirements and progression are
unchanged.

---

## 10. Open decisions

**None closed.**

| # | Decision | Status after Phase 7 |
| --- | --- | --- |
| **O1** | Logical resolution | **Open — and Phase 7 is itself the reason.** Density is now a scholar-facing preference, so a *configurable default* may be the resolution of this question rather than a single fixed matrix size. That is a stronger position than any measurement this project has produced, and it is a product decision. |
| O21 | The remaining thirteen forms | **Sharpened, and now visible.** Counted and stated in the interface. This is the largest remaining migration work and it is artwork, not architecture. |
| O22 | Whether form variants are separate assets or states of one | **Sharpened but still undecided.** Three form keys mapped to one figure is exactly the ambiguity O22 names: a scholar can *choose* a variant that draws identically. The evidence still does not exist because the artwork does not. |
| **O24** | The aura and relic catalogues are empty | **Unchanged, and now user-visible.** Two categories cannot be offered at all because their catalogues hold only an unequipped entry. A scholar sees this as two missing tabs. |
| O2–O20, O23 | — | **Unchanged.** This phase created no pressure on presentation, scheduling, the renderer backend, effects, the framebuffer or the remaining `CharacterRenderer` consumers. |

### Limits, stated plainly

- **Only one category offers a real choice today.** The multi-category layout is
  exercised by Pixel size rather than by several populated categories, so the
  layout is proven for two tabs and not for five.
- **The three mapped forms draw the same figure.** Documented above rather than
  hidden.
- **Live high-DPI rendering remains unobserved** (O13).
- QA wrote a density preference to one existing account and removed it afterwards.
  No other data was touched, and no scholar's configuration was modified.
