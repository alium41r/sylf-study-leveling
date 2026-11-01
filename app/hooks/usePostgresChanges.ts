"use client";

// ============================================================================
// usePostgresChanges — push-based updates instead of REST polling.
// ============================================================================
// Subscribes to Supabase Realtime postgres_changes events for the given
// table/event filters and invokes `onEvent` for every row change. Requires:
//   • NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY env
//   • SUPABASE_JWT_SECRET server-side (minted authenticated JWT)
//   • The tables added to the `supabase_realtime` publication and RLS SELECT
//     policies for `authenticated` — see scripts/db/supabase-realtime-setup.sql
//
// Until all of that is in place the hook simply stays disconnected and the
// pages keep their (slower) REST fallback polling.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { attachRealtimeAuth, getSupabaseBrowser, isRealtimeConfigured } from "@/lib/supabase-browser";

export interface PostgresChangeFilter {
  event: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  /** e.g. "conversationId=eq.42" */
  filter?: string;
}

let nextChannelInstanceId = 0;

export function usePostgresChanges(
  filters: PostgresChangeFilter[],
  onEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
): { enabled: boolean; connected: boolean } {
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (!isRealtimeConfigured() || filters.length === 0) {
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const channelName = `db-changes-${++nextChannelInstanceId}`;

    (async () => {
      const sb = await attachRealtimeAuth();
      if (!sb || cancelled) return;
      setEnabled(true);

      channel = sb.channel(channelName);
      for (const filter of filters) {
        channel = channel.on(
          "postgres_changes",
          {
            event: filter.event,
            schema: "public",
            table: filter.table,
            ...(filter.filter ? { filter: filter.filter } : {}),
          },
          (payload) => {
            if (!cancelled) onEventRef.current(payload);
          }
        );
      }

      channel.subscribe((status) => {
        if (cancelled) return;
        setConnected(status === "SUBSCRIBED");
      });
    })().catch((err) => {
      console.warn("[realtime] postgres_changes join failed — staying on polling:", err);
    });

    return () => {
      cancelled = true;
      if (channel) {
        try {
          const sb = getSupabaseBrowser();
          if (sb && typeof sb.removeChannel === "function") {
            void sb.removeChannel(channel);
          } else {
            void channel.unsubscribe();
          }
        } catch {
          // Already torn down.
        }
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return { enabled, connected };
}
