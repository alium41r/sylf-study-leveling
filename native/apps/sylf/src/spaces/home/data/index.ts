// The one place Home's data is bound. Signed in, each destination reads a live resource. In a build with a backend and nobody signed in, the empty
// adapter binds, and sample data can appear only in a development build with no backend at all, so a real account never sits beside invented content.
import { useEffect, useMemo, useState } from "react";
import { useBackend, useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { DEV_TOOLS, useDevSurface } from "../../../shell/dev-surface";
import { toLiveResult } from "../../../shell/live-result";
import type { Resource } from "@sylf/backend";
import type { HomeDataAdapter, HomeResult } from "./contracts";
import { liveHomeViews, type HomeView } from "./live";
import { homeDataFor } from "./sample";

export function useHomeData() {
  const { homeData } = useDevSurface();
  const configured = useBackend() !== null;
  return useMemo(() => homeDataFor(DEV_TOOLS && !configured, homeData), [configured, homeData]);
}

/** Loads once per adapter. `result` stays null while loading, and an unmounted screen ignores a late answer. */
export function useHomeResult<T>(view: HomeView, load: (adapter: HomeDataAdapter) => Promise<HomeResult<T>>): HomeResult<T> | null {
  const backend = useLiveBackend();
  const resource = useMemo(() => (backend ? (backend.resources.resource(liveHomeViews(backend)[view] as never) as unknown as Resource<T>) : null), [backend, view]);
  const state = useOptionalResource(resource);
  const adapter = useHomeData();
  const [result, setResult] = useState<{ adapter: HomeDataAdapter; value: HomeResult<T> } | null>(null);
  useEffect(() => {
    if (resource) return;
    let live = true;
    void load(adapter).then((value) => { if (live) setResult({ adapter, value }); });
    return () => { live = false; };
  }, [adapter, load, resource]);
  if (resource) return toLiveResult(state, resource);
  return result?.adapter === adapter ? result.value : null;
}
