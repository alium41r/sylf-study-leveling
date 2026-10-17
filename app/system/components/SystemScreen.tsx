"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../components/AuthProvider";
import { MessageSquare, CalendarDays, Lock, History, PanelRight } from "lucide-react";
import SessionSidebar, { SystemChatSession } from "./SessionSidebar";
import ConversationPanel from "./ConversationPanel";
import PlannerTab from "./PlannerTab";
import { QuotaInfo } from "../../components/AiPlannerPanel";
import { fetchCachedJSON, invalidateClientCache } from "@/lib/client-data-cache";
import { motion } from "framer-motion";
import { SylvieIcon } from "@/app/components/icons";
import { ImmersiveModeButton } from "@/app/components/ImmersiveModeButton";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import { consumePlannerHandoff, discardPlannerHandoff, PLANNER_HANDOFF_EVENT } from "@/lib/ai/sylvie/planner-handoff-client";

import styles from "../System.module.css";

type WorkspaceTab = "conversation" | "planner";

const SYSTEM_TABS: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "conversation",
    label: "CONVERSATION",
    icon: <MessageSquare className="w-4 h-4 shrink-0" />,
  },
  {
    id: "planner",
    label: "PLANNER",
    icon: <CalendarDays className="w-4 h-4 shrink-0" />,
  },
];

/**
 * System Workspace — the dedicated home of Sylvie.
 *
 * Portable extracted component: used by both the Next.js App Router
 * page (`app/system/page.tsx`) and the mobile Vite client
 * (`mobile/src/components/MobileRouteOutlet.tsx`).
 *
 * Two connected surfaces:
 *   • Conversation — the complete chat experience with session history
 *   • Planner      — the AI Study Planner as a first-class tab
 *
 * The quick overlay elsewhere can deep-link here (?session=<id>) to
 * continue any conversation it started.
 */
