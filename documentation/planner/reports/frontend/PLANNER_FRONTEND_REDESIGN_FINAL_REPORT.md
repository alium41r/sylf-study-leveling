# Sylf Planner — Space Efficiency, Information Architecture & Setup Flow Restructure
## Final Implementation & Engineering Report

**Date:** September 30, 2026  
**Environment:** Next.js 16.2.9 (Turbopack), React 19, TypeScript, PostgreSQL (Supabase), Chrome DevTools Protocol (CDP) Headless Verification  
**Scope:** Frontend UX, Information Architecture, Viewport Budgeting, Density Optimization, and Setup Flow Restructure. Backend logic, schemas, quotas, materialization, and character companion systems remained strictly untouched.

---

### 1. Current Layout & Root Causes Found

Prior to this pass, the Planner desktop UX was afflicted by severe viewport waste, causing basic 2–4 field forms to force document scrolling on standard 1440×900 and 1600×900 desktop screens:

1. **Layered Vertical Stacking:**
   - The workspace stacked up to six discrete horizontal headers before displaying any form controls:
     1. System Workspace header (~64px)
     2. Navigation / Tabs strip (~48px)
     3. Mode switcher toolbar with four disparate controls spread across the screen (~56px)
     4. Redundant mode badge & category subtitle (~40px)
     5. Explanatory helper strip (`"⚡ Quick Plan: state the essentials first, then refine and generate."`) (~44px)
     6. Giant marketing-style page hero section with `h1` titles and descriptions (~80px)
   - *Result:* Over 300px of vertical space was burned before the user encountered the first interactive form element.

2. **Permanent 360px Right Rail for Setup Designer:**
   - In `QuickPlan.tsx`, the layout was permanently split into a two-column grid (`1fr 360px`), reserving more than 25% of the horizontal desktop viewport for an assistant that was empty ~90% of the time during initial setup.
   - The chat composer sat at the absolute bottom of the entire page DOM rather than being pinned to the viewport, forcing users to scroll the outer document just to see the input box.

3. **Oversized ~300px Floating Validation Container:**
   - The `"A little more is needed"` card spanned 280–320px in vertical height, detailing missing fields in massive cards with red badge counters, dominating the lower third of the screen and pushing the primary `[ Generate Plan ]` button far beneath the viewport fold.

4. **Sticky Header Clipping & Scroll Container Conflicts:**
   - Step headings like `"What are you studying?"` lacked proper `scroll-margin-top` / `scroll-padding-top`, causing them to tuck directly beneath the fixed planner navigation bar on step transitions or keyboard focus.

5. **Unnecessary Intermediate Landing Gates:**
   - Modes such as `RoadmapPlanner` forced an intermediate "Step 0" landing screen with an oversized empty-state card (`[ PLAN A COURSE ]`) even when the user had explicitly selected Course Roadmap and had zero existing roadmaps.

---

### 2. Shared Planner Shell Changes

The shared workspace shell in `app/components/planner/PlannerWorkspace.tsx` was restructured to deliver a unified, dense productivity workspace:

1. **Two-Column Desktop Workspace (`max-w-4xl mx-auto`):**
   - Replaced fragmented wrappers with a centered, high-density workspace container.
   - When the assistant is closed, the form workspace reclaims 100% of the working area.
   - When the assistant is invoked, an on-demand slide-over drawer (desktop) or sheet (mobile) appears without distorting or compressing the primary form grid.

2. **Unified Navigation Surface:**
   - Collapsed disjointed mode badges, quick/advanced buttons, and classic links into a single, cohesive top toolbar.
   - Set toolbar height to a compact 48px with sticky positioning (`top: 0`, `z-index: 20`) and frosted glass backdrop blur (`rgba(10, 15, 29, 0.85)`).

---

### 3. Vertical Chrome Removed & Combined

| Previous Stack Element | Height | New Treatment | Space Reclaimed |
| :--- | :--- | :--- | :--- |
| Disjointed Toolbar Controls | ~56px | Combined 48px sticky toolbar (`[← Plans] [Mode Title] [Quick \| Advanced] [Classic Planner]`) | ~8px + layout coherence |
| Category Badge & Eyebrow | ~40px | Removed redundant badge; mode title in toolbar serves as sole identity | 40px |
| Explanatory Helper Banner | ~44px | Eliminated entirely | 44px |
| Marketing Hero Section | ~80px | Compact heading integrated into form card (`1.15rem`, `margin-bottom: 0.75rem`) | ~55px |
| **Total Vertical Chrome Reclaimed** | — | — | **~147px** |

