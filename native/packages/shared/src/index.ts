// The only entry point from Sylf Native into the web repository's lib/. Modules are consumed in place
// (never copied or moved). Each one is portable: no DOM, browser storage, server, Next.js or React imports.
// tooling/checks/check-boundaries.mjs enforces this list and its transitive imports; parity.ts verifies
// identical behavior across V8, Chromium and Hermes. Add a module here only after both checks pass.
export * as progression from "../../../../lib/game-engine";
export * as appearance from "../../../../lib/color-utils";
export * as calculator from "../../../../lib/calculator/math-engine";
export { TimezoneService } from "../../../../lib/timezone-service";
export * as timer from "../../../../lib/timer-engine";
export * as modes from "../../../../lib/timer-modes";
export * as ink from "../../../../lib/notes/ink";
export * as inkGeometry from "../../../../lib/notes/ink-geometry";
export * as notesGraph from "../../../../lib/notes/graph";

export type { InkSample, InkBrush, InkPaper } from "../../../../lib/notes/ink";