export function SystemScreen() {
  const { user } = useAuth();
  const handoffUserId = user?.id;

  // Multi-session state
  const [sessions, setSessions] = useState<SystemChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [newChatVersion, setNewChatVersion] = useState(0);

  const [tab, setTab] = useState<WorkspaceTab>("conversation");
  const [plannerHandoffState, setPlannerHandoff] = useState<{ userId: number | undefined; handoff: SylviePlannerHandoff | null }>(
    { userId: user?.id, handoff: null },
  );
  if (plannerHandoffState.userId !== user?.id) {
    setPlannerHandoff({ userId: user?.id, handoff: null });
  }
  const plannerHandoff = plannerHandoffState.userId === user?.id ? plannerHandoffState.handoff : null;

  useEffect(() => {
    if (!handoffUserId) {
      discardPlannerHandoff();
      return;
    }
    const receive = () => {
      const handoff = consumePlannerHandoff(handoffUserId);
      if (!handoff) return;
      setPlannerHandoff({ userId: handoffUserId, handoff });
      setTab("planner");
    };
    receive();
    window.addEventListener(PLANNER_HANDOFF_EVENT, receive);
    return () => window.removeEventListener(PLANNER_HANDOFF_EVENT, receive);
  }, [handoffUserId]);
  // The neutral state on initial load is closed on all viewports;
  // users can open and close the Archives drawer via the toolbar toggle.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Collapse sidebar/drawer on Escape when not actively focused in an input/textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSidebarOpen) {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === "input" || activeTag === "textarea") return;
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen]);

  // Daily quota tracking (server-backed)
  const [chatQuota, setChatQuota] = useState<QuotaInfo | null>(null);
  const [plannerQuota, setPlannerQuota] = useState<QuotaInfo | null>(null);

  // Developer Debug Mode (hidden by default; toggle by triple-clicking "SYLVIE" or ?dev=true)
  const [isDevMode, setIsDevMode] = useState(false);
  const [devClicks, setDevClicks] = useState(0);

  // Dev-mode AI cost telemetry panel
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageData, setUsageData] = useState<any>(null);

  const openUsage = async () => {
    setUsageOpen(true);
    setUsageData(null);
    if (!user) return;
    try {
      const res = await fetch("/api/ai-costs");
      if (res.ok) setUsageData(await res.json());
    } catch (e) {
      console.error("Failed to fetch AI costs:", e);
    }
  };

  // Model Preference (Auto multi-engine routing by default)
  const [modelPref, setModelPref] = useState<"auto" | "deepseek" | "gemini" | "groq">("auto");

  // Prevents fetchSessions from re-selecting the first session after the
  // user has explicitly chosen "New Chat" or a deep-linked session.
  const autoSelectRef = useRef(true);

  const activeSessionTitle =
    sessions.find((s) => s.id === activeSessionId)?.title || "";

  // ── Deep links from the quick overlay (?session=<id>, ?tab=planner) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get("session");
    const tabParam = params.get("tab");
    const devParam = params.get("dev");

    if (sessionParam && !isNaN(Number(sessionParam))) {
      setActiveSessionId(Number(sessionParam));
      autoSelectRef.current = false;
    }
    if (tabParam === "planner") setTab("planner");
    if (devParam === "true" || localStorage.getItem("sylf_dev_ai") === "true") {
      setIsDevMode(true);
    }
    if (sessionParam || tabParam || devParam) {
      window.history.replaceState({}, "", "/system");
    }
  }, []);

  const handleTitleClick = () => {
    setDevClicks((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setIsDevMode((curr) => {
          const newVal = !curr;
          localStorage.setItem("sylf_dev_ai", newVal ? "true" : "false");
          console.log(`[Sylf Dev Mode] Developer AI Diagnostics ${newVal ? "ENABLED" : "DISABLED"}`);
          return newVal;
        });
        return 0;
      }
      return next;
    });
  };

  // ── Quotas ────────────────────────────────────────────────────
  const fetchQuotas = useCallback(async (force = false) => {
    if (!user) return;
    try {
      if (force) {
        invalidateClientCache("/api/ai-usage");
      }
      // Stale-while-revalidate: reopening the workspace paints instantly,
      // while force-refresh bypasses cache after an action consumes quota.
      const data = await fetchCachedJSON<{ chat?: QuotaInfo; planner?: QuotaInfo }>(
        "/api/ai-usage",
        {},
        { ttlMs: force ? 0 : 30_000, staleMs: force ? 0 : 120_000, forceFresh: force }
      );
      if (data) {
        if (data.chat) setChatQuota(data.chat);
        if (data.planner) setPlannerQuota(data.planner);
      }
    } catch (e) {
      console.error("Failed to fetch quotas:", e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  // ── Sessions ──────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!user) return;
    try {
      // Stale-while-revalidate: reopening the workspace shows the last
      // session list instantly and refreshes in the background.
      const data = await fetchCachedJSON<{ sessions?: SystemChatSession[] }>(
        "/api/chats",
        {},
        { ttlMs: 10_000, staleMs: 120_000, storageKey: `chats:${user?.id ?? 0}` }
      );
      if (data) {
        const sessions = data.sessions || [];
        setSessions(sessions);
        setActiveSessionId((prev) => {
          // Never override an explicit user choice (deep link / new chat).
          if (!autoSelectRef.current) return prev;
          if (prev !== null && sessions.some((s: SystemChatSession) => s.id === prev)) return prev;
          return sessions.length > 0 ? sessions[0].id : prev;
        });
      }
    } catch (e) {
      console.error("Failed to fetch sessions:", e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createNewChat = () => {
    autoSelectRef.current = false;
    setNewChatVersion(version => version + 1);
    setActiveSessionId(null);
    setTab("conversation");
  };

  const renameSession = async (id: number, newTitle: string) => {
    try {
      await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });
      fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await fetch(`/api/chats/${id}`, {
        method: "DELETE",
      });
      if (activeSessionId === id) {
        autoSelectRef.current = true;
        setActiveSessionId(null);
      }
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  // ── Planner completion → thread created, quotas refreshed ──────
  const handlePlanComplete = (result: any) => {
    if (result?.quota) {
      setPlannerQuota(result.quota);
    } else {
      setPlannerQuota((prev) =>
        prev
          ? {
              ...prev,
              used: prev.used + 1,
              // Keep an unlimited account unlimited rather than faking exhaustion.
              remaining: prev.unlimited ? null : 0,
              allowed: prev.unlimited === true,
            }
          : null
      );
    }
    fetchQuotas(true);
    fetchSessions();
    if (result?.sessionId) {
      autoSelectRef.current = false;
      setActiveSessionId(result.sessionId);
    }
  };

  const handleSessionCreated = (session: SystemChatSession) => {
    autoSelectRef.current = false;
    setActiveSessionId(session.id);
    setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
  };

  return (
    <div className={styles.systemContainer}>
      <div className={styles.topGlow} aria-hidden="true" />

      {/* ── Main Column ── */}
      <div className={styles.mainColumn}>
        {/* ── Workspace Header ── */}
        <header className={styles.workspaceHeader}>
          {/* ─── Top Switcher Bar (Objectives-style segmented pill) ──────────────────────────── */}
          <div className="w-full flex justify-center items-center mb-2 sm:mb-2.5">
            <div className={styles.tabSwitcher}>
              {SYSTEM_TABS.map((tabItem) => {
                const isActive = tab === tabItem.id;
                return (
                  <button
                    key={tabItem.id}
                    type="button"
                    onClick={() => setTab(tabItem.id)}
                    className={`relative px-5 sm:px-7 py-1.5 sm:py-2 rounded-xl font-['Rajdhani'] font-bold text-xs sm:text-sm tracking-widest uppercase transition-colors duration-200 z-10 shrink-0 flex items-center gap-2 cursor-pointer ${
                      isActive ? "text-accent-text-light" : "hover:opacity-80"
                    }`}
                    style={{
                      color: isActive ? "var(--accent-strong)" : "var(--muted)",
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSystemWorkspaceTabPill"
                        className="absolute inset-0 rounded-xl"
                        style={{
                          background: "var(--accent-dim)",
                          border: "1px solid var(--accent-mid)",
                          boxShadow: "0 0 16px var(--accent-dim)",
                        }}
                        transition={{ type: "spring", stiffness: 450, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {tabItem.icon}
                      <span>{tabItem.label}</span>
                      {tabItem.id === "planner" && plannerQuota && (
                        <span
                          className={`${styles.tabBadge} ${
                            !plannerQuota.unlimited &&
                            (plannerQuota.remaining === 0 ||
                              plannerQuota.used >= (plannerQuota.limit ?? 0))
                              ? styles.tabBadgeLocked
                              : ""
                          }`}
                          title={plannerQuota.unlimited ? "Unlimited plans" : "Free weekly plan"}
                        >
                          {!plannerQuota.unlimited &&
                            (plannerQuota.remaining === 0 ||
                              plannerQuota.used >= (plannerQuota.limit ?? 0)) && (
                              <Lock className="w-2.5 h-2.5" />
                            )}
                          <span>
                            {plannerQuota.unlimited
                              ? "∞"
                              : `${plannerQuota.used}/${plannerQuota.limit}`}
                          </span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Action / Title Row ──────────────────────────── */}
          <div className={styles.headerTopRow}>
            <div>
              {/* Developer AI Mode Inspector & Selector (Only visible in Dev Mode) */}
              {isDevMode && (
                <div className={`${styles.eyebrowGroup} flex items-center gap-2 animate-fadeIn`}>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                    DEV AI
                  </span>
                  <select
                    value={modelPref}
                    onChange={(e) => setModelPref(e.target.value as any)}
                    className="bg-bg-panel text-xs text-text-primary border border-indigo-500/40 rounded px-2 py-0.5 outline-none focus:border-accent-light"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    <option value="auto">Auto (DeepSeek → Groq → Gemini)</option>
                    <option value="deepseek">Force DeepSeek</option>
                    <option value="gemini">Force Gemini</option>
                    <option value="groq">Force Groq (GPT OSS 120B)</option>
                  </select>
                  <button
                    onClick={openUsage}
                    className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors"
                    title="AI token & cost telemetry"
                  >
                    AI Costs
                  </button>
                </div>
              )}

              <h1 className={styles.title}>
                <SylvieIcon size={22} className="text-accent-primary shrink-0" />
                <span onClick={handleTitleClick} title="Sylvie AI">Sylvie</span>
              </h1>
            </div>

            {/* ── Unified Archives Trigger (Desktop & Mobile) ── */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className={`${styles.btnArchivesTrigger} ${isSidebarOpen ? styles.btnArchivesTriggerActive : ""}`}
                title={isSidebarOpen ? "Collapse Archives" : "Open Archives"}
                aria-label={isSidebarOpen ? "Collapse Archives" : "Open Archives"}
                aria-expanded={isSidebarOpen}
              >
                <History className="w-3.5 h-3.5 text-accent-text-light shrink-0" />
                <span>Archives</span>
                <span className={styles.triggerBadge}>{sessions.length}</span>
                <PanelRight
                  className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${
                    isSidebarOpen ? "text-accent-primary" : "text-text-muted"
                  }`}
                />
              </button>
              <ImmersiveModeButton variant="header-pill" className="hidden md:inline-flex" />
            </div>
          </div>
        </header>

        {/* ── Tab Content ── */}
        {tab === "conversation" ? (
          <ConversationPanel
            key={`${user?.id ?? "signed-out"}:${newChatVersion}`}
            sessionId={activeSessionId}
            sessionTitle={activeSessionTitle}
            chatQuota={chatQuota}
            modelPref={modelPref}
            isDevMode={isDevMode}
            onSessionCreated={handleSessionCreated}
            onQuotaRefresh={() => fetchQuotas(true)}
            onOpenPlanner={() => setTab("planner")}
          />
        ) : (
          <PlannerTab
            key={`${user?.id ?? "signed-out"}:${plannerHandoff?.id ?? "planner-tab"}`}
            handoff={plannerHandoff ?? undefined}
            plannerQuota={plannerQuota}
            sessionId={activeSessionId}
            onQuotaRefresh={() => fetchQuotas(true)}
            onComplete={handlePlanComplete}
            onViewConversation={() => setTab("conversation")}
          />
        )}
      </div>

      {/* ── Session History Rail (Right) ── */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onCreateNew={() => {
          createNewChat();
          if (typeof window !== "undefined" && window.innerWidth < 768) {
            setIsSidebarOpen(false);
          }
        }}
        onSelect={(id) => {
          autoSelectRef.current = false;
          setActiveSessionId(id);
          setTab("conversation");
          if (typeof window !== "undefined" && window.innerWidth < 768) {
            setIsSidebarOpen(false);
          }
        }}
        onRename={renameSession}
        onDelete={deleteSession}
      />

      {/* ── Dev-Mode AI Cost Telemetry ── */}
      {usageOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
          onClick={() => setUsageOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-panel/95 backdrop-blur-xl p-5 shadow-2xl max-h-[85dvh] overflow-y-auto chat-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3
                className="text-sm tracking-widest text-accent-text-light font-bold uppercase"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                AI Cost Telemetry
              </h3>
              <button
                onClick={() => setUsageOpen(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-abyss transition-colors"
                title="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] text-text-muted mb-4 font-['Rajdhani']">
              Estimated costs from the rate table · deterministic replies skip the LLM and aren't
              logged
            </p>

            {!usageData ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <StatBox label="Dispatches (today)" value={String(usageData.today?.totalRequests ?? 0)} />
                  <StatBox
                    label="Tokens (today)"
                    value={String(
                      (usageData.today?.promptTokens ?? 0) +
                        (usageData.today?.completionTokens ?? 0)
                    )}
                  />
                  <StatBox label="Est. cost (today)" value={usageData.today?.costUsd == null ? "Unknown" : `$${usageData.today.costUsd}`} />
                </div>

                {/* Cache-aware note: stable prompt prefixes are billed at ~10% */}
                {(() => {
                  const hit = usageData.today?.cacheHitTokens ?? 0;
                  const input = usageData.today?.promptTokens ?? 0;
                  if (hit > 0 && input > 0) {
                    const pct = Math.round((hit / input) * 100);
                    return (
                      <p className="text-[10px] text-emerald-500/90 font-mono">
                        Input cache hit: {hit.toLocaleString()} / {input.toLocaleString()} tokens
                        ({pct}%) — billed at ~10% of fresh input price
                      </p>
                    );
                  }
                  return null;
                })()}

                {usageData.today?.byModel?.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-['Rajdhani'] font-bold text-text-muted mb-1.5">
                      By model (today)
                    </p>
                    <table className="w-full text-[11px] font-mono">
                      <thead>
                        <tr className="text-text-muted text-left">
                          <th className="font-medium pb-1">Model</th>
                          <th className="font-medium pb-1 text-right">Req</th>
                          <th className="font-medium pb-1 text-right">Tokens</th>
                          <th className="font-medium pb-1 text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageData.today.byModel.map((m: any) => (
                          <tr key={m.model} className="border-t border-border-subtle text-text-secondary">
                            <td className="py-1 pr-2 max-w-[160px] truncate">{m.model}</td>
                            <td className="py-1 text-right">{m.requests}</td>
                            <td className="py-1 text-right">
                              {m.promptTokens + m.completionTokens}
                            </td>
                            <td className="py-1 text-right text-accent-text-light">
                              {m.costUsd == null ? "Unknown" : `$${m.costUsd}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-['Rajdhani'] text-text-muted border-t border-border-subtle pt-3">
                  <span>Last 7 days</span>
                  <span>
                    {usageData.last7Days?.totalRequests ?? 0} dispatches · {usageData.last7Days?.costUsd == null ? "Unknown cost" : `$${usageData.last7Days.costUsd}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-abyss/70 border border-border-subtle p-3">
      <p className="text-[9px] uppercase tracking-widest font-['Rajdhani'] font-bold text-text-muted">
        {label}
      </p>
      <p className="text-base font-bold font-mono text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

export default SystemScreen;
