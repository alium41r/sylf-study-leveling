# SYLF ONBOARDING AUDIT REPORT

**Date:** September 27, 2026  
**Auditor:** Antigravity AI  
**Scope:** Current Onboarding Experience Audit vs. Current Sylf App Design & Architecture  
**Execution Mode:** Audit & Diagnostic Only (No redesign or code modifications applied)

---

## 1. Current Onboarding Flow

### Entry Criteria & Gating
1. **Unauthenticated Users**: If an unauthenticated visitor navigates directly to `/onboarding`, the edge middleware (`proxy.ts` line 82) intercepts the request and redirects to `/login?redirect=%2Fonboarding`.
2. **Authenticated Incomplete Users**: Any user whose JWT token contains `hasCompletedOnboarding: false` attempting to access any protected application route (`/dashboard`, `/timer`, `/social`, `/system`, `/goals`, `/quests`, `/locker`, `/settings`, `/inventory`, `/calendar`, `/profile`, `/focus`, `/notes`) is redirected by `proxy.ts` (line 99) directly to `/onboarding`.
3. **Completed Users**: Any user with `hasCompletedOnboarding: true` visiting `/onboarding` is immediately redirected by `proxy.ts` (line 103) to `/dashboard`.
4. **Registration Gate**:
   - **Credentials Signup (`/register`)**: The user provides Display Name, Username, Email, and Password. Upon successful registration, the session cookie is signed with `hasCompletedOnboarding: false` and the client routes to `/onboarding`.
   - **Google OAuth Signup (`/api/auth/callback/[provider]`)**: When a new user authenticates via Google OAuth, the user record is provisioned with `hasPassword: false` and `hasCompletedOnboarding: false`, routing directly to `/onboarding`.

---

### Step Progression Mechanics

The step progression is determined by whether the user registered via Google OAuth or standard credentials:
```typescript
const isGoogleSignup = user ? user.hasPassword === false : false;

const steps: OnboardingStep[] = isGoogleSignup
  ? ["BOOT", "IDENTITY", "SUBJECTS", "THEME", "INITIALIZING"]
  : ["BOOT", "SUBJECTS", "THEME", "INITIALIZING"];
```

#### Step 1: `BOOT` (Synthetic Loading Sequence)
- **Duration**: Forced 3,500ms delay (`duration = 2800` ms, auto-advance `setTimeout` 3500ms).
- **Presentation**: Full-screen centered vector emblem featuring concentric rotating dashed radar rings, dual-arc rotors, a hexagonal core, and an SVG monogram logo (`app/onboarding/page.tsx:403-445`).
- **Interactive State**: Completely non-interactive. The user cannot skip, pause, or click to proceed.
- **Progress Simulation**: Increments an artificial counter from 0% to 100% every 35ms, cycling through fake status messages:
  - 0% – 30%: `"INITIALIZING SYSTEM"`
  - 31% – 65%: `"CALIBRATING INTERFACE"`
  - 66% – 100%: `"PREPARING WORKSPACE"`
- **Transition**: Automatically fires `setCurrentStep("IDENTITY")` for Google signups or `setCurrentStep("SUBJECTS")` for credentials signups.

#### Step 2: `IDENTITY` ("Confirm Scholar Identity" — Google OAuth Signups Only)
- **Condition**: Bypassed for email/password registrants (who already entered credentials on `/register`).
- **Inputs**:
  1. *Registered Email*: Read-only input showing `user.email`.
  2. *Display Name*: Text input for user's full name (defaults to OAuth name).
  3. *Scholar Username*: Debounced input (350ms delay) validating lowercase alphanumeric + underscore strings (3-20 characters) against `/api/auth/check-username`. Displays live status pills (checking spinner, red taken warning, or green available confirmation).
  4. *Security Password (Optional)*: Password input with toggle show/hide button and `PasswordStrengthMeter` to allow Google users to set an optional credentials password.
- **Proceed Condition**: Requires username length $\ge 3$, `usernameStatus === "available"`, and display name $\ge 1$ char.
- **Navigation**: Forward CTA only (`"CONFIRM IDENTITY & PROCEED"`). No back button or skip option.

#### Step 3: `SUBJECTS` ("Configure Curriculum")
- **Header**: Title `"CONFIGURE CURRICULUM"`, subtitle `"Select your academic subjects & syllabus codes to generate your Constellation Trees."`
- **Calibration Banner**: Highlighting `"AI CONSTELLATION ENGINE CALIBRATION"`, asking users to add subjects, syllabus codes, exam boards, academic levels, and textbooks so the AI can build a "48-node academic constellation graph."
- **Interactive Elements**:
  - *Active Curriculum Container*: Empty dashed box if 0 subjects; displays configured subject chips once added.
  - *Custom Subject Form Toggle*: A button (`"+ Add Custom Subject"`) toggling an inline sub-form.
  - *Inline Sub-form Fields*:
    1. `Subject Name *` (Required text input, e.g. "Linear Algebra")
    2. `Syllabus Code *` (Required text input, forced uppercase, e.g. "MATH-201" or "CAIE 9709")
    3. `Exam Board` (Dropdown selecting from `EXAM_BOARDS`: CAIE, Edexcel, AQA, OCR, IB, AP, CBSE, ICSE, FBISE, BISE Lahore, BISE Karachi, University / College, Other / Self-Study)
    4. `Academic Level` (Dropdown selecting from `ACADEMIC_LEVELS`: IGCSE / O-Level, A-Level / AS-Level, IB Diploma, AP, Middle School, Matriculation, Intermediate / FSc / FA, Secondary, Senior Secondary, Undergraduate, Postgraduate, Professional, Lifelong Learning)
    5. `Book / Syllabus Details` (Optional multi-line textarea for textbook/specification notes)
    6. `Accent Color` (Palette of 8 color circles selecting from `ACCENT_COLORS`)
  - *Add Button*: `"+ Add to Curriculum"` appends the subject to the local list.
  - *Subject Chips*: Each configured subject displays a colored left border strip, name, syllabus code badge, exam board/level line, optional syllabus note snippet, and a red delete icon (`X`).
