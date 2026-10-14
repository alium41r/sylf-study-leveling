"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_SPRING, MOTION_EASE } from "@/lib/motion";
import {
  X,
  Plus,
  MoreHorizontal,
  CalendarDays,
  Lock,
  ArrowUp,
  StopCircle,
  Copy,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { SylvieIcon } from "../icons";
import MarkdownRenderer from "../MarkdownRenderer";
import type { PagePresence } from "./page-presence";
import type { QuotaInfo } from "../AiPlannerModal";
import { lockPageScroll } from "@/lib/scroll-lock";
import styles from "./SystemOverlay.module.css";

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
  const [actionsOpen, setActionsOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
      if (!prev.some((message) => message.role === "user")) {
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
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    const frame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      unlock();
      if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>('[data-system-companion="true"]')?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (actionsOpen) setActionsOpen(false);
        else onClose();
      }
      if (e.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
        );
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, actionsOpen]);

  useEffect(() => {
    if (!actionsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [actionsOpen]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [input, open]);

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
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError") {
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
            content: "⚠️ Sylvie is temporarily unavailable. Please try again.",
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={styles.scrim}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Sylvie quick assistant — ${presence.label} context`}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.14, ease: MOTION_EASE.exit } }}
            transition={MOTION_SPRING.modal}
            className={styles.dialog}
          >
            <header className={styles.header}>
              <div className={styles.identity}>
                <SylvieIcon size={28} className={styles.brandIcon} />
                <div className={styles.heading}>
                  <span className={styles.title}>Sylvie</span>
                  <span className={styles.context}>{presence.label}</span>
                </div>
              </div>
              <div className={styles.headerActions}>
                <div ref={actionsRef} className={styles.actionsAnchor}>
                  <button
                    type="button"
                    onClick={() => setActionsOpen(!actionsOpen)}
                    aria-label="Conversation options"
                    aria-expanded={actionsOpen}
                    aria-controls="system-conversation-options"
                    title="Conversation options"
                    className={styles.iconButton}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                  {actionsOpen && (
                    <div id="system-conversation-options" className={styles.actionsMenu}>
                      <button type="button" disabled={sending} onClick={() => { handleNewChat(); setActionsOpen(false); }}>
                        <Plus size={16} aria-hidden="true" /> New conversation
                      </button>
                      {presence.plannerHint && (
                        <button type="button" onClick={() => { setActionsOpen(false); onOpenPlanner(); }}>
                          <CalendarDays size={16} aria-hidden="true" /> Create a study plan
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setActionsOpen(false); onOpenWorkspace(sessionId); }}
                  aria-label="Open in Sylvie workspace"
                  title="Open in Sylvie workspace"
                  className={styles.iconButton}
                >
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
                <button type="button" onClick={onClose} aria-label="Close conversation" title="Close (Esc)" className={styles.iconButton}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className={`${styles.messages} chat-scroll`} data-conversation={hasUserMessage} aria-label="Conversation" aria-busy={sending}>
              {messages.map((message) =>
                message.contextNotice ? (
                  <div key={message.id} className={styles.contextNotice}>
                    <MarkdownRenderer content={message.content} compact />
                  </div>
                ) : message.role === "user" ? (
                  <div key={message.id} className={styles.userMessage}>
                    <p>{message.content}</p>
                  </div>
                ) : (
                  <div key={message.id} className={styles.assistantMessage} data-failed={message.failed}>
                    <MarkdownRenderer content={message.content} className={styles.markdown} />
                    {message.content && !sending && !message.failed && !message.id.startsWith("greet-") && (
                      <button
                        type="button"
                        onClick={() => handleCopy(message.id, message.content)}
                        aria-label={copiedId === message.id ? "Reply copied" : "Copy reply"}
                        title="Copy reply"
                        className={styles.copyButton}
                      >
                        {copiedId === message.id ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                      </button>
                    )}
                  </div>
                )
              )}
              {sending && (
                <div className={styles.thinking} role="status">
                  <span>Thinking</span>
                  <span className={styles.thinkingDots} aria-hidden="true"><i /><i /><i /></span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {showSuggestions && !quotaExhausted && (
              <div className={styles.suggestions}>
                {presence.suggestions.map(suggestion => (
                  <button key={suggestion} type="button" onClick={() => handleSend(suggestion)}>
                    {suggestion}<ArrowUpRight size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
            {quotaExhausted && (
              <p className={styles.quotaNotice} role="status">
                <Lock size={14} aria-hidden="true" />
                <span>Daily limit reached. Resets at midnight{chatQuota?.resetsAt ? ` (${new Date(chatQuota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}.</span>
              </p>
            )}
            <div className={styles.composerArea}>
              <form onSubmit={event => { event.preventDefault(); handleSend(); }} className={styles.composer}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  disabled={quotaExhausted}
                  aria-label="Message Sylvie"
                  placeholder={quotaExhausted ? "Daily limit reached" : "Ask anything…"}
                />
                {sending ? (
                  <button type="button" onClick={stopGeneration} aria-label="Stop generation" title="Stop generation" className={styles.sendButton}>
                    <StopCircle size={18} aria-hidden="true" />
                  </button>
                ) : (
                  <button type="submit" disabled={!input.trim() || quotaExhausted} aria-label="Send message" title="Send (Enter)" className={styles.sendButton}>
                    {quotaExhausted ? <Lock size={15} aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}
                  </button>
                )}
              </form>
              <div className={styles.footer}>
                <span>Shift + Enter for a new line</span>
                {chatQuota && (
                  <span title={chatQuota.unlimited ? "Unlimited AI messages" : "Daily AI messages remaining"}>
                    {chatQuota.unlimited ? "Unlimited" : `${chatQuota.remaining ?? "–"} messages left`}
                  </span>
                )}
              </div>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
