"use client";

import { useState, useEffect, useRef, use, useMemo } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { useProfileModal } from "@/app/components/ProfileModalContext";
import { useRouter } from "next/navigation";
import { ChatHeader, ConversationDetail } from "../../components/ChatHeader";
import { MessageItem, ChatMessage } from "../../components/MessageItem";
import { ChatInputBar } from "../../components/ChatInputBar";
import { ChatDetailsDrawer } from "../../components/ChatDetailsDrawer";
import { ChatEmptyState } from "../../components/ChatEmptyState";
import { AlertCircle, X } from "lucide-react";

export default function ModernChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { user, token, isLoading } = useAuth();
  const { openProfile } = useProfileModal();
  const router = useRouter();
  const { conversationId } = use(params);

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // In-Chat Search
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Smart Scrolling Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const hasInitialScrolledRef = useRef(false);
  const justSentMessageRef = useRef(false);

  // Auto-dismiss error toast
  useEffect(() => {
    if (errorToast) {
      const t = setTimeout(() => setErrorToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorToast]);

  // Fetch chat data
  const fetchChat = async (silent = false) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversation(data.conversation);
        setMessages((prev) => {
          // Keep any pending optimistic messages that haven't resolved yet
          const pendingOptimistic = prev.filter((m) => m.isOptimistic);
          const serverMsgs: ChatMessage[] = data.messages || [];
          return [...serverMsgs, ...pendingOptimistic];
        });
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

  // Track if user is near bottom of scroll window (within 100px)
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceFromBottom <= 100;
  };

  // Smart Scroll Anchoring
  useEffect(() => {
    if (messages.length === 0) return;

    if (!hasInitialScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      hasInitialScrolledRef.current = true;
    } else if (justSentMessageRef.current || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      justSentMessageRef.current = false;
    }
  }, [messages]);

  // Send Message with Optimistic Delivery
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isSending || !user) return;

    const tempId = -Date.now();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      senderId: user.id,
      sender: {
        id: user.id,
        name: user.name,
        username: user.username,
        hunterRank: user.hunterRank || "E",
        level: user.level,
        avatarUrl: user.avatarUrl,
        activeAvatar: user.activeAvatar,
      },
      isOptimistic: true,
    };

    justSentMessageRef.current = true;
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsSending(true);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error("Failed to deliver message");
      }

      const realMsg = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === tempId ? realMsg : m)));
    } catch (err: any) {
      console.error("Send message error:", err);
      // Rollback optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setErrorToast("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Edit Message with Optimistic Rollback
  const handleEditMessage = async (messageId: number, newContent: string) => {
    const prevMessages = [...messages];

    // Optimistically update
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
    );

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newContent }),
      });

      if (!res.ok) {
        throw new Error("Failed to edit message");
      }

      const updatedMsg = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMsg : m)));
    } catch (err: any) {
      console.error("Edit message error:", err);
      setMessages(prevMessages); // Rollback
      setErrorToast("Unable to edit message. Reverting changes.");
    }
  };

  // Delete Message with Optimistic Rollback
  const handleDeleteMessage = async (messageId: number) => {
    const prevMessages = [...messages];

    // Optimistically remove
    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to delete message");
      }
    } catch (err: any) {
      console.error("Delete message error:", err);
      setMessages(prevMessages); // Rollback
      setErrorToast("Unable to delete message. Reverting.");
    }
  };

  // Group Management Actions
  const handleAddMember = async (memberId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addMemberIds: [memberId] }),
      });
      if (res.ok) {
        fetchChat(true);
      } else {
        setErrorToast("Failed to add member to group.");
      }
    } catch (err) {
      setErrorToast("Network error adding member.");
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ removeMemberIds: [memberId] }),
      });
      if (res.ok) {
        fetchChat(true);
      } else {
        setErrorToast("Failed to remove member.");
      }
    } catch (err) {
      setErrorToast("Network error removing member.");
    }
  };

  const handleUpdateGroupName = async (name: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        fetchChat(true);
      } else {
        setErrorToast("Failed to rename group.");
      }
    } catch (err) {
      setErrorToast("Network error renaming group.");
    }
  };

  const handleLeaveGroup = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ removeMemberIds: [user.id] }),
      });
      if (res.ok) {
        router.push("/social");
      } else {
        setErrorToast("Failed to leave group.");
      }
    } catch (err) {
      setErrorToast("Network error leaving group.");
    }
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  if (isLoading || !user || !conversation) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-xs font-['Rajdhani'] uppercase tracking-widest text-text-muted">
            Initializing Encrypted Frequency...
          </p>
        </div>
      </div>
    );
  }

  const otherParticipant = !conversation.isGroup
    ? conversation.participants.find((p) => p.id !== user.id)
    : null;

  const displayName = conversation.isGroup
    ? conversation.name || "Group Chat"
    : otherParticipant?.name || otherParticipant?.username || "Scholar";

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-5xl mx-auto p-2 sm:p-6 gap-3 relative">
      {/* Floating Error Toast */}
      {errorToast && (
        <div className="fixed top-4 right-4 z-50 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs font-['Rajdhani'] flex items-center gap-2 shadow-2xl backdrop-blur-md animate-fade-in-down">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            className="p-1 hover:text-white ml-2 text-rose-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Interactive Chat Header ───────────────────────────── */}
      <ChatHeader
        conversation={conversation}
        currentUserId={user.id}
        onOpenDetails={() => setShowDetails(true)}
        isSearchOpen={isSearchOpen}
        onToggleSearch={() => {
          setIsSearchOpen((prev) => !prev);
          if (isSearchOpen) setSearchQuery("");
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* ─── Main Chat Viewport ────────────────────────────────── */}
      <div className="system-card flex-1 flex flex-col min-h-0 rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden relative">
        {/* Message Stream Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 space-y-3"
        >
          {filteredMessages.length === 0 ? (
            searchQuery ? (
              <div className="h-full flex items-center justify-center text-center p-8">
                <p className="text-xs font-['Rajdhani'] text-text-muted">
                  No messages matched &ldquo;{searchQuery}&rdquo;.
                </p>
              </div>
            ) : (
              <ChatEmptyState
                isGroup={conversation.isGroup}
                displayName={displayName}
                onSelectPrompt={handleSendMessage}
              />
            )
          ) : (
            filteredMessages.map((msg, idx) => {
              const isMe = msg.senderId === user.id;
              const prevMsg = idx > 0 ? filteredMessages[idx - 1] : null;
              
              // Group consecutive messages from same sender within 5 minutes
              const isSameSenderAsPrev = prevMsg?.senderId === msg.senderId;
              const timeDiff = prevMsg
                ? Math.abs(new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime())
                : Infinity;
              const showHeader = !isSameSenderAsPrev || timeDiff > 5 * 60 * 1000;

              return (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  isMe={isMe}
                  showHeader={showHeader}
                  isGroup={conversation.isGroup}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onOpenProfile={openProfile}
                />
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── Modern Input Bar & Emoji Picker ───────────────────── */}
        <ChatInputBar onSendMessage={handleSendMessage} isSending={isSending} />
      </div>

      {/* ─── Instagram / Telegram Style Details Drawer ─────────── */}
      <ChatDetailsDrawer
        conversation={conversation}
        currentUserId={user.id}
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
        onLeaveGroup={handleLeaveGroup}
        onUpdateGroupName={handleUpdateGroupName}
        token={token}
      />
    </div>
  );
}