- **Proceed Condition**: Blocked until at least 1 subject is in the active curriculum (`canProceed = configuredSubjects.length > 0`).
- **Navigation**:
  - `"Go Back"`: Rendered only if `isGoogleSignup` is true (navigates back to `IDENTITY`). Hidden for email/password users.
  - `"CONFIRM CURRICULUM"`: Advances to `THEME`.

#### Step 4: `THEME` ("Calibrate Resonance")
- **Header**: Title `"CALIBRATE RESONANCE"`, subtitle `"Choose your interface mode, domain environment and core system aura."`
- **Sections (All rendered simultaneously in a single tall scroll container)**:
  1. *Interface Mode*: Two cards for "Dark Mode (Default)" (stealth black/neon) and "Light Mode" (high-contrast daylight). Selecting immediately applies `data-mode` to the root HTML document and updates localStorage.
  2. *Environment Domain*: 9 cards from `COSMETICS_CATALOG.BACKGROUND` ("Simple", "The Void", "Cyber Grid", "Sakura Dusk", "Abyssal Glow", "Neon Sunrise", "Digital Rain", "Aurora Borealis", "Deep Ocean"). Clicking immediately invokes `applyGlobalBackground` to paint the active background live onto `#app-bg-layer`.
  3. *System Resonance Auras*: 10 cards from `COSMETICS_CATALOG.THEME` ("Cyberpunk", "Sakura", "Emerald", "Crimson", "Amber", "Abyss", "Volt", "Plasma", "Glacier", "Solar"). Clicking applies CSS variables live from `THEME_MAP`.
- **Proceed Condition**: Blocked until both `selectedTheme` and `selectedBackground` are non-null (`canProceed = !!selectedTheme && !!selectedBackground`). Note that both start unselected (`null`), so the button begins in a disabled state.
- **Navigation**:
  - `"Go Back"`: Navigates back to `SUBJECTS`.
  - `"COMPLETE SETUP"`: Advances to `INITIALIZING`.

#### Step 5: `INITIALIZING` (Persistence & Transition)
- **Trigger**: Automatic `useEffect` triggers `submitOnboarding()` upon step entry.
- **Presentation**: Center spinner with dual rotating rings and text `"Synchronizing. Applying system configuration..."`
- **Network Call**: `POST /api/user/onboarding` sending:
  ```json
  {
    "classId": "class_scholar",
    "avatarId": "class_scholar",
    "backgroundId": "...",
    "themeId": "...",
    "username": "...",
    "name": "...",
    "password": "...",
    "timezone": "America/New_York",
    "subjects": [...]
  }
  ```
- **Backend Transaction**:
  - Unlocks chosen cosmetics in `UserCosmetic` table.
  - Upserts subjects in `Subject` table.
  - Bulk-creates 48 `SubjectNode` skeleton records per subject.
  - Updates `User` table: `hasCompletedOnboarding: true`, `activeTheme`, `activeBackground`, `activeAvatar`.
  - Re-issues signed `hunter_token` JWT cookie with `hasCompletedOnboarding: true`.
- **Error Handling**: On failure, displays `"INITIALIZATION FAILED"`, renders error text in red, and after 2,000ms rolls back to `THEME`.
- **Success Handling**: On success, updates client auth state (`login(data.user)`), calls `refreshStats()`, waits 1,000ms, and executes a full window reload: `window.location.href = "/dashboard"`.

---

## 2. Files and Components Involved

### Direct Onboarding Surface Files
| File Path | Role | Complexity / LOC |
|---|---|---|
| `app/onboarding/page.tsx` | Monolithic frontend page containing the entire multi-step flow and all sub-step components (`BootSequence`, `IdentityStep`, `SubjectIntakeStep`, `ThemeAndModeStep`, `InitializingSequence`). | 1,299 lines / 53.9 KB |
| `app/api/user/onboarding/route.ts` | Backend POST endpoint processing onboarding submissions, transactionally provisioning cosmetics, subjects, 48-node trees, and updating JWT tokens. | 292 lines / 10.1 KB |
| `app/api/auth/check-username/route.ts` | Backend GET endpoint performing debounced username availability checks. | ~45 lines |
| `__tests__/auth/onboarding.test.ts` | Vitest test suite testing onboarding token re-issuance and idempotency. | 131 lines |

### Shared State & Infrastructure Files
| File Path | Dependency / Interaction |
|---|---|
| `proxy.ts` | Next.js Edge route guard enforcing redirection into `/onboarding` when `hasCompletedOnboarding === false`. |
| `app/components/AuthProvider.tsx` | Provides `useAuth()`, `login()`, `refreshStats()` to mutate client session. |
| `app/components/GlobalSystemWrapper.tsx` | Exports `THEME_MAP`, `BG_MAP`, `applyGlobalBackground()`, `applyAppMode()`. |
| `app/components/SidebarWrapper.tsx` | Lists `/onboarding` in `PUBLIC_PATHS` to suppress the desktop navigation rail and mobile drawer during onboarding. |
| `app/components/PasswordStrengthMeter.tsx` | Visual meter evaluating password entropy in `IdentityStep`. |
| `lib/cosmetics-catalog.ts` | Supplies `COSMETICS_CATALOG.THEME` (10 items) and `COSMETICS_CATALOG.BACKGROUND` (9 items). |
| `lib/study-systems.ts` | Shared constants: `EXAM_BOARDS`, `ACADEMIC_LEVELS`, `ACCENT_COLORS`. |
| `lib/skill-tree-skeleton.ts` | Static matrix of 48 placeholder nodes (`SKELETON_NODES`) inserted per subject. |
| `lib/timezone-service.ts` | Server-side timezone validation. |
| `lib/auth.ts` & `lib/auth-server.ts` | JWT signing, cookie creation (`hunter_token`), and session extraction. |

