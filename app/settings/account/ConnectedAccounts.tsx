"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { ConfirmationModal } from "../../components/ConfirmationModal";

interface ProviderConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "google",
    name: "Google",
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
      </svg>
    ),
  },
  {
    id: "github",
    name: "GitHub",
    icon: (
      <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.304 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    id: "discord",
    name: "Discord",
    icon: (
      <svg className="w-5 h-5 fill-[#5865F2]" viewBox="0 0 24 24">
        <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: (
      <svg className="w-5 h-5 fill-[#E4405F]" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
];

interface ConnectedAccountInfo {
  provider: string;
  isLinked: boolean;
  email?: string;
  username?: string;
  linkedAt?: string;
}

export default function ConnectedAccounts() {
  const { token } = useAuth();
  const [connections, setConnections] = useState<Record<string, ConnectedAccountInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    providerId: string | null;
  }>({
    isOpen: false,
    providerId: null,
  });

  const fetchConnections = useCallback(async () => {
    try {
      const storedToken = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const res = await fetch("/api/user/connections", {
        credentials: "include",
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, ConnectedAccountInfo> = {};
        if (data.connections) {
          data.connections.forEach((c: ConnectedAccountInfo) => {
            map[c.provider.toLowerCase()] = c;
          });
        }
        setConnections(map);
      }
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Check URL params for OAuth status (e.g. ?connected=github or ?error=...)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const connected = searchParams.get("connected");
      const error = searchParams.get("error");
      if (connected) {
        setSuccessMessage(`Successfully connected your ${connected.toUpperCase()} account.`);
        const url = new URL(window.location.href);
        url.searchParams.delete("connected");
        window.history.replaceState({}, "", url.toString());
        fetchConnections();
      }
      if (error) {
        setErrorMessage(decodeURIComponent(error));
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [fetchConnections]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleConnect = (providerId: string) => {
    window.location.href = `/api/auth/oauth/${providerId}`;
  };

  const handleDisconnectClick = (providerId: string) => {
    setErrorMessage(null);
    setModalState({ isOpen: true, providerId });
  };

  const handleConfirmDisconnect = async () => {
    const providerId = modalState.providerId;
    if (!providerId) return;

    setModalState({ isOpen: false, providerId: null });

    try {
      const res = await fetch(`/api/user/connections/${providerId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();
      if (res.ok) {
        await fetchConnections();
      } else {
        setErrorMessage(data.error || "Could not disconnect account.");
      }
    } catch {
      setErrorMessage("Network error while disconnecting provider.");
    }
  };

  const selectedProvider = PROVIDERS.find((p) => p.id === modalState.providerId);

  return (
    <div className="pt-2 space-y-4">
      {successMessage && (
        <div
          className="p-4 rounded border text-xs flex items-center gap-2 font-['Rajdhani'] bg-emerald-950/20 border-emerald-900/50"
          style={{ color: "var(--accent-green)" }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          className="p-4 rounded border text-xs flex items-center gap-2 font-['Rajdhani'] bg-red-950/20 border-red-900/50"
          style={{ color: "var(--accent-red)" }}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => {
          const conn = connections[provider.id];
          const isConnected = conn?.isLinked;

          const displayHandle = conn?.username
            ? `@${conn.username}`
            : conn?.email || "Connected";

          return (
            <div
              key={provider.id}
              className="p-4 border rounded flex items-center justify-between transition-colors"
              style={{
                background: "var(--bg-abyss)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center border"
                  style={{
                    background: isConnected ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.4)",
                    borderColor: isConnected ? "var(--border-active)" : "var(--border-subtle)",
                  }}
                >
                  {provider.icon}
                </div>
                <div>
                  <h4 className="font-['Rajdhani'] font-bold text-primary">{provider.name}</h4>
                  {isConnected ? (
                    <p
                      className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest mt-0.5"
                      style={{ color: "var(--accent-green)" }}
                    >
                      {displayHandle}
                    </p>
                  ) : (
                    <p
                      className="text-[0.65rem] font-['Rajdhani'] uppercase tracking-widest mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Not Connected
                    </p>
                  )}
                </div>
              </div>

              {isConnected ? (
                <button
                  type="button"
                  onClick={() => handleDisconnectClick(provider.id)}
                  className="btn-secondary !border-red-900/50 hover:!bg-red-900/20 text-danger"
                  style={{ padding: "6px 14px", fontSize: "0.75rem" }}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(provider.id)}
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: "0.75rem" }}
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, providerId: null })}
        onConfirm={handleConfirmDisconnect}
        title={`Disconnect ${selectedProvider?.name}`}
        danger={true}
        confirmText="Confirm Disconnect"
        message={
          <div className="space-y-3">
            <p className="text-gray-300 text-sm">
              Are you sure you want to disconnect your {selectedProvider?.name} account?
            </p>
            <p className="text-xs text-muted">
              If this is your only authentication method, you will need a password configured to access your system profile.
            </p>
          </div>
        }
      />
    </div>
  );
}
