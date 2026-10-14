# Phase 6 — Modular Character and Cosmetics System

**Status:** complete.
**Evidence:** [evidence/](evidence/).
**Contract:** [Pixel Display contract](../../pixel-display-contract.md) ·
**Authoring:** [authoring-guide.md](../../authoring-guide.md).

---

## 1. What the phase proved

The goal was not "convert PNGs to pixels". It was to prove one composition is
expressible through the Pixel Asset contract:

```
pedestal  +  character  +  wearable  +  aura  +  held item
```

It is. A fully equipped loadout composes from five assets, resolves from
**persisted cosmetic keys**, and paints at every density and physical size from
24 to 64 logical cells — and every existing key still works, including the ones
this phase does not recognise.

**No database migration was needed.** The report says so explicitly below, since
the roadmap asked for that statement.

---

## 2. The contract extension: two new kinds

Phase 5 offered `character | wearable | held`. The real catalogue needed two
more, and the evidence was concrete rather than speculative:

| Existing slot | Why it is not an existing kind |
| --- | --- |
| `CharacterConfig.pedestal` | It is *under* the character, not worn and not gripped |
| `CharacterConfig.aura` | It *surrounds* the character; it is not attached to a body part |

Forcing either into `wearable` would have meant an anchor that lied about what it
attached to — a "hat" that is actually the ground. So:

```ts
export type PixelAssetKind =
  | "character" | "wearable" | "held"
  | "pedestal" | "aura";
```

That is the whole extension. There is deliberately no `hat`, `cape`, `trail` or
`emote`, because no existing cosmetic key needs one. Two new anchors were added
to the character for the same reason — `ground` and `core` — alongside the
existing `hold-right` and `wear-neck`. **No socket library was created.**

### Validation rule added

A composed asset is painted with its host's placement, so its coordinates are
read in the host's reference grid. An asset whose own grid is **larger than its
host's** is describing a space the host does not have:

```
grid-larger-than-host — "Asset X has a 64 × 64 grid but host Y is 32 × 32.
                         A composed asset shares its host's grid."
```

Reported as a problem, and the composition still paints everything else.

---

## 3. O19 resolved: ground ownership moved out of the character

Phase 5 recorded that Sylf's sparkles *and* grass were character planes, and
declined to refactor without evidence. Phase 6 produced the evidence.

`pedestal` is an **equipped slot with its own identifier**, which means the ground
is *chosen* and can change. A ground plane welded into the character would have to
be hidden by every pedestal that replaced it, and two grounds would appear
whenever one did not. So the grass moved to
[`pedestal-meadow.ts`](../../../lib/pixel-display/content/asset/reference/pedestal-meadow.ts).

**The grass did not move a pixel** — same row, same tufts, same colours, same
output. The change was ownership, not appearance, which is exactly the "smallest
content ownership change required".

**The sparkles stayed.** Nothing equips them, no slot selects them, and they are
specific to this character. Moving them would have been change for its own sake,
and the contract's own rule — act on evidence, not anticipation — cuts both ways.

---

## 4. O20 not triggered: composition stayed one level deep

The model is **one host and a flat list of parts**. A part is an asset, and an
asset has no slot list, so composition cannot recurse, cannot cycle, and needs no
traversal. There is no scene graph.

A test asserts the ceiling structurally at runtime — no reference asset has a
`parts` or `children` property — so a later change that introduced recursion
would fail there. Declaring the same slot twice paints it once. No existing
cosmetic needed anything more, so nothing more was built.

---

## 5. The cosmetic registry

`app/dashboard/pixel-cosmetic-registry.ts` maps **persisted keys** to asset ids,
one line per mapping. Its whole rule is that persisted keys are the authority:
nothing renames a key, invents one, or asks a scholar to re-equip anything.

Three outcomes, and the difference between the last two is reported:

| Outcome | Meaning | Visual result |
| --- | --- | --- |
| `asset` | the key is mapped | the asset paints |
| `unequipped` | the key deliberately means nothing (`none`, `relic_none`) | nothing, and no notice |
| `unknown` | the registry has never heard of it | the slot's fallback, and a notice |

**What the registry does not do:** it does not price, unlock, rank-gate or own
anything. Rarity, cost, requirements and ownership stay exactly where they were,
in `character-traits.ts` and the Shop. It is a translation table, and the only
thing it decides is which asset a key looks like.

### Migrated categories