---

## 3. Visual Audit

### 3.1 Outdated Visual Language & Isolation
- **What is wrong**: The onboarding flow is visually frozen in an earlier iteration of Sylf. While the rest of the application has migrated to scoped CSS Modules (`System.module.css`, `Dashboard.module.css`, `Timer.module.css`, `Goals.module.css`) with standard application tokens (`--page`, `--surface`, `--elevated`, `--ink`, `--line`, `--subtle-line`), `onboarding/page.tsx` relies entirely on inline style blocks mixed with ad-hoc Tailwind utility strings.
- **Where it occurs**: Throughout `app/onboarding/page.tsx` (lines 512-516, 761, 897-945, 1034, 1130-1165).
- **Current app pattern conflict**: The app’s design system uses semantic CSS module variables that automatically adapt across themes and modes. Onboarding manually specifies `style={{ background: "var(--bg-abyss)", borderColor: "var(--border-subtle)" }}`.
- **Severity**: HIGH

### 3.2 Inconsistent Button Geometry and Hover Effects
- **What is wrong**:
  1. Onboarding primary buttons use `rounded` (4px / 0.25rem radius) on navigation CTAs (lines 966, 1243):
     ```tsx
     className={`px-8 py-3 rounded font-bold tracking-widest uppercase transition-all duration-300 relative overflow-hidden ... hover:scale-105`}
     ```
  2. `IdentityStep` uses `.btn-primary` (0.5rem radius, gradient background).
  3. CTAs apply `hover:scale-105`, directly violating the master design system rule:
     > `❌ Layout-shifting hovers — Avoid scale transforms that shift layout` (`design-system/MASTER.md:201`).
- **Where it occurs**: `app/onboarding/page.tsx:647`, `app/onboarding/page.tsx:966-973`, `app/onboarding/page.tsx:1243-1250`.
- **Current app pattern conflict**: Across Dashboard, Timer, System, Goals, and Settings, all primary buttons use `rounded-xl` (12px) or `rounded-2xl` (16px), subtle border glows, and smooth opacity/background color transitions without layout-shifting transforms (`hover:scale-105`).
- **Severity**: HIGH

### 3.3 Fragmented Border Radius Hierarchy
- **What is wrong**: Within a single screen, onboarding mixes five distinct corner radius values without a discernible visual hierarchy:
  - Step container cards: `rounded-2xl` (16px)
  - Guidance banners: `rounded-xl` (12px)
  - Form input elements: `rounded-lg` (8px)
  - Subject cards & cosmetic cards: `rounded-xl` (12px)
  - Navigation action buttons: `rounded` (4px)
  - Color swatches: `rounded-full` (9999px)
- **Where it occurs**: `app/onboarding/page.tsx:512, 747, 788, 901, 966, 1050`.
- **Current app pattern conflict**: The current app enforces consistent radius tokens: `rounded-2xl` for major cards/containers, `rounded-xl` for interactive controls/buttons, and `rounded-lg` for nested badge chips.
- **Severity**: MEDIUM

### 3.4 Hardcoded Color Values and Legacy Purple Theming
- **What is wrong**:
  - The curriculum guidance banner hardcodes arbitrary Tailwind purples:
    `className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 text-xs text-purple-200 ..."`
  - The Dark Mode selection card hardcodes a purple shadow regardless of the user's active theme:
    `shadow-[0_0_15px_rgba(124,58,237,0.3)]` (`line 1052`).
  - Swatch preview boxes contain hardcoded `#222` and `#fff` fallbacks (lines 1196-1200).
- **Where it occurs**: `app/onboarding/page.tsx:747-758, 1052, 1196-1201`.
- **Current app pattern conflict**: App surfaces derive all tints from dynamic theme variables (`var(--accent-primary)`, `var(--accent-primary-dim)`, `var(--accent-primary-mid)`).
- **Severity**: MEDIUM

### 3.5 Lack of Ambient Starlight Atmosphere
- **What is wrong**: Modern Sylf pages (`System`, `Dashboard`, `Goals`, `Calendar`) incorporate a refined ambient canvas glow (`.topGlow` defined in their CSS modules) featuring subtle starlight particles and dual radial gradients that blend seamlessly with both Dark and Light modes. Onboarding instead places two crude, giant 384px blurred pulsing circles (`w-96 h-96 bg-accent-primary filter blur-[128px] animate-pulse`) across the screen.
- **Where it occurs**: `app/onboarding/page.tsx:288-292`.
- **Current app pattern conflict**: Conflicts with `.topGlow` in `System.module.css:68-102` and `Dashboard.module.css`.
- **Severity**: LOW

---

## 4. UX Audit

### 4.1 Artificial 3.5-Second Boot Delay
- **What is wrong**: Step 1 (`BOOT`) forces every new user to sit through a mandatory 3.5-second artificial timer. The user is already authenticated, the token is verified, and no heavy background asset loading is occurring. There is no skip button, no tap-to-bypass, and no interactive element.
- **Where it occurs**: `app/onboarding/page.tsx:174-186, 366-473`.
- **Current app pattern conflict**: Elsewhere in Sylf, entry into workspaces is instant, using stale-while-revalidate client caches and optimistic rendering.
- **Severity**: HIGH

