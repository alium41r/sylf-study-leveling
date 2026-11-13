import { useMemo } from "react";
import { useLiveBackend, useOptionalResource } from "../../../shell/backend";
import { toLiveResult } from "../../../shell/live-result";
import { liveWorldViews, type WorldView, type WorldViews } from "./live";

export function useWorldResult<K extends WorldView>(view: K) {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend ? backend.resources.resource<WorldViews[K]>(liveWorldViews(backend)[view]) : null, [backend, view]);
  return toLiveResult(useOptionalResource(resource), resource);
}
