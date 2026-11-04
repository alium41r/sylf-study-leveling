// The tool contract (master plan §2.2). Every Workspace tool is a new frontend over something Sylf already has, and `owner`
// names it. A tool with no owner does not belong here (master plan §7.3). `multiple` is false where one authority forbids a
// second copy: there is one timer session and one audio engine. Planner and Calendar live in Home's Plan (ADR 0014).
export const TOOL_IDS = ["notes", "pdfs", "whiteboard", "sylvie", "timer", "calculator", "audio", "resources"] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export type ToolCapability = "pen" | "keyboard" | "file" | "ai-context";

export interface ToolSize { width: number; height: number }
export interface ToolSpec {
  label: string;
  multiple: boolean;
  min: ToolSize;
  preferred: ToolSize;
  max: ToolSize;
  capabilities: ToolCapability[];
  owner: string;
  /** Its content zooms on its own, so two fingers on it are the tool's. On any other tool, a pinch zooms the canvas. */
  ownsPinch?: boolean;
}

const BIG = { width: 1680, height: 1204 };

export const TOOLS: Record<ToolId, ToolSpec> = {
  notes: { label: "Notes", multiple: true, ownsPinch: true, min: { width: 336, height: 280 }, preferred: { width: 588, height: 644 }, max: BIG, capabilities: ["pen", "keyboard", "ai-context"], owner: "lib/notes: envelope v1, /api/notes" },
  pdfs: { label: "PDFs", multiple: true, ownsPinch: true, min: { width: 336, height: 336 }, preferred: { width: 588, height: 756 }, max: BIG, capabilities: ["pen", "file", "ai-context"], owner: "lib/notes/pdf, PDF source records in Notes" },
  whiteboard: { label: "Whiteboard", multiple: true, ownsPinch: true, min: { width: 336, height: 280 }, preferred: { width: 756, height: 532 }, max: BIG, capabilities: ["pen"], owner: "lib/notes: a Notes drawing document, sylf-ink/1" },
  sylvie: { label: "Sylvie", multiple: true, min: { width: 336, height: 364 }, preferred: { width: 420, height: 616 }, max: { width: 840, height: 1204 }, capabilities: ["keyboard"], owner: "lib/ai, ChatSession, /api/system-messages/chat" },
  timer: { label: "Timer", multiple: false, min: { width: 280, height: 308 }, preferred: { width: 336, height: 392 }, max: { width: 560, height: 700 }, capabilities: [], owner: "lib/timer-engine, StudySession, /api/sessions" },
  calculator: { label: "Calculator", multiple: true, min: { width: 280, height: 420 }, preferred: { width: 336, height: 532 }, max: { width: 560, height: 840 }, capabilities: ["keyboard"], owner: "lib/calculator/math-engine, in place through @sylf/shared" },
  audio: { label: "Audio", multiple: false, min: { width: 280, height: 280 }, preferred: { width: 364, height: 420 }, max: { width: 560, height: 840 }, capabilities: [], owner: "AcousticTrack, /api/acoustics, lib/acoustics" },
  resources: { label: "Resources", multiple: true, min: { width: 308, height: 308 }, preferred: { width: 420, height: 560 }, max: { width: 840, height: 1204 }, capabilities: ["file"], owner: "The Resource Shelf: a catalogue over Notes, not a new store" },
};

export const isToolId = (value: unknown): value is ToolId => TOOL_IDS.includes(value as ToolId);
