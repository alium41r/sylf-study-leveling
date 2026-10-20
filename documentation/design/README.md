# Design documentation entry points

The [authentication experience](../authentication/README.md) describes the current login/signup Floating Sanctuary, including the canonical companion, native SVG scenery, responsive layouts, appearance tokens, and motion controls.

The `design-system/` reference set now lives beside this index. [Dashboard](design-system/pages/dashboard.md), [Goals/Quests](design-system/pages/goals.md), [Timer](design-system/pages/timer.md), and [Study Sanctuary](design-system/pages/study-sanctuary.md) provide scoped page/art directions. Treat them as design guidance and check current source for implementation details; housekeeping does not certify every design statement as current behavior.

Two documents need qualification:

- [MASTER.md](design-system/MASTER.md) contains generated hospitality defaults and a rule that page directions override it. It is preserved; it is not presented here as a verified Sylf-wide implementation contract.
- [Landing direction](design-system/pages/landing.md) contains historical video-renderer/playback descriptions and a reference to missing `docs/landing-companion-motion-qa.md`. Later [painted/SVG companion reports](../landing-companion/README.md) and [SVG capability evidence](../svg-companion/README.md) describe subsequent work. The older note stays in the design-system reference set, with that limitation explicit here.

The [Focus background content specification](../specifications/features/focus-backgrounds-content-spec.md) remains the existing asset/content standard. The [Planner frontend design input](../planner/archive/frontend-redesign/PLANNER_FRONTEND_UX_GUIDE_AND_REDESIGN_SPEC.md) is archived separately from later implementation reports.

Source and design-reference artwork lives in [`assets/`](../../assets/README.md). Runtime screenshots are served from `public/landing/screenshots/`; the duplicate root screenshot folder was removed after SHA-256 verification.

## Main page headings

Sidebar destinations use a single short page heading: Dashboard, Timer, Social, Sylvie, Objectives, Calendar, Locker, and Shop. The admin-only background studio uses Studio. Omit decorative eyebrow text, greetings, protocol labels, and introductory taglines from these page headers. Keep functional controls, metrics, tab labels, and section content. Both Objectives tabs retain the Objectives page heading; Locker owns its page heading above the tabs, with the immersive Pixel Studio retaining its own toolbar.
