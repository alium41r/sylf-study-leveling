"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Paperclip, Sparkles, X } from "lucide-react";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import { QuotaInfo } from "../../components/AiPlannerPanel";
import { SystemChatSession } from "./SessionSidebar";
import { fetchCachedJSON } from "@/lib/client-data-cache";

interface SystemMsg {
  id: number;
  content: string;
  type: string;
  read: boolean;
  attachmentUrl?: string;
  createdAt: string;
  sessionId?: number;
  failed?: boolean;
  fileObj?: File;
  modelUsed?: string;
}

function getMessageModelBadge(msg: SystemMsg, currentModelPref?: string): string {
  if (msg.modelUsed) {
    if (msg.modelUsed === "DEEPSEEK") return "DeepSeek";
    if (msg.modelUsed === "GEMINI") return "Gemini";
    if (msg.modelUsed === "GROQ") return "Groq";
    return msg.modelUsed;
  }
  if (msg.content) {
    const match = msg.content.match(/<!--\s*model:\s*([^->\n]+?)\s*-->/i);
    if (match && match[1]) return match[1].trim();
  }
  if (msg.type?.includes("DEEPSEEK")) return "DeepSeek";
  if (msg.type?.includes("GEMINI")) return "Gemini";
  if (msg.type?.includes("GROQ")) return "Groq";
  if (currentModelPref === "deepseek") return "DeepSeek";
  if (currentModelPref === "groq") return "Groq";
  return "The System AI";
}

interface ConversationPanelProps {
  sessionId: number | null;
  sessionTitle: string;
  chatQuota: QuotaInfo | null;
  modelPref: "auto" | "deepseek" | "gemini" | "groq";
  isDevMode: boolean;
  onSessionCreated: (session: SystemChatSession) => void;
  onQuotaRefresh: () => void;
  onOpenPlanner: () => void;
}

