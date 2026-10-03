"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  Paperclip,
  X,
  Send,
  Copy,
  Check,
  RotateCcw,
  Zap,
  Swords,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { ObjectiveTargetIcon } from "@/app/components/icons";
import MarkdownRenderer from "../../components/MarkdownRenderer";
import { QuotaInfo } from "../../components/AiPlannerPanel";
import { SystemChatSession } from "./SessionSidebar";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import styles from "../System.module.css";

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

function SystemChatVectorSymbol({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sysChatBubbleGrad" x1="12" y1="10" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-primary, #7c3aed)" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="sysChatFillGrad" x1="16" y1="12" x2="48" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--accent-primary, #7c3aed)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="sysCoreSparkGrad" x1="26" y1="18" x2="38" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="var(--accent-primary, #7c3aed)" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id="sysBackGlow" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="var(--accent-primary, #7c3aed)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent-primary, #7c3aed)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient soft glow backdrop */}
      <circle cx="32" cy="26" r="23" fill="url(#sysBackGlow)" className="opacity-90" />

      {/* Main speech bubble silhouette */}
      <path
        d="M 21 12 H 43 A 8 8 0 0 1 51 20 V 32 A 8 8 0 0 1 43 40 H 32 L 22.5 47.5 A 1.6 1.6 0 0 1 20 46.2 L 21.8 40 H 21 A 8 8 0 0 1 13 32 V 20 A 8 8 0 0 1 21 12 Z"
        fill="url(#sysChatFillGrad)"
        stroke="url(#sysChatBubbleGrad)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Subtle transmission axis */}
      <line
        x1="20.5"
        y1="26"
        x2="43.5"
        y2="26"
        stroke="var(--accent-primary, #7c3aed)"
        strokeOpacity="0.3"
        strokeDasharray="2 3"
        strokeWidth="1"
      />

      {/* Flanking pulse nodes */}
      <circle cx="20.5" cy="26" r="2" fill="url(#sysChatBubbleGrad)" />
      <circle cx="20.5" cy="26" r="0.8" fill="#ffffff" />
      <circle cx="43.5" cy="26" r="2" fill="url(#sysChatBubbleGrad)" />
      <circle cx="43.5" cy="26" r="0.8" fill="#ffffff" />

      {/* Central System Star core */}
      <path
        d="M 32 18 C 32 22.2 33.8 24.2 38 26 C 33.8 27.8 32 29.8 32 34 C 32 29.8 30.2 27.8 26 26 C 30.2 24.2 32 22.2 32 18 Z"
        fill="url(#sysCoreSparkGrad)"
      />
      <circle cx="32" cy="26" r="1.2" fill="#ffffff" />

      {/* Floating System Spark at top right */}
      <path
        d="M 51 5 C 51 7.8 51.8 8.8 54.5 10 C 51.8 11.2 51 12.2 51 15 C 51 12.2 50.2 11.2 47.5 10 C 50.2 8.8 51 7.8 51 5 Z"
        fill="#38bdf8"
      />
      <circle cx="51" cy="10" r="0.7" fill="#ffffff" />
    </svg>
  );
}

