"use client";

import { useState, useEffect, useRef, use } from "react";
import { useAuth } from "../../../components/AuthProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Participant {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  isOnline: boolean;
}

interface Conversation {
  id: number;
  name: string;
  isGroup: boolean;
  createdBy: number;
  participants: Participant[];
}

interface Message {
  id: number;
  content: string;
  createdAt: string;
  senderId: number;
  sender: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
  };
}

export default function ChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const { conversationId } = use(params);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  
  // Member management
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{id: number, username: string, name: string | null}[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);

  const fetchChat = async (silent = false) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversation(data.conversation);
        setMessages(data.messages);
      } else if (!silent) {
        router.push("/social");
      }
    } catch (err) {
      console.error("Failed to fetch chat", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchChat();
      const interval = setInterval(() => fetchChat(true), 3000);
      return () => clearInterval(interval);
    }
  }, [token, conversationId]);

  useEffect(() => {
    if (messages.length > 0 && !hasInitialScrolled.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      hasInitialScrolled.current = true;
    } else if (messages.length > 0) {
      // Auto-scroll on new message if already near bottom (simplified to just scroll)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2 || !token) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // filter out people who are already in the group
          const currentMemberIds = conversation?.participants.map(p => p.id) || [];
          setSearchResults(data.filter((u: any) => !currentMemberIds.includes(u.id)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, token, conversation?.participants]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage })
      });
      if (res.ok) {
        const newMsg = await res.json();
        setMessages(prev => [...prev, newMsg]);
        setNewMessage("");
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleAddMember = async (memberId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ addMemberIds: [memberId] })
      });
      if (res.ok) {
        setSearchQuery("");
        fetchChat();
      }
    } catch (err) {
      console.error("Failed to add member", err);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (memberId === user?.id) return; // Can't remove self this way (needs leave feature)
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ removeMemberIds: [memberId] })
      });
      if (res.ok) {
        fetchChat();
      }
    } catch (err) {
      console.error("Failed to remove member", err);
    }
  };

  if (isLoading || !user || !conversation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-text-muted">Loading Chat...</p>
      </div>
    );
  }

  const onlineCount = conversation.participants.filter(p => p.isOnline).length;

  let displayName = conversation.name;
  if (!conversation.isGroup) {
    const otherParticipant = conversation.participants.find(p => p.id !== user.id);
    displayName = otherParticipant?.name || otherParticipant?.username || "Unknown";
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto p-4 sm:p-8">
      {/* Header */}
      <div className="system-card p-4 flex items-center justify-between mb-4 shrink-0 relative z-20">
        <div className="flex items-center gap-4">
          <Link href="/social" className="text-text-muted hover:text-text-primary transition-colors">
            ← Back
          </Link>
          <div>
            <h1 className="font-bold text-lg" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              {displayName}
            </h1>
            <p className="text-xs text-text-muted">
              {conversation.isGroup 
                ? `${conversation.participants.length} members • ${onlineCount} online`
                : `${conversation.participants.find(p => p.id !== user.id)?.isOnline ? 'Online' : 'Offline'}`
              }
            </p>
          </div>
        </div>
        {conversation.isGroup && (
          <button 
            onClick={() => setShowMembers(!showMembers)}
            className="text-sm px-4 py-2 rounded transition-colors"
            style={{ background: showMembers ? "var(--accent-primary-dim)" : "rgba(255,255,255,0.05)", color: "var(--text-primary)" }}
          >
            Members
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 gap-4 relative">
        {/* Main Chat Area */}
        <div className="system-card flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-text-secondary text-sm">No messages yet. Say hello!</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isMe = msg.senderId === user.id;
                const showHeader = i === 0 || messages[i - 1].senderId !== msg.senderId;
                
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {showHeader && (
                      <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <div className={`rank-badge rank-${msg.sender.hunterRank} w-6 h-6 text-[10px]`}>
                          {msg.sender.hunterRank}
                        </div>
                        <span className="text-xs text-text-muted">{msg.sender.name || msg.sender.username}</span>
                      </div>
                    )}
                    <div 
                      className={`px-4 py-2 rounded-2xl max-w-[75%] break-words text-sm ${
                        isMe 
                          ? 'bg-accent-mid text-white rounded-tr-none' 
                          : 'bg-bg-panel text-text-primary rounded-tl-none border border-border-subtle'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-text-secondary mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                className="input-field flex-1"
                disabled={isSending}
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim() || isSending}
                className="btn-primary px-6 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Group Members Panel (Slide-in or inline side panel) */}
        {conversation.isGroup && showMembers && (
          <div className="system-card w-72 shrink-0 flex flex-col min-h-0 absolute right-0 top-0 bottom-0 z-20 md:relative md:w-80 border-l border-white/5 shadow-2xl">
            <div className="p-4 border-b border-white/10">
              <h2 className="font-bold text-sm" style={{ color: "var(--accent-text-light)", fontFamily: "'Rajdhani', sans-serif" }}>
                GROUP MEMBERS
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {conversation.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-white/5 group">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={`rank-badge rank-${p.hunterRank} w-8 h-8 text-xs`}>
                        {p.hunterRank}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#050505] ${p.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.name || p.username}</p>
                    </div>
                  </div>
                  {p.id !== user.id && conversation.createdBy === user.id && (
                    <button 
                      onClick={() => handleRemoveMember(p.id)}
                      className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20">
              <h3 className="text-xs tracking-widest text-gray-400 mb-2">ADD MEMBER</h3>
              <input
                type="text"
                placeholder="Search scholar..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input-field w-full text-sm mb-2"
              />
              <div className="max-h-32 overflow-y-auto space-y-1">
                {isSearching ? (
                  <p className="text-xs text-gray-500">Searching...</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <div key={res.id} className="flex items-center justify-between p-2 rounded bg-white/5">
                      <span className="text-sm truncate pr-2">{res.name || res.username}</span>
                      <button 
                        onClick={() => handleAddMember(res.id)}
                        className="text-xs text-accent-primary hover:text-accent-primary-light whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  ))
                ) : searchQuery.length >= 2 ? (
                  <p className="text-xs text-gray-500">No results</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
