// The person's own focus background, from the preference on their account, so it is the same one web shows. Null is Sylf's plain ground.
import { useMemo } from "react";
import type { FocusBackground } from "@sylf/backend";
import { useLiveBackend, useOptionalResource } from "../backend";

export function useBackgroundCatalog() {
  const backend = useLiveBackend();
  const resource = useMemo(() => backend?.resources.resource({ key: "focus-backgrounds", ttlMs: 30 * 60_000, load: (signal) => backend.reads.focus.backgrounds(signal) }) ?? null, [backend]);
  return useOptionalResource(resource)?.data ?? null;
}

export function useFocusBackground(): { chosen: FocusBackground | null; chosenId: number | null; choose: (id: number | null) => Promise<void> } {
  const backend = useLiveBackend();
  const catalog = useBackgroundCatalog();
  const resource = useMemo(() => backend?.resources.resource({ key: "focus-background-preference", tags: ["focus-background"], ttlMs: 5 * 60_000, load: (signal) => backend.reads.focus.backgroundPreference(signal) }) ?? null, [backend]);
  const preference = useOptionalResource(resource)?.data ?? null;
  const chosenId = preference?.source === "official" ? preference.backgroundId ?? null : null;
  const chosen = chosenId === null ? null : catalog?.categories.flatMap((category) => category.backgrounds).find((background) => background.id === chosenId) ?? null;
  return {
    chosen,
    chosenId,
    async choose(id) { if (!backend) return; await backend.reads.focus.chooseBackground(id); backend.resources.invalidate("focus-background"); },
  };
}