// 4 Interactive Quick Prompt Starters for Empty State
const PROMPT_STARTERS = [
  {
    icon: ObjectiveTargetIcon,
    title: "Syllabus Breakdown",
    prompt: "Break down my current exam syllabus into high-yield daily study milestones and review checkpoints.",
    gradient: "from-emerald-500/20 to-teal-500/5",
    border: "hover:border-emerald-500/50",
  },
  {
    icon: Zap,
    title: "Concept Deep-Dive",
    prompt: "Explain a complex concept using intuitive analogies, active recall questions, and a mental model.",
    gradient: "from-amber-500/20 to-orange-500/5",
    border: "hover:border-amber-500/50",
  },
  {
    icon: Swords,
    title: "Active Recall Quiz",
    prompt: "Generate a 5-question high-yield practice quiz with detailed reasoning for each answer.",
    gradient: "from-cyan-500/20 to-blue-500/5",
    border: "hover:border-cyan-500/50",
  },
  {
    icon: ShieldCheck,
    title: "Study Habit Audit",
    prompt: "Audit my study routine and help me optimize for deep-work focus intervals without burnout.",
    gradient: "from-purple-500/20 to-pink-500/5",
    border: "hover:border-purple-500/50",
  },
];

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
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Fetch messages when the active session changes
  useEffect(() => {
    if (sessionId) {
      setIsLoadingMessages(true);
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

  const copyToClipboard = (id: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleStarterClick = (prompt: string) => {
    setInputText(prompt);
    textareaRef.current?.focus();
  };

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
        let errorMsg = "The system is temporarily unavailable. Please try again.";
        try {
          const errData = await res.json();
          if (errData?.error && typeof errData.error === "string") {
            errorMsg = errData.error;
          }
        } catch {}
        console.error("Chat error", errorMsg);
        setMessages((prev) => {
          const updated = prev.map((m) => (m.id === optimisticUserMsg.id ? { ...m, failed: true } : m));
          return [
            ...updated,
            {
              id: Date.now() + 1,
              content: errorMsg,
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

  // Auto-unlock isSending after 45 seconds
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
  }, [isSending, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTriggerSend();
    }
  };

  const handleTriggerSend = async () => {
    if (isSending || (!inputText.trim() && !selectedFile) || quotaExhausted) return;
    const currentInput = inputText;
    const currentFile = selectedFile;
    setInputText("");
    setSelectedFile(null);
    await sendMessage(currentInput, currentFile);
  };

  // An unlimited account is never locked out (`remaining` is null there).
  const quotaExhausted =
    chatQuota !== null && !chatQuota.unlimited && chatQuota.remaining === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none overflow-hidden relative">
      {/* ─── Main Chat Window (Borderless & Centered) ───────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll relative">
        {isLoadingMessages && (
          <div className="absolute inset-0 z-20 bg-bg-void/40 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-bg-panel/90 border border-border-subtle shadow-xl">
              <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shadow-sm" />
              <span className="text-xs font-['Rajdhani'] uppercase tracking-wider text-accent-text-light font-bold">
                Synchronizing Memory...
              </span>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 py-4 sm:py-6 flex flex-col space-y-4">
          {messages.length === 0 && !isLoadingMessages ? (
            /* ─── Ultra-Minimalist Empty State ─────── */
            <div className="my-auto py-8 px-2 flex flex-col items-center text-center max-w-lg mx-auto w-full">
              <div className="relative group mb-3">
                <div className="absolute -inset-3 rounded-full bg-accent-primary/20 blur-xl opacity-75 pointer-events-none" />
                <SystemChatVectorSymbol className="w-12 h-12 relative z-10 transition-transform duration-300 group-hover:scale-105 drop-shadow-md" />
              </div>

              <h2 className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted mb-4">
                How can The System assist you?
              </h2>

              {/* Minimalist Prompt Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {PROMPT_STARTERS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      onClick={() => handleStarterClick(item.prompt)}
                      className={styles.starterCard}
                    >
                      <div className="p-1 rounded-lg bg-white/5 text-accent-text-light group-hover:text-accent-primary-light transition-colors shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider truncate group-hover:text-text-primary transition-colors">
                        {item.title}
                      </span>
                    </button>
                  );
                })}
              </div>
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
                      className={`max-w-[92%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-4 select-text ${
                        isUser
                          ? styles.messageBubbleUser
                          : styles.messageBubbleSystem
                      }`}
                    >
                      {/* Message Meta Header */}
                      <div className="flex justify-between items-center mb-2 gap-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider font-['Rajdhani'] ${
                              isUser ? "text-accent-text-light" : "text-accent-primary"
                            }`}
                          >
                            {isUser ? "You" : "The System"}
                          </span>
                          {!isUser && isDevMode && (() => {
                            const modelBadge = getMessageModelBadge(msg, modelPref);
                            if (!modelBadge) return null;
                            return (
                              <span className="text-[9px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                DEV: {modelBadge}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex items-center gap-2">
                          {!isUser && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(msg.id, msg.content)}
                              className="p-1 rounded text-text-muted hover:text-accent-primary-light hover:bg-white/5 transition-colors"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                          <span className="text-[10px] font-mono text-text-muted">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* File attachment rendering */}
                      {msg.attachmentUrl && (
                        <div className="mb-3">
                          {msg.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                            <img
                              src={msg.attachmentUrl}
                              alt="attachment"
                              className="max-w-full h-auto max-h-[220px] rounded-xl object-contain border border-white/10"
                            />
                          ) : (
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent-primary underline text-xs break-all flex items-center gap-1.5"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Attached Document</span>
                            </a>
                          )}
                        </div>
                      )}

                      {/* Content Renderer */}
                      {isUser ? (
                        <div className="flex flex-col gap-2 text-sm leading-relaxed">
                          <MarkdownRenderer content={msg.content} />
                          {msg.failed && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-rose-400 font-bold font-['Rajdhani']">
                                ⚠ Transmission Failed
                              </span>
                              <button
                                onClick={() => {
                                  setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                                  sendMessage(msg.content, msg.fileObj || null);
                                }}
                                className="text-[10px] bg-rose-900/30 hover:bg-rose-800/50 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30 transition-colors cursor-pointer"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm leading-relaxed">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {/* Neural Thought / Typing Pulse */}
          <AnimatePresence>
            {isSending && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="flex justify-start"
              >
                <div className="border border-border-subtle bg-bg-abyss/90 rounded-2xl p-3.5 flex items-center gap-2.5 shadow-md">
                  <span className="text-[10px] font-bold uppercase tracking-wider font-['Rajdhani'] text-accent-text-light">
                    The System
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-accent-primary italic font-medium font-['Rajdhani']">
                      Calculating response
                    </span>
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

      {/* ─── Modern Integrated Floating Command Deck (Centered & Compact) ─ */}
      <div className="shrink-0 max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 pt-1">
        {quotaExhausted && (
          <div className="mb-2 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs font-['Rajdhani'] text-rose-300 shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Daily prompt limit reached ({chatQuota?.limit || 15}/{chatQuota?.limit || 15} messages). Quota resets at midnight.
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

        {/* Unified Capsule Container */}
        <div className={`relative ${styles.deckWrapper}`}>
          {/* Attached File Chip Preview */}
          {selectedFile && (
            <div className="mb-2 px-3 py-1.5 bg-accent-primary/10 border border-accent-primary/30 rounded-xl inline-flex items-center gap-2 text-xs text-accent-text-light font-['Rajdhani'] font-bold">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="truncate max-w-xs">{selectedFile.name}</span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-rose-400 hover:text-rose-300 ml-1 p-0.5 rounded hover:bg-rose-500/20 transition-colors"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Text Input / Textarea */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending || quotaExhausted}
            placeholder={
              quotaExhausted
                ? "Daily chat quota reached..."
                : "Ask anything... (Enter to send, Shift+Enter for new line)"
            }
            className="w-full bg-transparent border-none text-xs sm:text-sm font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none resize-none leading-relaxed px-1 disabled:opacity-50"
          />

          {/* Action Row Inside Capsule */}
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50 mt-1">
            {/* Left Controls */}
            <div className="flex items-center gap-1.5">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={quotaExhausted || isSending}
                className="p-2 sm:p-1.5 rounded-lg text-text-muted hover:text-accent-primary-light hover:bg-white/5 transition-colors disabled:opacity-40 flex items-center gap-1 text-xs font-['Rajdhani'] cursor-pointer"
                title="Attach syllabus, notes, or image"
              >
                <Paperclip className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px] font-medium">Attach File</span>
              </button>

              {inputText.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setInputText("")}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors text-xs"
                  title="Clear input"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right Controls: Quota Ring & Send Button */}
            <div className="flex items-center gap-2.5">
              {/* Daily Quota Dial Indicator */}
              {(() => {
                if (chatQuota?.unlimited) {
                  // Explicit unlimited state — never a placeholder number.
                  return (
                    <div
                      className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 group cursor-help shrink-0"
                      title="Unlimited AI messages"
                    >
                      <svg className="w-7 h-7 transform -rotate-90">
                        <circle
                          cx="14"
                          cy="14"
                          r="8"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          fill="transparent"
                          className="text-accent-primary/40"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[11px] font-mono font-bold text-accent-text-light">
                          ∞
                        </span>
                      </div>
                    </div>
                  );
                }

                const MAX_REQUESTS = chatQuota?.limit || 15;
                const requestsUsed = chatQuota?.used || 0;
                const remaining = chatQuota?.remaining ?? MAX_REQUESTS;
                const percentage = (requestsUsed / MAX_REQUESTS) * 100;
                const isWarning = remaining <= 3 && remaining > 0;
                const isCritical = remaining === 0;

                return (
                  <div
                    className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 group cursor-help shrink-0"
                    title={`Daily AI Messages: ${remaining}/${MAX_REQUESTS} remaining`}
                  >
                    <svg className="w-7 h-7 transform -rotate-90">
                      <circle
                        cx="14"
                        cy="14"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="transparent"
                        className="text-white/10"
                      />
                      <circle
                        cx="14"
                        cy="14"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 8}
                        strokeDashoffset={2 * Math.PI * 8 - (percentage / 100) * (2 * Math.PI * 8)}
                        className={`transition-all duration-500 ease-out ${
                          isCritical
                            ? "text-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]"
                            : isWarning
                            ? "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"
                            : "text-accent-primary"
                        }`}
                      />
                    </svg>

                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {isCritical ? (
                        <Lock className="w-2.5 h-2.5 text-rose-400" />
                      ) : (
                        <span className="text-[9px] font-mono font-bold text-text-muted group-hover:text-accent-text-light transition-colors">
                          {remaining}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* High Contrast Send Button */}
              <button
                type="button"
                onClick={handleTriggerSend}
                disabled={isSending || (!inputText.trim() && !selectedFile) || quotaExhausted}
                className={`py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer ${styles.btnPrimaryAction}`}
              >
                {isSending ? (
                  <span className="animate-pulse">Thinking...</span>
                ) : quotaExhausted ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Locked</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
