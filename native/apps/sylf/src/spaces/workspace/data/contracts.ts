// What Workspace's tools need to draw, shaped as view models and not as server records. Each names the existing owner it stands
// for: Workspace adds no server concept. As with Home, every result says where it came from, the window shows the sample notice
// from `provenance`, and Phase 13 replaces the adapter without touching a tool.
import type { LiveStatus } from "../../../shell/live-result";

export type Provenance = "sample" | "live";
export interface ToolResult<T> {
  provenance: Provenance;
  data: T | null;
  live?: LiveStatus;
  /** This tool has no real content yet and later work owns it. The sentence says what is true now, in place of an empty state. */
  limited?: string;
}

/** A Notes document, read as text for now: NotesDocument, envelope v1, /api/notes. */
export interface NoteDocument { id: string; title: string; subject: string; updated: string; body: { heading?: string; text: string }[] }
/** A PDF source in Notes: lib/notes/pdf. Pages here stand in for a rendered page. */
export interface PdfDocument { id: string; title: string; detail: string; pages: { heading: string; lines: string[] }[] }
/** A Notes drawing document: sylf-ink/1. */
export interface BoardDocument { id: string; title: string; detail: string }
/** Planner items for the day and open objectives: PlannerRevision, Goal, Quest. */
export interface PlannerItem { id: string; time: string; title: string; detail: string }
export interface PlannerObjective { id: string; title: string; detail: string; questId?: number; subject?: string | null; subjectId?: number | null; done?: boolean; completion?: { id: number; plannedMinutes?: number | null; executionVersion?: number } }
export interface PlannerView { items: PlannerItem[]; objectives: PlannerObjective[]; goals?: { id: string; title: string; detail: string }[] }
/** CalendarEvent, by local day. `day` is yyyy-mm-dd. */
export interface CalendarEntry { id: string; day: string; time: string; title: string; startsAt?: number }
/** A ChatSession and its messages, through the Sylvie contract. */
export interface SylvieMessage { id: string; from: "person" | "sylvie"; text: string }
export interface SylvieThread { id: string; title: string; messages: SylvieMessage[] }
/** Sylvie's threads, without their messages. A thread's messages are read when it is opened. */
export interface SylvieIndex { threads: { id: string; title: string }[] }
/** AcousticTrack, /api/acoustics. */
export interface SoundTrack { id: string; name: string; detail: string }
/** A Resource Shelf entry: a pointer to something Notes already owns, never a second copy. */
export type ResourceKind = "note" | "pdf" | "board";
export interface ResourceEntry { id: string; kind: ResourceKind; documentId: string; title: string; detail: string }

export interface WorkspaceDataAdapter {
  notes(): Promise<ToolResult<NoteDocument[]>>;
  pdfs(): Promise<ToolResult<PdfDocument[]>>;
  boards(): Promise<ToolResult<BoardDocument[]>>;
  planner(): Promise<ToolResult<PlannerView>>;
  calendar(now: Date): Promise<ToolResult<CalendarEntry[]>>;
  sylvie(): Promise<ToolResult<SylvieThread[]>>;
  sounds(): Promise<ToolResult<SoundTrack[]>>;
  resources(): Promise<ToolResult<ResourceEntry[]>>;
}
