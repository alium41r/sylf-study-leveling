"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useFocusTools } from "../FocusToolsContext";
import MarkdownRenderer from "@/app/components/MarkdownRenderer";
import {
  Send,
  User,
  RotateCcw,
  Check,
  Copy,
  FileText,
  StopCircle,
  Plus,
  History,
  MessageSquare,
  Trash2,
  X,
  Lock,
  GitBranch,
  Search,
} from "lucide-react";
import { SylvieIcon } from "@/app/components/icons";
import SylvieResponseActions from "@/app/components/system/SylvieResponseActions";
import type { PendingSylvieAction } from "@/lib/ai/sylvie/action";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  pendingAction?: PendingSylvieAction;
  plannerHandoff?: SylviePlannerHandoff;
}

interface ChatSessionItem {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const INITIAL_GREETING = "What can I help you with?";

export default function AiAssistantTool() {
  const { subjectName, openTool } = useFocusTools();

  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "welcome",
      sender: "ai",
      text: INITIAL_GREETING,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>([]);
  const [quotaReached, setQuotaReached] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, isLoading, isStreaming, scrollToBottom]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Fetch all chat sessions on mount
  const fetchSessions = useCallback(async () => {
    try {
      const [chatsRes, skillsRes] = await Promise.all([
        fetch("/api/chats"),
        fetch("/api/skills").catch(() => null),
      ]);

      if (chatsRes.ok) {
        const data = await chatsRes.json();
        if (Array.isArray(data?.sessions)) {
          setSessions(data.sessions);
        }
      }

      if (skillsRes && skillsRes.ok) {
        const skillData = await skillsRes.json();
        if (Array.isArray(skillData?.unlockedSkills)) {
          setUnlockedSkills(skillData.unlockedSkills.map((s: any) => s.nodeKey));
        }
      }
    } catch (err) {
      console.error("Failed to fetch chat sessions or skills:", err);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load past conversation messages for a selected session
  const loadSessionMessages = useCallback(
    async (targetSessionId: number) => {
      setIsLoadingHistory(true);
      setShowHistoryDrawer(false);
      try {
        const res = await fetch(
          `/api/system-messages?sessionId=${targetSessionId}&limit=100`
        );

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            // Sort ascending by createdAt
            const sorted = [...data.messages].sort(
              (a: any, b: any) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );

            const mapped: ChatMessage[] = sorted.map((m: any) => ({
              id: String(m.id),
              sender: m.type === "USER" ? "user" : "ai",
              text: m.content,
              pendingAction: m.pendingAction,
              plannerHandoff: m.plannerHandoff,
              timestamp: new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            }));

            setSessionId(targetSessionId);
            setMessages(mapped);
          } else {
            setSessionId(targetSessionId);
            setMessages([
              {
                id: `session-empty-${targetSessionId}`,
                sender: "ai",
                text: "Continuing this conversation thread. What would you like to explore next?",
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ]);
          }
        }
      } catch (err) {
        console.error("Failed to load session messages:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    []
  );

  // Start a new empty chat session
  const handleNewChat = () => {
    setSessionId(null);
    setMessages([
      {
        id: "welcome-new",
        sender: "ai",
        text: INITIAL_GREETING,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    setInput("");
    setShowHistoryDrawer(false);
    if (inputRef.current) {
      inputRef.current.style.height = "42px";
      inputRef.current.focus();
    }
  };

  // Delete a past session
  const handleDeleteSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (sessionId === id) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    }
  };

  // Progressive token streamer for smooth live rendering
  const streamResponseText = useCallback((fullText: string, messageId: string) => {
    setIsStreaming(true);
    let currentLength = 0;
    const chunkSize = Math.max(2, Math.floor(fullText.length / 45));

    const streamNext = () => {
      currentLength = Math.min(fullText.length, currentLength + chunkSize);
      const partialText = fullText.slice(0, currentLength);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, text: partialText, isStreaming: currentLength < fullText.length }
            : m
        )
      );

      if (currentLength < fullText.length) {
        streamTimeoutRef.current = setTimeout(streamNext, 18);
      } else {
        setIsStreaming(false);
        setIsLoading(false);
      }
    };

    streamNext();
  }, []);

  const handleSend = async (customPrompt?: string, confirmationToken?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || isLoading || isStreaming) return;

    const userMsgId = Math.random().toString(36).substring(2, 9);
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const aiMsgId = Math.random().toString(36).substring(2, 9);
    const placeholderAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: "ai",
      text: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg, placeholderAiMsg]);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "42px";
    }
    setIsLoading(true);

