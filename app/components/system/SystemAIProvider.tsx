"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "../AuthProvider";
import { PagePresence, resolvePresence } from "./page-presence";
import { QuotaInfo, AiPlannerModal } from "../AiPlannerModal";
import SystemFab from "./SystemFab";
import SystemOverlay from "./SystemOverlay";
import { fetchCachedJSON } from "@/lib/client-data-cache";

// ============================================================
// System AI Provider — the client-side intelligence layer.
//
// One shared state for both surfaces of The System:
//   • Quick AI  — the floating trigger + conversational overlay
//   • Workspace  — the dedicated /system experience (deep-linked)
//
// Both share the same backend: sessions, quota pools, agent
// routing and the Planner all run through the existing APIs.
// ============================================================

interface SystemAIContextValue {
  /** Page presence for the current route (null = no quick AI here). */
  presence: PagePresence | null;
  overlayOpen: boolean;
  openOverlay: () => void;
  closeOverlay: () => void;
  /** The chat session the overlay is continuing (null = fresh thread). */
  overlaySessionId: number | null;
  setOverlaySession: (id: number | null, session?: { id: number; title: string } | null) => void;
  chatQuota: QuotaInfo | null;
  plannerQuota: QuotaInfo | null;
  refreshQuotas: () => Promise<void>;
  /** Open the global Planner modal from the current context. */
  openPlanner: () => void;
  /** Navigate to the System workspace, optionally resuming a session. */
  openWorkspace: (sessionId?: number | null) => void;
}

const SystemAIContext = createContext<SystemAIContextValue | undefined>(undefined);

export function useSystemAI(): SystemAIContextValue {
  const ctx = useContext(SystemAIContext);
  if (!ctx) throw new Error("useSystemAI must be used within SystemAIProvider");
  return ctx;
}

export function SystemAIProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, token } = useAuth();

  const [presence, setPresence] = useState<PagePresence | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlaySessionId, setOverlaySessionId] = useState<number | null>(null);
  const [chatQuota, setChatQuota] = useState<QuotaInfo | null>(null);
  const [plannerQuota, setPlannerQuota] = useState<QuotaInfo | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);

  const refreshQuotas = useCallback(async () => {
    const t = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    if (!t) return;
    try {
      // Stale-while-revalidate: quota info mounts on every page; reuse a
      // fresh-enough snapshot instead of re-querying on each full load.
      const data = await fetchCachedJSON<{ chat?: QuotaInfo | null; planner?: QuotaInfo | null }>(
        "/api/ai-usage",
        { headers: { Authorization: `Bearer ${t}` } },
        { ttlMs: 30_000, staleMs: 120_000 }
      );
      if (data) {
        setChatQuota(data.chat || null);
        setPlannerQuota(data.planner || null);
      }
    } catch (e) {
      console.error("Failed to fetch AI usage:", e);
    }
  }, [token]);

  useEffect(() => {
    if (user) refreshQuotas();
  }, [user, refreshQuotas]);

  // Close the overlay when it no longer applies (logout, or navigating to
  // a page without a registered presence).
  const applyPresence = useCallback((next: PagePresence | null) => {
    setPresence(next);
    if (!next) setOverlayOpen(false);
  }, []);

  const openOverlay = useCallback(() => setOverlayOpen(true), []);
  const closeOverlay = useCallback(() => setOverlayOpen(false), []);

  const setOverlaySession = useCallback(
    (id: number | null, _session?: { id: number; title: string } | null) => {
      setOverlaySessionId(id);
    },
    []
  );

  const openPlanner = useCallback(() => {
    setPlannerOpen(true);
  }, []);

  const openWorkspace = useCallback(
    (sessionId?: number | null) => {
      setOverlayOpen(false);
      router.push(`/system${sessionId ? `?session=${sessionId}` : ""}`);
    },
    [router]
  );

  const value = useMemo<SystemAIContextValue>(
    () => ({
      presence,
      overlayOpen,
      openOverlay,
      closeOverlay,
      overlaySessionId,
      setOverlaySession,
      chatQuota,
      plannerQuota,
      refreshQuotas,
      openPlanner,
      openWorkspace,
    }),
    [
      presence,
      overlayOpen,
      openOverlay,
      closeOverlay,
      overlaySessionId,
      setOverlaySession,
      chatQuota,
      plannerQuota,
      refreshQuotas,
      openPlanner,
      openWorkspace,
    ]
  );

  return (
    <SystemAIContext.Provider value={value}>
      {children}

      {/* Tracks the route (including query strings like ?tab=quests) inside
          a Suspense boundary, as required for useSearchParams. */}
      <Suspense fallback={null}>
        <PresenceTracker enabled={!!user} onPresence={applyPresence} />
      </Suspense>

      {/* ── Lightweight global access point (only where it belongs) ── */}
      <AnimatePresence>
        {presence && !overlayOpen && (
          <SystemFab presence={presence} chatQuota={chatQuota} onClick={openOverlay} />
        )}
      </AnimatePresence>

      {/* ── Quick conversational overlay ── */}
      <SystemOverlay
        open={overlayOpen && !!presence}
        presence={presence}
        token={token}
        chatQuota={chatQuota}
        sessionId={overlaySessionId}
        onSessionChange={setOverlaySession}
        onQuotaRefresh={refreshQuotas}
        onOpenWorkspace={openWorkspace}
        onOpenPlanner={openPlanner}
        onClose={closeOverlay}
      />

      {/* ── Global Planner (launched from any context's quick actions) ── */}
      <AiPlannerModal
        isOpen={plannerOpen}
        onClose={() => setPlannerOpen(false)}
        quota={plannerQuota}
        onQuotaRefresh={refreshQuotas}
        sessionId={overlaySessionId}
        onPlanCreated={(plan: any) => {
          // Keep the overlay's "Open workspace" linked to the thread that
          // received the generated plan.
          if (plan?.sessionId) setOverlaySessionId(plan.sessionId);
          refreshQuotas();
        }}
      />
    </SystemAIContext.Provider>
  );
}

/**
 * Resolves page presence reactively — including query-string changes that
 * keep the pathname identical (e.g. /goals?tab=quests).
 */
function PresenceTracker({
  enabled,
  onPresence,
}: {
  enabled: boolean;
  onPresence: (p: PagePresence | null) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled || !pathname) {
      onPresence(null);
      return;
    }
    onPresence(resolvePresence(pathname, searchParams.toString()));
  }, [enabled, pathname, searchParams, onPresence]);

  return null;
}
