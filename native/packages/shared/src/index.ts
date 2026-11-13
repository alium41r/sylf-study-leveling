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
export * as quickAdd from "../../../../lib/calendar/quick-add";
export * as ink from "../../../../lib/notes/ink";
export * as inkGeometry from "../../../../lib/notes/ink-geometry";
export * as notesGraph from "../../../../lib/notes/graph";
export * as notesContracts from "../../../../lib/notes/contracts";
export * as notesPdf from "../../../../lib/notes/pdf";
export * as noteStyle from "../../../../lib/notes/note-style";
export * as inkOutline from "../../../../lib/notes/ink-outline";
// The planning kernel: the same solver, verifiers, diff and command parser the server commits with, so drags and what-ifs re-solve on the device.
export * as planning from "../../../../lib/planner/kernel";

export type { InkSample, InkBrush, InkPaper, InkStroke } from "../../../../lib/notes/ink";
export type { DocumentDescriptor, AssetDescriptor } from "../../../../lib/notes/contracts";
export type { PdfMark, PdfSourcePage } from "../../../../lib/notes/pdf";
export type { PenPreset } from "../../../../lib/notes/note-style";
