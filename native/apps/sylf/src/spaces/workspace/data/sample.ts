// Sample content for reviewing the tools. It is invented, every result is marked "sample", and a window says so. Without
// development tools the empty adapter is bound, so a store build cannot show any of this.
import type { ToolResult, WorkspaceDataAdapter } from "./contracts";

const sample = <T,>(data: T): Promise<ToolResult<T>> => Promise.resolve({ provenance: "sample", data });
const empty = <T,>(): Promise<ToolResult<T>> => Promise.resolve({ provenance: "live", data: null });





export const SAMPLE_WORKSPACE_DATA: WorkspaceDataAdapter = {
  sylvie: () => sample([{ id: "thread", title: "Roots of unity", messages: [{ id: "1", from: "person", text: "Why are the cube roots of −8 evenly spaced?" }, { id: "2", from: "sylvie", text: "Each root has the same modulus, 2, so they all sit on one circle. De Moivre's theorem says their arguments differ by 2π/3, a third of a full turn. Three equal turns bring you back to where you began." }, { id: "3", from: "person", text: "So for fourth roots it would be a quarter turn?" }, { id: "4", from: "sylvie", text: "Exactly. n roots, spaced 2π/n apart. Try sketching the fourth roots of 16 and see whether the picture agrees." }] }]),
  sounds: () => sample([{ id: "rain", name: "Rain on a window", detail: "Ambient" }, { id: "library", name: "Quiet library", detail: "Ambient" }, { id: "brown", name: "Brown noise", detail: "Noise" }, { id: "piano", name: "Slow piano", detail: "Music" }]),
};

export const EMPTY_WORKSPACE_DATA: WorkspaceDataAdapter = { sylvie: empty, sounds: empty };

export const workspaceDataFor = (devTools: boolean, scenario: "sample" | "empty" | "slow" | null) => (devTools && scenario !== "empty" ? SAMPLE_WORKSPACE_DATA : EMPTY_WORKSPACE_DATA);
