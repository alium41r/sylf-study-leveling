// Turns a resource's state into what a screen reads, so Home, Workspace and World all say loading, offline and failed the same way.
import type { Resource, ResourceState } from "@sylf/backend";
import { describeFailureText } from "./account/failure";

/** How a real read is going. Absent on sample and empty data. */
export interface LiveStatus {
  offline: boolean;
  /** Set when the last read did not work. With data, what is on screen is the last good copy. */
  failure: string | null;
  retry(): void;
}

export interface LiveResult<T> { provenance: "live"; data: T | null; live: LiveStatus }

/** Null while there is nothing to show yet. A failure with no data still answers, because the screen has to say something. */
export function toLiveResult<T>(state: ResourceState<T> | null, resource: Resource<T> | null): LiveResult<T> | null {
  if (!state || !resource) return null;
  if (state.data === null && (state.status === "idle" || state.status === "loading")) return null;
  const offline = state.status === "offline";
  const failure = offline || state.status === "failed" || state.status === "signed-out" ? (state.error ? describeFailureText(state.error) : null) : null;
  return { provenance: "live", data: state.data, live: { offline, failure, retry: () => resource.refresh() } };
}
