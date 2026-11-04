// A level-up is one quiet line, once. The number is the server's, read after a session settles, and nothing here computes what it paid. It waits for
// the Focus environment to close rather than interrupt it, and a level seen at start-up is the baseline, never an announcement.
import { useEffect, useRef } from "react";
import { useNotice } from "@sylf/design-system";
import { useStats } from "./live";
import { useFocusEnvironmentOpen } from "./focus/environment";

export function LevelNotice() {
  const stats = useStats();
  const focusing = useFocusEnvironmentOpen();
  const notice = useNotice();
  const seen = useRef<{ who: number | undefined; level: number } | null>(null);
  useEffect(() => {
    if (!stats) return;
    if (!seen.current || seen.current.who !== stats.id) { seen.current = { who: stats.id, level: stats.level }; return; }
    if (stats.level > seen.current.level && !focusing) { seen.current.level = stats.level; notice(`You reached level ${stats.level}.`); }
    else if (stats.level < seen.current.level) seen.current.level = stats.level;
  }, [stats, focusing, notice]);
  return null;
}
