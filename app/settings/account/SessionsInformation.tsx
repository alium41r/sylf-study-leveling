"use client";

import React, { useState } from "react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { SettingsRowGroup } from "../../components/SettingsRowGroup";
import { SettingsRow } from "../../components/SettingsRow";

export default function SessionsInformation() {
  const [modalState, setModalState] = useState<{ isOpen: boolean; sessionId: string | null }>({
    isOpen: false,
    sessionId: null
  });

  const sessions = [
    {
      id: "current",
      device: "MacBook Pro",
      platform: "macOS • Chrome",
      location: "Islamabad, PK",
      lastActive: "Active Now",
      isCurrent: true,
      icon: "💻"
    },
    {
      id: "device_2",
      device: "iPhone 15",
      platform: "iOS • Safari",
      location: "Islamabad, PK",
      lastActive: "2 hours ago",
      isCurrent: false,
      icon: "📱"
    },
    {
      id: "device_3",
      device: "Windows Desktop",
      platform: "Windows 11 • Edge",
      location: "Lahore, PK",
      lastActive: "Yesterday",
      isCurrent: false,
      icon: "🖥️"
    }
  ];

  const handleRevoke = (id: string) => {
    setModalState({ isOpen: true, sessionId: id });
  };

  const confirmRevoke = () => {
    // Placeholder for API integration
    console.log(`Revoked session: ${modalState.sessionId}`);
    setModalState({ isOpen: false, sessionId: null });
  };

  return (
    <div className="pt-2 space-y-4">
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
                  <span className="text-[0.6rem] px-2 py-0.5 rounded bg-accent-green/20 text-accent-green uppercase tracking-widest border border-accent-green/30 shrink-0">Current</span>
                )}
              </>
            }
            description={
              <>
                <p className="truncate">{session.platform} • {session.location}</p>
                <p className="text-[0.65rem] font-rajdhani uppercase tracking-widest mt-1 truncate">
                  Last Active: <span className={session.isCurrent ? "text-accent-green" : "text-primary"}>{session.lastActive}</span>
                </p>
              </>
            }
          >
            {!session.isCurrent && (
              <button 
                onClick={() => handleRevoke(session.id)}
                className="btn-secondary !border-red-900/50 hover:!bg-red-900/20 hover:!border-red-500/50 text-danger"
                style={{ padding: "6px 16px", fontSize: "0.75rem" }}
              >
                Revoke
              </button>
            )}
          </SettingsRow>
        ))}
      </SettingsRowGroup>

      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, sessionId: null })}
        onConfirm={confirmRevoke}
        title="Revoke Session"
        danger={true}
        confirmText="Revoke"
        message={
          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to sign out of this device? It will be disconnected immediately and any unsaved progress may be lost.
            </p>
            <div className="p-3 bg-black/40 border border-white/10 rounded text-center italic text-xs text-accent-primary-light">
              <span className="opacity-70">Session management coming soon...</span>
            </div>
          </div>
        }
      />
    </div>
  );
}