| Slot | Persisted key(s) | State |
| --- | --- | --- |
| `form` | `form_tanjiro`, `form_gojo`, `form_uzui`, `form_itadori`, `form_shinobu`, `form_mitsuri`, `default_hunter`, `test_hunter_base` | **Supported — all resolve to the base figure.** Sixteen forms exist in the catalogue; there is one authored character. |
| `pedestal` | `pedestal_cyber` | **Supported** → `sylf:pedestal-meadow` |
| `aura` | `none`, `aura_none`, `aura_ember` | **Supported**; `none` is deliberately empty |
| `relic` | `relic_none`, `none`, `relic_practice_wand` | **Supported**; `relic_none` is deliberately empty |
| `accessory` | `none`, `accessory_study_scarf` | **Mechanism supported, content deferred** — `ACCESSORY_STYLES` contains only "No Headgear" |

### Deferred, with evidence

**Fifteen of the sixteen forms are not authored as pixel assets.** They exist as
90 × 90 PNGs referenced by `imagePath`. Migrating them is artwork, not
architecture, and the roadmap forbids redesigning Sylf here. The honest position
is: the *keys* resolve deterministically and adding a form later is one line.

**The `aura` catalogue is effectively empty.** `AURA_PRESETS` contains only
`"none"`, and the live configuration this phase inspected carries
`aura_obsidian`, which no catalogue defines. The `aura_ember` reference asset
exists to prove the mechanism; the real aura art does not yet.

**The `relic` catalogue is effectively empty.** `RELIC_OPTIONS` contains only the
unequipped relic. `relic_practice_wand` names the migrated asset so the held path
is driven by a **real persisted identifier** rather than by a special case in the
composer — but no scholar can equip it yet, because the Shop does not offer it.

**The accessory slot has no content at all.** Its mechanism is wired and tested;
`ACCESSORY_STYLES` offers only "No Headgear".

---

## 6. Safe fallback, verified against a real configuration

A configuration was read from the live database and resolved:

```json
{ "aura": "aura_obsidian", "outfit": "form_deadpool",
  "accessory": "circlet_heroic", "skin": "olive", "hairStyle": "3" }
```

| Slot | Key | Outcome |
| --- | --- | --- |
| form | `form_deadpool` | unknown → **base figure**, notice raised |
| accessory | `circlet_heroic` | unknown → **omitted**, notice raised |
| aura | `aura_obsidian` | unknown → **omitted**, notice raised |

Result: a valid composition painting **381 lit cells**, zero placement problems,
and three degradation notices. **Not a blank card.** That is the requirement, and
it was verified against a real scholar's real configuration rather than a
synthetic one.

The rule differs by slot role, deliberately: an unknown **form** falls back to
the base figure, because a character with no body is not a degraded experience —
it is a broken one. An unknown **accessory** falls back to nothing, because an
accessory nobody recognises should simply not appear.

---

## 7. Attachment independence

Measured across **24, 32, 40, 48 and 64** logical cells:

- every composition paints with zero placement problems at every density;
- the reference-space offsets for every part are **byte-identical at every
  density** — asserted as `new Set(offsets).size === 1`;
- every part shares the base's placement, so parts scale together.

The offsets cannot depend on the display because they are computed in reference
space and mapped once. That is what makes an equipped character look the same at
110 px as at 640 px, and it is a property of the model rather than a test of it.

---

## 8. Persistence

**No schema change. No migration. No `SCHEMA_BUILD_VERSION` bump.** The existing
`User.characterConfig` JSON carries everything this phase reads — `outfit`,
`pedestal`, `pedestalKey`, `aura`, `relic`, `weapon`, `accessory` — and
`User.activeAura` supplies the aura for configurations that only set it there.
The registry reads those fields and adds no new ones.

The future Pixel Studio user-content persistence format was **not** introduced.

---

## 9. Surface migration

Only the **production dashboard card** moved to the modular path. It already had
the Pixel Display, so the migration was to pass it a resolved composition instead
of a bare character.

`CharacterRenderer` is **unchanged** and still serves all 11 of its other
consumers — Social, Focus Party, Shop, Locker, Public Profile, Friend Requests,
`dashboard-design` and both Studio views. Nothing else was migrated, and the
sprite renderer remains available as the fallback for every surface that has not.

The dashboard's application code passes a **composition**, never a plane or a
pixel:

```
AuthProvider.characterConfig → registry → asset ids → composition → SylfCharacterContent
 (the authority)               (translation) (content)   (one object)   (the display)
```

Every arrow is one-way. The display never sees a trait key; the resolver never
sees a pixel.

---

## 10. Verification

