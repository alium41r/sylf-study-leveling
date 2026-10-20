# Source and reference assets

Non-runtime source artwork and design references. Nothing here is served by the
web or mobile apps; runtime assets belong in [`public/`](../public/).

| Path | Contents | Consumed by |
| --- | --- | --- |
| `branding/` | Sylf application logo. | Design and documentation work. |
| `design-references/` | Figma exports, login/sign-up artwork, and the `login-design/` SVG sources. | Design reference only. |
| `pixel-companion/source/` | Canonical transparent companion cut-outs. | `scripts/assets/prepare-pixel-companion-base.mjs`, `scripts/assets/audit-pixel-companion-grid.mjs` |
| `pixel-companion/eyes/` | Eye-sheet source art (batches 1–7). | `scripts/assets/prepare-pixel-companion-eyes.mjs` |

Generated runtime derivatives are written to `public/` (for example
`public/companions/pixel/sylf/`). Do not import `assets/` from application code.
