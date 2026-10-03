# Scholar Dashboard

This page-specific design direction overrides `MASTER.md` for `/dashboard`. It applies the landing page's midnight canvas and typography while keeping all labels direct, concise, and non-vibe-coded.

---

## 1. Visual System & Palette

- **Midnight Canvas**: `#080d17` (`--page`)
- **Inset Surface**: `#0e1522` (`--surface`)
- **Elevated Surface**: `#121c2b` (`--elevated`)
- **Ink Text**: `#eef1f8` (`--ink`)
- **Muted Text**: `#a1adc1` (`--muted`)
- **Quiet Text**: `#8291aa` (`--quiet`)
- **Moon-Blue Accent**: `#b7cbf7` / `#86aaf4` (`--accent`)
- **Lines / Borders**: `#1a2435` subtle, `#263247` active

---

## 2. Typography & Hierarchy

- **Title**: `Georgia, "Times New Roman", serif` — `Welcome back, <em>Scholar</em>`.
- **Eyebrow**: Simple uppercase tracking — `Scholar Dashboard`.
- **Subtitle**: Short and direct — `Your daily focus and quest overview.`
- **Telemetry & Numbers**: Clean `Inter` with tabular numerals.

---

## 3. Component Architecture & Proportions

### Character Hero Card
- **Enlarged Character Avatar**: 116px × 116px frame with `CharacterRenderer` at `size={100}`, showing character, pedestal, and aura prominently.
- **Character Tags**: `CHARACTER ↗`, user name, rank badge (e.g. `E-Rank • Lv. 3`).
- **Telemetry Tracks**: Constrained to `max-width: 520px` to maintain visual balance with the character.
  - Labels: strictly `EXP` and `HP` (no verbose adjectives).
  - Recessed tracks with smooth animated fills.

### Metrics Grid
- **Level**: Simple title `Level`, rank subtitle.
- **Total Focus**: Hours and minutes.
- **Today's Quests**: Completed / total with percentage.

### System Insights
- Clean `System Insights` heading with vector `Compass` icon.
- No verbose or pseudo-intellectual subtitle.
- Standard status chips: `Warning`, `Tip`, `Trend`.