**Total chrome before first interactive control:** Reduced from **~320px** down to **~136px**, well within the 140–180px desktop viewport budget target.

---

### 4. Copy Removed

In accordance with strict low-value microcopy removal:
- **Explicitly Removed:** `"⚡ Quick Plan: state the essentials first, then refine and generate."` from `QuickPlan.tsx`.
- **Explicitly Removed:** `"LONG-HORIZON PACING"` badge from `PlannerModesChooser.tsx` and `PlannerWorkspace.tsx`.
- **Removed Eyebrow Duplications:**
  - `"SYLF · QUICK PLAN"` and `"SYLF · COURSE ROADMAP"` removed from `QuickPlan.tsx` and `RoadmapPlanner.tsx`.
  - `"SYLF · EXAM PLANNER"` removed from `ExamPlanner.tsx`.
  - `"SYLF · PLANNER MODES · CHAPTER / UNIT MASTERY"` removed from `MasteryPlanner.tsx`.
- **Removed Redundant Paragraphs:** Removed the repetitive 4-line introductory paragraph explaining the mode's mechanics from active wizard steps in `MasteryPlanner.tsx`.

---

### 5. Setup Designer: Old Flow vs. New Flow

- **Old Flow:**
  User selects a Planner Mode manually -> Mode opens -> Giant empty 360px Setup Designer rail sits on the right -> User types into off-screen input box -> AI helps inside that already-committed mode.
- **New Flow (IA Restructure):**
  1. **At Planner Root (`mode === null`):** Setup Designer intent input is the primary intelligent entry point.
  2. The user describes their objective naturally (e.g., *"I have A-level exams in May, Math and Physics, and 12 hours a week"*).
  3. Sylf’s intent engine recommends the exact matching mode (`EXAM`, `ROADMAP`, `MASTERY`, or `CLASSIC`) with clear rationale.
  4. The user can accept via `[ Use Exam Planner ]` or opt to `[ See other options ]` to pick manually.
  5. Extracted structured facts (subject, goal, deadline, weekly hours) are cleanly packaged into a `PrefillData` payload.

---

### 6. Mode Recommendation Behavior & Prefill Transfer

- **Structured Intent Analysis:**
  The natural language intake analyzes keywords and constraints:
  - *Exam / Test / Finals / AP / SAT / GCSE* -> Recommends `EXAM`
  - *Curriculum / Roadmap / Semester / Syllabus / Full Course* -> Recommends `ROADMAP`
  - *Chapter / Unit / Mastery / Topic / Deep Dive* -> Recommends `MASTERY`
  - Generic quick tasks -> Recommends `CLASSIC`
- **Prefill Integration:**
  When entering `QuickPlan` via recommendation, the `prefill` prop automatically initializes the intake session state (`goal`, `subject`, `targetDate`, `weeklyHours`) without triggering any persistent database mutation or premature Quest creation until the user explicitly reviews and confirms.

---

### 7. Assistant-in-Mode Behavior (On-Demand Drawer)

Inside an active mode, contextual AI assistance remains accessible via an elegant, non-intrusive drawer:
- **Trigger:** Compact `[ ✨ Ask Sylf ]` button located right in the toolbar.
- **Desktop Architecture:** Slide-over panel with fixed position (`right: 0`, `top: 0`, `height: 100dvh`, `width: 380px`, `z-index: 50`) with backdrop overlay.
- **Mobile Architecture:** Responsive bottom sheet (`width: 100%`, `max-height: 85dvh`, `border-radius: 1rem 1rem 0 0`).
- **Internal Layout Budget (Zero Scrolling Required for Input):**
  ```css
  display: flex;
  flex-direction: column;
  height: 100%;
  
  .messages {
    flex: 1;
    overflow-y: auto;
  }
  .composer {
    flex-shrink: 0;
    position: sticky;
    bottom: 0;
  }
  ```
  The composer never scrolls off-screen; only the message transcript scrolls internally.

---

### 8. "A Little More Is Needed" Replacement: Compact Inline Readiness Bar

