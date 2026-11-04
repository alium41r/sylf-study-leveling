// The one place Workspace's data is bound. Signed in, a tool reads a live resource, or says plainly that later work owns it. In a build with a backend
// and nobody signed in, the empty adapter binds, and sample data can appear only in a development build with no backend at all.
import { useEffect, useMemo, useState } from "react";
import type { Resource } from "@sylf/backend";
import { useBackend, useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { DEV_TOOLS, useDevSurface } from "../../../shell/dev-surface";
import { toLiveResult } from "../../../shell/live-result";
import type { ToolResult, WorkspaceDataAdapter } from "./contracts";
import { LIMITED_TOOLS, liveToolResource, type LiveToolView } from "./live";
import { workspaceDataFor } from "./sample";

export function useWorkspaceData() {
  const { homeData } = useDevSurface();
  const configured = useBackend() !== null;
  return useMemo(() => workspaceDataFor(DEV_TOOLS && !configured, homeData), [configured, homeData]);
}

/** Loads once per adapter. `result` stays null while loading, and an unmounted tool ignores a late answer. `param` names what a tool is looking at. */
export function useToolResult<T>(view: LiveToolView, load: (adapter: WorkspaceDataAdapter) => Promise<ToolResult<T>>, param?: string): ToolResult<T> | null {
  const backend = useLiveBackend();
  const limited = backend ? LIMITED_TOOLS[view] : undefined;
  const resource = useMemo(() => (backend && view === "sounds" ? (backend.resources.resource(liveToolResource(backend, "sounds")) as Resource<T>) : null), [backend, view, param]);
  const state = useOptionalResource(resource);
  const adapter = useWorkspaceData();
  const [result, setResult] = useState<{ adapter: WorkspaceDataAdapter; value: ToolResult<T> } | null>(null);
  useEffect(() => {
    if (resource || limited) return;
    let live = true;
    void load(adapter).then((value) => { if (live) setResult({ adapter, value }); });
    return () => { live = false; };
  }, [adapter, limited, load, resource]);
  if (limited) return limited as ToolResult<T>;
  if (resource) return toLiveResult(state, resource);
  return result?.adapter === adapter ? result.value : null;
}
