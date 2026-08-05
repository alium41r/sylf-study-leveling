"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../components/AuthProvider";
import { AddFriendModal } from "../components/AddFriendModal";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Tab = "friends" | "messages" | "groups";

interface Friend {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level: number;
  todayMinutes: number;
  isOnline: boolean;
}

interface FriendRequest {
  id: number;
  sender: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
    level: number;
  };
}

interface Conversation {
  id: number;
  name: string;
  isGroup: boolean;
  hasUnread: boolean;
  participants: {
    id: number;
    name: string | null;
    username: string;
    hunterRank: string;
    isOnline: boolean;
  }[];
  lastMessage: {
    content: string;
    senderName: string;
    senderId: number;
    createdAt: string;
  } | null;
  updatedAt: string;
}

export default function SocialPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Data states
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Group creation states
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<number[]>([]);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const [friendsRes, requestsRes, convosRes] = await Promise.all([
          fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/friends/requests", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (friendsRes.ok) setFriends(await friendsRes.json());
        if (requestsRes.ok) setRequests(await requestsRes.json());
        if (convosRes.ok) setConversations(await convosRes.json());
      } catch (err) {
        console.error("Failed to fetch social data", err);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();

    // Set up polling for messages & requests every 5 seconds
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleRequestAction = async (requestId: number, action: "ACCEPT" | "REJECT") => {
    try {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        setRequests(prev => prev.filter(req => req.id !== requestId));
        if (action === "ACCEPT") {
          // Re-fetch friends
          const friendsRes = await fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } });
          if (friendsRes.ok) setFriends(await friendsRes.json());
        }
      }
    } catch (err) {
      console.error("Action failed", err);
    }
  };

  const handleMessageFriend = async (friendId: number) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ participantIds: [friendId] })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to start conversation", err);
    }
  };

  const handleCreateGroup = async () => {
    if (selectedFriends.length === 0) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          participantIds: selectedFriends,
          name: groupName || "New Group",
          isGroup: true
        })
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreateGroup(false);
        setGroupName("");
        setSelectedFriends([]);
        router.push(`/social/chat/${data.id}`);
      }
    } catch (err) {
      console.error("Failed to create group", err);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const dms = conversations.filter(c => !c.isGroup);
  const groups = conversations.filter(c => c.isGroup);

  return (
    <div className="p-8 max-w-5xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <div className="mb-8">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: "var(--accent-primary)", fontFamily: "'Rajdhani', sans-serif" }}>
            NETWORK
          </p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Social
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-2">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab("friends")}
            className={`px-4 py-2 text-sm uppercase tracking-wider font-medium transition-colors ${activeTab === "friends" ? "text-white border-b-2" : "text-gray-400 hover:text-white"}`}
            style={{ borderColor: activeTab === "friends" ? "var(--accent-primary)" : "transparent", fontFamily: "'Rajdhani', sans-serif" }}
          >
          Friends
        </button>
        <button 
          onClick={() => setActiveTab("messages")}
          className={`px-4 py-2 text-sm uppercase tracking-wider font-medium transition-colors ${activeTab === "messages" ? "text-white border-b-2" : "text-gray-400 hover:text-white"}`}
          style={{ borderColor: activeTab === "messages" ? "var(--accent-primary)" : "transparent", fontFamily: "'Rajdhani', sans-serif" }}
        >
          Messages
          {dms.some(c => c.hasUnread) && <span className="ml-2 w-2 h-2 inline-block bg-blue-500 rounded-full" />}
        </button>
        <button 
          onClick={() => setActiveTab("groups")}
          className={`px-4 py-2 text-sm uppercase tracking-wider font-medium transition-colors ${activeTab === "groups" ? "text-white border-b-2" : "text-gray-400 hover:text-white"}`}
          style={{ borderColor: activeTab === "groups" ? "var(--accent-primary)" : "transparent", fontFamily: "'Rajdhani', sans-serif" }}
        >
          Groups
          {groups.some(c => c.hasUnread) && <span className="ml-2 w-2 h-2 inline-block bg-blue-500 rounded-full" />}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {activeTab === "friends" && (
          <button onClick={() => setShowAddFriend(true)} className="btn-primary text-sm py-1.5 px-4">
            + Add Friend
          </button>
        )}
        {activeTab === "groups" && (
          <button onClick={() => setShowCreateGroup(true)} className="btn-primary text-sm py-1.5 px-4">
            + Create Group
          </button>
        )}
      </div>
    </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {/* --- FRIENDS TAB --- */}
        {activeTab === "friends" && (
          <div className="space-y-6">
            {/* Friend Requests */}
            {requests.length > 0 && (
              <div className="system-card p-4">
                <h2 className="text-sm tracking-widest text-gray-400 uppercase mb-3">Pending Requests ({requests.length})</h2>
                <div className="space-y-2">
                  {requests.map(req => (
                    <div key={req.id} className="flex items-center justify-between p-3 rounded" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center gap-3">
                        <div className={`rank-badge rank-${req.sender.hunterRank} w-8 h-8 text-xs`}>
                          {req.sender.hunterRank}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{req.sender.name || req.sender.username}</p>
                          <p className="text-xs text-gray-400">@{req.sender.username} • Lv. {req.sender.level}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleRequestAction(req.id, "ACCEPT")} className="text-xs px-3 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Accept</button>
                        <button onClick={() => handleRequestAction(req.id, "REJECT")} className="text-xs px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div className="system-card p-4 min-h-[400px]">
              <h2 className="text-sm tracking-widest text-gray-400 uppercase mb-4">All Friends ({friends.length})</h2>
              {isLoadingData && friends.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Loading friends...</p>
              ) : friends.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400 mb-4">No friends yet. Start building your network!</p>
                  <button onClick={() => setShowAddFriend(true)} className="btn-secondary">Search Scholars</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {friends.map(friend => (
                    <div key={friend.id} className={`flex items-center justify-between p-3 rounded transition-opacity ${!friend.isOnline ? 'opacity-70 hover:opacity-100' : ''}`} style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className={`rank-badge rank-${friend.hunterRank} w-10 h-10 text-sm`}>
                            {friend.hunterRank}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#050505] ${friend.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{friend.name || friend.username}</p>
                          <p className="text-xs text-gray-400">@{friend.username} • Lv. {friend.level} • {friend.todayMinutes}m study today</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => handleMessageFriend(friend.id)}
                          className="text-xs uppercase tracking-wider text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                          Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- MESSAGES TAB --- */}
        {activeTab === "messages" && (
          <div className="system-card p-4 min-h-[400px]">
            {dms.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">No messages yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {dms.map(dm => (
                  <Link href={`/social/chat/${dm.id}`} key={dm.id} className="block">
                    <div className="flex items-center justify-between p-4 rounded hover:bg-white/5 transition-colors" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-900/50 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold uppercase">
                          {dm.name.charAt(0)}
                        </div>
                        <div>
                          <p className={`font-medium ${dm.hasUnread ? 'text-white' : 'text-gray-200'}`}>
                            {dm.name}
                          </p>
                          <p className={`text-sm max-w-sm truncate ${dm.hasUnread ? 'text-blue-300 font-medium' : 'text-gray-500'}`}>
                            {dm.lastMessage ? `${dm.lastMessage.senderName}: ${dm.lastMessage.content}` : 'No messages yet'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {dm.lastMessage && (
                          <p className="text-xs text-gray-500 mb-1">
                            {new Date(dm.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {dm.hasUnread && (
                          <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- GROUPS TAB --- */}
        {activeTab === "groups" && (
          <div className="system-card p-4 min-h-[400px]">
            {groups.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400 mb-4">No groups yet.</p>
                <button onClick={() => setShowCreateGroup(true)} className="btn-secondary">Create Group</button>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(group => (
                  <Link href={`/social/chat/${group.id}`} key={group.id} className="block">
                    <div className="flex items-center justify-between p-4 rounded hover:bg-white/5 transition-colors" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent-mid flex items-center justify-center text-accent-light font-bold uppercase">
                          {group.name.charAt(0)}
                        </div>
                        <div>
                          <p className={`font-medium ${group.hasUnread ? 'text-white' : 'text-gray-200'}`}>
                            {group.name} <span className="text-xs text-gray-500 font-normal ml-2">{group.participants.length} members</span>
                          </p>
                          <p className={`text-sm max-w-sm truncate ${group.hasUnread ? 'text-blue-300 font-medium' : 'text-gray-500'}`}>
                            {group.lastMessage ? `${group.lastMessage.senderName}: ${group.lastMessage.content}` : 'No messages yet'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {group.lastMessage && (
                          <p className="text-xs text-gray-500 mb-1">
                            {new Date(group.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {group.hasUnread && (
                          <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddFriend && <AddFriendModal onClose={() => setShowAddFriend(false)} />}
      
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateGroup(false)} />
          <div className="system-card relative w-full max-w-md p-6 z-10 flex flex-col max-h-[80vh]">
            <button onClick={() => setShowCreateGroup(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}>
              CREATE GROUP
            </h2>
            
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="input-field mb-4 w-full"
            />

            <p className="text-sm text-gray-400 mb-2 uppercase tracking-wider">Select Members</p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 border border-white/10 p-2 rounded max-h-60">
              {friends.map(friend => (
                <label key={friend.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={selectedFriends.includes(friend.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedFriends(prev => [...prev, friend.id]);
                      else setSelectedFriends(prev => prev.filter(id => id !== friend.id));
                    }}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm">{friend.name || friend.username}</span>
                </label>
              ))}
              {friends.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No friends to add.</p>}
            </div>

            <button 
              onClick={handleCreateGroup}
              disabled={!groupName || selectedFriends.length === 0}
              className="btn-primary w-full disabled:opacity-50"
            >
              Create Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
