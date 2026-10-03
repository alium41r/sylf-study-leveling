"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";

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
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
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
  }, [query]);

  const handleSendRequest = async (username: string) => {
    setError("");
    try {
      const res = await fetch("/api/friends/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    <motion.div
      key="add-friend-modal-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <motion.div
        variants={backdropVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        variants={modalDialogVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="system-card relative w-full max-w-md p-6 z-10 flex flex-col max-h-[80vh] shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary transition-colors"
        >
          ✕
        </button>

        <h2
          className="text-xl font-bold mb-4 font-['Rajdhani'] uppercase tracking-wide text-accent-text-light"
        >
          ADD FRIEND
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
            className="input-field w-full text-xs font-['Rajdhani']"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px] custom-scrollbar">
          {isSearching ? (
            <p className="text-center text-sm font-['Rajdhani'] text-text-muted">
              Searching...
            </p>
          ) : results.length > 0 ? (
            results.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/[0.04] bg-bg-panel border border-border-subtle"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-accent-primary-dim/30 border border-accent-primary-mid/40 text-[10px] font-mono font-bold text-accent-text-light">
                    Rank {user.hunterRank}
                  </span>
                  <div>
                    <p className="text-sm font-bold font-['Rajdhani'] text-text-primary">{user.name || user.username}</p>
                    <p className="text-xs font-mono text-text-muted">
                      @{user.username} • Lv. {user.level}
                    </p>
                  </div>
                </div>

                {user.isFriend ? (
                  <span
                    className="text-xs px-2.5 py-1 rounded-lg font-['Rajdhani'] font-bold uppercase tracking-wider bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid"
                  >
                    Friend
                  </span>
                ) : sentRequests.has(user.username) ? (
                  <span
                    className="text-xs px-2.5 py-1 rounded-lg font-['Rajdhani'] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  >
                    Request Sent ✓
                  </span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(user.username)}
                    className="btn-primary text-xs px-3 py-1 rounded-lg font-['Rajdhani'] font-bold uppercase tracking-wider"
                    style={{
                      background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                      border: "none",
                      color: "var(--text-primary)",
                    }}
                  >
                    Add
                  </button>
                )}
              </motion.div>
            ))
          ) : query.length >= 2 ? (
            <p className="text-center text-sm font-['Rajdhani'] text-text-muted">
              No users found.
            </p>
          ) : (
            <p className="text-center text-sm font-['Rajdhani'] text-text-muted">
              Type at least 2 characters to search.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
