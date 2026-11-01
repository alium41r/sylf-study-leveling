# Sylf Native — Master Vision and Development Plan

**Phase 1 (Product Vision and Master Plan), 30 October 2026.** This is a planning document. Nothing in it is implemented, and it adds no code, dependencies or repository structure. The technology stack is **provisional** until Phase 2 approves it. Source, tests, schema and configuration remain authoritative for current Sylf behavior. The [Phase 1 report](reports/phase-1/report.md) summarizes how this plan was established.

## Status and decision log

| Date | Phase | Outcome |
| --- | --- | --- |
| 30 Oct 2026 | 1: Vision and master plan | Approved. |
| 30 Oct 2026 | 2: Tech stack research and validation | Approved. Stack: [ADR 0001](decisions/0001-technology-stack.md) (Accepted). Evidence: [Phase 2 report](reports/phase-2/report.md). |
| 30 Oct 2026 | Design direction (owner) | **Confirmed:** an original native visual language; the web app is a reference only for functionality, branding and preferences (§7.2). |
| 30 Oct 2026 | 3: Project foundation | Approved. `native/` workspace, Android build on the Tab S9 FE, Electron on macOS: [ADR 0002](decisions/0002-native-workspace-foundation.md), [Phase 3 report](reports/phase-3/report.md). **Stage 1 ends here.** |
| 30 Oct 2026 | 4: UI design system and Theme Studio | Approved. Scope grew during the phase (Confirmed by the owner): appearance customization, six themes, a Theme Studio and a Phase 4 handoff. [ADR 0003](decisions/0003-design-system-and-theme-engine.md), [design guide](design/README.md), [Phase 4 report](reports/phase-4/report.md). |
| 30 Oct 2026 | 5: Global Spaces system | Complete, **awaiting approval**. The app opens into a global switcher and three placeholder Spaces. [ADR 0004](decisions/0004-global-spaces-shell.md), [Spaces shell guide](spaces/README.md), [Phase 5 report](reports/phase-5/report.md). Verified on Electron and the Tab S9 FE; iOS stays unresolved until real iPad testing (owner). |
| 30 Oct 2026 | Backend compatibility (owner) | **Confirmed:** Sylf Native is a completely redesigned frontend, not a new backend or product. See §7.3. Applies to every later phase. |
| 30 Oct 2026 | 6: Home interface template | Complete, **awaiting approval**. Home has its rail and four destinations, built as templates on typed sample data. [ADR 0005](decisions/0005-home-interface-template.md), [Home guide](home/README.md), [Phase 6 report](reports/phase-6/report.md). Read the [Phase 6 handoff](handoffs/phase-6.md) first. |

| 31 Oct 2026 | 7: Workspace interface and Command Center | Complete, **awaiting review**. The owner approved Phase 6 and authorized Phases 7 and 8 as one overnight run on the Mac, with no tablet. A finite dotted canvas, a Command Center and ten tool shells. [ADR 0006](decisions/0006-workspace-canvas-and-windows.md), [Workspace guide](workspace/README.md), [Phase 7 report](reports/phase-7/report.md). |
| 31 Oct 2026 | 8: Workspace multitasking | Complete on the Mac, **awaiting review**. Free windows, instances, presets, restoration, suspension. An earlier build ran on the tablet with partial results, and the final code has not. [Phase 8 report](reports/phase-8/report.md). Read the [Phase 8 handoff](handoffs/phase-8.md) first. **Stop before Phase 9.** |
| 31 Oct 2026 | 9: World lobby and foundation | Complete on the Mac, **awaiting review**. A lobby at the gate and an engine-agnostic host, with no game. [ADR 0007](decisions/0007-world-lobby-and-host.md), [World guide](world/README.md), [Phase 9 report](reports/phase-9/report.md). Read the [Phase 9 handoff](handoffs/phase-9.md) first. **Stop before Phase 10.** |
| 31 Oct 2026 | Testing location (owner) | **Confirmed:** until Phase 10 is complete, all work and testing stay on the Mac. No connecting to, installing on or testing with the Samsung tablet. Android tablet verification, performance testing and device-specific debugging wait until after Phase 10 and the owner's explicit authorization. Unavailable tablet testing does not block development. |
| 31 Oct 2026 | 9: World lobby and foundation | **Approved** by the owner in the Phase 10 brief. **Confirmed with it:** the Phase 9 gate is the main World lobby image, World's sky stays independent of the appearance theme, and Sylf Native stays a redesigned frontend over the existing backend. |
| 31 Oct 2026 | 10: Device adaptation, Universal Timer Dock and frontend refinement | Complete on the Mac, **awaiting review**. One study session behind a dock, Focus and Workspace's Timer, Spaces shortcuts on desktop, and a pass across all three Spaces. **Milestone 1 is reached on the Mac, and Stage 2 ends here.** [ADR 0008](decisions/0008-study-session-and-timer-dock.md), [Phase 10 report](reports/phase-10/report.md). Read the [Stage 2 handoff](handoffs/stage-2.md) first. **Stop before Phase 11.** Tablet verification needs the owner's authorization, and its list is in the [tablet checklist](handoffs/tablet-checklist.md). |
| 1 Nov 2026 | 11: Backend audit | Complete on the Mac, **awaiting the gate**. One critical and six high security defects, and one forged-time defect, were reproduced on real PostgreSQL and fixed. Native authentication and session ownership are Proposed in [ADR 0009](decisions/0009-native-authentication.md) and [ADR 0010](decisions/0010-session-ownership-before-sign-in.md). One RLS migration is written and not applied. Hosted state was not inspected, and nothing is deployed. [Handoff](handoffs/phase-11.md) |
| 1 Nov 2026 | 12: Shared backend foundation | Complete on the Mac, **awaiting the gate**. Native sign-in with revocation parity, password and OAuth, through one `AuthSession` row per device and one branch in `getSession`. A typed client, cached reads, connectivity, `TimerSync` on native, small reads, Electron's main process as the client. Connected to no screen, by design: Phase 13 does that. [ADR 0009](decisions/0009-native-authentication.md) as built, [ADR 0011](decisions/0011-shared-backend-foundation.md), [backend guide](backend/README.md), [Phase 12 handoff](handoffs/phase-12.md), [Phase 12 report](reports/phase-12/report.md). |
| 1 Nov 2026 | 13: Core feature integration | Complete on the Mac, **awaiting the gate**. Real sign-in, one session delivered through `TimerSync`, and Home, Workspace and World on real data, with honest limited states for what Phase 14 owns. Nothing deployed, no hosted service, no device. [Report](reports/phase-13/report.md), [Stage 3 handoff](handoffs/stage-3.md), [ADR 0012](decisions/0012-connected-app.md) |
| 1 Nov 2026 | Expansion Part 1: audit and blueprint | Complete, **awaiting review**. The owner approved Plan as a fifth Home destination, the immersive Focus environment, and moving Calendar and Planner to Home after parity. No application code or hosted service changed. A rehearsed recovery baseline exists outside the repository. Four production defects were proved and five planned repairs were removed. No device run. [Report](reports/expansion-part-1/report.md), [urgent issues](reports/expansion-part-1/urgent-issues.md), [blueprint](expansion/blueprint.md), [Part 2 handoff](handoffs/expansion-part-1.md), [ADR 0016](decisions/0016-realtime-streaming-and-remote-media.md). |
| 1 Nov 2026 | Roadmap revision (owner) | **Confirmed:** a Feature Expansion and Experience Redesign stage goes between Phase 13 and Phase 14, in four parts. Phases 14 to 17 keep their numbers. Calendar, AI Planner, quests and objectives belong in Home, and Workspace stays a dedicated study environment. Stabilization and tablet verification are a prerequisite. **Planned only, and nothing is implemented.** [Stage plan](expansion/README.md), [feature map](expansion/feature-map.md), ADRs [0013](decisions/0013-expansion-stage.md), [0014](decisions/0014-home-hub-and-workspace-scope.md), [0015](decisions/0015-session-modes-focus-environment-and-parties.md). |