### 4.2 Outdated Core Product Narrative (48-Node Constellation Graph)
- **What is wrong**: Onboarding explains Sylf’s value proposition with the following copy:
  > `"Select your academic subjects & syllabus codes to generate your Constellation Trees."`  
  > `"Include your book or syllabus details so the AI can dissect your exact syllabus and forge your 48-node academic constellation graph."`
  
  In the actual app today, the legacy constellation tree has been superseded and redirected to the unified Objectives & Quests system (`app/goals/components/GoalsScreen.tsx:40-45`). The user is being promised an intimidating, technical "48-node constellation graph" rather than being introduced to:
  - Daily & weekly AI study quests
  - The Focus timer & study sessions
  - Hunter rank progression (E $\rightarrow$ S rank)
  - Cognitive stat growth (Discipline, Focus, Memory, Endurance)
- **Where it occurs**: `app/onboarding/page.tsx:326, 752-757`.
- **Current app pattern conflict**: Completely out of sync with `app/goals/` and `app/quests/`.
- **Severity**: HIGH

### 4.3 Total Absence of the Sylf Companion
- **What is wrong**: Sylf’s primary brand and emotional identity is anchored by its illustrated Companion (`app/components/landing/companion/Companion.tsx`), which features rich multi-state behaviors (Greeting, Focusing, Reading, Planning, Celebrating). In onboarding, the companion does not appear anywhere. The user moves from the playful, inviting landing page directly into a sterile, cold, technical HUD.
- **Where it occurs**: Entire `app/onboarding/page.tsx` flow.
- **Current app pattern conflict**: Conflicts with `app/components/landing/companion/Companion.tsx` and the product’s core narrative.
- **Severity**: HIGH

### 4.4 Missing Class & Character Selection
- **What is wrong**: Sylf possesses an 8-class archetype catalog in `lib/cosmetics-catalog.ts` (Scholar, Analyst, Engineer, Scientist, Researcher, Psychologist, Strategist, Creative) and a dedicated sprite system (`app/components/character/CharacterRenderer.tsx`). However, during onboarding, the class is hardcoded in the submission payload:
  ```typescript
  classId: "class_scholar",
  avatarId: "class_scholar",
  ```
  The user is never shown their avatar, never given the choice of archetype, and never sees their character during setup.
- **Where it occurs**: `app/onboarding/page.tsx:223-224`.
- **Current app pattern conflict**: Conflicts with the manhwa gamification premise displayed on the dashboard (`CharacterRenderer`).
- **Severity**: HIGH

### 4.5 Lack of Stepper / Progress Indication
- **What is wrong**: There is no progress indicator (e.g. "Step 2 of 4", progress bar, or breadcrumb dots). Users have no indication of how long the setup is or how many questions remain.
- **Where it occurs**: `SubjectIntakeStep` and `ThemeAndModeStep`.
- **Current app pattern conflict**: Conflicts with standard onboarding multi-step best practices.
- **Severity**: MEDIUM

### 4.6 Disabled Button Trap in Theme Step
- **What is wrong**: When the user enters `ThemeAndModeStep`, the `"COMPLETE SETUP"` button is disabled (`canProceed = !!selectedTheme && !!selectedBackground`). Neither a theme nor a background is selected by default (`null`). Because the step contains 21 different cards spread over a tall scrollable container, users are frequently confused as to why the button is disabled and unclickable.
- **Where it occurs**: `app/onboarding/page.tsx:63-64, 350, 1241-1250`.
- **Current app pattern conflict**: The app’s appearance settings (`AppearanceSettingsScreen.tsx`) always select sane active defaults (Dark Mode, Deep Void, System Purple).
- **Severity**: MEDIUM

---

## 5. Mobile / Responsive Audit

### 5.1 Hardcoded `h-[88vh]` Container Trap
- **What is wrong**: Both `SubjectIntakeStep` and `ThemeAndModeStep` enforce a fixed viewport height:
  ```tsx
  className="w-full max-w-6xl p-6 sm:p-8 z-10 flex flex-col h-[88vh]"
  ```
  On mobile devices (iOS Safari and Android Chrome):
  1. Viewport heights fluctuate dynamically as navigation/address bars expand and contract.
  2. Fixed `88vh` leaves very little vertical real estate on small phones (e.g. iPhone SE / mini viewports around 667px height).
  3. When an input is focused and the virtual keyboard opens, `88vh` is squished or overflows, causing the header, nested scroll area, and bottom button bar to collide or trap the user’s cursor.
- **Where it occurs**: `app/onboarding/page.tsx:734, 1020`.
- **Current app pattern conflict**: The authenticated app shell uses responsive flex columns (`flex-1 min-h-0`) or dynamic viewport units (`100dvh` with `overscroll-none`) via `isStaticViewportRoute` in `SylfAppShell.tsx`.
- **Severity**: HIGH

### 5.2 21-Card Overload on Mobile Viewports
- **What is wrong**: In `ThemeAndModeStep`, the page renders:
  - 2 Mode toggle cards
  - 9 Environment background cards
  - 10 System resonance aura cards
  
  On mobile (`grid-cols-1`), these 21 cards stack into a massive, repetitive vertical list requiring over 10 full screen swipes to reach the bottom.
- **Where it occurs**: `app/onboarding/page.tsx:1045-1226`.
- **Current app pattern conflict**: In `AppearanceSettingsScreen.tsx`, appearance choices are organized into clean segmented tabs and compact horizontal swatch trays.
- **Severity**: HIGH