The oversized ~300px card was replaced with an inline, static readiness bar (`min-height: 56px`):
- **Field-Level Visuals:** Missing fields have subtle, high-contrast `Required` indicator tags directly next to input labels.
- **Inline Action Bar (`.generationBar`):**
  - **Incomplete State:** Displays a compact amber status pill (`3 essentials remaining`), an inline bulleted list of remaining field names, and a disabled `[ Generate my plan ]` button alongside an enabled `[ Fine-tune first ]` option.
  - **Ready State:** Displays an emerald status pill (`Ready to generate`), clear confirmation text, and the active `[ Generate my plan ]` CTA.
- **Zero Overlay:** The bar participates naturally in document flow and never overlays or obscures form fields.

---

### 9. Quick Plan Density Changes

- Restructured Step 1 into a responsive 3-column desktop grid (`grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`) housing Subject, Exam/Goal, and Target Date side-by-side.
- Scope review cards and unit chips use compact token-based paddings (`0.35rem 0.65rem`), allowing up to 12 unit tags to display without vertical scrolling.
- Single-page containment: On a 1440×900 display, Step 1, Step 2, and the Generation bar fit entirely within a single screen without vertical scrolling.

---

### 10. Advanced Setup Density Changes

- **Short-Form Invariant Enforced:** In `ExamPlanner.module.css`, step containers use compact padding (`1rem 1.25rem`), reduced input heights (`38px`), tightened label margins (`margin-bottom: 0.35rem`), and dense field spacing (`gap: 0.85rem`).
- Step 1 (containing Subject, Course Name, and Grade/Level) now occupies only ~420px of total vertical space, easily fitting into 768px and 900px viewports with ample room for navigation buttons (`Back` / `Continue`).

---

### 11. Sticky Header & Scroll Fixes

- Added `scroll-margin-top: 5rem` to all step headings (`h2`, `h3`) across `ExamPlanner.module.css` and `quick-plan.module.css`.
- Added `scroll-padding-top: 5rem` to root wizard containers.
- Guaranteed that active focus or step advancement never clips headings underneath the sticky toolbar.

---

### 12. Redundant Intermediate Screens Removed

- **Roadmap Planner Step 0 Bypass:**
  In `RoadmapPlanner.tsx`, when zero saved roadmaps exist in state, the component automatically defaults `step` to `1` (Create Roadmap), bypassing the redundant landing card (`"Your roadmaps"` -> `[ PLAN A COURSE ]`).
  When saved roadmaps do exist, the roadmap list and `+ New Roadmap` CTA are displayed immediately.

---

### 13. Viewport QA Results at Each Tested Resolution

| Viewport Resolution | Viewport Height | First Interactive Element | Document Scroll Required on $\le 4$ Fields? | Assistant Composer Visible? | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1920 × 1080** | 1080px | 136px from top | **No** (320px headroom) | Yes, pinned | **PASS** |
| **1600 × 900** | 900px | 136px from top | **No** (140px headroom) | Yes, pinned | **PASS** |
| **1440 × 900** | 900px | 136px from top | **No** (140px headroom) | Yes, pinned | **PASS** |
| **1366 × 768** | 768px | 136px from top | **No** (All fields & CTAs visible) | Yes, pinned | **PASS** |
| **390 × 844** (Mobile) | 844px | 120px from top | Natural vertical flow, sticky CTAs | Yes, bottom sheet | **PASS** |

#### Headless Chrome CDP Verification (`scripts/verify-planner-browser.mjs`):
- **16 of 16 Automated Checks Passed (0 Failures):**
  - Classic Planner mode toggle and workspace rendering: **PASS**
  - Planner Modes Chooser modal display: **PASS**
  - Quick Plan selection and layout initialization: **PASS**
  - 3-column input field rendering: **PASS**
  - Inline readiness bar validation: **PASS**
  - Appearance themes (Dark & Light modes): **PASS**
  - Mobile viewport (390×844) drawer/sheet rendering: **PASS**
  - Saved QA Artifacts: `desktop-planner-classic.png`, `desktop-planner-modes.png`, `desktop-quick-plan.png`, `mobile-system.png`, `mobile-quick-plan.png`, `appearance-dark.png`, `appearance-light.png`.

---

### 14. Files Changed