export default function ConversationPanel({
  sessionId,
  sessionTitle,
  chatQuota,
  modelPref,
  isDevMode,
  onSessionCreated,
  onQuotaRefresh,
  onOpenPlanner,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<SystemMsg[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Fetch messages when the active session changes
  useEffect(() => {
    if (sessionId) {
      setIsLoadingMessages(true);
      // Stale-while-revalidate per session: switching between chats paints
      // the cached thread instantly and refreshes in the background.
      fetchCachedJSON<{ messages?: SystemMsg[] }>(
        `/api/system-messages?limit=100&sessionId=${sessionId}`,
        {},
        { ttlMs: 3_000, staleMs: 120_000, storageKey: `sys-msgs:${sessionId}` }
      )
        .then((data) => {
          const sorted = (data?.messages || []).sort(
            (a: SystemMsg, b: SystemMsg) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setMessages(sorted);
          setIsLoadingMessages(false);
          scrollToBottom();
        })
        .catch((e) => {
          console.error(e);
          setIsLoadingMessages(false);
        });
    } else {
      setMessages([]);
      setSelectedFile(null);
    }
  }, [sessionId]);

  const sendMessage = async (text: string, file: File | null) => {
    if (!text.trim() && !file) return;

    const optimisticUserMsg: SystemMsg = {
      id: Date.now(),
      content: text || "Sent an attachment.",
      type: "USER",
      read: true,
      attachmentUrl: file ? URL.createObjectURL(file) : undefined,
      fileObj: file || undefined,
      createdAt: new Date().toISOString(),
      sessionId: sessionId || undefined,
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);
    scrollToBottom();

    const formData = new FormData();
    if (text.trim()) formData.append("message", text);
    if (file) formData.append("file", file);
    formData.append("modelPreference", modelPref);
    if (sessionId) formData.append("sessionId", sessionId.toString());

    try {
      const res = await fetch("/api/system-messages/chat", {
        method: "POST",
        body: formData,
      });

      if (res.status === 429) {
        // Quota exhausted
        const data = await res.json();
        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === optimisticUserMsg.id ? { ...m, failed: true } : m));
          return [
            ...updated,
            {
              id: Date.now() + 1,
              content: `**Daily Limit Reached**\n\nYou've used all ${data.limit || 15} AI messages for today. Your quota resets at midnight.`,
              type: "INFO",
              read: true,
              createdAt: new Date().toISOString(),
              sessionId: sessionId || undefined,
            },
          ];
        });
        onQuotaRefresh();
        scrollToBottom();
      } else if (res.ok) {
        const data = await res.json();

        if (data.sessionId && !sessionId && data.session) {
          onSessionCreated(data.session);
        }

        console.log(
          `%c[Sylf AI Diagnostics]%c Engine: ${data.modelDisplayName || data.modelUsed} | Provider: ${data.modelUsed} | Session ID: ${data.sessionId}`,
          "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid #4338ca;",
          "color: #38bdf8; font-weight: bold; margin-left: 8px;"
        );

        // Empty-reply guard: if the payload somehow carries no reply text,
        // re-fetch the thread once so the bubble never renders blank.
        const replyIsEmpty =
          !data.aiMessage?.content || !String(data.aiMessage.content).trim();
        if (replyIsEmpty) {
          const targetId = data.sessionId || sessionId;
          if (targetId) {
            try {
              const refetch = await fetch(
                `/api/system-messages?limit=100&sessionId=${targetId}`
              );
              if (refetch.ok) {
                const refetched = await refetch.json();
                const sorted = (refetched.messages || []).sort(
                  (a: SystemMsg, b: SystemMsg) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                setMessages(sorted);
                scrollToBottom();
                onQuotaRefresh();
                return;
              }
            } catch (refetchErr) {
              console.error("Refetch after empty reply failed:", refetchErr);
            }
          }
        }

        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticUserMsg.id);
          return [...withoutOptimistic, data.userMessage, data.aiMessage];
        });
        scrollToBottom();
        onQuotaRefresh();
      } else {
        console.error("Chat error", await res.text());
        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === optimisticUserMsg.id ? { ...m, failed: true } : m));
          return [
            ...updated,
            {
              id: Date.now() + 1,
              content: "The system is temporarily unavailable. Please try again.",
              type: "INFO",
              read: true,
              createdAt: new Date().toISOString(),
              sessionId: sessionId || undefined,
            },
          ];
        });
        scrollToBottom();
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = prev.map((m) => (m.id === optimisticUserMsg.id ? { ...m, failed: true } : m));
        return [
          ...updated,
          {
            id: Date.now() + 1,
            content: "The system is temporarily unavailable. Please try again.",
            type: "INFO",
            read: true,
            createdAt: new Date().toISOString(),
            sessionId: sessionId || undefined,
          },
        ];
      });
      scrollToBottom();
    } finally {
      setIsSending(false);
    }
  };

  // Auto-unlock isSending after 45 seconds as a safety net
  useEffect(() => {
    if (!isSending) return;
    const timeout = setTimeout(() => {
      setIsSending(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 2,
          content: "The request timed out. Please try again.",
          type: "INFO",
          read: true,
          createdAt: new Date().toISOString(),
          sessionId: sessionId || undefined,
        },
      ]);
    }, 45000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = inputText;
    const currentFile = selectedFile;
    setInputText("");
    setSelectedFile(null);
    await sendMessage(currentInput, currentFile);
  };

  const quotaExhausted = chatQuota !== null && chatQuota.remaining === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 md:px-8 py-4">
      {/* Thread context row */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] uppercase tracking-widest font-['Rajdhani'] font-bold text-text-muted shrink-0">
            Thread
          </span>
          <span className="h-3 w-px bg-border-subtle" />
          <span className="text-xs text-text-secondary truncate font-['Rajdhani']">
            {sessionId ? sessionTitle || `Conversation #${sessionId}` : "New conversation"}
          </span>
        </div>
        {isDevMode && (
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0">
            DEV AI
          </span>
        )}
      </div>

      {/* Chat History */}
      <div className="flex-1 min-h-0 mb-4 system-card p-4 rounded-xl chat-scroll relative">
        {isLoadingMessages && (
          <div className="absolute inset-0 z-10 bg-bg-void/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        <div className="flex flex-col space-y-4 pr-2">
          {messages.length === 0 && !isLoadingMessages ? (
            <div className="text-center text-muted my-auto flex flex-col items-center gap-3 py-10">
              <span className="text-4xl">💬</span>
              <p className="text-sm">
                {sessionId ? "No messages yet." : "Start a new conversation with The System."}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isUser = msg.type === "USER";
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", damping: 25, stiffness: 350 }}
                    className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl p-4 ${
                        isUser
                          ? "bg-accent-dim border border-accent-mid shadow-sm"
                          : "border border-border-subtle bg-bg-abyss shadow-sm"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider opacity-90 ${
                              isUser ? "text-accent-text-light" : "text-accent-primary"
                            }`}
                          >
                            {isUser ? "You" : "The System"}
                          </span>
                          {!isUser && isDevMode && (() => {
                            const modelBadge = getMessageModelBadge(msg, modelPref);
                            if (!modelBadge) return null;
                            return (
                              <span className="text-[9px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs">
                                DEV: {modelBadge}
                              </span>
                            );
                          })()}
                        </div>
                        <span className="text-[10px] opacity-40">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {msg.attachmentUrl && (
                        <div className="mb-3">
                          {msg.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                            <img
                              src={msg.attachmentUrl}
                              alt="attachment"
                              className="max-w-full h-auto max-h-[200px] rounded-md object-contain border border-white/10"
                            />
                          ) : (
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent-primary underline text-sm break-all"
                            >
                              📎 Attached File
                            </a>
                          )}
                        </div>
                      )}

                      {isUser ? (
                        <div className="flex flex-col gap-2">
                          <MarkdownRenderer content={msg.content} />
                          {msg.failed && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-red-400 font-bold">⚠ Failed to send</span>
                              <button
                                onClick={() => {
                                  setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                                  sendMessage(msg.content, msg.fileObj || null);
                                }}
                                className="text-[10px] bg-red-900/30 hover:bg-red-800/50 text-red-300 px-2 py-1 rounded border border-red-500/30 transition-colors"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {/* Typing indicator */}
          <AnimatePresence>
            {isSending && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="flex justify-start"
              >
                <div className="border border-border-subtle bg-bg-abyss rounded-xl p-4 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent-text-light mr-2">
                    The System
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-accent-primary italic font-medium">Working on it</span>
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce shadow-sm" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce shadow-sm" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-bounce shadow-sm" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input */}
      <div className="shrink-0">
        {quotaExhausted && (
          <div className="mb-2 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs font-['Rajdhani'] text-rose-300 shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Daily prompt limit reached ({chatQuota?.limit || 15}/{chatQuota?.limit || 15} messages). Free tier
                chat quota refreshes at midnight.
              </span>
            </div>
            <span className="font-mono text-[11px] text-rose-400 font-bold hidden sm:inline-block">
              Resets:{" "}
              {chatQuota?.resetsAt
                ? new Date(chatQuota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "00:00"}
            </span>
          </div>
        )}

        {selectedFile && (
          <div className="mb-2 px-3 py-2 bg-blue-900/30 border border-blue-500/30 rounded-lg inline-flex items-center gap-2 text-sm text-blue-200">
            <Paperclip className="w-4 h-4" />
            <span>{selectedFile.name}</span>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="text-red-400 hover:text-red-300 ml-2 font-bold"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={quotaExhausted}
            className="p-3 system-card flex-shrink-0 text-xl hover:bg-bg-panel transition-colors text-accent-text-light rounded-xl border border-border-subtle disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              quotaExhausted
                ? "Daily chat quota reached (0 messages remaining)..."
                : "Ask anything..."
            }
            className="flex-1 min-w-0 bg-bg-void border border-border-subtle rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-primary transition-colors shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSending || quotaExhausted}
          />
          <button
            type="submit"
            disabled={isSending || (!inputText.trim() && !selectedFile) || quotaExhausted}
            className="btn-primary rounded-xl px-4 sm:px-6 font-bold disabled:opacity-50 disabled:cursor-not-allowed tracking-wider shrink-0 whitespace-nowrap flex items-center justify-center gap-1.5"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            {isSending ? (
              "..."
            ) : quotaExhausted ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>LOCKED</span>
              </>
            ) : (
              "SEND"
            )}
          </button>

          {/* ─── Daily AI Quota Ring ──────────────────────── */}
          {(() => {
            const MAX_REQUESTS = chatQuota?.limit || 15;
            const requestsUsed = chatQuota?.used || 0;
            const remaining = chatQuota?.remaining ?? MAX_REQUESTS;
            const percentage = (requestsUsed / MAX_REQUESTS) * 100;
            const isWarning = remaining <= 3 && remaining > 0;
            const isCritical = remaining === 0;

            return (
              <div
                className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center bg-bg-panel backdrop-blur-md border border-border-subtle rounded-xl group cursor-help ml-2"
              >
                <svg className="w-10 h-10 transform -rotate-90">
                  <circle
                    cx="20"
                    cy="20"
                    r="11"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="transparent"
                    className="text-text-primary/20"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="11"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 11}
                    strokeDashoffset={2 * Math.PI * 11 - (percentage / 100) * (2 * Math.PI * 11)}
                    className={`transition-all duration-500 ease-out ${
                      isCritical
                        ? "text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                        : isWarning
                        ? "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"
                        : "text-accent-primary drop-shadow-sm"
                    }`}
                  />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {isCritical ? (
                    <Lock className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-text-muted" />
                  )}
                </div>

                <div className="absolute bottom-14 right-0 w-44 p-2.5 bg-bg-shadow border border-border-subtle rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.8)] text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <p className="text-[10px] text-text-muted font-['Rajdhani'] font-bold tracking-widest mb-1">
                    DAILY CHAT QUOTA
                  </p>
                  <p
                    className={`text-xl font-bold font-['Rajdhani'] ${
                      isCritical ? "text-rose-400 animate-pulse" : "text-accent-primary"
                    }`}
                  >
                    {remaining} <span className="text-xs text-text-muted">/ {MAX_REQUESTS}</span>
                  </p>
                  <p className="text-[9px] text-text-muted mt-1 uppercase font-['Rajdhani']">
                    {isCritical ? "Limit reached • Resets at midnight" : "Messages remaining today"}
                  </p>
                  <div className="absolute -bottom-2 right-4 w-4 h-4 bg-bg-shadow border-b border-r border-border-subtle transform rotate-45"></div>
                </div>
              </div>
            );
          })()}
        </form>
      </div>
    </div>
  );
}
