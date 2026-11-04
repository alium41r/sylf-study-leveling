// Applies the one-time seed (appearance-seed.ts). It renders nothing. The marker is per account and survives sign-out, so signing back in never repeats it
// and a choice made on this device is never overwritten.
import { useEffect } from "react";
import { useAppearanceStore } from "@sylf/design-system";
import { currentPreferences } from "./backend";
import { useStats } from "./live";
import { seedMarker, seedPatch } from "./account/appearance-seed";

export function AppearanceSeed() {
  const stats = useStats();
  const store = useAppearanceStore();
  useEffect(() => {
    const preferences = currentPreferences();
    if (!stats?.id || !preferences || preferences.getItem(seedMarker(stats.id))) return;
    const patch = seedPatch(stats, store.getSnapshot().preference);
    if (patch) store.tweak(patch);
    preferences.setItem(seedMarker(stats.id), "1");
  }, [stats, store]);
  return null;
}
