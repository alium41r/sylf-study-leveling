# Study Timer — Focus Sessions

This page-specific design direction overrides `MASTER.md` for `/timer`. It harmonizes the Study Timer with the Scholar Dashboard (`/dashboard`) and the Sylf landing page visual language.

---

## 1. Visual System & Palette

- **Midnight Canvas**: `#080d17` (`--page`)
- **Inset Surface**: `#0e1522` (`--surface`)
- **Elevated Surface**: `#121c2b` (`--elevated`)
- **Ink Text**: `#eef1f8` (`--ink`)
- **Muted Text**: `#a1adc1` (`--muted`)
- **Quiet Text**: `#8291aa` (`--quiet`)
- **Moon-Blue Accent**: `#b7cbf7` / `#86aaf4` (`--accent` / `--accent-strong`)
- **Lines / Borders**: `#1a2435` subtle, `#263247` active
- **Container Glow**: `box-shadow: 0 0 22px -4px var(--accent-dim)`
- **Specular Top Highlight**: `linear-gradient(90deg, transparent, var(--accent-strong), transparent)` with 55% opacity

---

## 2. Typography & Hierarchy

- **Title**: `Georgia, "Times New Roman", serif` — `Focus <em>Sessions</em>`.
- **Eyebrow**: Simple uppercase tracking with glowing dot indicator — `STUDY TIMER`.
- **Subtitle**: Short, concise, non-vibe-coded — `Track daily focus, active quests, and subject sessions.`
- **Timer Digits**: Tabular numerals with `Inter`, `font-variant-numeric: tabular-nums`, and crisp glow.
- **Section Headings**: Editorial serif for section titles (`Active Quests`, `Subjects`), paired with vector icons.

---

## 3. Component Architecture

### Hero Daily Focus Card
- Centered container with signature specular top line and container glow.
- Small uppercase date badge: `DAILY FOCUS • YYYY.MM.DD`.
- Prominent tabular digital clock (`00:00:00`) with legible contrast and refined glow.
- Clear caption: `Total focus time across quests and subjects today`.

### Active Quests Column
- Section header with Lucide `Target` icon.
- Cards with left accent indicator, circular play button, quest title with glassmorphism tooltip, difficulty pill (`Easy`, `Normal`, `Hard`, `Expert`), and elapsed / target time readout.
- Clean empty state with Lucide `Scroll` icon and thoughtful prompt when no active quests are found.

### Subjects Column
- Section header with Lucide `BookOpen` icon and `+ Add Subject` button.
- Subject cards with colored left accent indicator matching the subject's theme color (`subject.color`).
- Circular play action button, subject name, syllabus code badge, exam board & academic level, and today's accumulated focus time.
- Inline/expandable "Add Subject" card with styled form controls (name, syllabus code, board, level, syllabus details, color swatches).
- Clean empty state when no subjects exist yet.