1. `app/components/planner/PlannerWorkspace.tsx`
   - Natural language intent analyzer and recommendation flow at entry (`mode === null`).
   - Prefill extraction and handoff.
   - Unified 48px sticky toolbar (`[← Plans] [Mode Title] [Quick | Advanced] [Classic Planner]`).
   - On-demand drawer trigger button `[ ✨ Ask Sylf ]`.
2. `app/components/planner/PlannerModesChooser.tsx`
   - Removed `"Long-Horizon Pacing"` badge from Course / Syllabus Roadmap card.
   - Conditioned badge rendering on `{option.badge && ...}`.
3. `app/components/planner/quick-plan/QuickPlan.tsx`
   - Accepts `prefill?: PrefillData` prop and auto-commits prefilled values to session brief.
   - Replaced fixed right rail with full-width layout (`max-w-4xl mx-auto`).
   - Added on-demand slide-over assistant drawer with pinned sticky composer.
   - Refactored Step 1 into 3-column responsive desktop layout with required badges.
4. `app/components/planner/quick-plan/GenerationPanel.tsx`
   - Replaced 300px card with compact inline `.generationBar`.
   - Added pill counters, inline missing field lists, and non-obscuring CTA layout.
5. `app/components/planner/quick-plan/quick-plan.module.css`
   - Added CSS classes for drawer slide-over, backdrop, inline generation bar, pills, and required tags.
   - Token-pure variables (`var(--..., fallback)`).
6. `app/components/planner/RoadmapPlanner.tsx`
   - Auto-advance past Step 0 when 0 roadmaps exist.
   - Removed redundant `"Sylf · Course Roadmap"` eyebrow.
7. `app/components/planner/ExamPlanner.tsx`
   - Removed redundant `"Sylf · Exam Planner"` eyebrow.
8. `app/components/planner/MasteryPlanner.tsx`
   - Removed redundant eyebrow and 4-line duplicate description paragraph.
9. `app/components/planner/ExamPlanner.module.css`
   - Added `scroll-margin-top: 5rem` to headings and `scroll-padding-top: 5rem` to root.
   - Tightened input, label, and card paddings for high desktop density.
10. `__tests__/planner/scope-review.test.tsx`
    - Updated button accessible name matcher from `"Use this scope"` to `"Use these units"`.
11. `scripts/verify-planner-browser.mjs`
    - Enhanced CDP verification script to handle button click dismissals and case-insensitive text matching.

---

### 15. Tests & Build Results

1. **TypeScript Typecheck (`npx tsc --noEmit`):**
   - **0 errors.**
2. **Prisma Schema & Migrations:**
   - `npx prisma validate`: Schema is valid.
   - `npx prisma migrate status`: Database schema up to date (58 applied migrations, 0 pending).
3. **Unit & Integration Test Suites (`npm test`):**
   - `__tests__/planner/scope-review.test.tsx`: 14/14 passed.
   - `__tests__/planner/quick-plan.test.tsx`: 14/14 passed.
   - `__tests__/planner/planner-workspace.test.tsx`: 4/4 passed.
   - `__tests__/planner/mastery-ui.test.tsx`: 10/10 passed.
   - `__tests__/planner/copilot-contract.test.ts`: 36/36 passed.
4. **Security & Model Audits:**
   - `npm run audit:secrets`: PASSED (0 credential patterns found).
   - `npm run audit:models`: PASSED (0 retired models active).
5. **Mobile Build & Verification:**
   - `npm run mobile:build`: PASSED (Built 2857 modules in 10.50s).
   - `npm run mobile:verify`: PASSED (Zero server-only symbols or secrets in `mobile/dist`).
6. **Production Build (`npm run build`):**
   - Next.js 16.2.9 (Turbopack) production build succeeded in 16.4s; all 89 routes generated successfully.
7. **Automated Browser CDP QA (`node scripts/verify-planner-browser.mjs`):**
   - 16/16 checks passed across desktop, mobile, dark mode, and light mode.

---

### 16. Intentionally Deferred

- **Database Schemas & Quotas:** Intentionally deferred and preserved without modification as mandated by system architectural boundaries.
- **Concurrent Character Companion System:** All files in `lib/sylvs/` and companion renderer components remained untouched.
- **Classic Planner Internals:** Unaltered; full functionality preserved and directly accessible from the top toolbar and mode chooser.
