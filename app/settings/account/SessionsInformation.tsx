"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { useAuth } from "../../components/AuthProvider";
import { useRouter } from "next/navigation";
import { fetchCachedJSON } from "@/lib/client-data-cache";

interface SessionItem {
  id: string;
  device: string;
  platform: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
  icon: string;
  createdAt: string;
}

export default function SessionsInformation() {
  const { logout } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalState, setModalState] = useState<{ isOpen: boolean; sessionId: string | null }>({
    isOpen: false,
    sessionId: null,
  });

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Stale-while-revalidate: reopening account paints instantly.
      const data = await fetchCachedJSON<{ sessions?: SessionItem[]; error?: string }>(
        "/api/user/sessions",
        { credentials: "include" },
        { ttlMs: 20_000, staleMs: 120_000 }
      );
      if (data && !data.error) {
        setSessions(data.sessions || []);
      } else {
        setError(data?.error || "Failed to load sessions");
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
      setError("Unable to connect to session registry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = (id: string) => {
    setModalState({ isOpen: true, sessionId: id });
  };

  const confirmRevoke = async () => {
    if (!modalState.sessionId) return;
    setIsRevoking(true);
    try {
      const res = await fetch("/api/user/sessions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ sessionId: modalState.sessionId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.isCurrent) {
          await logout();
          router.push("/login");
          return;
        }
        // Remove revoked session from list
        setSessions((prev) => prev.filter((s) => s.id !== modalState.sessionId));
        setModalState({ isOpen: false, sessionId: null });
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to revoke session");
      }
    } catch (err) {
      console.error("Failed to revoke session:", err);
      alert("Failed to revoke session. Please try again.");
    } finally {
      setIsRevoking(false);
    }
  };

  if (isLoading && sessions.length === 0) {
    return (
      <div className="py-8 text-center text-xs font-['Rajdhani'] font-bold text-text-muted uppercase tracking-wider animate-pulse">
        Loading active sessions...
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-['Rajdhani']">
          {error}
        </div>
      )}

      <SettingsRowGroup>
        {sessions.map((session) => (
          <SettingsRow
            key={session.id}
            icon={
              <div className="w-12 h-12 rounded bg-black/40 border border-white/5 flex items-center justify-center text-2xl">
                {session.icon}
              </div>
            }
            label={
              <>
                {session.device}
                {session.isCurrent && (
                  <span className="text-[0.6rem] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-widest border border-emerald-500/30 shrink-0 font-mono font-bold">
                    Current
                  </span>
                )}
              </>
            }
            description={
              <>
                <p className="truncate text-text-secondary">{session.platform} • {session.location}</p>
                <p className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest mt-1 truncate">
                  Last Active:{" "}
                  <span className={session.isCurrent ? "text-emerald-400 font-bold" : "text-text-primary"}>
                    {session.lastActive}
                  </span>
                </p>
              </>
            }
          >
            {!session.isCurrent && (
              <button
                type="button"
                onClick={() => handleRevoke(session.id)}
                className="btn-secondary !border-rose-900/50 hover:!bg-rose-900/20 hover:!border-rose-500/50 text-rose-400 text-xs px-3.5 py-1.5 rounded-lg transition-all"
                style={{ fontSize: "0.75rem" }}
              >
                Revoke
              </button>
            )}
          </SettingsRow>
        ))}

        {sessions.length === 0 && !isLoading && (
          <div className="py-6 text-center text-text-muted text-xs font-['Rajdhani']">
            No active sessions found.
          </div>
        )}
      </SettingsRowGroup>

      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, sessionId: null })}
        onConfirm={confirmRevoke}
        title="Revoke Session"
        danger={true}
        confirmText={isRevoking ? "Revoking..." : "Revoke"}
        message={
          <div className="space-y-4">
            <p className="text-gray-300 text-sm">
              Are you sure you want to sign out of this device? It will be disconnected immediately and require logging in again.
            </p>
          </div>
        }
      />
    </div>
  );
}