### 5.3 iOS Viewport Zoom Trigger
- **What is wrong**: The custom subject form fields use `text-xs` (12px):
  ```tsx
  className="w-full px-3 py-2 rounded-lg bg-bg-abyss border border-border-subtle text-text-primary text-xs focus:outline-none focus:border-accent-primary"
  ```
  In iOS Safari, any input element with a font size smaller than 16px triggers automatic camera zoom on focus, breaking the page layout and requiring manual pinch-to-unzoom.
- **Where it occurs**: `app/onboarding/page.tsx:788, 798, 807, 819, 837`.
- **Current app pattern conflict**: `globals.css:364-368` includes a mobile override rule for `@media screen and (max-width: 768px) { input { font-size: 16px !important; } }`, but local specificity issues and inline select styles can cause intermittent zoom jitter.
- **Severity**: MEDIUM

### 5.4 Sub-Standard Touch Targets
- **What is wrong**: The subject card delete button is styled as:
  ```tsx
  className="w-7 h-7 rounded-lg border border-border-subtle hover:border-accent-red/50 ... flex items-center justify-center"
  ```
  A dimensions box of $28\times 28\text{px}$ is well below Apple's Human Interface Guidelines ($44\times 44\text{px}$) and WCAG 2.5.5 Level AAA ($44\times 44\text{px}$) / WCAG 2.5.8 Level AA ($24\times 24\text{px}$ with spacing) standards for mobile tap targets.
- **Where it occurs**: `app/onboarding/page.tsx:939`.
- **Current app pattern conflict**: App buttons in mobile drawers and modals enforce minimum 40–44px hit targets (e.g. `w-10 h-10` in `Sidebar.tsx:405`).
- **Severity**: MEDIUM

---

## 6. Accessibility Audit (A11Y)

### 6.1 Unassociated Form Labels and Inputs
- **What is wrong**: None of the inputs across `IdentityStep` and `SubjectIntakeStep` include `id` attributes, and `<label>` tags lack `htmlFor`. Screen readers reading the form cannot associate label text with the corresponding input field.
- **Where it occurs**: `app/onboarding/page.tsx:536-543, 547-556, 560-582, 604-616, 782-790, 792-800, 802-811, 814-823, 829-842`.
- **Current app pattern conflict**: Conflicts with accessible form implementations in `SubjectModal.tsx` and `RegisterForm`.
- **Severity**: HIGH

### 6.2 Inaccessible Password Toggle Button
- **What is wrong**: The toggle button to show/hide the password in `IdentityStep` specifies `tabIndex={-1}` and has no `aria-label`:
  ```tsx
  <button
    type="button"
    onClick={onToggleShowPassword}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted ..."
    tabIndex={-1}
  >
  ```
  Keyboard users cannot tab to the button, and screen reader users hear only an unannounced clickable control.
- **Where it occurs**: `app/onboarding/page.tsx:617-633`.
- **Current app pattern conflict**: In `app/register/page.tsx` and `app/login/page.tsx`, the password toggle button is fully focusable with descriptive aria labels.
- **Severity**: HIGH

### 6.3 Missing ARIA Roles for Radio/Selection Cards
- **What is wrong**:
  - The color picker swatches in `SubjectIntakeStep` (`lines 849-860`) are bare `<button>` tags without `aria-label="Color #..."` or `aria-pressed`. Screen readers announce them simply as generic unnamed buttons.
  - The Interface Mode cards, Environment Domain cards, and Theme cards function as single-select radio groups, but lack `role="radiogroup"`, `role="radio"`, and `aria-checked` attributes.
- **Where it occurs**: `app/onboarding/page.tsx:849-860, 1047-1100, 1126-1163, 1180-1224`.
- **Current app pattern conflict**: The app’s custom tabs (`GoalsScreen.tsx`, `SystemScreen.tsx`) use proper ARIA roles and tab semantics.
- **Severity**: HIGH

### 6.4 Missing `aria-live` Regions for Dynamic Validation
- **What is wrong**:
  - Real-time username feedback (`"Checking availability..."`, `"✓ Username is available"`, `"This username is already taken."`) does not use `aria-live="polite"`. Assistive technologies do not announce availability changes.
  - Form validation errors (`validationError` in `SubjectIntakeStep:871`) lack `role="alert"`.
- **Where it occurs**: `app/onboarding/page.tsx:585-600, 871-873`.
- **Severity**: MEDIUM

### 6.5 Indefinite Animations and `prefers-reduced-motion`
- **What is wrong**: The rotating orbital HUD rings in `BootSequence` (`animate={{ rotate: 360 }}` over 12s and 6s) and `InitializingSequence` run indefinitely and do not honor `prefers-reduced-motion`.
- **Where it occurs**: `app/onboarding/page.tsx:409-419, 1275-1281`.
- **Current app pattern conflict**: Framer Motion animations in `lib/motion.ts` support reduced motion preferences.
- **Severity**: MEDIUM

---

## 7. Comparison with Current Sylf App