Stage handoffs and their schedule are listed in the [native index](README.md#stage-handoffs).

Statements are labelled by status:

- **Confirmed**: a product decision given in the Sylf Native brief or the approved roadmap.
- **Proposed**: a recommendation from this phase. It needs review, and can be changed without reopening confirmed decisions.
- **Open**: an unresolved product question or technical validation. Each has an owning phase in [§8](#8-risks-open-questions-and-decisions-requiring-validation).

---

## 1. Product vision and objectives

### 1.1 Vision

**Confirmed.** Sylf Native is a new, premium, high-performance study and productivity application. It combines productivity, AI-assisted learning, advanced workspaces, social interaction and gamification in one coherent ecosystem. It is built from scratch inside the existing Sylf repository, with a new frontend. It reuses proven Sylf backend systems wherever they are suitable.

It should feel purpose-built: a calm, distinctive instrument for studying. It should not feel like a website in a wrapper or a collection of separate tools.

### 1.2 Objectives

| # | Objective | Status |
| --- | --- | --- |
| O1 | Deliver a tablet-first native application for iPad and Android tablets, with desktop/laptop treated as an equal large-screen priority. | Confirmed |
| O2 | Organize the product into three Spaces (Home, Workspace, World), each with its own navigation philosophy, joined by one global Spaces switcher. | Confirmed |
| O3 | Make Workspace the most capable study environment in Sylf: a large canvas, a dock-style Command Center, multiple simultaneous tools, layouts and session restoration. | Confirmed |
| O4 | Build Sylf World as a fully immersive game, connected to Sylf progression and rewards and isolated from the rest of the app for performance. | Confirmed |
| O5 | Provide a simplified phone companion (Timer, Home, basic tasks, progress, social) as a separate frontend module sharing core logic. It comes later. | Confirmed |
| O6 | Preserve the existing Next.js web app, backend, databases and production behavior. Web and native must share authoritative data. | Confirmed |
| O7 | Put quality, usability and performance ahead of implementation speed: fast startup, low memory use, smooth interaction and native-quality pen and keyboard input. | Confirmed |
| O8 | Reuse existing domain logic and server authorities rather than rebuilding them. No parallel timer, progression, planner, document or AI systems. | Confirmed (also required by the [repository instructions](../../AGENTS.md)) |

### 1.3 What success looks like

**Proposed.** A student opens Sylf on an iPad and lands in Home within about two seconds. They see what to do next and start a session in one action. They move into Workspace, open their notes and a past paper side by side, ask Sylvie about a question, and write with a pencil without noticing latency. When they finish, the session settles to the same server ledgers the web app uses, and their progress appears in Home and World. Next time, Workspace restores exactly where they stopped. World feels like a place they want to return to, earned by studying, and never like a distraction built into the study tools.

### 1.4 Delivery sequence

**Confirmed.** There are 17 phases in five stages: Vision and Architecture (1–3), Frontend Templates and Navigation (4–10), Backend Integration (11–13), Advanced Features (14–15), and Testing and Release (16–17). Each phase is completed, reviewed and approved before the next begins. **Milestone 1** (end of Phase 10) is a fully navigable, visually polished native app with all three Spaces, working navigation and Command Center, and empty feature templates. It has no backend integration.

**Confirmed (owner, 1 November 2026): the Expansion stage.** A Feature Expansion and Experience Redesign stage runs between Phase 13 and Phase 14. It brings the useful Sylf Web features into Native, redesigns them in Aloft, improves them and audits their backend integration. Phases 14 to 17 keep their numbers and scope.

| Order | Stage or part | Work | State |
| --- | --- | --- | --- |
| 1 | Stage 1 | Phases 1–3 | Done |
| 2 | Stage 2 | Phases 4–10 | Done |
| 3 | Stage 3 | Phases 11–13 | Done on the Mac and, in portrait, the tablet. Awaiting the owner |
| 4 | Entry gate | Stage 3 review, a committed baseline, remaining tablet verification | Part 1 started with these open. A baseline stands in for the commit until Part 2 |
| 5 | Expansion Part 1 | Web-to-Native audit and design blueprint | **Complete, awaiting review** |
| 6 | Expansion Part 2 | Study experience, progression and personalization | **Next,** after the commit and the owner's review |
| 7 | Expansion Part 3 | Social systems, Sylvie and AI Planner | Planned |
| 8 | Expansion Part 4 | Integration, optimization and polish | Planned |
| 9 | Stage 4 | Phase 14 Notes, PDFs, Whiteboard, Resources. Phase 15 World | Waits |
| 10 | Stage 5 | Phases 16 and 17 | Waits |

The plan is the [Expansion stage](expansion/README.md). The new stage is unnumbered on purpose, so existing references stay true ([ADR 0013](decisions/0013-expansion-stage.md)). **No part starts without the owner's authorization.**

**Proposed qualification.** "Frontend before backend" should not mean "frontend without contracts". Templates in Phases 5–10 should be built against typed, mock-backed interfaces shaped like the real Sylf contracts (see [§5.4](#54-frontend-first-without-throwaway-work)). Phase 13 then swaps adapters instead of rewriting screens.

---

## 2. The three Sylf Spaces

### 2.1 Home — Personal Command Center

**Confirmed.** Home is the everyday experience: dashboard, focus timer, daily objectives, quests, study statistics, progression and social features. It has a compact, refined vertical navigation rail on the left. It prioritizes immediate actions, upcoming work and useful information. It keeps clutter to a minimum, makes navigation intuitive and keeps gamification subtle. A persistent study session connects Home and Workspace.

**Confirmed (owner, 1 November 2026).** Home is the central hub for calendar, planning, daily objectives, quests, schedules and educational progress. Calendar, AI Planner, quests and objectives belong in Home, integrated into its navigation without unnecessary sections ([ADR 0014](decisions/0014-home-hub-and-workspace-scope.md)).

**Confirmed destinations (roadmap Phase 6):** Today, Focus, Circle, Progress. **Approved addition (owner, 1 November 2026, not built):** one destination, Plan.

**Proposed content mapping**, drawn from existing web features:

| Destination | Purpose | Existing Sylf sources (reference only, not UI to migrate) |
| --- | --- | --- |
| **Today** | What to do now: next action, today's objectives and quests, upcoming Planner and Calendar items, a resume-Workspace entry and a short Sylvie briefing. | Dashboard, Quests/Goals, Planner revisions, Calendar projection, daily briefing ([`lib/ai/daily-briefing-service.ts`](../../lib/ai/daily-briefing-service.ts)). |
| **Plan** (planned) | What is ahead, and how to shape it: Calendar, Quests and goals, and Plans, which holds AI Planner V2's whole workflow. The schedule lives here too. | Calendar, Quests/Goals, Subjects, study schedule, [Student Planner workspace](../planner/STUDENT_WORKSPACE.md). |
| **Focus** | Prepare and review a study session. Covers subject or quest selection, modes, focus backgrounds, ambient audio and Focus Parties. It opens the immersive Focus environment, a shell layer above the Spaces (planned, [ADR 0015](decisions/0015-session-modes-focus-environment-and-parties.md)). | Timer ([timer contract](../timer/README.md)), focus backgrounds, Acoustics, Focus Party. |
| **Circle** | Social: friends, presence, conversations, invites, shared sessions and parties. | Social, chats, friendships, Focus Party, Supabase Realtime presence. |
| **Progress** | Level, XP, stats, rankings, cognitive stats, skill tree, achievements, Codex and study history. | [`game-engine`](../../lib/game-engine.ts), [`cognitive-stats`](../../lib/cognitive-stats.ts), [`skill-tree`](../../lib/skill-tree.ts), achievements, [`archive-catalog`](../../lib/archive-catalog.ts), System Hub. |

**Proposed rail behavior.** The rail shows icons only by default, with an optional label on hover or long-press. The four destinations sit at the top. Profile/account and settings sit at the bottom behind the user's avatar or companion. The rail never carries Workspace tools; those belong to the Command Center.

**Open.**

The [Home guide](home/README.md#3-destinations) records where Phase 6 left these three: all on their proposed defaults.

- H1: Where Locker, Shop, Inventory and cosmetics live. The roadmap integrates Locker and Shop with World in Phase 15, which suggests they move into World. Home's Progress would then show earned items only.
- H2: **Decided by the owner, 1 November 2026.** Full Planner and Calendar live in Home, and Workspace's versions leave once Home has parity. This replaces the earlier proposal of summaries only.
- H3: How Sylvie appears in Home. The proposed answer is a lightweight quick-ask overlay that reuses the same runtime; the full Sylvie tool lives in Workspace. It is scheduled for [Expansion Part 3](expansion/part-3-social-sylvie-planner.md).

### 2.2 Workspace — Advanced Study Environment

**Confirmed.** Workspace is the most powerful environment, designed to maximize usable screen space:

- A large, uninterrupted canvas without a permanent sidebar.
- A Command Center inspired by the macOS Dock, for launching, switching and managing tools.
- Tools: Notes, Planner, Calendar, Sylvie AI, Timer, Calculator, Audio Dock, PDFs, Whiteboard and Resources. **Confirmed change (owner, 1 November 2026):** Workspace is a dedicated multitasking study environment, so Planner and Calendar leave once Home has parity, without losing functionality ([ADR 0014](decisions/0014-home-hub-and-workspace-scope.md)). They are still built here today.
- Multiple simultaneous tools, floating windows, resizable panels and split-screen arrangements.
- Presets: Focus, Split and Assistant.
- Session restoration, contextual AI, smooth transitions, natural handwriting and stylus support, keyboard shortcuts and efficient multitasking.

**Proposed layout model.** A Workspace layout is a small, serializable description:

- **Regions**: a primary canvas region plus optional docked side regions. Split ratios snap to useful positions, such as ⅓, ½ and ⅔.
- **Panels**: each panel hosts one tool instance and is either `docked`, `floating` (position/size within the canvas) or `collapsed` (a chip on the canvas edge or Command Center).
- **Presets** as starting layouts:
  - **Focus**: one tool fills the canvas; a minimal session indicator appears; the Command Center auto-hides.
  - **Split**: two tools side by side, for example a PDF beside a notebook.
  - **Assistant**: a main tool plus a docked, context-aware Sylvie panel.
- A preset is a starting point. A user's adjustments persist as their own layout and do not mutate the preset.

**Proposed tool contract.** Every tool is a module that declares:

- Identity, icon and capabilities (pen, keyboard, file, AI-context provider).
- Minimum, preferred and maximum panel sizes, and whether it supports floating, multiple instances and compact mode.
- A lifecycle: `mount → active → background → suspended → restored → disposed`. Restorable state is small and serialized. Heavy resources (decoded PDF pages, ink rasters, audio buffers) are released on `suspended` and rebuilt on `restored`.
- A per-tool resource budget and lazy loading, so opening Workspace does not load every tool.
- Optional *context* it may expose to Sylvie, such as the current page, selection or task. Exposure happens only on explicit user selection (see [§6](#6-existing-sylf-systems-that-may-be-reused)).

**Confirmed direction (owner, 30 October 2026) — a zoomable grid canvas.** The Workspace canvas is a dot grid larger than the screen. People can zoom in and out, and tools rest within the grid. The Phase 5 placeholder shows a fixed dot grid only. This replaces the idea of a canvas exactly the size of the window, so it reframes the layout model above: panel positions may need to live in canvas coordinates, with a saved camera (position and zoom). **W5 (Proposed in [ADR 0006](decisions/0006-workspace-canvas-and-windows.md)):** the world is finite at 5600 × 3640 pt, windows land on the 28 pt grid, zoom scales tools with the canvas from 20% to 200%, and presets work at 100%. **Open:** how a pen behaves on the canvas (Phase 14) and how this meets OS edge gestures on tablets. Phase 5 measured the constraint: a full-window SVG costs about 50 MB on Android, so the grid stays a shared tile.

**Proposed relationship to Sylf tools.** Tools are new native frontends over existing authorities. Notes, PDF and Whiteboard all use one Sylf Notes document foundation. Whiteboard is a Notes drawing document, per the [Study Workspaces plan](../workspaces/master-plan-october-2026.md#6-consolidating-note-taking-functionality). Timer uses the canonical timer and session authority. Planner and Calendar use their existing services, wherever their surfaces live. Sylvie uses the existing AI runtime. Resources uses the unified Resource Shelf concept.

**Important reconciliation (W1, Proposed in ADR 0006).** The October [Study Workspaces master plan](../workspaces/master-plan-october-2026.md) already uses "Workspace" for a different concept. There, a workspace is a persistent, reusable study configuration (subject/topic, goal, tasks, Resource Shelf, preferred tools, resume context) that orchestrates Notes, Timer and Sylvie. Sylf Native's Workspace is a *Space*: the canvas and Command Center environment.

**Proposed resolution.** These are complementary layers, not competitors:

- **Workspace (Space)** is the environment and window manager.
- A **Study Workspace** (for example "Further Mathematics — Complex Numbers") is a saved context that the Space opens. It brings its layout, resources, goal, tasks and session settings.
- "Start Workspace → Study → Finish Session → Continue Later" becomes the primary flow inside the Workspace Space.

Ownership stays as that plan defines it: Notes owns documents, Sessions own timer and study activity, and Workspace configuration references both. Phases 7 and 8 built to this: "Workspace" is the Space, and a saved context stays unbuilt. Its final name still needs the owner.

**Built to the proposed answers (Phases 7 and 8).** The [Workspace guide](workspace/README.md) is the current contract, and it supersedes the regions, panels and docking described above: windows are free on the canvas, and presets arrange them.

- W2: One Workspace per person. Saved contexts arrive with Study Workspace integration.
- W3: Bottom center, auto-hiding in Focus with a handle to reveal it. Placement relative to the iPadOS home indicator and Android gesture bar still needs device testing.
- W4: Below 600 pt, one tool fills the window ([§4.4](#44-window-size-classes-not-device-types)).

### 2.3 Sylf World — Immersive Fantasy Game

**Confirmed.** Sylf World is a dedicated, fully immersive game, not another dashboard. It is inspired by the freedom of sandbox games while developing its own visual identity. It covers exploration, customization, building, progression, rewards and social interaction. It integrates with Sylf's progression and reward systems and has minimal conventional navigation, using game-specific controls and interfaces. It needs a proper save-and-leave experience before returning to other Spaces, and strong performance isolation from the rest of the app.

**Proposed product principles.**

1. **Original identity.** World shares a genre (an open, buildable fantasy world) but no specific existing game's assets, mechanics, branding or look. Sylf's companion, pixel art lineage ([Pixel Display](../pixel-display/README.md)) and Floating Sanctuary/island imagery ([authentication experience](../authentication/README.md)) are natural starting points for an identity.
2. **Earned by studying, never a substitute for it.** Rewards come from server-settled study outcomes: XP, Sylph currency, items and cosmetics. Gameplay itself must not mint study rewards on the client.
3. **Server-authoritative economy.** Purchases, inventory and cosmetics continue to use the existing ledgers (`XpLedger`, `SylphLedger`, `HpLedger`, `UserInventory`, `InventoryItem`, `UserCosmetic`) and atomic RPC patterns. World-specific state (terrain, builds, placements) is a new owned domain with its own storage contract, decided in Phase 15.
4. **Isolation.** The engine loads only on World entry and is torn down (or reduced to a bounded suspended state) on exit. It never runs underneath Home or Workspace.

**Built in Phase 9, and refined in Phase 10.** The [World guide](world/README.md) is the current contract for the lobby and the host. The Phase 9 gate is the main lobby image, and the sky stays independent of the appearance theme (both Confirmed, owner). The owner's visual direction, `assets/design-references/sylf world design assets.pdf`, is the primary reference for World's identity (Confirmed), and most of it describes the game, so it waits for Phase 15. The World host is one interface with no engine named, and a stand-in host walks the whole path until there is a game.

**Proposed entry and exit.**

- **Entry:** choosing World in the Spaces switcher shows a short, atmospheric transition with a loading state that reports real progress. Spaces navigation then hands control to the game.
- **In play:** the Spaces icon is not shown. A game menu (Resume, Settings, Save & Leave) takes its place.
- **Exit:** Save & Leave waits for a confirmed local save. Pending remote sync is shown honestly. The engine shuts down, and Sylf returns to the previously active Space with its state restored.

**Open.**

- G1: Whether World can be entered during an active study session. The proposed answer is that entering World pauses or requires ending focus, with a clear prompt. Silently counting game time as study time is not acceptable.
- G2: Whether World is single-player first with social features later (visits, shared builds, presence). The proposed answer is yes; real-time multiplayer needs new server infrastructure and is a separate decision.
- G3: Supported-device floor and download size. World might be an on-demand download, for example with iOS On-Demand Resources or Android Play Asset Delivery.
- G4: Phone exclusion. World is excluded from phones (confirmed). On small tablets and split-screen windows, World may need a minimum window size.

---

## 3. Global navigation and Command Center philosophy

### 3.1 Sylf Spaces switcher

**Confirmed.**

- One persistent Spaces icon in the top-left corner of the app shell.
- Activating it reveals a short, expandable horizontal bar with Home, Workspace and World.
- Each Space has its own independent navigation system.
- In World gameplay, the game's exit flow takes priority. The switcher becomes available after leaving the active world.
- Switching preserves relevant state without keeping heavy components running.

**Proposed interaction details.**

- The icon is small and quiet, aligned with the safe area. The current Space is indicated subtly, for example by tint or glyph.
- The bar expands horizontally from the icon with a short spring animation. It collapses on selection, outside tap or Escape. It never covers the whole screen.
- Keyboard shortcuts: Command + 1, 2 or 3 on a Mac and Control + 1, 2 or 3 elsewhere switch Spaces directly (built for desktop in Phase 10, checked against each system in [ADR 0008](decisions/0008-study-session-and-timer-dock.md#shortcuts-what-was-checked)). No shortcut opens the bar, because direct keys leave nothing for it to do. A tablet needs a native key hook, which is deferred to Phase 14's keyboard work.
- Gestures: none by default. A global edge or multi-finger gesture risks conflicts with OS, pen and canvas gestures, so this needs validation before adoption.
- Accessibility: the bar is a labelled tab list with focus order, VoiceOver/TalkBack labels and reduced-motion variants.

### 3.2 State preservation across Spaces

**Proposed contract.** Each Space exposes `serialize()` and `restore()` for a small state snapshot. Shell-level services outlive Space switches.

| State | Home | Workspace | World |
| --- | --- | --- | --- |
| Kept alive when leaving | Route and scroll position (cheap). | Layout, open tool instances and their restorable state. Tools are suspended, not running. | Nothing heavy. A save checkpoint and last location only; the engine is torn down. |
| Restored on return | Same destination. | Same layout; tools rehydrate lazily, visible ones first. | World re-enters through its entry experience from the last save. |
| Survives app restart | Yes. | Yes (this is "session restoration"). | Yes, through game saves. |

**Shell-level services** run regardless of the active Space: authentication and session, the active study session (timer and journal), appearance, connectivity and sync status, notifications, and audio playback (if the student keeps ambient audio running). **Planned (Expansion stage):** presence, one Realtime connection, one audio engine, and the Focus environment above the Spaces, all around the same session ([ADR 0015](decisions/0015-session-modes-focus-environment-and-parties.md)). **Built in Phase 10:** the persistent study session is `createStudySessionModel`, and it appears as the Universal Timer Dock in Home, Workspace and the World lobby. In the game there is no dock, and entering needs a paused or ended session, by G1 ([Spaces guide](spaces/README.md#10-the-study-session-and-the-timer-dock)).

### 3.3 Command Center philosophy

**Confirmed.** The Command Center is the macOS Dock–inspired surface for launching, switching and managing Workspace tools.

**Proposed principles.**

1. **One place for tools.** Launching, switching, focusing, minimizing and closing tools happen in the Command Center. There are no competing toolbars.
2. **Quiet until needed.** It is small, translucent and auto-hides in Focus layout. It reveals itself predictably and never covers pen input mid-stroke.
3. **State at a glance.** Open tools show an indicator, and collapsed panels appear as chips. The session status and a layout control (Focus / Split / Assistant / custom) live at one end.
4. **Recent and pinned.** Pinned tools have stable positions, and recently used tools follow. A long-press or right-click menu offers new instance, layout placement and close.
5. **Keyboard-first parity.** Every Command Center action has a shortcut on desktop, and a quick switcher opens with Command or Control + K (built in Phase 8). It finds tools and windows. Finding documents waits for real data.
6. **Contextual, not crowded.** Only Workspace tools appear. Home and World navigation never leak into it.

---

## 4. Platform strategy

### 4.1 Priorities

**Confirmed.**

1. Desktop/laptop and iPad/Android tablet experiences first.
2. Native, large-screen-first interfaces with exceptional responsiveness and polish.
3. A simplified iOS/Android phone companion, developed later.

### 4.2 Tablet (primary native target)

**Proposed requirements**, to validate in Phase 2 and qualify in Phases 10 and 16:

- **Orientation and windows:** portrait, landscape, iPad Split View, Slide Over and Stage Manager, and Android split-screen, freeform and desktop windowing. Live resizing must not lose state.
- **Input:** Apple Pencil (pressure, tilt, hover where available, double-tap/squeeze), S Pen and other Android styluses, palm rejection, touch, hardware keyboard, trackpad and mouse (pointer hover, right-click, scroll), and external displays where the OS supports it.
- **Performance:** 120 Hz ProMotion and high-refresh Android displays; low-latency ink.
- **Platform services:** background-safe timer and session behavior (Live Activities and notifications on iOS; foreground service and notifications on Android), Files and share integration, drag and drop between tools and apps, and state restoration after OS process termination.

### 4.3 Desktop/laptop

**Confirmed.** Desktop/laptop is a first-tier priority. The desktop-native distribution strategy is decided in Phase 2, and the existing Next.js web application is preserved.

**Open (D1, highest priority for Phase 2).** How desktop users receive the Sylf Native experience. Candidates:

| Candidate | Notes for evaluation |
| --- | --- |
| Native app on macOS through iPad-on-Mac or Mac Catalyst | Low incremental cost if the tablet app is native iOS, but macOS only. Window and keyboard fidelity and App Store distribution need checking. |
| React Native for macOS/Windows | One codebase reaches desktop natively. Library coverage (pen, PDF, game embedding) and the maturity of community-maintained platforms need verification. |
| Desktop shell around a web build of the native UI (Electron or Tauri) | Broad reach, but adds a second runtime. Its performance and memory targets may conflict with O7. |
| Existing Next.js web app on desktop for now, Native UI later | Lowest risk. It delays a unified desktop experience and leaves desktop users on the current UI. |

A related question is **D2**: whether the Sylf Native UI ever comes to the web, or the web keeps its current UI indefinitely. That choice decides whether Phase 4 components must target web rendering.

### 4.4 Window size classes, not device types

**Proposed.** Layout adapts to the **window** the app has, not the device it runs on. An iPad in narrow Split View or Slide Over, or an Android tablet in a small freeform window, can be as narrow as a phone.

| Class (approximate, validate in Phase 4) | Behavior |
| --- | --- |
| Compact (< ~600 pt) | Phone-like layouts: one tool at a time in Workspace, with sheets instead of floating windows. World requires a larger window. |
| Medium (~600–1000 pt) | Two-region splits; a floating panel limit applies. |
| Expanded (> ~1000 pt) | Full multitasking: multiple floating panels and all presets. |

Feature **availability** (World and the full Workspace) depends on product tier and device capability. Layout depends on window size. **Decided in Phase 10 (Proposed):** a compact window on a tablet keeps the tablet app's compact layouts, and the phone companion is for phones. All three Spaces work under 600 pt, and crossing the width must not swap the app.

### 4.5 Phone companion

**Confirmed.** The phone app is a separate frontend folder/module that shares core logic. Its scope is Timer, Home, basic tasks, progress and social, without the full Workspace or World. It is developed later.

**Proposed.**

- It is a distinct frontend package in the same native project, with its own navigation (for example, a bottom tab bar) and components tuned for one-handed use. It reuses the design system tokens and shared domain packages.
- **Open (P1):** whether the phone experience ships in the same app binary (a universal iOS app, and one Android app that picks the frontend by device class) or as a separate store listing. One binary is simpler for accounts and installs and avoids two store identities. The proposed default is one binary with two frontends. Phase 2 confirms feasibility and size impact.
- The phone is a natural Focus companion: start or stop a session started elsewhere, and act as a session remote while the tablet is in Workspace.

### 4.6 Relationship to the existing web and Capacitor clients

**Confirmed.** The Next.js web app is preserved and unchanged.

**Observation.** The repository already contains a Vite/Capacitor client in [`mobile/`](../../mobile/) with an Android project in [`android/`](../../android/) (`appId: app.sylf.study`). It reuses web screens through navigation and API adapters, and is a WebView client. There is no iOS project.

**Open (C1).** Sylf Native is a different product surface. It must not reuse or disturb the Capacitor client, but the following need decisions:

1. Whether Sylf Native eventually replaces the Capacitor Android app, and on what timeline.
2. Whether it shares the `app.sylf.study` identifier, which would make it an upgrade path, or uses a new one.
3. What folder name it uses, since `mobile/` is taken.

---

## 5. Intended technical architecture and performance principles

### 5.1 Stack (accepted in Phase 2)

Phase 1 named a provisional candidate: React Native + Expo + TypeScript with Swift/Kotlin modules, SQLite/Yjs offline data, the existing backend, a modular monorepo and a dedicated game engine. **Phase 2 decided** ([ADR 0001](decisions/0001-technology-stack.md), Accepted):

- One React Native + Expo (SDK 58, React Native 0.88, Hermes V1) codebase.
- Native on tablets and phones, using Expo modules for ink, PDF, SQLite, secure sessions, background timers, audio and the World host.
- On macOS and Windows, its **react-native-web build inside Electron**, using Sylf's existing web owners.
- BlockNote in an Expo DOM component for rich text.
- A separate `native/` npm workspace consuming approved `lib/` modules in place.

The game engine stays deferred to Phase 15. [§9](#9-handoff-to-phase-2--tech-stack-research-and-validation) keeps the original evaluation questions.

### 5.2 Architectural layers (proposed, stack-independent)

```
┌──────────────────────────────────────────────────────────────────┐
│ App shell: Spaces switcher · auth gate · session indicator ·     │
│            appearance · connectivity · notifications             │
├───────────────┬─────────────────────────────┬────────────────────┤
│ Home Space    │ Workspace Space             │ World Space        │
│ rail + 4      │ canvas · Command Center ·   │ isolated engine    │
│ destinations  │ layout manager · tools      │ host + game HUD    │
├───────────────┴─────────────────────────────┴────────────────────┤
│ Design system: tokens (from Sylf appearance) · components ·      │
│                motion · input/gesture primitives                 │
├──────────────────────────────────────────────────────────────────┤
│ Shared domain packages (pure TS): progression, timer math,       │
│ planner contracts, notes formats, calculator, catalogs           │
├──────────────────────────────────────────────────────────────────┤
│ Platform adapters: storage (SQLite/files) · secure credentials · │
│ pen input · PDF · audio · background session · files/share       │
├──────────────────────────────────────────────────────────────────┤
│ Data access: typed API client · sync/outbox · local cache        │
└──────────────────────────────────────────────────────────────────┘
                    │  HTTPS (existing /api routes)  │ Realtime
┌──────────────────────────────────────────────────────────────────┐
│ Existing Sylf backend: Next.js API routes · Prisma/PostgreSQL    │
│ (RPCs, ledgers, RLS) · Supabase Realtime/Storage · Redis · AI    │
│ providers · Notes credential broker · user cloud (Drive)         │
└──────────────────────────────────────────────────────────────────┘
```

**Proposed rules.**

1. **The backend stays authoritative.** Native talks to the existing API routes, with new native-auth-aware endpoints only where needed. It never talks to PostgreSQL or Prisma directly. Rewards, settlement and quotas are never computed client-side as truth.
2. **Shared domain packages are pure.** They have no React, DOM, Next, Prisma or server-only imports, and no browser globals. Platform specifics enter through adapters. This extends the boundary the [mobile Vite server guard](../../mobile/vite.config.ts) already enforces.
3. **One format per domain.** Native Notes, ink and PDF annotations read and write the existing Sylf envelope v1, `sylf-ink/1` and PDF anchoring formats ([Notes contracts](../notes/README.md)). A platform-native ink format (for example PencilKit's) may be used for capture or rendering, but never as stored authority.
4. **Spaces are separately loaded modules.** Startup loads the shell plus the last-used Space only. World and heavy Workspace tools are lazily loaded. World's engine never shares the UI thread with Home or Workspace.
5. **Adapters are capability-aware.** Features check capabilities (pen pressure, hover, background execution, multi-window) instead of platform names, following the [Study Workspaces native guidance](../workspaces/master-plan-october-2026.md#7-future-android-and-ios-integration).
6. **The web app is untouched.** Any extraction of shared code out of `lib/` must keep existing web imports working (see risk R10).

### 5.3 Performance principles and proposed budgets

These budgets are **proposed targets** for Phase 2 to validate on reference devices: a recent iPad Air, a base iPad, a mid-range Android tablet and a low-end Android tablet.

| Area | Proposed target |
| --- | --- |
| Cold start to interactive Home | ≤ 2.0 s on a mid-range tablet. Warm start ≤ 0.8 s. |
| Space switch (Home ↔ Workspace) | ≤ 300 ms to first meaningful frame, with no dropped frames during the transition. |
| Interaction frame rate | Sustained 60 fps everywhere, and 120 fps for scrolling, panel dragging and ink on capable displays. |
| Pen latency | Perceived latency comparable to the platform's own notes app. The first rendered segment appears within one display frame of the input event when the platform offers prediction or a low-latency path. Measured physically, not with synthetic events (see the [Notes Phase 6 gate](../notes/reports/phase-6/report.md)). |
| Memory | Home and Workspace shell within an agreed per-device budget, with suspended tools releasing decoded assets. World has a separate budget and returns memory on exit. |
| Battery and thermal | No background polling while idle. Realtime connections and sync are batched. Thermal behavior is profiled for long pen sessions and World. |
| Offline | Home shows cached data. Timer sessions run and settle later. Notes open and edit locally, per the Notes durability contract. |

**Principles.** Measure on physical devices before claiming. Keep pointer and pen sampling off the React render path, as the web ink controller already does. Prefer native-driven animation. Virtualize long lists. Never hold the only copy of acknowledged work in memory.

### 5.4 Frontend-first without throwaway work

**Proposed.** Phases 4–10 build against **typed mock adapters**. These are interfaces shaped like the real contracts: planner revisions, session lifecycle, user stats, Notes document references and resource references. Mock implementations live behind a development flag, as the existing [`mobile/src/adapters/api/mock-api.ts`](../../mobile/src/adapters/api/mock-api.ts) pattern does. Production builds must not ship mock data paths. Phase 11 audits these interfaces against the real APIs.

---

## 6. Existing Sylf systems that may be reused

Classification from this phase's repository inspection (imports and browser-API usage were checked; behavior was not re-verified):

- **Portable**: pure TypeScript with no DOM, browser, server or framework imports, so a candidate for direct sharing.
- **Adapter**: logic is reusable, but storage, crypto, input or rendering need native adapters.
- **Server**: reused unchanged through HTTP APIs.
- **Reference**: web-only UI or runtime. Use for product behavior and design reference, not code reuse.

### 6.1 Domain logic and contracts

| System | Location | Class | Notes |
| --- | --- | --- | --- |
| Progression (levels, XP, rewards math) | [`lib/game-engine.ts`](../../lib/game-engine.ts), [`difficulty-engine`](../../lib/difficulty-engine.ts), [`cognitive-stats`](../../lib/cognitive-stats.ts), [`skill-tree`](../../lib/skill-tree.ts) | Portable | Imports only each other and `timezone-service`. Display and preview only; settlement remains server-side. |
| Timezone and user-local dates | [`lib/timezone-service.ts`](../../lib/timezone-service.ts) | Portable | No imports. Hermes `Intl` time-zone support must be verified (R7). |
| Timer epoch math | [`lib/timer-engine.ts`](../../lib/timer-engine.ts), [`session-math`](../../lib/session-math.ts), [`planner/v2/session-client`](../../lib/planner/v2/session-client.ts) | Portable / Adapter | Epoch snapshots are pure. Legacy cache migration references `localStorage`. The durable journal in [`timer-sync.ts`](../../lib/timer-sync.ts) relies on localStorage, Web Locks and visibility events, so it needs a native journal with the same semantics. |
| Planner contracts | [`lib/planner/contracts.ts`](../../lib/planner/contracts.ts) and field/policy modules | Portable | Zod schemas and policies. Server materialization stays in [`lib/planner/server/`](../../lib/planner/server/) and [`lib/planner/v2/server/`](../../lib/planner/v2/server/). |
| Notes formats and sync logic | [`lib/notes/contracts.ts`](../../lib/notes/contracts.ts), `graph`, `pack`, `interchange`, `ink`, `ink-geometry`, `sync` | Portable / Adapter | Pure Yjs/Zod format and DAG logic. [`repository.ts`](../../lib/notes/repository.ts) is bound to Dexie/IndexedDB and [`vault.ts`](../../lib/notes/vault.ts) to WebCrypto AES-GCM. The contract already anticipates native SQLite/file adapters held to "the same IDs, bytes and conformance suite" ([architecture contract §8](../notes/architecture-contract.md#8-recovery-history-and-lifecycle)). |
| Calculator | [`lib/calculator/math-engine.ts`](../../lib/calculator/math-engine.ts) | Portable | No imports. |
| Appearance color generation | [`lib/color-utils.ts`](../../lib/color-utils.ts) | Portable | No imports. Can generate native theme tokens from the same user preferences, keeping custom accent/background parity with web. |
| Catalogs | [`cosmetics-catalog`](../../lib/cosmetics-catalog.ts), [`achievements-catalog`](../../lib/achievements-catalog.ts), [`character-traits`](../../lib/character-traits.ts), focus-party types, study-schedule types | Portable | Shared content definitions. Reuse them; do not copy them into the native app. [`shop-items.ts`](../../lib/shop-items.ts) re-exports an archived legacy catalog, so its status needs checking. |
| Pixel Display engine | [`lib/pixel-display/engine/`](../../lib/pixel-display/engine/), [`content/`](../../lib/pixel-display/content/) | Portable / Adapter | Engine and content are pure. The renderer is Canvas 2D, so a native renderer (for example Skia) can draw the same framebuffer. Relevant to the companion, Locker and World identity. |

### 6.2 Server systems reused through APIs

| System | Owner | Native implication |
| --- | --- | --- |
| Authentication and revocation | [`lib/auth-server.ts`](../../lib/auth-server.ts), [`lib/auth.ts`](../../lib/auth.ts), [`lib/auth-session-service.ts`](../../lib/auth-session-service.ts) | Sessions are **cookie-only**. A bearer fallback was deliberately removed. One device can be ended since Phase 11, through `AuthSession`. Native design: [ADR 0009](decisions/0009-native-authentication.md). |
| 148 API route handlers at Phase 11, 155 route files by 1 November | [`app/api/`](../../app/api/) | Audited in Phase 11. All reach identity through `getSession`. Only the Notes broker's origin check and the OAuth connect flows refuse a native client ([handoff](handoffs/phase-11.md#2-backend-map)). Native reaches 26 ([feature map](expansion/feature-map.md#1-how-far-native-reaches-today)). |
| Study sessions, settlement and rewards | [`SessionService`](../../lib/planner/v2/server/sessions.ts), [settlement](../../lib/planner/v2/server/settlement.ts), [timer migrations](../../prisma/migrations/) | Reuse unchanged; this is the source of truth for XP, currency and totals. |
| Planner and Calendar | [`lib/planner/server/`](../../lib/planner/server/), [`lib/calendar/`](../../lib/calendar/), [Calendar contract](../calendar/README.md) | Reuse services and mutation guards ([`mutation-guards.ts`](../../lib/planner/server/mutation-guards.ts)). |
| Sylvie and AI | [`lib/ai/`](../../lib/ai/), [Sylvie contract](../sylvie/README.md) | Reuse routing, provider adapters, entitlements and quotas. The SSE streaming client needs a native streaming fetch (R8). |
| Social and Focus Parties | [`lib/focus-party-service.ts`](../../lib/focus-party-service.ts), chats and friends APIs, Supabase Realtime | Realtime uses an app-minted Supabase JWT from `/api/realtime/token`. `supabase-js` can run natively; keep polling fallbacks. |
| Notes cloud broker | [`lib/notes/server/`](../../lib/notes/server/) | Keeps credentials server-side. The native client uses the same broker with native auth. |
| Economy and inventory | Prisma ledgers (`XpLedger`, `SylphLedger`, `HpLedger`), `UserInventory`, `UserCosmetic`, `PixelCreation` | The basis for World rewards, Locker and Shop. |
| Data platform | [`prisma/schema.prisma`](../../prisma/schema.prisma) (73 models), 79 ordered migrations, RPCs, triggers and RLS; Redis with in-process fallback | Unchanged. New native needs (device sessions, World saves) require reviewed migrations. |

### 6.3 Web-only (reference, rebuild natively)

The web UI (`app/**` components, CSS Modules, Tailwind, framer-motion via [`lib/motion.ts`](../../lib/motion.ts)) serves as a reference, not as reused code.

| Web owner | Native replacement needed |
| --- | --- |
| BlockNote/ProseMirror rich text | A native editor, or an embedded web editor, compatible with the existing `body` XML fragment (R3). |
| Pointer Events ink controller with `perfect-freehand` | Native pen capture producing `sylf-ink/1` samples (R2). |
| `pdfjs-dist` / `pdf-lib` PDF handling | A native PDF renderer that keeps the existing annotation anchoring (R4). |
| Web Audio Acoustics engine ([`lib/acoustics/`](../../lib/acoustics/)) | A native audio engine with background playback. |
| `transformers.js` calendar recognition worker | Re-evaluate later, possibly with on-device ML. |
| Next.js routing | Native navigation. |
| [`lib/client-data-cache.ts`](../../lib/client-data-cache.ts) (browser storage) | Native cache with the same invalidation and logout-cleanup semantics. |

---

## 7. Development principles, design expectations and scope boundaries

### 7.1 Development principles (proposed)

1. **Approve phase by phase** (confirmed). No phase starts before the previous one is approved.
2. **Isolate from the web.** No changes to the web app, API behavior, schema or production data unless an approved phase explicitly scopes them. Shared-code extraction must be behavior-preserving and covered by existing web tests.
3. **Reuse before rebuild.** Extend existing authorities and contracts. A new owner needs a written reason.
4. **Measure before claiming.** Performance and input claims need physical-device evidence. Synthetic results are labelled as such.
5. **Accessibility from the start.** Screen readers, Dynamic Type/font scaling, reduced motion, contrast, keyboard navigation and 44 pt touch targets.
6. **Privacy by default.** No silent upload of note libraries to AI. Credentials live in OS secure storage. No authenticated data in logs or analytics.
7. **Document as you go.** Each phase leaves its contract and report under [`documentation/native/`](README.md).

### 7.2 Design expectations

**Confirmed.** Minimal but information-rich. Beautiful, restrained visuals with a consistent identity. Fluid, purposeful animation and natural gestures. Contextual navigation, maximum useful screen space, intuitive mouse/keyboard and touch/stylus input, fast startup and low memory use, and a distinctive atmosphere without unnecessary decoration.

**Confirmed (owner direction, 30 October 2026) — an original native design language.** Sylf Native gets a completely fresh, premium and highly polished UI that significantly surpasses the web app in aesthetics, usability, fluidity and overall experience.

- The existing web app is a reference **only** for functionality, branding and user preferences. It is **not** a design template.
- Do not replicate its layouts, components, navigation or visual structure.
- Think independently and explore innovative approaches. Prioritize minimalism, elegance, purposeful animation, intuitive interaction and exceptional tablet/desktop UX.
- Avoid generic AI-generated dashboard aesthetics.
- Phase 4 is done when it establishes an original, cohesive design direction that feels distinctly Sylf and is substantially more refined than the current web experience.

**Requirements carried into Phase 4.**

- **Honor user preferences, not web styling.** Users' saved choices (light/dark, custom accent and background colors) are inputs the native system must respect with accessible contrast. The native token set, palette, typography, spacing, motion and components are designed fresh. `lib/color-utils.ts` may be used only for color math (validation, contrast). Its web token set is not the native palette. The native app must still not assume a fixed palette or dark-only surfaces. Authored paper, ink and PDF colors never follow the theme.
- **Branding continuity, not visual continuity.** The Sylf name, companion and pixel-art lineage, and the Floating Sanctuary atmosphere are brand references to reinterpret, not screens to copy. The web `design-system/` reference set is background reading only.
- **Treat motion as a system.** Shared spring and duration tokens, interruptible animations, and reduced-motion equivalents.
- **Keep chrome to a minimum.** Each Space shows only its own navigation, and the content gets the screen.

### 7.3 Scope boundaries

| In scope for Sylf Native | Out of scope / deferred |
| --- | --- |
| New native frontend for Home, Workspace and World; phone companion later. | Migrating or porting web UI components. |
| New native adapters (storage, pen, PDF, audio, background, credentials). | Changing the web app's UI or behavior. |
| Reviewed additions to the backend where native needs them (native auth, device sessions, World persistence). | Rebuilding existing backend authorities, ledgers or AI routing. |
| Using the existing Notes, Planner, Calendar, Timer and Sylvie contracts. | New document formats, parallel timers or progression engines. |
| World game experience integrated with progression. | Recreating any specific existing game. Real-time multiplayer until separately approved. |

**Backend compatibility (Confirmed, owner direction, 30 October 2026).** The goal is a completely redesigned frontend, not an entirely new backend or product. Features may be redesigned, reorganized, simplified or improved, and small frontend interactions or lightweight logic are welcome. Every feature and workflow must be able to integrate with the existing Sylf Web backend, APIs and business logic. Do not invent major features that need substantial backend work, new complex systems or significant architecture changes. If a proposal would, defer it and document it as a future possibility. The reviewed native additions in the table above (native auth, device sessions, World persistence) stay in scope because the plan already names them.

**Phase 1 boundary (confirmed).** This phase involves research and documentation only. No code, dependencies or restructuring.

---

## 8. Risks, open questions and decisions requiring validation

### 8.1 Major technical risks

| ID | Risk | Why it matters | Owner phase |
| --- | --- | --- | --- |
| R1 | **Native authentication.** Web sessions are cookie-only with tokenVersion revocation, and the bearer path was removed on purpose. | Native needs secure token storage (Keychain/Keystore) and revocation parity. Security review must cover CSRF/origin behavior for non-browser clients and refresh/rotation. **Phase 11:** designed in [ADR 0009](decisions/0009-native-authentication.md) (Proposed). It does not touch every route: all 148 reach identity through `getSession`, so one branch covers them. **Phase 12:** built and tested on disposable PostgreSQL and in real Electron. Still unverified: real OAuth providers, hosted services, Keychain and Keystore, and anything on Hermes. | Phase 2 (feasibility), 11–12 (design and implementation) **1 Nov 2026:** bearer sign-in, secure storage, refresh and revocation passed on the tablet. Real OAuth has not run. |
| R2 | **Ink capture and format parity.** Notes ink is `sylf-ink/1`: Yjs per-page streams with 8-value samples and a `perfect-freehand` brush. | Native pen APIs such as PencilKit use their own formats. Rendering must match web geometry, or the same note looks different across platforms. Palm rejection and latency need native input. | Phase 2 (spike), 14 |
| R3 | **Rich-text editing.** Web Notes uses BlockNote on ProseMirror and y-prosemirror, all DOM-based. | No native editor speaks the same Yjs XML schema. The options are an embedded web editor (performance and integration costs) or a native editor with a schema-compatible Yjs binding (large effort). This is likely the hardest Workspace dependency. | Phase 2 (spike), 14 |
| R4 | **PDF rendering and annotations.** Web uses pdf.js and pdf-lib; annotations bind to the original digest and page units. | Native renderers (PDFKit, Android PdfRenderer, PDFium) must reproduce page geometry exactly, so annotations align across platforms. | Phase 2, 14 |
| R5 | **Notes local durability and encryption.** The repository relies on IndexedDB transactions and the vault on WebCrypto. | The native SQLite and native-crypto adapter must pass the same conformance suite. Encrypted-at-rest and offline-unlock policy are still open product gates. | Phase 2 (library choice), 14 |
| R6 | **Game engine embedding.** | Embedding an engine (Unity as a Library, Godot, a Skia/GL-based engine, or a WebView engine) affects binary size, memory, startup, store review, update cadence and the isolation guarantee. It is also the largest single cost. **Phase 9:** no engine was evaluated, as the brief required. The risk is reduced by a host contract with no engine in it, a tested failure path for every step, and isolation enforced by the boundary audit. | Phase 2 (evaluate), 15 (finalize) |
| R7 | **JS runtime compatibility.** | Shared modules assume web runtime features: `Intl` time zones, `crypto.subtle`, `TextEncoder`, streaming `fetch`, `structuredClone` and Web Locks. Hermes or the chosen runtime must support them, or polyfills must be qualified. | Phase 2 |
| R8 | **AI streaming.** Sylvie uses SSE with long deadlines (245 s). | React Native's default fetch has historically lacked streaming response bodies. A streaming-capable transport must be validated. Phase 13 read Sylvie's real route through `client.stream` in Electron and on Node, on answers needing no provider. Hermes and a real provider's stream were not run, and `client.stream` reads the whole answer at once if `response.body` is missing. | Phase 2, 13, tablet day |
| R9 | **Background timer behavior.** | iOS suspends apps. Session continuity needs Live Activities and notifications, plus a durable native journal that matches the web journal's idempotent replay semantics. Android needs a foreground service policy that is store-compliant. **Phase 10:** the local half is done. Time survives backgrounding and a process kill because it is derived, and operations are shaped like the web journal's ([ADR 0008](decisions/0008-study-session-and-timer-dock.md)). Nothing tells a person a countdown ended while the app is away. Delivery exists since Phase 13, through the bridge and the journal, and has run in Electron across a real process restart, not on a device. | Tablet day, later phases |
| R10 | **Monorepo without disturbing the web.** | The root `package.json` is the Next.js app (React 19.2.4, no workspaces). React Native pins exact React versions, so a hoisted single version may conflict. Moving `lib/` into packages could break the `@/` imports of 148 routes and many tests. | Phase 2 (strategy), 3 |
| R11 | **Desktop strategy.** | It decides whether components must also target desktop platforms or web, and could double testing (see D1). | Phase 2 |
| R12 | **Multitasking fidelity on tablets.** | Free-form floating windows inside an app that itself runs in OS split-screen, Stage Manager or freeform windows. Gesture conflicts arise between canvas, pen, panels and OS edges. **Phase 10:** the app side was prepared and measured in Electron at ten window shapes. No device has run it. | Tablet verification after Phase 10, 16 **1 Nov 2026:** not yet exercised by hand on the device. See the tablet checklist. |
| R13 | **Scope and timeline.** | The program contains several products: a study OS, a notes app and a game. The roadmap's sequential approval keeps quality high but makes the critical path long. Hard spikes (R2–R6) should start early in Phase 2. | Ongoing |
| R15 | **Native memory grows with every mount.** About 0.35 MB per Space switch, not returned, measured on the Tab S9 FE ([Phase 5 report §5](reports/phase-5/report.md#5-memory-investigation)). It scales with element count, including plain React Native views and text. | Cause not established: it sits below the app's React tree, in the React Native 0.88 and Hermes V1 stack or in how Sylf uses it. Workspace mounts far more than the placeholders, so a long session could become expensive. Reproduce it in a bare app before Phase 8. **Phase 6:** Home re-entry levelled off at about 104 MB of native heap over 120 cycles, and destination changes added nothing ([report](reports/phase-6/report.md#5-memory)). The difference from Phase 5 is not explained, so the risk stays open. **Phase 8:** the owner ruled the tablet out for this run, so the bare reproduction is prepared and not run: a probe with nothing of Sylf's in the tree, a build flag and `android:r15-check`. On the Mac the probe and Workspace retain nothing visible to JavaScript or the DOM, which clears the app's own React code and says nothing about Android's native heap ([report](reports/phase-8/report.md#5-risk-r15)). The tablet run was stopped before the bare reproduction started. On an earlier build, native heap levelled off in every Workspace sweep ([report](reports/phase-8/report.md#6a-tablet-results-partial-and-deferred)), so the risk stays open and the reproduction waits until after Phase 10. | Tablet verification after Phase 10, 16 **1 Nov 2026:** bare and in-app runs both level off, so a steady per-mount leak is not supported. Layout switching still adds about 0.6 MB per cycle. |
| R14 | **Store policy and economy.** | Virtual currency, cosmetics and any future purchases fall under App Store and Play rules. In-app purchase obligations apply if any paid goods appear. | Phase 15, 17 |
| R16 | **Expansion scope.** | The stage is about as large as all work so far. | Part 1 prioritizes. Each part stops for review |
| R17 | **Home's memory.** | Destinations stay mounted after a first visit, and Home is about to hold far more. | Parts 2, 4 |
| R18 | **Realtime on Hermes.** | `supabase-js` has never run here, so live features may need their fallback. | Part 1 spike, Part 3 |
| R19 | **AI Planner V2 is heavy and unqualified.** | It is flag-gated, needs a worker, costs real money, and formal educational qualification is deferred. | Part 3, owner |
| R20 | **Extraction disturbs web.** | Timer mode logic sits inside a 1,642-line web component. | Part 2 slice B |
| R21 | **An uncommitted, moving tree.** | Over 400 paths are uncommitted, and web changed under Phase 13. | Entry gate |
| R22 | **Background audio and notifications.** | Store policy, foreground services and battery. | Part 1 spike, Part 2 |
| R23 | **Heartbeat turns HP on.** | Native sends none today, so HP penalties do not reconcile for a Native-only student. | Part 2 slice A |
| R24 | **`@sylf/shared` grows.** | Catalogs and Planner types add to the bundle. | Parts 2 to 4 |

### 8.2 Open product questions

| ID | Question | Proposed default | Decide by |
| --- | --- | --- | --- |
| D1 | How do desktop/laptop users receive Sylf Native? | **Decided (ADR 0001):** Electron hosting the React Native web build; Tauri is the fallback. | Resolved in Phase 2 |
| D2 | Does the Native UI ever replace the web UI? | No commitment. Keep the web as is and avoid choices that make it impossible. | Phase 2 |
| W1 | How do the Workspace Space and Study Workspaces relate, and what are they called? | Space = environment; Study Workspace = saved context opened inside it. Built to this default, and the name is the owner's. | Owner, at review |
| W2–W4 | Saved contexts in templates; Command Center placement; floating windows on small windows. | Built to the defaults in [§2.2](#22-workspace--advanced-study-environment) and [ADR 0006](decisions/0006-workspace-canvas-and-windows.md). | Owner, at review |
| W5 | Zoomable grid canvas: extent, snapping, what zoom scales, presets, pen and gesture conflicts. | Built as [ADR 0006](decisions/0006-workspace-canvas-and-windows.md) describes. Pen and OS edge gestures stay open. | Owner, at review; Phase 14 for pen |
| T1 | The sixth theme's user-facing name: Student or Scholar. | Keep Student and the `student` id until the owner decides ([ADR 0004](decisions/0004-global-spaces-shell.md#student-and-scholar)). | Before Phase 17 |
| H1, H3 | Locker/Shop placement; Sylvie in Home. | Locker/Shop in World; quick-ask overlay. Phase 6 built to these defaults, and the quick-ask waits for [Expansion Part 3](expansion/part-3-social-sylvie-planner.md). | Owner |
| H2 | Full Planner and Calendar in Home? | **Confirmed (owner, 1 November 2026): yes,** and they leave Workspace ([ADR 0014](decisions/0014-home-hub-and-workspace-scope.md)). | Resolved |
| E-1 to E-14 | The Expansion stage's decisions, including HP on Native, Planner V2 hosting, whether party time counts, urgent repairs and new dependencies. E-1, Plan as a fifth destination, is approved. | Defaults in [stage plan §12](expansion/README.md#12-decisions-for-the-owner). | Owner, by the part each names |
| G1–G4 | World during study sessions; social model; device floor and download size; small windows. | **G1 is Confirmed (Phase 10 brief):** a running session blocks entry, the person pauses or ends it, and the controller enforces this ([ADR 0008](decisions/0008-study-session-and-timer-dock.md)). G2 and G4 are built to these defaults: single-player first, and below 600 × 420 pt the lobby works and entry is disabled ([ADR 0007](decisions/0007-world-lobby-and-host.md)). G3 stays open, because it depends on the engine. | Owner, at review; Phase 15 for G3 |
| P1 | Phone app in the same binary or a separate listing? | Same binary, separate frontend module. | Phase 2 / 3 |
| C1 | Future of the Capacitor client and app identifier. | Keep it untouched. Decide replacement and identifier before the first store build. | Phase 3 / 17 |
| A1 | Offline sign-in and Notes offline-unlock policy on native. | Follow the Notes contract: no offline unlock until the trusted-device design is approved. | Phase 12 |
| S1 | Who owns a study session made before sign-in? | **Proposed in [ADR 0010](decisions/0010-session-ownership-before-sign-in.md):** nobody. It stays on the device, and only an explicit choice after sign-in adds it to a record. Sessions from before the account existed are not offered. | Owner, at review |
| S2 | Must first launch require an account? | Open. Built as: no, with "Study without an account" on the sign-in page ([ADR 0012](decisions/0012-connected-app.md) decision 2). Removing it is small. | Owner |
| S3 | Password reset, which exists on no client. | Open. Needs email delivery. | Owner |
| L1 | Localization and minimum OS versions (iPadOS, Android API level). | Set in Phase 2 from library requirements and the device floor. | Phase 2 |

### 8.3 Decisions requiring technical validation

1. The native framework (RN/Expo, or alternatives such as Flutter, fully native Swift/Kotlin, or Kotlin Multiplatform with native UI), judged against [§9](#9-handoff-to-phase-2--tech-stack-research-and-validation).
2. Expo managed or prebuild/continuous native generation versus bare, given the number of custom native modules (pen, PDF, game, background).
3. Rendering and animation stack for canvas, panels and ink (for example Skia and a native-driven animation library).
4. Local database and file storage (SQLite variant, file layout) and how the Notes conformance suite runs against it.
5. Yjs runtime viability on the native JS engine: performance with large page streams and garbage collection.
6. Game engine choice and embedding model, including how it is isolated and torn down.
7. Monorepo layout and package boundaries that leave the web app's imports untouched.
8. Native authentication model, coordinated with the backend audit.

---

## 9. Handoff to Phase 2 — Tech Stack Research and Validation

### 9.1 Phase 2 inputs

This document, the [Study Workspaces master plan](../workspaces/master-plan-october-2026.md), the [Notes contracts](../notes/README.md) (foundation, ink, PDF, architecture), the [timer contract](../timer/README.md), the [Sylvie contract](../sylvie/README.md), the [Pixel Display contract](../pixel-display/README.md), [`AGENTS.md`](../../AGENTS.md) and the inventory in [§6](#6-existing-sylf-systems-that-may-be-reused).

### 9.2 Questions Phase 2 must answer

1. **Framework fit.** Can the candidate stack deliver the [§5.3](#53-performance-principles-and-proposed-budgets) budgets on the reference devices? Compare at least React Native + Expo, Flutter, and fully native (SwiftUI + Jetpack Compose), with Kotlin Multiplatform or shared-TS logic. Criteria: performance, pen input, multi-window, code sharing with existing TypeScript, desktop reach, hiring and maintainability, and long-term risk.
2. **Desktop strategy (D1/D2)** with a recommendation and its cost.
3. **Handwriting (R2).** Spike native pen capture on iPad (Pencil) and an Android tablet (S Pen). Produce `sylf-ink/1` samples and render them with geometry matching the web brush. Measure physical latency and palm rejection.
4. **Rich text (R3).** Spike the embedded web editor against a native editor bound to the existing Yjs `body` fragment. Assess fidelity, performance, IME and accessibility.
5. **PDF (R4).** Native rendering with annotation-coordinate parity.
6. **Offline storage (R5).** SQLite plus native crypto under the Notes durability rules; Yjs on the chosen JS engine (R7).
7. **Multitasking (R12).** A prototype of the panel and window manager under OS split-screen and Stage Manager, including gesture conflict handling.
8. **AI (R8).** Streaming SSE transport with cancellation and deadlines.
9. **Background sessions (R9).** Live Activities and notifications on iOS; foreground service on Android.
10. **Game engine (R6).** A shortlist with embedding, isolation, size and memory data. The choice is not finalized until Phase 15, but Phase 2 must show that at least one option meets the isolation requirement.
11. **Monorepo (R10).** A layout that adds the native app and shared packages without changing web behavior or imports. This also decides the folder name and location for the tablet app and phone module (C1, P1).
12. **Native auth (R1).** A feasibility sketch only. Implementation belongs to Phases 11–12.

### 9.3 Phase 2 deliverables (proposed)

- A tech stack decision record: options, evidence, decision and rejected alternatives.
- Spike results with physical-device measurements (evidence stored beside the report).
- A target architecture diagram and package map for Phase 3.
- An updated risk register, with each risk retired, accepted or carried forward.
- Spike code kept out of the main source tree, or in a clearly temporary, removable location agreed before Phase 2 starts. It is not production code.

### 9.4 Constraints carried forward

The web app, backend, databases and production stay untouched. No restructuring before Phase 3 approval. Spikes do not become the foundation by accident. Phase 2 stops for approval before Phase 3.
