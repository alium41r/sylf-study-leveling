"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { calendarRequest } from "./useCalendarWorkspace";
import {
  defaultCalendarPreferences,
  preferencesSchema,
  type CalendarPreferences,
} from "@/lib/calendar/preferences";
import { getClientSessionEpoch } from "@/lib/client-data-cache";

export function useCalendarPreferences(owner: number) {
  const [settings, setSettings] = useState(defaultCalendarPreferences);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0),
    pending = useRef<Partial<CalendarPreferences>>({});
  const saving = useRef(false),
    live = useRef(false);
  const load = useCallback(async () => {
    const response = await calendarRequest("/api/calendar/preferences", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Calendar settings could not load.");
    const result = await response.json();
    if (!live.current) return;
    revision.current = result.revision;
    setSettings({
      ...preferencesSchema.parse(result.settings),
      ...pending.current,
    });
    setLoaded(true);
  }, []);
  useEffect(() => {
    live.current = true;
    void load().catch(() => {
      if (live.current)
        setError(
          "Calendar preferences could not load. Retry before changing settings."
        );
    });
    return () => {
      live.current = false;
    };
  }, [load, owner]);
  const flush = useCallback(async () => {
    if (saving.current || !live.current) return;
    const epoch = getClientSessionEpoch();
    saving.current = true;
    try {
      let conflicts = 0;
      while (
        Object.keys(pending.current).length &&
        live.current &&
        epoch === getClientSessionEpoch()
      ) {
        const patch = pending.current;
        pending.current = {};
        try {
          const response = await calendarRequest("/api/calendar/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: revision.current, patch }),
          });
          if (!live.current || epoch !== getClientSessionEpoch()) return;
          if (response.status === 409 && conflicts++ < 2) {
            pending.current = { ...patch, ...pending.current };
            await load();
            continue;
          }
          if (!response.ok)
            throw new Error(
              "Your display preferences are not synced yet. Retry when connected."
            );
          const result = await response.json();
          revision.current = result.revision;
          setSettings({ ...result.settings, ...pending.current });
          setError("");
        } catch (err) {
          pending.current = { ...patch, ...pending.current };
          throw err;
        }
      }
    } catch (err) {
      if (live.current)
        setError(
          err instanceof Error ? err.message : "Preferences could not sync."
        );
    } finally {
      saving.current = false;
    }
  }, [load]);
  const retry = useCallback(() => {
    void (loaded ? flush() : load().then(flush)).catch(() =>
      setError("Preferences could not sync. Try again.")
    );
  }, [loaded, flush, load]);
  useEffect(() => {
    const online = () => retry();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [retry]);
  const update = (patch: Partial<CalendarPreferences>) => {
    pending.current = { ...pending.current, ...patch };
    setSettings((value) => ({ ...value, ...patch }));
    if (loaded) void flush();
  };
  return { settings, loaded, error, update, retry };
}