| Product Surface | Current Sylf App Pattern | Onboarding Implementation | Consistency Assessment |
|---|---|---|---|
| **Styling & CSS Architecture** | Scoped CSS Modules (`System.module.css`, `Dashboard.module.css`, `Timer.module.css`, `Calendar.module.css`) utilizing standard tokens (`--page`, `--surface`, `--elevated`, `--ink`, `--muted`, `--line`). | Raw Tailwind strings with hardcoded inline style overrides (`style={{ background: "var(--bg-abyss)" }}`). | **DISCONNECTED** |
| **Canvas & Atmosphere** | Refined `.topGlow` layer featuring starlight dot grid and dual radial glows harmonized for both Dark and Light modes. | Two oversized 384px pulsing blur circles (`blur-[128px] animate-pulse`) across the screen. | **DISCONNECTED** |
| **Navigation & Chrome** | Detached floating liquid-glass navigation rail (`liquid-glass-sidebar`), rounded-2xl profile card, and off-canvas mobile drawer. | Hidden (`SidebarWrapper` suppresses navigation on `/onboarding`). Custom ad-hoc footer button row. | **ACCEPTABLE (Dedicated Flow)** |
| **Companion Presentation** | Canonical animated mascot (`Companion.tsx`) exhibiting context-aware emotional states (Greeting, Focusing, Planning, Celebrating). | Zero presence. Not rendered or mentioned anywhere in the flow. | **COMPLETELY ABSENT** |
| **Character & Avatar Identity** | Pixelated hunter sprite system with 8 distinct class archetypes, pedestals, auras, and relics (`CharacterRenderer.tsx`). | Completely hidden. Class is hardcoded to `"class_scholar"` in the background payload without user awareness. | **COMPLETELY ABSENT** |
| **Button Language & Radii** | `rounded-xl` (12px) or `rounded-2xl` (16px), subtle border glows, smooth opacity/background color transitions. | `rounded` (4px) with `hover:scale-105` (layout-shifting scale transform forbidden by design system). | **DISCONNECTED** |
| **Modal & Form Dialogs** | Portal-based dialogs (`SubjectModal.tsx`), body scroll locking (`lockPageScroll()`), `backdropVariants`, 16px mobile inputs. | Inlined forms inside fixed `h-[88vh]` flex box; unassociated labels, 12px inputs on mobile. | **DISCONNECTED** |
| **Light Mode Support** | Comprehensive light mode token sets (`html[data-mode="light"]`) with high-contrast slate surfaces, crisp dark text, and soft shadows. | Incomplete: `BootSequence` monogram SVG has hardcoded dark fill (`rgba(0,0,0,0.5)`) and `bg-white/10` track invisible in light mode. | **POOR PARITY** |
| **Product Value Loop** | Quests, AI Study Planner, Pomodoro / Focus Sessions, Stats, XP & Ranks (E to S). | Cryptic "48-node academic constellation graph" promise; no mention of quests, timer, or ranks. | **MISALIGNED** |

---

## 8. Design-System Inconsistencies

### Master File Anomaly vs. Actual Implementation
A notable discovery during this audit is that `design-system/MASTER.md` contains placeholder content from an unrelated template:
- Header specifies: `"Category: Hotel/Hospitality"`, `"Heading Font: Playfair Display SC"`, `"Body Font: Karla"`, and palette `#1E3A8A / #A16207`.
- **Reality in Codebase**: The actual live application is built strictly around the **Solo Leveling Manhwa / The System** aesthetic defined in `app/globals.css:7-13`:
  - Primary UI Font: **Inter**
  - Display/Accent/Monogram Font: **Rajdhani**
  - Core Canvas: Deepest void `#090d16`, Abyss `#0d1117`, Shadow `#0f0f2a`, Panel `#141432`
  - Core Accents: Electric purple `#7c3aed`, Light purple `#a78bfa`, Gold `#f59e0b`, Green `#22c55e`, Red `#ef4444`

### Specific Inconsistencies in Onboarding
1. **Button Geometry Violation**:
   - Master rules specify 8px to 16px radius for buttons.
   - Onboarding navigation buttons use `rounded` (4px).
2. **Forbidden Scale Transform**:
   - Master rules explicitly ban `hover:scale` transforms due to blurriness and layout shifts.
   - Onboarding buttons use `hover:scale-105` (lines 969, 1245).
3. **Legacy Theme Tokens**:
   - Modern Sylf appearance settings (`AppearanceSettingsScreen.tsx`) use unified hex accent tinting with presets ("System Purple", "Electric Cyan", "Emerald", "Rose", "Amber Gold", "Neon Lime", "Royal Indigo").
   - Onboarding uses the legacy `THEME_MAP` keys (`cyberpunk`, `sakura`, `glacier`, `volt`, `plasma`).
4. **Card Hover Elevations**:
   - Current app uses subtle border glow and background brightening (`hover:border-border-active hover:bg-bg-panel`).
   - Onboarding cards use `scale-[1.02]` and `scale-[1.03]` with z-index manipulation (lines 1130-1135, 1186-1191).

---

## 9. Product & Friction Issues

### 9.1 Mandatory Syllabus Code (High Drop-off Risk)
- **What is wrong**: In `SubjectIntakeStep`, the `Syllabus Code` input is strictly marked required (`*`). Attempting to add a subject without one yields:
  ```typescript
  if (!customCode.trim()) {
    setValidationError("Syllabus code is required.");
    return;
  }
  ```
- **Why this hurts users**: Many students (especially university undergrads, informal self-studiers, or high school students outside the UK/IB/AP systems) do not have or know a formal alphanumeric syllabus code like `MATH-201` or `CAIE 9709`. Because adding at least one subject is required to exit onboarding, users without a code are completely blocked.
- **Severity**: HIGH

### 9.2 Zero Subject Presets or Suggestions
- **What is wrong**: The onboarding flow presents an empty dashed box and expects the user to manually enter every single subject by clicking "+ Add Custom Subject" and filling out 4–5 fields from scratch. There are no quick-tap suggestions (e.g. "Mathematics", "Physics", "Chemistry", "Computer Science", "Biology", "Literature").
- **Severity**: HIGH

### 9.3 Immediate Unlock of End-Game Cosmetics
- **What is wrong**: In `lib/cosmetics-catalog.ts`, cosmetic backgrounds and themes have defined unlock requirements:
  - `Abyss`: S-Rank
  - `Volt`: A-Rank
  - `Amber`: B-Rank
  - `Digital Rain`: C-Rank
  - `Sakura Dusk`: Level 10
  
  However, `ThemeAndModeStep` presents the entire catalog to a brand-new Level 1, E-Rank user, and `/api/user/onboarding` permanently unlocks whichever one they select into `UserCosmetic`. This inadvertently short-circuits the game's reward loop before the user even starts.
