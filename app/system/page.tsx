"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../components/AuthProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AiPlannerModal from "../components/AiPlannerModal";

interface SystemMsg {
  id: number;
  content: string;
  type: string;
  read: boolean;
  attachmentUrl?: string;
  createdAt: string;
  sessionId?: number;
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
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  
  // Select mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState<number[]>([]);

  // Rate limit tracking (15 requests per minute)
  const [apiRequests, setApiRequests] = useState<number[]>([]);
  
  // Model Preference
  const [modelPref, setModelPref] = useState<"auto" | "gemini" | "groq">("auto");

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setApiRequests(prev => prev.filter(time => now - time < 60000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
      .then((r) => r.json())
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
        .then((r) => r.json())
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
      setApiRequests((prev) => [...prev, Date.now()]);
      const res = await fetch("/api/system-messages/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        
        // If this was a new chat, update our active session and refetch the sidebar
        if (data.sessionId && !activeSessionId) {
          setActiveSessionId(data.sessionId);
          if (data.session) {
            setSessions((prev) => [data.session, ...prev]);
          }
        }

        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (m) => m.id !== optimisticUserMsg.id
          );
          return [...withoutOptimistic, data.userMessage, data.aiMessage];
        });
        scrollToBottom();
      } else {
        console.error("Chat error", await res.text());
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
    } finally {
      setIsSending(false);
    }
  };

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
                <div className="flex items-center gap-4 mb-1">
                  <p
                    className="text-xs tracking-widest text-accent-light"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    THE SYSTEM
                  </p>
                  
                  {/* Model Selector Dropdown */}
                  <select
                    value={modelPref}
                    onChange={(e) => setModelPref(e.target.value as any)}
                    className="bg-[#141432]/70 text-xs text-gray-300 border border-white/10 rounded px-2 py-1 outline-none focus:border-accent-light"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    <option value="auto">Auto (Gemini → Groq)</option>
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq (Llama-3)</option>
                  </select>
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
              <div className="absolute inset-0 z-10 bg-[#0d1117]/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
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
              messages.map((msg) => {
                const isUser = msg.type === "USER";
                return (
                  <div
                    key={msg.id}
                    className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl p-4 ${
                        isUser
                          ? "bg-accent-dim border border-accent-mid shadow-[0_0_10px_rgba(124,58,237,0.1)]"
                          : "border border-cyan-500/20 bg-[#06080d] shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                      }`}
                      style={{ animation: "message-fade-in 0.3s ease-out" }}
                    >
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider opacity-90 ${isUser ? 'text-accent-light' : 'text-cyan-400'}`}>
                          {isUser ? "You" : `The System${msg.type.includes('GEMINI') ? ' (Gemini)' : msg.type.includes('GROQ') ? ' (Groq)' : ''}`}
                        </span>
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
                              className="text-blue-400 underline text-sm break-all"
                            >
                              📎 Attached File
                            </a>
                          )}
                        </div>
                      )}

                      {isUser ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      ) : (
                        <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {isSending && (
              <div className="flex justify-start">
                <div className="border border-cyan-500/20 bg-[#06080d] rounded-xl p-4 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mr-2">
                    The System
                  </span>
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(6,182,212,0.8)]" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(6,182,212,0.8)]" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce shadow-[0_0_5px_rgba(6,182,212,0.8)]" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Chat Input */}
          <div className="shrink-0">
            {selectedFile && (
              <div className="mb-2 px-3 py-2 bg-blue-900/30 border border-blue-500/30 rounded-lg inline-flex items-center gap-2 text-sm text-blue-200">
                📎 {selectedFile.name}
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-red-400 hover:text-red-300 ml-2 font-bold"
                >
                  ✕
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
                className="p-3 system-card flex-shrink-0 text-xl hover:bg-white/5 transition-colors text-accent-light rounded-xl"
                title="Attach file"
              >
                📎
              </button>
              <button
                type="button"
                onClick={() => setIsPlannerOpen(true)}
                className="px-4 py-2 system-card flex-shrink-0 hover:bg-white/5 transition-colors text-indigo-400 rounded-xl font-bold tracking-wide flex items-center gap-2"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
                title="Open Planner"
              >
                Planner
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything..."
                className="flex-1 bg-[#0d1117] border border-blue-500/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition-colors shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || (!inputText.trim() && !selectedFile)}
                className="btn-primary rounded-xl px-6 font-bold disabled:opacity-50 disabled:cursor-not-allowed tracking-wider shrink-0"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {isSending ? "..." : "SEND"}
              </button>

              {/* ─── System API Rate Limit Ring ──────────────────────── */}
              {(() => {
                const MAX_REQUESTS = 15;
                const requestsUsed = Math.min(apiRequests.length, MAX_REQUESTS);
                const percentage = (requestsUsed / MAX_REQUESTS) * 100;
                const circumference = 2 * Math.PI * 9;
                const strokeDashoffset = circumference - (percentage / 100) * circumference;
                const isWarning = requestsUsed >= 12;
                const isCritical = requestsUsed >= 15;

                return (
                  <div 
                    className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center bg-[#141432]/70 backdrop-blur-md border border-white/10 rounded-xl group cursor-help ml-2"
                  >
                    {/* SVG Ring */}
                    <svg className="w-10 h-10 transform -rotate-90">
                      <circle
                        cx="20" cy="20" r="11"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        className="text-[#1f1f3a]"
                      />
                      <circle
                        cx="20" cy="20" r="11"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 11}
                        strokeDashoffset={(2 * Math.PI * 11) - (percentage / 100) * (2 * Math.PI * 11)}
                        className={`transition-all duration-500 ease-out ${
                          isCritical ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" : 
                          isWarning ? "text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]" : 
                          "text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"
                        }`}
                      />
                    </svg>
                    
                    {/* Inner Icon */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <svg className={`w-4 h-4 ${isCritical ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    
                    {/* Tooltip on hover (opens upwards) */}
                    <div className="absolute bottom-14 right-0 w-40 p-2 bg-[#0a0a0f] border border-[#1f1f3a] rounded-lg shadow-[0_0_20px_rgba(0,0,0,0.8)] text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      <p className="text-[10px] text-gray-400 font-['Rajdhani'] font-bold tracking-widest mb-1">SYSTEM CAPACITY</p>
                      <p className={`text-xl font-bold ${isCritical ? 'text-red-500 animate-pulse' : 'text-cyan-400'}`}>
                        {MAX_REQUESTS - requestsUsed} <span className="text-xs text-gray-500">/ {MAX_REQUESTS}</span>
                      </p>
                      <p className="text-[9px] text-gray-500 mt-1 uppercase">Requests per minute</p>
                      {/* Tooltip arrow pointer */}
                      <div className="absolute -bottom-2 right-4 w-4 h-4 bg-[#0a0a0f] border-b border-r border-[#1f1f3a] transform rotate-45"></div>
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
          className={`absolute top-4 -left-10 w-10 h-11 text-cyan-400 rounded-l-lg hover:bg-cyan-900/40 transition-colors flex items-center justify-center shrink-0 z-50 bg-[#06080d] border-[#2a2a4a] border-y border-l ${!isSidebarOpen ? 'border-r' : 'border-r-0'}`}
          title="Toggle History"
        >
          <svg className={`w-5 h-5 transition-transform duration-300 ${!isSidebarOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        {/* Inner wrapper that fills the vertical space */}
        <div className={`w-full flex-1 border-[#2a2a4a] bg-[#06080d] flex flex-col overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 border-l' : 'opacity-0 border-l-0'}`}>
          <div className="w-64 flex-1 flex flex-col">
            <div className="p-4 border-b border-[#2a2a4a] flex flex-col gap-3">
              <div className="flex gap-2">
                <button
                  onClick={createNewChat}
                  className="flex-1 py-2.5 px-4 bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 hover:border-cyan-400 rounded-lg text-cyan-400 font-bold tracking-wide transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center justify-center gap-2 whitespace-nowrap"
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
                  className="py-2.5 px-3 bg-[#11111f] hover:bg-[#1a1a2e] border border-[#2a2a4a] hover:border-gray-500 rounded-lg text-gray-400 font-bold transition-all flex items-center justify-center shrink-0"
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
              <p className="text-xs text-gray-500 text-center mt-6 uppercase tracking-widest font-['Rajdhani']">No previous chats</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group relative flex items-center p-3 rounded-lg cursor-pointer transition-all ${
                    isSelectMode && selectedChats.includes(session.id)
                      ? "bg-red-900/20 border border-red-500/50 text-red-300"
                      : activeSessionId === session.id && !isSelectMode
                      ? "bg-blue-900/20 border border-blue-500/30 text-blue-300"
                      : "hover:bg-white/5 text-gray-400 border border-transparent"
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
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      className="w-full bg-[#0d1117] border border-blue-500 text-sm px-2 py-1 rounded outline-none"
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
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors rounded ${openMenuId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      >
                        ⋮
                      </button>
                    )}
                  </div>

                  {/* Dropdown Menu */}
                  {openMenuId === session.id && !isSelectMode && (
                    <div className="absolute right-2 top-10 bg-[#11111f] border border-[#2a2a4a] rounded-lg shadow-xl z-50 py-1 w-28 overflow-hidden">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(session.title);
                          setEditingSessionId(session.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
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
        onPlanCreated={async (plan) => {
          const planTitle = plan?.title || "New Study Plan";
          const text = `I just created a new study plan: "${planTitle}". Please review the generated quests and let me know if we should adjust anything.`;
          
          // Optimistically add AI message to UI
          const optimisticMsg: SystemMsg = {
            id: Date.now(),
            content: text,
            type: "SYSTEM (Gemini)",
            read: true,
            createdAt: new Date().toISOString(),
            sessionId: activeSessionId || undefined,
          };
          setMessages(prev => [...prev, optimisticMsg]);
          scrollToBottom();

          // Save to backend
          try {
            const res = await fetch("/api/system-messages", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json", 
                Authorization: `Bearer ${token}` 
              },
              body: JSON.stringify({ 
                content: text, 
                type: "SYSTEM (Gemini)", 
                sessionId: activeSessionId 
              })
            });
            
            if (res.ok) {
              const data = await res.json();
              // If a new session was created because none existed
              if (data.sessionId && !activeSessionId) {
                setActiveSessionId(data.sessionId);
                fetchSessions();
              }
            }
          } catch (e) {
            console.error("Failed to save AI planner message:", e);
          }
        }}
      />
    </div>
  );
}
