import { useMemo } from "react";
import type { UserStats } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";
import { liveHomeViews, type HomeView, type HomeViews } from "./live";

export function useHomeResult<K extends HomeView>(view: K) {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend ? backend.resources.resource<HomeViews[K]>(liveHomeViews(backend)[view]) : null, [backend, view]);
  return toLiveResult(useOptionalResource(resource), resource);
}

/**
 * The person as the server sees them, with how the read is going. It is the shell's own "user-stats" resource (the rail's and the dock's), asked for by the same
 * key, so the dashboard adds no request: it only also learns whether the read is still loading or has failed, which a bare value cannot say.
 */
export function useStatsResult() {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend ? backend.resources.resource<UserStats>({ key: "user-stats", load: (signal) => backend.reads.stats(signal), tags: ["progress", "traveller"], ttlMs: 30_000 }) : null, [backend]);
  return toLiveResult(useOptionalResource(resource), resource);
}
