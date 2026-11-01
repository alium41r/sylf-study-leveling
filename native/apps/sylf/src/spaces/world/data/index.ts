// The one place the lobby's data is bound. Signed in, it reads who the person is and what they own. In a build with a backend and nobody signed in, the
// empty adapter binds, and sample data can appear only in a development build with no backend at all. Nothing here touches the game or its host.
import { useEffect, useMemo, useState } from "react";
import type { Resource } from "@sylf/backend";
import { useBackend, useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { DEV_TOOLS, useDevSurface } from "../../../shell/dev-surface";
import { toLiveResult } from "../../../shell/live-result";
import type { WorldDataAdapter, WorldResult } from "./contracts";
import { liveWorldViews, type WorldView } from "./live";
import { worldDataFor } from "./sample";

function useWorldData() {
  const { worldData } = useDevSurface();
  const configured = useBackend() !== null;
  return useMemo(() => worldDataFor(DEV_TOOLS && !configured, worldData), [configured, worldData]);
}

/** Loads once per adapter. `result` stays null while loading, and an unmounted screen ignores a late answer. */
export function useWorldResult<T>(view: WorldView, load: (adapter: WorldDataAdapter) => Promise<WorldResult<T>>): WorldResult<T> | null {
  const backend = useLiveBackend();
  const resource = useMemo(() => (backend ? (backend.resources.resource(liveWorldViews(backend)[view] as never) as unknown as Resource<T>) : null), [backend, view]);
  const state = useOptionalResource(resource);
  const adapter = useWorldData();
  const [result, setResult] = useState<{ adapter: WorldDataAdapter; value: WorldResult<T> } | null>(null);
  useEffect(() => {
    if (resource) return;
    let live = true;
    void load(adapter).then((value) => { if (live) setResult({ adapter, value }); });
    return () => { live = false; };
  }, [adapter, load, resource]);
  if (resource) return toLiveResult(state, resource);
  return result?.adapter === adapter ? result.value : null;
}
