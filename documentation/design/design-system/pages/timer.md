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

### Responsive Session Choices
- Quests and subjects remain in two equal columns at every supported width, including phone viewports. Each section keeps its own list, count, loading state, and empty state.
- At a page container width of 1,000px or less, cards place wrapping titles and metadata above time readouts, followed by labeled Focus buttons. Subject management stays beside the Focus button. Interactive controls are at least 44px tall.
- At 540px or less, compact labels and a shorter daily-focus card leave more room for the two lists. Complete action names remain available to assistive technology.
- Add Subject appears below a populated subject list; an empty list uses its own add action. Menus and the existing create/edit/delete dialogs retain their behavior.
- Container queries measure the space left by the shared sidebar. Surface, text, and accent colors use the app's semantic appearance tokens, including custom backgrounds.
- See the [responsive layout verification](../../reports/timer-mobile-columns/report.md) for the checked viewports and states.


### Active Focus Session Bar (`/focus`)

- `FocusTimerLayoutRouter` owns one shared `FocusSessionBar` above Classic, Anime, Landscape, and Fantasy timer layouts. The bar combines phase/paused state, mode, subject or quest title, and the existing environment picker action.
- Keep the bar centered and compact, with a subdued translucent semantic surface, fine dividers, small regular text, and a steady status dot. Avoid animated dots, glow, shadows, bold uppercase environment labels, and a visible shortcut badge. The existing Alt+B shortcut remains available.
- Below 640px, hide the mode and environment name to leave room for the subject; keep the environment icon button at least 44px square. Long titles truncate with full context in their title attributes. Keyboard focus remains visible.
- Use the same presentation in inert environment previews. Timer engines, layout docking positions, shared party docks, and background preferences retain their existing owners. The mirror-tab notice reserves space above the bar.
- See the [session bar verification](../../reports/focus-session-bar/report.md) for viewport and appearance evidence.
