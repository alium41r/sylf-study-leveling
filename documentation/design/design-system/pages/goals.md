# Scholar Objectives & Quests — Goals & Tasks

This page-specific design direction overrides `MASTER.md` for `/goals`. It harmonizes the Objectives (Goals) and Quests tabs with the Scholar Dashboard (`/dashboard`) and Study Timer (`/timer`) visual language.

---

## 1. Visual System & Palette

- **Midnight Canvas**: `#080d17` (`--page`, `bg-[#080d17]`)
- **Card Surface**: `#0e1522` (`--surface`, `bg-[#0e1522]/90`)
- **Elevated Surface / Wells**: `#121c2b` (`--elevated`, `bg-[#121c2b]`)
- **Ink Text**: `#eef1f8` (`--ink`, high-contrast heading text)
- **Muted Text**: `#a1adc1` (`--muted`, descriptions, subtitles)
- **Quiet Text**: `#8291aa` (`--quiet`, secondary metadata, dates)
- **Moon-Blue Accent**: `#b7cbf7` / `#86aaf4` (`--accent` / `--accent-strong`)
- **Lines / Borders**: `#1a2435` subtle, `#263247` active
- **Container Glow**: `box-shadow: 0 0 22px -4px var(--accent-dim), 0 2px 8px rgba(0, 0, 0, 0.25)`
- **Specular Top Highlight**: `linear-gradient(90deg, transparent, var(--accent-strong), transparent)` with 55% opacity
- **Border Radius**: 16px (`rounded-2xl`) for primary cards, 10px (`rounded-xl`) for items, 6-8px (`rounded-lg`) for chips & micro-actions

---

## 2. Typography & Hierarchy

- **Title**: Refined typography — `Active <em>Goals</em>` and `Quest <em>Log</em>` with `Georgia, "Times New Roman", serif` or crisp Rajdhani.
- **Eyebrow**: Tracking-widest uppercase with glowing dot indicator — `SCHOLAR OBJECTIVES` & `SCHOLAR TASKS`.
- **Telemetry & Numbers**: Tabular numerals with `Inter`, monospace fonts for time and XP counters.
- **Vector Icons**: Exclusively Lucide vector icons (`Calendar`, `Clock`, `Zap`, `Target`, `Play`, `Pencil`, `Trash2`). Strictly no raw emojis.

---

## 3. Component Architecture

### Objective / Goal Cards (`GoalsTab`)
- **Surface**: Translucent elevated `#0e1522` surface with signature specular top highlight line and container glow.
- **Left Accent Indicator**: Sleek vertical indicator strip in the goal's selected color theme (`goal.color`), with soft ambient glow.
- **Header Row**: High-contrast title with description markdown, active status badge, and micro-actions toolbar (Pencil edit, Trash2 abandon).
- **Telemetry Row**:
  - `Timeline`: Calendar icon, overdue alert badge (`bg-red-500/10 text-red-400 border border-red-500/20`) or upcoming date badge.
  - `Intensity`: Flame/Zap icon with styled effort badge (`Standard`, `Focused`, `Hardcore`).
  - `Quests`: Target icon with total and completed quests progress.
  - `Edit Deadline`: Sleek compact action button with CalendarClock icon and inline date picker.

### Streak Quest Card (`QuestsTab`)
- **Structure**: Modeled after Timer's `.heroTimerCard` with centered or balanced layout, specular highlight, and radial starlight glow.
- **Telemetry**: Weekly focus minutes vs 3h milestone, level-scaled payout (+XP, +Sylph), and smooth gradient progress track.

### Quest Log Cards (`QuestsTab`)
- **Structure**: Distinct, beautifully spaced item cards with left accent bar inheriting the parent goal's theme color.
- **Play Action**: Circular play button with Lucide `Play` icon to immediately jump into a Focus Timer session for that quest.
- **Title & Metadata**: Quest title, parent goal badge pill, scheduled date with `Calendar` icon.
- **Rewards**: Lucide `Sparkles` icon for XP (+XP) and Sylph coin badge, `Clock` icon for duration.
- **Status & Actions**: Polished status pill (`COMPLETED`, `IN_PROGRESS`, `PENDING`), and icon action buttons (`Pencil`, `Trash2`).
