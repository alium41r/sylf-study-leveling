"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../components/AuthProvider";
import MarkdownRenderer from "../components/MarkdownRenderer";
import AiPlannerModal from "../components/AiPlannerModal";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Paperclip, Calendar, Sparkles, Clock, AlertCircle, X } from "lucide-react";

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
    if (msg.modelUsed === "GEMINI") return "Gemini 2.5 Flash";
    if (msg.modelUsed === "GROQ") return "Groq (Qwen 3.6)";
    return msg.modelUsed;
  }
  if (msg.content) {
    const match = msg.content.match(/<!--\s*model:\s*([^->\n]+?)\s*-->/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  if (msg.type?.includes("DEEPSEEK")) return "DeepSeek";
  if (msg.type?.includes("GEMINI")) return "Gemini 2.5 Flash";
  if (msg.type?.includes("GROQ")) return "Groq (Qwen 3.6)";
  if (currentModelPref === "deepseek") return "DeepSeek";
  if (currentModelPref === "groq") return "Groq (Qwen 3.6)";
  return "The System AI";
}

interface ChatSession {
  id: number;
  title: string;
  updatedAt: string;
}

export default function SystemPage() {
  const { token } = useAuth();
  
  // Multi-session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  
  // Messages state
  const [messages, setMessages] = useState<SystemMsg[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Chat input state
  const [inputText, setInputText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Select mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<number[]>([]);

  // Daily quota tracking (server-backed)
  const [chatQuota, setChatQuota] = useState<{ used: number; limit: number; remaining: number; resetsAt: string } | null>(null);
  const [plannerQuota, setPlannerQuota] = useState<{ used: number; limit: number; remaining: number; resetsAt: string } | null>(null);
  
  // Developer Debug Mode (hidden by default; toggle by triple-clicking "THE SYSTEM" or ?dev=true)
  const [isDevMode, setIsDevMode] = useState(false);
  const [devClicks, setDevClicks] = useState(0);

  // Model Preference (Auto multi-engine routing by default)
  const [modelPref, setModelPref] = useState<"auto" | "deepseek" | "gemini" | "groq">("auto");

  // Planner Modal
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("dev") === "true" || localStorage.getItem("sylf_dev_ai") === "true") {
        setIsDevMode(true);
      }
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

  // Fetch AI usage quotas from server
  const fetchQuotas = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/ai-usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChatQuota(data.chat);
        setPlannerQuota(data.planner);
      }
    } catch (e) {
      console.error("Failed to fetch quotas:", e);
    }
  };

  useEffect(() => {
    fetchQuotas();
  }, [token]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = () => setOpenMenuId(null);
    if (openMenuId !== null) {
      window.addEventListener("click", handleClick);
    }
    return () => window.removeEventListener("click", handleClick);
  }, [openMenuId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all sessions
  const fetchSessions = () => {
    if (!token) return;
    fetch(`/api/chats?_t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => (r.ok ? r.json().catch(() => ({})) : {}))
      .then((data) => {
        setSessions(data.sessions || []);
        // If we have sessions but no active one, auto-select the first one
        if (data.sessions?.length > 0 && activeSessionId === null) {
          setActiveSessionId(data.sessions[0].id);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchSessions();
  }, [token]);

  // Fetch messages when active session changes
  useEffect(() => {
    if (!token) return;
    
    if (activeSessionId) {
      setIsLoadingMessages(true);
      fetch(`/api/system-messages?limit=100&sessionId=${activeSessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (r) => (r.ok ? r.json().catch(() => ({})) : {}))
        .then((data) => {
          const sorted = (data.messages || []).sort(
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
    }
  }, [token, activeSessionId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const createNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInputText("");
    setSelectedFile(null);
  };

  const deleteSession = async (id: number) => {
    if (!confirm("Are you sure you want to delete this chat?")) return;
    try {
      await fetch(`/api/chats/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (activeSessionId === id) {
        setActiveSessionId(null);
      }
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const renameSession = async (id: number, newTitle: string) => {
    try {
      await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });
      setEditingSessionId(null);
      fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteSelectedChats = async () => {
    if (!token || selectedChats.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedChats.length} chat(s)?`)) return;

    try {
      for (const id of selectedChats) {
         await fetch(`/api/chats/${id}`, {
           method: "DELETE",
           headers: { Authorization: `Bearer ${token}` },
         });
      }
      setSessions(prev => prev.filter(s => !selectedChats.includes(s.id)));
      if (activeSessionId && selectedChats.includes(activeSessionId)) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setIsSelectMode(false);
      setSelectedChats([]);
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async (text: string, file: File | null) => {
    if (!text.trim() && !file) return;
    if (!token) return;

    const optimisticUserMsg: SystemMsg = {
      id: Date.now(),
      content: text || "Sent an attachment.",
      type: "USER",
      read: true,
      attachmentUrl: file ? URL.createObjectURL(file) : undefined,
      fileObj: file || undefined,
      createdAt: new Date().toISOString(),
      sessionId: activeSessionId || undefined,
    };
    
    setMessages((prev) => [...prev, optimisticUserMsg]);
    setIsSending(true);
    scrollToBottom();

    const formData = new FormData();
    if (text.trim()) formData.append("message", text);
    if (file) formData.append("file", file);
    formData.append("modelPreference", modelPref);
    if (activeSessionId) formData.append("sessionId", activeSessionId.toString());

    try {
      const res = await fetch("/api/system-messages/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.status === 429) {
        // Quota exhausted
        const data = await res.json();
        setChatQuota(prev => prev ? { ...prev, remaining: 0, used: prev.limit, resetsAt: data.resetsAt || prev.resetsAt } : prev);
        setMessages((prev) => {
          const updated = prev.map(m => m.id === optimisticUserMsg.id ? { ...m, failed: true } : m);
          return [
            ...updated,
            {
              id: Date.now() + 1,
              content: `**Daily Limit Reached**\n\nYou've used all ${data.limit || 15} AI messages for today. Your quota resets at midnight.`,
              type: "INFO",
              read: true,
              createdAt: new Date().toISOString(),
              sessionId: activeSessionId || undefined,
            }
          ];
        });
        scrollToBottom();
      } else if (res.ok) {
        const data = await res.json();
        
        // If this was a new chat, update our active session and refetch the sidebar
        if (data.sessionId && !activeSessionId) {
          setActiveSessionId(data.sessionId);
          if (data.session) {
            setSessions((prev) => [data.session, ...prev]);
          }
        }

        console.log(
          `%c[Sylf AI Diagnostics]%c Engine: ${data.modelDisplayName || data.modelUsed} | Provider: ${data.modelUsed} | Session ID: ${data.sessionId}`,
          "background: #1e1b4b; color: #818cf8; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid #4338ca;",
          "color: #38bdf8; font-weight: bold; margin-left: 8px;"
        );

        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (m) => m.id !== optimisticUserMsg.id
          );
          return [...withoutOptimistic, data.userMessage, data.aiMessage];
        });
        scrollToBottom();
        // Refresh quota after successful send
        fetchQuotas();
      } else {
        console.error("Chat error", await res.text());
        setMessages((prev) => {
          const updated = prev.map(m => m.id === optimisticUserMsg.id ? { ...m, failed: true } : m);
          return [
            ...updated,
            {
              id: Date.now() + 1,
              content: "The system is temporarily unavailable. Please try again.",
              type: "INFO",
              read: true,
              createdAt: new Date().toISOString(),
              sessionId: activeSessionId || undefined,
            }
          ];
        });
        scrollToBottom();
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = prev.map(m => m.id === optimisticUserMsg.id ? { ...m, failed: true } : m);
        return [
          ...updated,
          {
            id: Date.now() + 1,
            content: "The system is temporarily unavailable. Please try again.",
            type: "INFO",
            read: true,
            createdAt: new Date().toISOString(),
            sessionId: activeSessionId || undefined,
          }
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
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 2,
          content: "The request timed out. Please try again.",
          type: "INFO",
          read: true,
          createdAt: new Date().toISOString(),
          sessionId: activeSessionId || undefined,
        }
      ]);
    }, 45000);
    return () => clearTimeout(timeout);
  }, [isSending]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = inputText;
    const currentFile = selectedFile;
    setInputText("");
    setSelectedFile(null);
    await sendMessage(currentInput, currentFile);
  };

  return (
    <div className="flex w-full h-[100vh] overflow-hidden">
      {/* ── Main Chat Area ── */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="max-w-[98%] mx-auto w-full flex-1 flex flex-col p-4 md:p-8 min-h-0">
          
            <div className="flex justify-between items-end mb-4 shrink-0">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <p
                    onClick={handleTitleClick}
                    className="text-xs tracking-widest text-accent-text-light font-bold cursor-pointer select-none hover:text-accent-primary transition-colors"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    title="The System AI"
                  >
                    THE SYSTEM
                  </p>
                  
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
                    </div>
                  )}
                </div>
                
                <h1
                  className="text-3xl font-bold"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {activeSessionId 
                  ? sessions.find(s => s.id === activeSessionId)?.title || "Chat"
                  : "New Chat"}
              </h1>
            </div>

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
                  {activeSessionId ? "No messages yet." : "Start a new conversation with The System."}
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
                            <span className={`text-[10px] font-bold uppercase tracking-wider opacity-90 ${isUser ? 'text-accent-text-light' : 'text-accent-primary'}`}>
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
                                    setMessages(prev => prev.filter(m => m.id !== msg.id));
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
            {/* Quota Exhausted Alert Banner */}
            {chatQuota?.remaining === 0 && (
              <div className="mb-2 px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs font-['Rajdhani'] text-rose-300 shadow-sm animate-pulse">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Daily prompt limit reached (15/15 messages). Free tier chat quota refreshes at midnight.
                  </span>
                </div>
                <span className="font-mono text-[11px] text-rose-400 font-bold hidden sm:inline-block">
                  Resets: {chatQuota?.resetsAt ? new Date(chatQuota.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "00:00"}
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
                disabled={chatQuota?.remaining === 0}
                className="p-3 system-card flex-shrink-0 text-xl hover:bg-bg-panel transition-colors text-accent-text-light rounded-xl border border-border-subtle disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center"
                title="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* AI Planner Modal Trigger Button with Lock Indicator */}
              <button
                type="button"
                onClick={() => setIsPlannerOpen(true)}
                className={`px-4 py-3 system-card flex-shrink-0 text-xs font-bold transition-all rounded-xl border tracking-wide flex items-center gap-1.5 ${
                  plannerQuota?.remaining === 0
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "hover:bg-bg-panel text-accent-text-light border-border-subtle"
                }`}
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
                title={
                  plannerQuota?.remaining === 0
                    ? "AI Study Planner (Daily limit reached: 0/1)"
                    : "AI Study Planner (1 free plan remaining today)"
                }
              >
                {plannerQuota?.remaining === 0 ? (
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Calendar className="w-3.5 h-3.5 text-accent-text-light" />
                )}
                <span>Planner</span>
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  chatQuota?.remaining === 0
                    ? "Daily chat quota reached (0 messages remaining)..."
                    : "Ask anything..."
                }
                className="flex-1 bg-bg-void border border-border-subtle rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-primary transition-colors shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSending || chatQuota?.remaining === 0}
              />
              <button
                type="submit"
                disabled={isSending || (!inputText.trim() && !selectedFile) || (chatQuota?.remaining === 0)}
                className="btn-primary rounded-xl px-6 font-bold disabled:opacity-50 disabled:cursor-not-allowed tracking-wider shrink-0 flex items-center justify-center gap-1.5"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {isSending ? (
                  "..."
                ) : chatQuota?.remaining === 0 ? (
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
                    {/* SVG Ring */}
                    <svg className="w-10 h-10 transform -rotate-90">
                      <circle
                        cx="20" cy="20" r="11"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        className="text-text-primary/20"
                      />
                      <circle
                        cx="20" cy="20" r="11"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 11}
                        strokeDashoffset={(2 * Math.PI * 11) - (percentage / 100) * (2 * Math.PI * 11)}
                        className={`transition-all duration-500 ease-out ${
                          isCritical ? "text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" : 
                          isWarning ? "text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" : 
                          "text-accent-primary drop-shadow-sm"
                        }`}
                      />
                    </svg>
                    
                    {/* Inner Icon */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {isCritical ? (
                        <Lock className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-text-muted" />
                      )}
                    </div>
                    
                    {/* Tooltip on hover (opens upwards) */}
                    <div className="absolute bottom-14 right-0 w-44 p-2.5 bg-bg-shadow border border-border-subtle rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.8)] text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <p className="text-[10px] text-text-muted font-['Rajdhani'] font-bold tracking-widest mb-1">
                        DAILY CHAT QUOTA
                      </p>
                      <p className={`text-xl font-bold font-['Rajdhani'] ${isCritical ? 'text-rose-400 animate-pulse' : 'text-accent-primary'}`}>
                        {remaining} <span className="text-xs text-text-muted">/ {MAX_REQUESTS}</span>
                      </p>
                      <p className="text-[9px] text-text-muted mt-1 uppercase font-['Rajdhani']">
                        {isCritical ? "Limit reached • Resets at midnight" : "Messages remaining today"}
                      </p>
                      {/* Tooltip arrow pointer */}
                      <div className="absolute -bottom-2 right-4 w-4 h-4 bg-bg-shadow border-b border-r border-border-subtle transform rotate-45"></div>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>

        </div>
      </div>

      {/* ── Inner Sidebar for Chat Sessions (Moved to Right) ── */}
      <div className={`relative flex flex-col shrink-0 z-10 hidden md:flex transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0'}`}>
        
        {/* Toggle Button outside the border */}
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`absolute top-4 -left-10 w-10 h-11 text-accent-text-light rounded-l-lg hover:bg-bg-panel transition-colors flex items-center justify-center shrink-0 z-50 bg-bg-abyss border-border-subtle border-y border-l ${!isSidebarOpen ? 'border-r' : 'border-r-0'}`}
          title="Toggle History"
        >
          <svg className={`w-5 h-5 transition-transform duration-300 ${!isSidebarOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        {/* Inner wrapper that fills the vertical space */}
        <div className={`w-full flex-1 border-border-subtle bg-bg-abyss flex flex-col overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 border-l' : 'opacity-0 border-l-0'}`}>
          <div className="w-64 flex-1 flex flex-col">
            <div className="p-4 border-b border-border-subtle flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  onClick={createNewChat}
                  className="flex-1 py-2.5 px-4 bg-accent-primary hover:brightness-110 border border-transparent rounded-lg text-white font-bold tracking-wide transition-all shadow-[var(--card-shadow)] hover:shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  <span className="text-xl leading-none">+</span> NEW CHAT
                </button>
                <button
                  onClick={() => {
                    setIsSelectMode(!isSelectMode);
                    setSelectedChats([]);
                    setOpenMenuId(null);
                  }}
                  className="py-2.5 px-3 bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-gray-500 rounded-lg text-text-secondary font-bold transition-all flex items-center justify-center shrink-0"
                  title={isSelectMode ? "Cancel Selection" : "Select Chats"}
                >
                  {isSelectMode ? "Done" : "Select"}
                </button>
              </div>
              
              {isSelectMode && selectedChats.length > 0 && (
                <button 
                  onClick={deleteSelectedChats}
                  className="w-full py-1.5 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 hover:border-red-400 rounded-lg text-red-400 text-sm font-bold tracking-wide transition-all"
                >
                  DELETE SELECTED ({selectedChats.length})
                </button>
              )}
            </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 system-scrollbar">
            {sessions.length === 0 ? (
              <p className="text-xs text-text-secondary text-center mt-6 uppercase tracking-widest font-['Rajdhani']">No previous chats</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative flex items-center p-3 rounded-lg cursor-pointer transition-all ${
                    isSelectMode && selectedChats.includes(session.id)
                      ? "bg-red-900/20 border border-red-500/50 text-red-300"
                      : activeSessionId === session.id && !isSelectMode
                      ? "bg-blue-900/20 border border-blue-500/30 text-blue-300"
                      : "hover:bg-text-primary/5 text-text-secondary border border-transparent"
                  }`}
                  onClick={() => {
                    if (isSelectMode) {
                      setSelectedChats(prev => 
                        prev.includes(session.id) ? prev.filter(id => id !== session.id) : [...prev, session.id]
                      );
                    } else {
                      setActiveSessionId(session.id);
                    }
                  }}
                >
                  {isSelectMode && (
                    <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center shrink-0 transition-colors ${selectedChats.includes(session.id) ? 'bg-red-500 border-red-500' : 'border-gray-500'}`}>
                      {selectedChats.includes(session.id) && (
                        <svg className="w-3 h-3 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0 flex items-center justify-between">
                    {editingSessionId === session.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      autoFocus
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => renameSession(session.id, editTitle)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameSession(session.id, editTitle);
                        if (e.key === "Escape") setEditingSessionId(null);
                      }}
                      className="w-full bg-bg-void border border-border-subtle text-sm px-2 py-1 rounded outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate text-sm pr-6 font-medium">{session.title}</span>
                  )}
                    {/* Actions Menu Trigger */}
                    {!isSelectMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === session.id ? null : session.id);
                        }}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary transition-colors rounded ${openMenuId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        ⋮
                      </button>
                    )}
                  </div>

                  {/* Dropdown Menu */}
                  {openMenuId === session.id && !isSelectMode && (
                    <div className="absolute right-2 top-10 bg-bg-panel border border-border-subtle rounded-lg shadow-xl z-50 py-1 w-28 overflow-hidden">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(session.title);
                          setEditingSessionId(session.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-text-primary/5 hover:text-text-primary transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(null);
                          deleteSession(session.id);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/5 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          </div>
        </div>
      </div>

      <AiPlannerModal
        isOpen={isPlannerOpen}
        onClose={() => setIsPlannerOpen(false)}
        quota={plannerQuota}
        sessionId={activeSessionId}
        onQuotaRefresh={() => {
          fetchQuotas();
          fetchSessions();
        }}
        onPlanCreated={(result) => {
          fetchQuotas();
          fetchSessions();
          if (result?.sessionId) {
            setActiveSessionId(result.sessionId);
            // Fetch messages for this session so the user request and generated plan appear immediately in the chatbox
            if (token) {
              fetch(`/api/system-messages?limit=100&sessionId=${result.sessionId}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then(async (r) => (r.ok ? r.json().catch(() => ({})) : {}))
                .then((data) => {
                  const sorted = (data.messages || []).sort(
                    (a: SystemMsg, b: SystemMsg) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  );
                  setMessages(sorted);
                  scrollToBottom();
                })
                .catch(console.error);
            }
          }
        }}
      />
    </div>
  );
}