- **Severity**: MEDIUM

### 9.4 Lack of Deferred Setup / "Skip for Now"
- **What is wrong**: Users cannot explore the dashboard, test the focus timer, or inspect the app before completing subject and cosmetic configuration. There is no "I'll do this later" option.
- **Severity**: MEDIUM

---

## 10. What Already Works Well

While the visual presentation and UX flow have aged, several robust architectural and data patterns must be preserved:

1. **Debounced Live Username Verification**:
   - `app/onboarding/page.tsx:93-140` debounces keystrokes (350ms) and checks `/api/auth/check-username`. It provides clear visual feedback and prevents duplicate usernames from failing at submission time.
2. **Standardized Study Systems Registry**:
   - Utilizing `lib/study-systems.ts` (`EXAM_BOARDS`, `ACADEMIC_LEVELS`, `ACCENT_COLORS`) guarantees that the options in onboarding match the options in the Focus Timer's `SubjectModal` and the AI Planner.
3. **Automatic Timezone Detection**:
   - `Intl.DateTimeFormat().resolvedOptions().timeZone` is automatically queried on the client and validated on the server via `TimezoneService.validateTimezone()`. This ensures calendar events, study streaks, and quota resets align to the user's local clock immediately.
4. **Atomic Transactional Submission**:
   - `app/api/user/onboarding/route.ts:138-222` runs all database operations inside a single `prisma.$transaction`. Cosmetics unlocking, subject creation, node generation, and user preference updates succeed or fail atomically.
5. **Idempotent API Handling**:
   - If an already-onboarded user's browser re-posts to `/api/user/onboarding`, the endpoint safely handles the request without crashing or creating duplicates, smoothly re-issuing a valid JWT cookie.
6. **Seamless Client Session Transition**:
   - Calling `login(data.user)` and `refreshStats()` in the client auth provider immediately updates React state before routing to `/dashboard`, preventing flash-of-unauthenticated-state errors.

---

## 11. Highest-Priority Problems

| Rank | Issue | Location | Current App Pattern Conflict | Severity |
|---|---|---|---|---|
| **1** | **Mandatory Syllabus Code Blocks Users** | `app/onboarding/page.tsx:693-696` | Users without formal course codes (university/self-study) cannot finish onboarding. | **HIGH** |
| **2** | **Complete Absence of Brand Identity & Companion** | Entire onboarding page | Sylf's animated companion (`Companion.tsx`) and character system (`CharacterRenderer`) are missing; class is hardcoded. | **HIGH** |
| **3** | **Hardcoded `h-[88vh]` Mobile Viewport Failure** | `app/onboarding/page.tsx:734, 1020` | Collapses when virtual keyboard opens; conflicts with `100dvh` / responsive flex standards. | **HIGH** |
| **4** | **Outdated Value Proposition (48-Node Constellation)** | `app/onboarding/page.tsx:326, 752-757` | Legacy skill tree is redirected in modern app; fails to explain quests, timer, or ranks. | **HIGH** |
| **5** | **Artificial 3.5s Boot Delay & Fake Progress** | `app/onboarding/page.tsx:174-186, 366-473` | Pure friction holding authenticated users back with fake loading meters. | **HIGH** |
| **6** | **21-Card Overload & Disabled Button Trap in Theme Step** | `app/onboarding/page.tsx:1033-1250` | Overwhelming mobile scrolling; button starts disabled with no default selection. | **MEDIUM** |
| **7** | **Inaccessible Forms & Missing ARIA Attributes** | `app/onboarding/page.tsx:536-633, 849-860` | Unassociated labels, unclickable password toggle (`tabIndex={-1}`), radio cards lack ARIA roles. | **MEDIUM** |
| **8** | **Button Styling Inconsistencies & Forbidden Scale Hover** | `app/onboarding/page.tsx:966-973, 1243-1250` | Uses `rounded` (4px) and `hover:scale-105` violating master design system rules. | **MEDIUM** |

---

## 12. Recommended Direction for a Future Redesign

*(Architectural recommendations only — no redesign implemented in this phase)*

1. **Introduce the Companion as the Onboarding Guide**:
   - Embed the canonical `Companion` (`size="MEDIUM"` or `"LARGE"`) to welcome the user, introduce Sylf's core loop, and react dynamically as steps are completed (e.g. `GREETING` on step 1, `PLANNING` on curriculum, `LEVEL_UP` or `CELEBRATING` on finish).
2. **Explain the Real Core Game Loop**:
   - Replace the cryptic constellation tree copy with concise, exciting onboarding cards explaining:
     - **Curriculum to Quests**: How syllabi turn into bite-sized daily objectives.
     - **Focus & Leveling**: How study timer sessions earn XP, Hunter Ranks, and stat growth.
3. **Provide Archetype / Class Selection**:
   - Replace the hardcoded `class_scholar` payload with an interactive class chooser displaying the 8 archetypes from `CLASS_CATALOG` with their `CharacterRenderer` sprite previews.
4. **Streamline Curriculum Intake**:
   - Provide a 1-tap list of common subject presets (e.g. Mathematics, Physics, Chemistry, Biology, Computer Science, Literature, Economics).
   - Make `Syllabus Code` optional with an "I don't have a syllabus code" or "General / University Course" toggle.
5. **Modernize Appearance Calibration**:
   - Match `AppearanceSettingsScreen.tsx`: Let users choose Dark vs. Light Mode and pick their primary accent tint from the 8 curated presets (System Purple, Cyan, Emerald, Rose, Gold, Crimson, Lime, Indigo).
   - Default to Dark Mode + System Purple so the completion button is immediately active.