| Gate | Result |
| --- | --- |
| `npm run test -- --run __tests__/pixel-display __tests__/dashboard` | **356 passed / 15 files**, 0 failed (Phase 5: 314/14) |
| Shop / Locker / companion regression | **202 passed / 24 files**, 0 failed |
| `npx tsc --noEmit` | 0 errors |
| `npm run typecheck:engine` | 0 errors — the engine is still DOM-free and cosmetic-free |
| `npx eslint` on changed files | clean |
| `npm run build` | succeeds |
| `npm run mobile:build` + `mobile:verify` | succeeds / **PASSED** |
| `GET /dev/pixel-display` in production | **404**, no dev markup |
| `GET /dashboard` in production | 307 (still protected) |

New: **33 composition tests** (registry determinism, five-slot composition, order,
density independence, fallback for six kinds of broken input, bounded recursion)
plus five card-level tests for equipped, unknown and malformed configurations,
and two new boundary assertions.

### Boundary changes, and why

Two assertions were touched, both deliberately:

1. **The display-path allowlist** widened from `pixel-display/content$` to
   `pixel-display/content(/|$)`. Phase 6 reaches the **asset contract**, which
   lives one level down. Reaching the content is the point of an integration
   surface; what it may not reach is the engine, a renderer or a plane, and that
   is unchanged.

2. **The dual-vocabulary list** now names two modules instead of one: the adapter,
   and the dev review panel. The panel must show the *same* resolution a scholar
   would get, so it cannot be handed a hand-made composition to inspect. The
   assertion is an exact list rather than a "contains", so widening it again
   requires editing the test — and therefore a conversation.

Three assertions were **added**: the display layer may not import
`character-traits`, `shop`, `locker` or `asset-manifest`; the content layer may
not import the cosmetic registry; and nothing outside `app/dev/` may import the
dev surface.

---

## 11. Architectural findings

**Ambience and ground are genuinely different, and Phase 5's grouping of them was
a simplification.** Ground is *equipped*; ambience is *character-specific*. O19
was recorded as one question and turned out to be two, with different answers.
Worth remembering when the next "these look similar" grouping appears.

**The kind vocabulary was the right size at three until real slots demanded
more.** Phase 5 was right not to guess `pedestal` and `aura` in advance, and
right that adding them was small once the evidence existed. The extension cost
one union member, one validator constant, and two anchors.

**A registry that returns three distinguishable outcomes is more useful than one
that returns two.** Collapsing "unequipped" into "unknown" would have made
`aura: "none"` — the default for every scholar — indistinguishable from a broken
key, and would have raised a notice on almost every dashboard load.

---

## 12. Open decisions

| # | Decision | Status after Phase 6 |
| --- | --- | --- |
| O1–O18 | — | **Unchanged.** This phase created no pressure on resolution, presentation, scheduling, the renderer backend, effects or the framebuffer. |
| O19 | Scenery ownership | **Resolved for ground, still open for ambience.** Ground moved to the pedestal slot on the evidence of an equipped `pedestal` key. Sparkles stayed, because no slot selects them. If a future cosmetic needs shared ambience, that is the evidence to act on. |
| O20 | Nested asset composition | **Still open, still not needed.** One host plus a flat part list expressed every real cosmetic slot. Nothing has yet required a part to host its own parts. |
| **O21** | **Authoring the remaining fifteen forms as pixel assets** | **New.** The architecture accepts them today; the artwork does not exist. This is an art-production task with an authoring contract already in place, and it is the largest single piece of remaining migration work. |
| **O22** | **Whether form variants are separate assets or states of one** | **New, and genuinely undecided.** Sixteen forms could be sixteen assets, or one asset with sixteen states, or one base plus a palette/part swap. The evidence does not yet exist because the artwork does not. Deciding now would be guessing, and the roadmap's rule is not to. |
| **O23** | **Migrating the remaining ten `CharacterRenderer` consumers** | **New.** Social, Focus Party, Shop, Locker, Profile and `dashboard-design` still use the sprite pipeline. Each has its own sizing and context, and each should migrate on its own evidence. |
| **O24** | **The `aura` and `relic` catalogues are effectively empty** | **New.** `AURA_PRESETS` has one entry (`none`) and `RELIC_OPTIONS` has one (`relic_none`), while live configurations already carry keys like `aura_obsidian` that nothing defines. The display path is ready; the catalogues are the gap. This is worth surfacing to whoever owns them, because it currently means real scholars see no aura and no relic at all. |
| O17, O18 | — | **Unchanged.** |
