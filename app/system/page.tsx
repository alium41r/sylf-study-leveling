"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../components/AuthProvider";
import { MessageSquare, CalendarDays, Lock } from "lucide-react";
import SessionSidebar, { SystemChatSession } from "./components/SessionSidebar";
import ConversationPanel from "./components/ConversationPanel";
import PlannerTab from "./components/PlannerTab";
import { QuotaInfo } from "../components/AiPlannerPanel";
import { fetchCachedJSON } from "@/lib/client-data-cache";

type WorkspaceTab = "conversation" | "planner";

/**
 * System Workspace — the dedicated home of The System.
 *
 * Two connected surfaces:
 *   • Conversation — the complete chat experience with session history
 *   • Planner      — the AI Study Planner as a first-class tab
 *
 * The quick overlay elsewhere can deep-link here (?session=<id>) to
 * continue any conversation it started.
 */
export default function SystemPage() {
  const { user } = useAuth();

  // Multi-session state
  const [sessions, setSessions] = useState<SystemChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const [tab, setTab] = useState<WorkspaceTab>("conversation");
  // Desktop defaults the history rail open; on mobile it must start CLOSED so
  // the overlay drawer doesn't cover the workspace on load.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  useEffect(() => {
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, []);

  // Daily quota tracking (server-backed)
  const [chatQuota, setChatQuota] = useState<QuotaInfo | null>(null);
  const [plannerQuota, setPlannerQuota] = useState<QuotaInfo | null>(null);

  // Developer Debug Mode (hidden by default; toggle by triple-clicking "THE SYSTEM" or ?dev=true)
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
  const fetchQuotas = useCallback(async () => {
    if (!user) return;
    try {
      // Stale-while-revalidate: reopening the workspace paints instantly.
      const data = await fetchCachedJSON<{ chat?: QuotaInfo; planner?: QuotaInfo }>(
        "/api/ai-usage",
        {},
        { ttlMs: 30_000, staleMs: 120_000 }
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
    fetchQuotas();
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
    <div className="flex w-full h-[100dvh] overflow-hidden">
      {/* ── Main Column ── */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* ── Workspace Header ── */}
        <header className="shrink-0 px-4 md:px-8 pt-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                <p
                  onClick={handleTitleClick}
                  className="text-xs tracking-widest text-accent-text-light font-bold cursor-pointer select-none hover:text-accent-primary transition-colors"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  title="The System AI"
                >
                  THE SYSTEM
                </p>

                {/* Live status chip */}
                <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                  </span>
                  Intelligence Layer
                </span>

                {/* Developer AI Mode Inspector & Selector (Only visible in Dev Mode) */}
                {isDevMode && (
                  <div className="flex items-center gap-2 animate-fadeIn">
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
                      <option value="groq">Force Groq (Qwen 3.6)</option>
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
              </div>

              <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                System Workspace
              </h1>
            </div>

            {/* ── Mobile-only History trigger — the session rail is hidden
                   below md; this opens it as an overlay drawer. ── */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg bg-bg-panel border border-border-subtle text-accent-text-light hover:border-accent-primary-mid transition-colors"
              title="Chat history"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              <span>History</span>
            </button>
          </div>

          {/* ── Workspace Tabs ── */}
          <nav className="flex items-center gap-1 mt-5 border-b border-border-subtle">
            <TabButton
              active={tab === "conversation"}
              onClick={() => setTab("conversation")}
              icon={<MessageSquare className="w-4 h-4" />}
              label="Conversation"
            />
            <TabButton
              active={tab === "planner"}
              onClick={() => setTab("planner")}
              icon={<CalendarDays className="w-4 h-4" />}
              label="Planner"
              badge={
                plannerQuota ? (
                  <span
                    className={`text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      plannerQuota.remaining === 0
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        : "bg-bg-abyss border-border-subtle text-text-muted"
                    }`}
                    title="Free weekly plan"
                  >
                    {plannerQuota.remaining === 0 ? (
                      <>
                        <Lock className="w-2.5 h-2.5" />
                        <span>0/1</span>
                      </>
                    ) : (
                      <span>
                        {plannerQuota.used}/{plannerQuota.limit}
                      </span>
                    )}
                  </span>
                ) : undefined
              }
            />
          </nav>
        </header>

        {/* ── Tab Content ── */}
        {tab === "conversation" ? (
          <ConversationPanel
            sessionId={activeSessionId}
            sessionTitle={activeSessionTitle}
            chatQuota={chatQuota}
            modelPref={modelPref}
            isDevMode={isDevMode}
            onSessionCreated={handleSessionCreated}
            onQuotaRefresh={fetchQuotas}
            onOpenPlanner={() => setTab("planner")}
          />
        ) : (
          <PlannerTab
            plannerQuota={plannerQuota}
            sessionId={activeSessionId}
            onQuotaRefresh={fetchQuotas}
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
        onCreateNew={createNewChat}
        onSelect={(id) => {
          autoSelectRef.current = false;
          setActiveSessionId(id);
          setTab("conversation");
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
                  <StatBox label="Requests (today)" value={String(usageData.today?.totalRequests ?? 0)} />
                  <StatBox
                    label="Tokens (today)"
                    value={String(
                      (usageData.today?.promptTokens ?? 0) +
                        (usageData.today?.completionTokens ?? 0)
                    )}
                  />
                  <StatBox label="Est. cost (today)" value={`$${usageData.today?.costUsd ?? 0}`} />
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
                              ${m.costUsd}
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
                    {usageData.last7Days?.totalRequests ?? 0} requests · $
                    {usageData.last7Days?.costUsd ?? 0}
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

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-xs font-bold uppercase tracking-widest transition-colors ${
        active
          ? "border-accent-primary text-accent-text-light"
          : "border-transparent text-text-muted hover:text-text-secondary"
      }`}
      style={{ fontFamily: "'Rajdhani', sans-serif" }}
    >
      {icon}
      <span>{label}</span>
      {badge}
    </button>
  );
}
