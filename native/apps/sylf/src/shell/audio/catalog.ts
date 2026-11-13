import { useMemo } from "react";
import { useLiveBackend, useOptionalResource } from "../backend";
import { toLiveResult } from "../live-result";

export function useSoundCatalog() {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend?.resources.resource({
    key: "audio-catalog",
    ttlMs: 30 * 60_000,
    load: async (signal) => (await backend.reads.sounds(signal)).tracks.map((track) => ({
      id: `catalog:${track.id}`,
      title: track.title,
      detail: track.category.charAt(0) + track.category.slice(1).toLowerCase(),
      url: backend.client.assetUrl(track.audioUrl),
    })),
  }) ?? null, [backend]);
  return toLiveResult(useOptionalResource(resource), resource);
}