    try {
      abortControllerRef.current = new AbortController();

      const res = await fetch("/api/system-messages/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          sessionId: sessionId || undefined,
          pageContext: {
            path: "/focus",
            subject: subjectName || undefined,
          },
          confirmationToken,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}));
        const lockedMessage =
          errData?.error === "DAILY_QUOTA_EXHAUSTED" || errData?.error === "quota_exceeded"
            ? `${errData?.message || "Daily AI message limit reached. Your quota resets at midnight."} Planner requests and confirmations are still available.`
            : "Rate limit exceeded. Please wait a moment.";
        if (errData?.error === "DAILY_QUOTA_EXHAUSTED" || errData?.error === "quota_exceeded") {
          setQuotaReached(true);
        }
        throw new Error(lockedMessage);
      }

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();
      // Deterministic replies remain available after quota runs out.
      if (data.modelUsed && data.modelUsed !== "DETERMINISTIC") setQuotaReached(false);
      if (data?.sessionId) {
        setSessionId(data.sessionId);
        if (data.session) {
          setSessions((prev) => [data.session, ...prev.filter((s) => s.id !== data.sessionId)]);
        } else {
          fetchSessions();
        }
      }

      const fullReply =
        data?.reply ||
        data?.aiMessage?.content ||
        data?.message ||
        "No answer came through. Please try again.";

      setMessages((prev) => prev.map((message) => message.id === aiMsgId ? {
        ...message,
        pendingAction: data.aiMessage?.pendingAction ?? data.pendingAction,
        plannerHandoff: data.aiMessage?.plannerHandoff ?? data.plannerHandoff,
      } : message));

      streamResponseText(fullReply, aiMsgId);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, text: "(Generation stopped by user)" } : m
          )
        );
      } else {
        console.error("AI chat error:", err);
        const errMsg =
          err?.message?.includes("Daily AI") || err?.message?.includes("Rate limit")
            ? `⚠️ ${err.message}`
            : "⚠️ Unable to reach Sylvie. Please check your connection and try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: errMsg,
                }
              : m
          )
        );
      }
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
    }
    setIsLoading(false);
    setIsStreaming(false);
  };

  const handleCopy = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleSaveToNotes = (text: string) => {
    try {
      const storageKey = `focus_scratchpad_${
        subjectName ? subjectName.toLowerCase().replace(/\s+/g, "_") : "general"
      }`;
      const existing = localStorage.getItem(storageKey) || "";
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const entry = `\n\n### AI Note [${timestamp}]\n${text}\n`;
      localStorage.setItem(storageKey, existing + entry);
      openTool("notes");
    } catch (e) {
      console.error(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 110)}px`;
    }
  };

  const activeSessionTitle =
    sessions.find((s) => s.id === sessionId)?.title ||
    (sessionId ? `Chat #${sessionId}` : "New Session");
  const latestAssistantId = messages.reduce<string | null>((latest, message) =>
    message.sender === "ai" ? message.id : latest, null);

  return (
    <div className="flex flex-col h-full text-text-primary font-sans text-xs bg-bg-void/40 select-none relative">
      {/* Top Header Bar */}
      <div className="px-3.5 py-2 bg-bg-panel/50 border-b border-border-subtle flex items-center justify-between gap-2 shadow-sm shrink-0">
        {/* Left Side: Thread indicator & Subject Badge */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="text-[11px] text-text-secondary truncate">
              Thread: <strong className="text-text-primary font-semibold">{activeSessionTitle}</strong>
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent-primary/10 text-accent-primary border border-accent-primary/20 shrink-0">
              {subjectName || "Focus"}
            </span>
          </div>
        </div>

        {/* Right Side: + New Chat, History Drawer Toggle & Reset */}
        <div className="flex items-center gap-1.5 shrink-0">
          {quotaReached && (
            <span
              className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
              title="Daily AI message limit reached. Planner requests and confirmations remain available."
            >
              <Lock className="w-3 h-3" />
              Daily Limit
            </span>
          )}

          <button
            onClick={handleNewChat}
            className="px-2 py-1 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30 transition-all flex items-center gap-1 text-[10px] font-medium"
            title="Start New Chat Session"
          >
            <Plus className="w-3 h-3" />
            <span>New</span>
          </button>

          <button
            onClick={() => setShowHistoryDrawer((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 text-[10px] font-medium ${
              showHistoryDrawer
                ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                : "bg-bg-abyss text-text-muted hover:text-text-primary border-border-subtle hover:border-accent-primary/40"
            }`}
            title="View All Past Conversations"
          >
            <History className="w-3 h-3" />
            <span>History</span>
            {sessions.length > 0 && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold ${
                  showHistoryDrawer ? "bg-white/20 text-white" : "bg-bg-panel text-accent-primary"
                }`}
              >
                {sessions.length}
              </span>
            )}
          </button>

          <button
            onClick={handleNewChat}
            className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-bg-panel transition-colors"
            title="Reset Active Chat"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* History Flyout Drawer */}
      {showHistoryDrawer && (
        <div className="absolute inset-x-0 top-[41px] bottom-0 bg-bg-void/95 backdrop-blur-md z-20 flex flex-col border-b border-border-subtle animate-in fade-in duration-150">
          <div className="p-3 bg-bg-panel/70 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-accent-primary" />
              <span className="font-bold text-text-primary text-xs uppercase tracking-wider">
                Conversation History ({sessions.length})
              </span>
            </div>
            <button
              onClick={() => setShowHistoryDrawer(false)}
              className="p-1 rounded-lg hover:bg-bg-abyss text-text-muted hover:text-text-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
            <button
              onClick={handleNewChat}
              className="w-full text-left p-2.5 rounded-xl border border-dashed border-accent-primary/40 hover:bg-accent-primary/10 transition-colors flex items-center gap-2 text-accent-primary text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start Blank Chat Session</span>
            </button>

            {sessions.length === 0 ? (
              <div className="py-10 text-center text-text-muted text-xs flex flex-col items-center gap-2">
                <History className="w-6 h-6 opacity-40" />
                <p>No past chat sessions found.</p>
                <p className="text-[10px]">Start prompting below to build your study archive.</p>
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = s.id === sessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSessionMessages(s.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                      isSelected
                        ? "bg-accent-primary/15 border-accent-primary text-text-primary shadow-sm"
                        : "bg-bg-abyss/80 border-border-subtle hover:border-accent-primary/40 text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-2">
                      <span className="font-semibold text-xs truncate">{s.title}</span>
                      <span className="text-[9px] text-text-muted">
                        {new Date(s.updatedAt || s.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        •{" "}
                        {new Date(s.updatedAt || s.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(e, s.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-all shrink-0"
                      title="Delete Conversation"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 custom-scrollbar select-text">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-2">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading conversation history...</span>
          </div>
        ) : (
          messages.map((m) => {
            const isAi = m.sender === "ai";

            return (
              <div
                key={m.id}
                className={`flex gap-2.5 max-w-[95%] sm:max-w-[90%] ${
                  isAi ? "self-start" : "self-end flex-row-reverse"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isAi
                      ? "bg-accent-primary text-white shadow-sm shadow-accent-primary/40"
                      : "bg-bg-panel text-text-secondary border border-border-subtle"
                  }`}
                >
                  {isAi ? <SylvieIcon size={14} className="text-accent-primary-light" /> : <User className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`p-3 rounded-2xl relative group transition-all ${
                    isAi
                      ? "bg-bg-abyss/90 border border-border-subtle text-text-primary rounded-tl-sm shadow-sm"
                      : "bg-accent-primary text-white rounded-tr-sm shadow-md"
                  }`}
                >
                  <div className="text-xs leading-relaxed overflow-hidden">
                    {m.text ? (
                      <>
                        <MarkdownRenderer content={m.text} compact />
                        {m.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 bg-accent-primary-light ml-1 animate-pulse align-middle" />
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1 text-text-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-bounce [animation-delay:0.4s]" />
                      </div>
                    )}
                  </div>

                  {isAi && (
                    <SylvieResponseActions
                      pendingAction={m.id === latestAssistantId ? m.pendingAction : undefined}
                      plannerHandoff={m.plannerHandoff}
                      busy={isLoading || isStreaming}
                      onConfirm={(token) => handleSend("Confirm change", token)}
                    />
                  )}

                  <div
                    className={`flex items-center justify-between gap-2 mt-1.5 text-[10px] ${
                      isAi ? "text-text-muted" : "text-white/70"
                    }`}
                  >
                    <span>{m.timestamp}</span>
                    {isAi && m.text && !m.isStreaming && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleSaveToNotes(m.text)}
                          className="p-1 rounded hover:bg-bg-panel hover:text-accent-text-light transition-colors flex items-center gap-0.5 text-[9px]"
                          title="Save to Scratchpad"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Save to Notes</span>
                        </button>
                        <button
                          onClick={() => handleCopy(m.id, m.text)}
                          className="p-1 rounded hover:bg-bg-panel hover:text-text-primary transition-colors"
                          title="Copy Answer"
                        >
                          {copiedId === m.id ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Analyst Dynamic Perks Chips */}
      {unlockedSkills.includes("analyst-logic-breakdown") && (
        <div className="px-3 pt-2 pb-1.5 bg-bg-abyss/95 flex items-center gap-1.5 overflow-x-auto border-t border-border-subtle scrollbar-none">
          <span className="text-[10px] font-bold font-['Rajdhani'] text-cyan-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
            <SylvieIcon size={12} className="text-cyan-400" />
            Analyst:
          </span>
          <button
            onClick={() =>
              handleSend(
                "Please decompose this problem/theorem into formal step-by-step logic and verify every premise."
              )
            }
            className="px-2 py-0.5 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 text-[10px] whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
          >
            <GitBranch className="w-3 h-3 text-cyan-400" />
            <span>Decompose Logic</span>
          </button>
          <button
            onClick={() =>
              handleSend(
                "Verify the mathematical proof rigorously and check for edge conditions or boundary violations."
              )
            }
            className="px-2 py-0.5 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60 text-[10px] whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Search className="w-3 h-3 text-cyan-400" />
            <span>Verify Proof</span>
          </button>
        </div>
      )}

      {/* Input Bar (Auto-expanding, with Enter to Send / Shift+Enter for Newline) */}
      {quotaReached && (
        <p className="px-3 py-2 border-t border-border-subtle text-[10px] leading-relaxed text-text-secondary" role="status">
          Daily AI message limit reached. Planner requests and confirmations are still available.
        </p>
      )}
      <div className="p-3 border-t border-border-subtle bg-bg-abyss flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Ask Sylvie in ${activeSessionTitle}... (Enter to send)`}
          rows={1}
          className="flex-1 bg-bg-panel/90 border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary resize-none max-h-28 min-h-[42px] leading-relaxed transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: "42px" }}
        />

        {isStreaming || isLoading ? (
          <button
            onClick={handleStop}
            className="w-10 h-10 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 transition-all flex items-center justify-center shrink-0 shadow-sm"
            title="Stop Generating"
          >
            <StopCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-accent-primary/30 flex items-center justify-center shrink-0"
            title="Send Message (Enter)"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
