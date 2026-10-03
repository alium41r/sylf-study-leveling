"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_SPRING, MOTION_EASE } from "@/lib/motion";
import {
  X,
  Plus,
  Expand,
  CalendarDays,
  Lock,
  Send,
  StopCircle,
  Copy,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { SystemApertureIcon } from "@/app/components/icons";
import MarkdownRenderer from "../MarkdownRenderer";
import { PagePresence } from "./page-presence";
import { QuotaInfo } from "../AiPlannerModal";
import { PresenceIconBadge } from "./PresenceIconBadge";

interface OverlayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  contextNotice?: boolean;
}

interface SystemOverlayProps {
  open: boolean;
  presence: PagePresence | null;
  chatQuota: QuotaInfo | null;
  sessionId: number | null;
  onSessionChange: (id: number | null, session?: { id: number; title: string } | null) => void;
  onQuotaRefresh: () => void;
  onOpenWorkspace: (sessionId?: number | null) => void;
  onOpenPlanner: () => void;
  onClose: () => void;
}

/**
 * Quick AI — a conversational overlay that floats above the current page.
 * It shares the same chat sessions, quota pool and backend intelligence
 * as the dedicated /system workspace, so a quick question can always be
 * continued there ("Open in workspace").
 */
export default function SystemOverlay({
  open,
  presence,
  chatQuota,
  sessionId,
  onSessionChange,
  onQuotaRefresh,
  onOpenWorkspace,
  onOpenPlanner,
  onClose,
}: SystemOverlayProps) {
  const [messages, setMessages] = useState<OverlayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const contextIdRef = useRef<string | null>(null);
  const revealingRef = useRef<{ id: string; full: string } | null>(null);

  // An unlimited account is never locked out (`remaining` is null there).
  const quotaExhausted =
    chatQuota !== null && !chatQuota.unlimited && chatQuota.remaining === 0;

  // ── Context seeding ─────────────────────────────────────────
  // First visit to a context seeds its greeting. Navigating into a new
  // context mid-conversation appends a small notice instead of wiping
  // the thread, so a quick question survives page hops.
  useEffect(() => {
    if (!presence) {
      contextIdRef.current = null;
      setMessages([]);
      return;
    }
    if (contextIdRef.current === presence.id) return;
    contextIdRef.current = presence.id;

    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ id: `greet-${presence.id}`, role: "assistant", content: presence.greeting }];
      }
      const last = prev[prev.length - 1];
      if (last?.contextNotice && last.id.startsWith(`ctx-${presence.id}`)) return prev;
      return [
        ...prev,
        {
          id: `ctx-${presence.id}-${Date.now()}`,
          role: "assistant",
          content: `_Now viewing **${presence.label}** — ${presence.eyebrow.toLowerCase()}._`,
          contextNotice: true,
        },
      ];
    });
  }, [presence]);

  // ── Close on Escape ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Scroll to bottom on new messages (container only, not the page) ──
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 60);
      return () => clearTimeout(t);
    }
  }, [messages, sending, open]);

  // ── Cleanup reveal timer / in-flight request ────────────────
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    // If a reply was mid-reveal, finish it instead of leaving it partial.
    if (revealingRef.current) {
      const { id, full } = revealingRef.current;
      revealingRef.current = null;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: full } : m)));
    }
    setSending(false);
  }, []);

  /** Progressive reveal so long replies render smoothly. */
  const revealText = useCallback((messageId: string, fullText: string) => {
    revealingRef.current = { id: messageId, full: fullText };
    let length = 0;
    const chunk = Math.max(2, Math.floor(fullText.length / 40));
    const step = () => {
      length = Math.min(fullText.length, length + chunk);
      const partial = fullText.slice(0, length);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: partial } : m)));
      if (length < fullText.length) {
        revealTimerRef.current = setTimeout(step, 18);
      } else {
        revealTimerRef.current = null;
        revealingRef.current = null;
        setSending(false);
      }
    };
    step();
  }, []);

  const handleSend = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending || quotaExhausted) return;

    const userMsg: OverlayMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/system-messages/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId ?? undefined,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            id: `quota-${Date.now()}`,
            role: "assistant",
            content: `⚠️ ${data.message || "Daily AI limit reached. Your quota resets at midnight."}`,
            failed: true,
          },
        ]);
        onQuotaRefresh();
        setSending(false);
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.sessionId) {
        onSessionChange(data.sessionId, data.session || null);
      }

      const reply =
        data?.reply ||
        data?.aiMessage?.content ||
        data?.message ||
        "I couldn't process that. Could you try again?";

      const aiMsgId = `a-${Date.now()}`;
      setMessages((prev) => [...prev, { id: aiMsgId, role: "assistant", content: "" }]);
      // revealText keeps `sending` true until the reply finishes rendering,
      // so the Stop control stays available during the reveal.
      revealText(aiMsgId, reply);
      onQuotaRefresh();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          { id: `stop-${Date.now()}`, role: "assistant", content: "_Generation stopped._", contextNotice: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "⚠️ The System is temporarily unavailable. Please try again.",
            failed: true,
          },
        ]);
      }
      setSending(false);
    }
  };

  const handleNewChat = () => {
    onSessionChange(null, null);
    if (presence) {
      contextIdRef.current = presence.id;
      setMessages([{ id: `greet-${presence.id}-${Date.now()}`, role: "assistant", content: presence.greeting }]);
    } else {
      setMessages([]);
    }
    setInput("");
  };

  const handleCopy = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  const hasUserMessage = messages.some((m) => m.role === "user");
  const showSuggestions = !!presence && !hasUserMessage && !sending && messages.length <= 1;

  return (
    <AnimatePresence>
      {open && presence && (
        <>
          {/* Transparent scrim keeps the page visible; clicking it dismisses */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[54] bg-black/20 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.section
            role="dialog"
            aria-label={`The System quick assistant — ${presence.label} context`}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: 12,
              scale: 0.97,
              transition: { duration: 0.14, ease: MOTION_EASE.exit },
            }}
            transition={MOTION_SPRING.modal}
            className="fixed z-[55] flex flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-bg-abyss/90 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_35px_rgba(124,58,237,0.12)]"
            style={{
              transformOrigin: "bottom right",
              right: "max(1rem, env(safe-area-inset-right))",
              bottom: "max(1rem, env(safe-area-inset-bottom))",
              width: "min(24.5rem, calc(100vw - 2rem))",
              height: "min(36.5rem, calc(100dvh - 5.5rem))",
            }}
          >
            {/* Signature system-window top line */}
            <div className="h-[2px] shrink-0 bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent" />

            {/* ── Header ── */}
            <header className="shrink-0 px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2.5 bg-bg-shadow/30">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center text-accent-text-light shrink-0">
                  <SystemApertureIcon className="w-3.5 h-3.5" />
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-xs tracking-[0.14em] text-text-primary font-bold truncate"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    THE SYSTEM
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-mono text-text-muted px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] truncate">
                    <PresenceIconBadge icon={presence.icon} className="w-2.5 h-2.5 text-accent-text-light/70 shrink-0" />
                    <span className="truncate">{presence.label}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Quota pill */}
                <span
                  title={
                    chatQuota?.unlimited
                      ? "Unlimited AI messages"
                      : quotaExhausted
                        ? "Daily AI quota reached — resets at midnight"
                        : "Daily AI messages remaining"
                  }
                  className={`flex items-center gap-1 text-[10px] font-mono rounded-full px-2 py-0.5 border ${
                    quotaExhausted
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : chatQuota && !chatQuota.unlimited && (chatQuota.remaining ?? 0) <= 3
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                      : "bg-white/[0.03] border-white/[0.06] text-text-muted"
                  }`}
                >
                  {quotaExhausted ? (
                    <>
                      <Lock className="w-2.5 h-2.5 text-rose-400" />
                      <span>Limit</span>
                    </>
                  ) : chatQuota?.unlimited ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                      <span aria-label="unlimited">∞</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                      <span>{chatQuota?.remaining ?? "–"} left</span>
                    </>
                  )}
                </span>

                {presence.plannerHint && (
                  <button
                    type="button"
                    onClick={onOpenPlanner}
                    title={presence.plannerHint}
                    className="p-1.5 rounded-lg text-text-muted hover:text-accent-text-light hover:bg-white/[0.05] transition-colors"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenWorkspace(sessionId)}
                  title="Open in System workspace"
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-text-light hover:bg-white/[0.05] transition-colors"
                >
                  <Expand className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleNewChat}
                  title="New conversation"
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent-text-light hover:bg-white/[0.05] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  title="Close (Esc)"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/[0.05] transition-colors ml-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            {/* ── Messages ── */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto chat-scroll px-3.5 py-3 space-y-3">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 bg-accent-primary/15 border border-accent-primary/30 text-text-primary text-[12.5px] leading-relaxed shadow-sm">
                      <MarkdownRenderer content={m.content} compact />
                      {m.failed && (
                        <p className="text-[9px] text-rose-400 font-bold mt-1 uppercase tracking-wider font-['Rajdhani']">
                          ⚠ Failed to send
                        </p>
                      )}
                    </div>
                  </div>
                ) : m.contextNotice ? (
                  <div key={m.id} className="flex justify-center my-1">
                    <span className="text-[10px] text-text-muted px-2.5 py-0.5 rounded-full bg-white/[0.02] border border-white/[0.05]">
                      <MarkdownRenderer content={m.content} compact />
                    </span>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start gap-2.5 group/msg">
                    <span className="w-6 h-6 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-text-light shrink-0 mt-0.5">
                      <SystemApertureIcon className="w-3 h-3" />
                    </span>
                    <div className="max-w-[86%] rounded-2xl rounded-tl-sm px-3.5 py-2.5 bg-bg-panel/60 border border-white/[0.06] text-text-primary text-[12.5px] leading-relaxed shadow-sm relative backdrop-blur-sm">
                      <MarkdownRenderer content={m.content} compact />
                      {m.content && !sending && !m.failed && (
                        <button
                          type="button"
                          onClick={() => handleCopy(m.id, m.content)}
                          title="Copy reply"
                          className="absolute -top-2 -right-2 p-1 rounded-md bg-bg-abyss border border-border-subtle text-text-muted hover:text-accent-text-light opacity-0 group-hover/msg:opacity-100 transition-opacity shadow-sm"
                        >
                          {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div className="flex justify-start gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center text-accent-text-light shrink-0">
                    <SystemApertureIcon className="w-3 h-3" />
                  </span>
                  <div className="rounded-2xl rounded-tl-sm px-3 py-2 bg-bg-panel/60 border border-white/[0.06] flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-text-light font-['Rajdhani']">
                      Thinking
                    </span>
                    <span className="flex gap-1">
                      <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce" />
                      <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 bg-accent-primary rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* ── Suggestions (Clean, non-intrusive chips) ── */}
            {showSuggestions && (
              <div className="shrink-0 px-3.5 pb-2.5 pt-1 flex flex-wrap gap-1.5">
                {presence.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-accent-text-light hover:bg-accent-primary/10 hover:border-accent-primary/35 active:scale-95 transition-all text-left flex items-center gap-1.5 group"
                  >
                    <span className="w-1 h-1 rounded-full bg-accent-primary/50 group-hover:bg-accent-primary transition-colors" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Quota banner ── */}
            {quotaExhausted && (
              <div className="shrink-0 mx-3.5 mb-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[10.5px] text-rose-300 flex items-center gap-2 font-['Rajdhani']">
                <Lock className="w-3 h-3 shrink-0" />
                <span>
                  Daily prompt limit reached. Resets at midnight
                  {chatQuota?.resetsAt ? ` (${new Date(chatQuota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}.
                </span>
              </div>
            )}

            {/* ── Composer (Integrated, sleek input bar) ── */}
            <div className="shrink-0 p-3 border-t border-white/[0.06] bg-bg-shadow/20">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="relative flex items-center gap-1.5 rounded-xl bg-bg-void/90 border border-white/[0.08] focus-within:border-accent-primary/50 focus-within:ring-1 focus-within:ring-accent-primary/20 px-3 py-1.5 transition-all shadow-inner"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  disabled={quotaExhausted}
                  placeholder={
                    quotaExhausted
                      ? "Daily quota reached — resets at midnight"
                      : `Ask The System…`
                  }
                  className="flex-1 resize-none bg-transparent border-0 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-0 max-h-24 min-h-[32px] py-1 leading-relaxed disabled:opacity-40 disabled:cursor-not-allowed"
                />
                {sending ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    title="Stop generation"
                    className="w-7 h-7 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || quotaExhausted}
                    title="Send (Enter)"
                    className="w-7 h-7 rounded-lg bg-accent-primary hover:bg-accent-primary-light text-white disabled:opacity-20 disabled:hover:bg-accent-primary flex items-center justify-center shrink-0 transition-all shadow-sm active:scale-95"
                  >
                    {quotaExhausted ? <Lock className="w-3 h-3" /> : <Send className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                )}
              </form>

              {/* Connection to the workspace */}
              <div className="flex items-center justify-between mt-2 px-1 text-[9.5px] font-['Rajdhani']">
                <span className="text-text-muted/70 uppercase tracking-wider">
                  The System • {presence.label}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace(sessionId)}
                  className="flex items-center gap-1 font-bold uppercase tracking-wider text-accent-text-light/80 hover:text-accent-primary-light transition-colors"
                >
                  <span>Open Workspace</span>
                  <ArrowUpRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
