// Workspace over the real backend. Audio's catalog reads real data here, and Sylvie reads hers in her own tool. Planner and Calendar live in Home's Plan. Notes, PDFs,
// Whiteboard and Resources read the local Notes library since Phase 14: there is no server list of notes by design.
import type { Backend, ResourceDefinition } from "@sylf/backend";
import type { SoundTrack, ToolResult, WorkspaceDataAdapter } from "./contracts";

const titleCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();


export type LiveToolView = keyof WorkspaceDataAdapter;

export function liveToolResource(backend: Backend, view: "sounds"): ResourceDefinition<unknown> {
  const { reads } = backend;
  // A fixed catalog, public on the server, so it can stay for the whole session.
  const sounds: ResourceDefinition<SoundTrack[]> = { key: "tool-sounds", ttlMs: 30 * 60_000, load: async (signal) => (await reads.sounds(signal)).tracks.map((track) => ({ id: String(track.id), name: track.title, detail: titleCase(track.category), url: track.audioUrl })) };
  return view === "sounds" ? (sounds as ResourceDefinition<unknown>) : (sounds as ResourceDefinition<unknown>);
}

/** Tools later work owns. Since Phase 14 there are none. */
export const LIMITED_TOOLS: Partial<Record<LiveToolView, ToolResult<never>>> = {};
