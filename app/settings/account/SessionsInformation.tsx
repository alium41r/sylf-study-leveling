"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";
import { useAuth } from "../../components/AuthProvider";
import { useRouter } from "next/navigation";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import { getAccountCapability } from "./services/account-capability";
import { Laptop, Smartphone, Globe, Monitor, AlertCircle } from "lucide-react";

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

function getDeviceIcon(device: string, platform: string) {
  const d = (device + " " + platform).toLowerCase();
  if (d.includes("iphone") || d.includes("android") || d.includes("mobile")) {
    return <Smartphone className="w-5 h-5 text-[var(--accent)]" />;
  }
  if (d.includes("mac") || d.includes("windows") || d.includes("linux") || d.includes("laptop")) {
    return <Laptop className="w-5 h-5 text-[var(--accent)]" />;
  }
  if (d.includes("desktop") || d.includes("pc")) {
    return <Monitor className="w-5 h-5 text-[var(--accent)]" />;
  }
  return <Globe className="w-5 h-5 text-[var(--accent)]" />;
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
      const result = await getAccountCapability().revokeSession(modalState.sessionId);

      if (result.ok) {
        if (result.data?.isCurrent) {
          await logout();
          router.push("/login");
          return;
        }
        setSessions((prev) => prev.filter((s) => s.id !== modalState.sessionId));
        setModalState({ isOpen: false, sessionId: null });
      } else {
        alert(result.error || "Failed to revoke session");
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
      <div className="py-8 text-center text-xs font-['Rajdhani'] font-bold text-[var(--muted)] uppercase tracking-wider animate-pulse">
        Loading active sessions...
      </div>
    );
  }

  return (
    <div className="pt-1 space-y-4">
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-['Rajdhani'] font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <SettingsRowGroup>
        {sessions.map((session) => (
          <SettingsRow
            key={session.id}
            icon={
              <div className="w-10 h-10 rounded-xl bg-[var(--chip-bg)] border border-[var(--sub-border)] flex items-center justify-center shrink-0">
                {getDeviceIcon(session.device, session.platform)}
              </div>
            }
            label={
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-['Rajdhani'] font-bold text-sm text-[var(--ink)]">
                  {session.device}
                </span>
                {session.isCurrent && (
                  <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 uppercase tracking-widest border border-emerald-500/30 font-mono font-bold">
                    Current Device
                  </span>
                )}
              </div>
            }
            description={
              <div className="space-y-0.5">
                <p className="truncate text-xs text-[var(--muted)]">
                  {session.platform} • {session.location}
                </p>
                <p className="text-[11px] font-['Rajdhani'] uppercase tracking-wider text-[var(--quiet)] truncate">
                  Last Active:{" "}
                  <span className={session.isCurrent ? "text-emerald-500 font-bold" : "text-[var(--ink)]"}>
                    {session.lastActive}
                  </span>
                </p>
              </div>
            }
          >
            {!session.isCurrent && (
              <button
                type="button"
                onClick={() => handleRevoke(session.id)}
                className="px-3.5 py-1.5 rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white"
              >
                Revoke
              </button>
            )}
          </SettingsRow>
        ))}

        {sessions.length === 0 && !isLoading && (
          <div className="py-6 text-center text-[var(--muted)] text-xs font-['Rajdhani']">
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
          <div className="space-y-3">
            <p className="text-[var(--ink)] text-sm">
              Are you sure you want to sign out of this device? It will be disconnected immediately and require logging in again.
            </p>
          </div>
        }
      />
    </div>
  );
}
