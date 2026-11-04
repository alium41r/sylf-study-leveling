// Workspace over the real backend. Audio's catalog reads real data here, and Sylvie reads hers in her own tool. Planner and Calendar live in Home's Plan. Notes, PDFs,
// Whiteboard and Resources belong to Phase 14: there is no server list of them by design, so they say what is true instead of showing an empty shelf.
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

/** Tools later work owns. Each sentence is true of today, for someone signed in. */
export const LIMITED_TOOLS: Partial<Record<LiveToolView, ToolResult<never>>> = {
  notes: { provenance: "live", data: null, limited: "Your notes live on the device you wrote them on, in Sylf for the web. Opening them here arrives with the Notes editor." },
  pdfs: { provenance: "live", data: null, limited: "PDFs live in Notes, on the device that added them. Reading them here arrives with the Notes editor." },
  boards: { provenance: "live", data: null, limited: "Whiteboards are Notes drawings. Drawing here arrives with native ink." },
  resources: { provenance: "live", data: null, limited: "The Resource Shelf points at your notes and PDFs, so it arrives with the Notes editor." },
};