6. **Migrate to Scoped CSS Modules & Responsive Shell**:
   - Create `Onboarding.module.css` utilizing `--page`, `--surface`, `--elevated`, `--accent-primary`, and `.topGlow`.
   - Remove `h-[88vh]` in favor of a responsive layout that scrolls naturally on mobile and handles on-screen keyboards gracefully.
7. **Add Clear Stepper & Optional Skip**:
   - Add a clean 3-step progress bar (e.g. 1: Archetype $\rightarrow$ 2: Curriculum $\rightarrow$ 3: Appearance).
   - Provide an optional "Explore First / Set Up Later" skip action that provisions default settings and routes directly to the dashboard.

---

## 13. Things That Should NOT Be Changed

To prevent regressions across the rest of the application, the following backend contracts and core mechanics must be kept intact during any future redesign:

1. **`POST /api/user/onboarding` API Contract**:
   - The endpoint expects `{ classId, avatarId, backgroundId, themeId, username, name, password, timezone, subjects }`.
   - The response format, cookie generation (`hunter_token`), and session refresh contract must remain stable.
2. **`proxy.ts` Route Protection**:
   - The edge middleware logic checking `session.hasCompletedOnboarding === false` and redirecting uncompleted users to `/onboarding` is critical for application integrity.
3. **Shared Study Systems Constants (`lib/study-systems.ts`)**:
   - The options in `EXAM_BOARDS`, `ACADEMIC_LEVELS`, and `ACCENT_COLORS` must remain unified because they are shared with `SubjectModal.tsx` and the AI Planner.
4. **Automatic Timezone Detection Logic**:
   - Client detection of `Intl.DateTimeFormat().resolvedOptions().timeZone` and server validation via `TimezoneService`.
5. **Atomic Subject Creation & Token Refresh**:
   - Transactional creation of subjects in Prisma and issuance of a fresh JWT cookie with `hasCompletedOnboarding: true`.

---

## 14. Files Likely to Be Touched in a Future Redesign

When a redesign is scheduled, the work will primarily involve:

| File | Scope of Potential Changes |
|---|---|
| `app/onboarding/page.tsx` | Complete visual and interaction rewrite, splitting into modular step components. |
| `app/onboarding/Onboarding.module.css` | New CSS Module defining scoped tokens, starlight `.topGlow`, responsive card layouts, and mobile-safe heights. |
| `app/onboarding/components/CompanionWelcomeStep.tsx` | New component integrating `Companion.tsx` and explaining the core game loop. |
| `app/onboarding/components/ArchetypeStep.tsx` | New component allowing selection of class archetypes from `CLASS_CATALOG` with `CharacterRenderer`. |
| `app/onboarding/components/CurriculumStep.tsx` | Streamlined subject intake with presets and optional syllabus codes. |
| `app/onboarding/components/CalibrationStep.tsx` | Simplified mode and accent tint picker matching `AppearanceSettingsScreen`. |
| `app/api/user/onboarding/route.ts` | Minor adjustments to support optional syllabus codes or default subjects if permitted. |
| `__tests__/auth/onboarding.test.ts` | Unit and integration test assertions updated for new step contracts. |

---

## 15. Explicit Confirmation: Planner Research Phase 3 Boundary

> [!IMPORTANT]
> **STRICT BOUNDARY VERIFICATION**:
> Antigravity AI hereby explicitly confirms that:
> - **ZERO** files under `lib/planner/research/**` were opened, inspected, edited, or modified.
> - No Planner research providers, research contracts, research evidence/coverage/selection/follow-up algorithms, research caches, research telemetry, Planner research Phase 3 UI, or research tests were touched or investigated.
> - Git working tree verification confirms zero alterations outside of this generated audit report ([ONBOARDING_AUDIT_REPORT.md](ONBOARDING_AUDIT_REPORT.md)).

---

## Summary

### Top 5 Problems
1. **Mandatory Syllabus Code**: Blocks self-studiers and university students who lack formal exam codes from passing onboarding.
2. **Missing Companion & Character Identity**: Complete absence of Sylf's signature animated companion mascot and character archetype system.
3. **Mobile Viewport Crushing (`h-[88vh]`)**: Causes severe scrolling and keyboard overlap bugs on smartphones.
4. **Outdated Value Proposition**: Boasts a legacy "48-node constellation graph" instead of explaining the actual core loop (Quests, Focus Timer, Ranks, XP).
5. **Forced 3.5s Artificial Delay**: Synthetic boot meter delays users with no interactive value or skip option.

### Top 5 Opportunities
1. **Companion-Led Onboarding**: Use Sylf’s animated companion to create an immediate emotional connection and guide the user through setup.
2. **Hunter Archetype Selection**: Turn step 1 into an engaging Solo Leveling moment where users pick their character class and see their sprite.
3. **1-Tap Subject Presets**: Allow users to configure their study subjects in under 15 seconds with quick-add chips.
4. **Unified Appearance Calibration**: Align with modern settings (Light/Dark mode + 8 accent presets) with instant defaults.
5. **Responsive CSS Module Architecture**: Adopt the app's standard `--page`, `--surface`, and `.topGlow` tokens for flawless desktop and mobile parity.

### Overall Consistency Rating
**Does onboarding currently feel visually consistent with Sylf?**  
# **NO**

*Rationale: While onboarding shares the underlying color palette in dark mode, its lack of scoped CSS module tokens, missing ambient starlight atmosphere, fragmented border radii, layout-shifting button scales, complete omission of the companion and character systems, and broken mobile viewport constraints make it feel like an un-refactored relic from an earlier prototype rather than a seamless entry point into the modern Sylf product.*
