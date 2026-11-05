// What Workspace's server-backed tools need to draw, shaped as view models and not as server records. Each names the existing owner it stands
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

/** A ChatSession and its messages, through the Sylvie contract. */
export interface SylvieMessage { id: string; from: "person" | "sylvie"; text: string }
export interface SylvieThread { id: string; title: string; messages: SylvieMessage[] }
/** Sylvie's threads, without their messages. A thread's messages are read when it is opened. */
export interface SylvieIndex { threads: { id: string; title: string }[] }
/** AcousticTrack, /api/acoustics. */
export interface SoundTrack { id: string; name: string; detail: string; url?: string }

/** Notes, PDFs, Whiteboard and Resources read the local Notes library (@sylf/notes), not this adapter. */
export interface WorkspaceDataAdapter {
  sylvie(): Promise<ToolResult<SylvieThread[]>>;
  sounds(): Promise<ToolResult<SoundTrack[]>>;
}
