# Timer mobile columns

Date: 2026-10-14

The timer page now shows quests and subjects side by side on phones and tablets. The existing screen and CSS module own the change; timing, API requests, subject lifecycle handlers, and focus destinations are unchanged.

Two equal columns use compact cards when the page container is 1,000px or narrower. Titles wrap rather than relying on a hover tooltip, metadata and timers remain visible, and Focus/menu controls have 44px touch targets. At 540px or narrower, headings and empty-state actions use shorter visible labels while retaining complete accessible names. The daily-focus card is shorter. Add Subject sits below populated subjects and remains available inside the empty state.

## Verification

The shared TimerScreen and SylfAppShell were rendered in the actual Vite mobile client with browser-only API fixtures. No account or database records were changed. The configured Playwright MCP profile was already in use, so verification used an isolated Playwright Chromium instance.

- Screenshots inspected at 320, 390, 430, 768, 980, and 1,440px. Light and dark modes plus light mode with a dark custom background and dark mode with a light custom background were covered.
- Populated lists with long names, empty quests beside populated subjects, both lists empty, and loading states were checked. Both column tops align, the sections remain side by side, and no content crosses viewport edges. Mobile Focus and menu buttons measure at least 44 by 44px.
- Subject menu, Edit Subject, and Add Subject dialogs opened and were inspected at 390px. Escape dismisses overlays. Focus destinations, active-quest filtering, cumulative/subject time readouts, menu dismissal, and add actions have component regression coverage.
- `timer-screen.test.tsx` and `subject-edit-delete.test.ts`: 24 tests passed.
- `npx tsc --noEmit`: passed. Targeted ESLint: no errors; TimerScreen retains its pre-existing `fetchSubjectsAndQuests` effect dependency warning.
- Next.js production build passed using the isolated `SYLF_TEST_DIST_DIR=.next-timer-layout` output. Temporary build files and Next-generated configuration additions were removed afterward.
- Mobile production build and the existing bundle verification script passed against an output directory in `/private/tmp`, preserving unrelated `mobile/dist` changes.

The broader `study-timer-accuracy.test.ts` run had two passing tests and two failures in friends/profile APIs. The failures attempt Prisma queries from the unchanged pixel-companion service and receive `EPERM` in the sandbox; that suite does not import TimerScreen or its stylesheet.

Browser measurements and screenshots are in [evidence](evidence/results.json). This is a fixture-based rendering check of the shared screen, not authenticated web/database integration coverage.
