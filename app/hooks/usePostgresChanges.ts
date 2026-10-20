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
import { useEffect, useState } from "react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { attachRealtimeAuth, isRealtimeConfigured } from "@/lib/supabase-browser";

export interface PostgresChangeFilter {
  event: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  /** e.g. "conversationId=eq.42" */
  filter?: string;
}

export function usePostgresChanges(
  filters: PostgresChangeFilter[],
  onEvent: (payload: RealtimePostgresChangesPayload<any>) => void
): { enabled: boolean; connected: boolean } {
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isRealtimeConfigured() || filters.length === 0) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const sb = await attachRealtimeAuth();
      if (!sb || cancelled) return;
      setEnabled(true);

      channel = sb.channel("db-changes");
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
            if (!cancelled) onEvent(payload);
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
      try {
        channel?.unsubscribe();
      } catch {
        // Already torn down.
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  return { enabled, connected };
}
