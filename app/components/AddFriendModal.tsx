"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

interface SearchResult {
  id: number;
  name: string | null;
  username: string;
  hunterRank: string;
  level: number;
  isFriend: boolean;
}

interface AddFriendModalProps {
  onClose: () => void;
}

export function AddFriendModal({ onClose }: AddFriendModalProps) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, token]);

  const handleSendRequest = async (username: string) => {
    setError("");
    try {
      const res = await fetch("/api/friends/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      });

      if (res.ok) {
        setSentRequests((prev) => new Set(prev).add(username));
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send request");
      }
    } catch {
      setError("Network error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="system-card relative w-full max-w-md p-6 z-10 flex flex-col max-h-[80vh]">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-cyan)" }}>
          ADD SCHOLAR
        </h2>

        {error && (
          <div className="system-message msg-warning mb-4 py-2 px-3 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field w-full"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
          {isSearching ? (
            <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>Searching...</p>
          ) : results.length > 0 ? (
            results.map((user) => (
              <div 
                key={user.id} 
                className="flex items-center justify-between p-3 rounded"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex items-center gap-3">
                  <div className={`rank-badge rank-${user.hunterRank} w-8 h-8 text-xs`}>
                    {user.hunterRank}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name || user.username}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      @{user.username} • Lv. {user.level}
                    </p>
                  </div>
                </div>
                
                {user.isFriend ? (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--accent-primary-dim)", color: "var(--accent-primary)" }}>
                    Friend
                  </span>
                ) : sentRequests.has(user.username) ? (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: "rgba(34, 197, 94, 0.2)", color: "var(--accent-green)" }}>
                    Request Sent ✓
                  </span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(user.username)}
                    className="text-xs px-3 py-1 rounded transition-colors"
                    style={{ 
                      background: "rgba(59, 130, 246, 0.2)", 
                      color: "var(--accent-blue)",
                      border: "1px solid rgba(59, 130, 246, 0.4)"
                    }}
                  >
                    Add
                  </button>
                )}
              </div>
            ))
          ) : query.length >= 2 ? (
            <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>No scholars found.</p>
          ) : (
            <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>Type at least 2 characters to search.</p>
          )}
        </div>
      </div>
    </div>
  );
}
