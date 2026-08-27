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
import { fetchCachedJSON } from "@/lib/client-data-cache";
import { usePostgresChanges } from "@/app/hooks/usePostgresChanges";

export default function ModernChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { user, isLoading } = useAuth();
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
  const lastServerIdRef = useRef(0);

  // Auto-dismiss error toast
  useEffect(() => {
    if (errorToast) {
      const t = setTimeout(() => setErrorToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorToast]);

  /** Merge server messages in, preserving pending optimistic bubbles. */
  const mergeServerMessages = (incoming: ChatMessage[]) => {
    if (!incoming || incoming.length === 0) return;
    setMessages((prev) => {
      const pendingOptimistic = prev.filter((m) => m.isOptimistic);
      const byId = new Map<number, ChatMessage>();
      for (const m of prev) {
        if (!m.isOptimistic) byId.set(m.id, m);
      }
      for (const m of incoming) {
        byId.set(m.id, m);
        if (m.id > lastServerIdRef.current) lastServerIdRef.current = m.id;
      }
      const sorted = Array.from(byId.values()).sort((a, b) => a.id - b.id);
      return [...sorted, ...pendingOptimistic];
    });
  };

  // ─── Realtime push: new messages arrive via postgres_changes ──
  // Instead of the 1s incremental poll. Falls back to polling when
  // Realtime isn't configured or the subscription drops.
  const conversationRef = useRef<ConversationDetail | null>(null);
  conversationRef.current = conversation;

  const mergeRef = useRef(mergeServerMessages);
  mergeRef.current = mergeServerMessages;

  const { connected: pushConnected } = usePostgresChanges(
    [{ event: "INSERT", table: "Message", filter: `conversationId=eq.${conversationId}` }],
    (payload) => {
      const row = payload.new as any;
      if (!row || typeof row.id !== "number") return;
      const senderProfile = conversationRef.current?.participants?.find(
        (p) => p.id === row.senderId
      );
      const msg: ChatMessage = {
        id: row.id,
        content: row.content,
        createdAt: row.createdAt,
        senderId: row.senderId,
        sender: senderProfile
          ? {
              id: senderProfile.id,
              name: senderProfile.name,
              username: senderProfile.username,
              hunterRank: senderProfile.hunterRank,
              level: senderProfile.level,
              avatarUrl: senderProfile.avatarUrl,
              activeAvatar: senderProfile.activeAvatar,
            }
          : { id: row.senderId, name: null, username: "Unknown", hunterRank: "E" },
        isOptimistic: false,
      };
      // mergeServerMessages dedupes by id, so a message that also arrives
      // via the send-response or a poll is only rendered once.
      mergeRef.current([msg]);
    }
  );

  // Prevent outer body rubber-banding / double scrolling on mobile devices while in chat
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Full load: conversation detail + recent messages
  // (stale-while-revalidate cache → returning to a chat paints instantly)
  const fetchChat = async (silent = false, refresh = false) => {
    if (!user) return;
    try {
      const url = `/api/conversations/${conversationId}${refresh ? "?refresh=1" : ""}`;
      const data = await fetchCachedJSON<{
        conversation: ConversationDetail;
        messages: ChatMessage[];
        hasMore?: boolean;
      }>(
        url,
        {},
        { ttlMs: 3000, staleMs: 45000 }
      );
      if (data && data.conversation) {
        setConversation(data.conversation);
        // Ingest server messages (track max server id for polling)
        setMessages((prev) => {
          const pendingOptimistic = prev.filter((m) => m.isOptimistic);
          const serverMsgs: ChatMessage[] = data.messages || [];
          for (const m of serverMsgs) {
            if (m.id > lastServerIdRef.current) lastServerIdRef.current = m.id;
          }
          return [...serverMsgs, ...pendingOptimistic];
        });
      } else if (!silent) {
        router.push("/social");
      }
    } catch (err) {
      console.error("Failed to fetch chat", err);
    }
  };

  // Lightweight incremental poll — only fetches messages newer than we have.
  // No-ops until the initial full load has established the baseline id.
  const fetchNewMessages = async () => {
    if (lastServerIdRef.current === 0) return;
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages?after=${lastServerIdRef.current}`
      );
      if (res.ok) {
        const data = await res.json();
        mergeServerMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to poll messages", err);
    }
  };

  useEffect(() => {
    if (user) {
      // Initial full load, incremental poll for new messages, and a slower
      // full refresh for presence dots. With Realtime push connected the
      // polls become slow safety nets instead of the live path.
      fetchChat();
      const lightInterval = setInterval(() => fetchNewMessages(), pushConnected ? 15000 : 1000);
      const refreshInterval = setInterval(() => fetchChat(true, true), pushConnected ? 60000 : 30000);
      return () => {
        clearInterval(lightInterval);
        clearInterval(refreshInterval);
      };
    }
  }, [user?.id, conversationId, pushConnected]);

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
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error("Failed to deliver message");
      }

      const realMsg = await res.json();
      if (realMsg.id > lastServerIdRef.current) lastServerIdRef.current = realMsg.id;
      // Replace the optimistic bubble with the real message. Merge instead of
      // a direct swap so a Realtime push of the same row (arriving in either
      // order) can never render the message twice.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      mergeServerMessages([realMsg]);
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

  const handleUpdateGroupAvatar = async (avatarUrl: string | null) => {
    // Optimistically update conversation state
    setConversation((prev) => (prev ? { ...prev, avatarUrl } : prev));
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatarUrl }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.conversation?.avatarUrl !== undefined) {
          setConversation((prev) => (prev ? { ...prev, avatarUrl: data.conversation.avatarUrl } : prev));
        }
        await fetchChat(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorToast(errData.error || "Failed to update group image.");
        await fetchChat(true); // Rollback to actual server state
      }
    } catch (err) {
      setErrorToast("Network error updating group image.");
      await fetchChat(true);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
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
      <div className="fixed inset-0 z-20 md:relative md:inset-auto md:z-auto flex items-center justify-center h-full min-h-[70vh] bg-background md:bg-transparent">
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
    <div className="fixed inset-0 z-20 md:relative md:inset-auto md:z-auto flex flex-col w-full h-[100dvh] md:h-[calc(100dvh-2rem)] max-w-7xl mx-auto p-2 sm:px-6 sm:py-4 gap-2 sm:gap-3 overflow-hidden bg-background md:bg-transparent">
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
      <div className="system-card flex-1 flex flex-col min-h-0 rounded-xl sm:rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden relative">
        {/* Message Stream Container */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-3 sm:p-5 space-y-3"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
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
        onUpdateGroupAvatar={handleUpdateGroupAvatar}
      />
    </div>
  );
}
