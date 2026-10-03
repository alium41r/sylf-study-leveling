"use client";

// ============================================================================
// FocusPartySection — Main Orchestrator for Focus Party on Social Page
// ============================================================================
// Coordinates the major Focus Party states:
//   A. No active party (FocusPartyEmptyState)
//   B. Party lobby (FocusPartyLobby)
//   C. Party lobby with active session
//   D. User inside Focus room (FocusPartyRoom)
//   E. Loading & Reconnecting states
//   F. Error states with safe retry
// ============================================================================

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFocusParty } from "./FocusPartyContext";
import { FocusPartyEmptyState } from "./FocusPartyEmptyState";
import { FocusPartyLobby } from "./FocusPartyLobby";
import { FocusPartyInviteModal } from "./FocusPartyInviteModal";
import { Loader2 } from "lucide-react";

interface FriendItem {
  id: number;
  name: string | null;
  username: string;
  hunterRank?: string;
  level?: number;
  characterConfig?: any;
  avatarUrl?: string | null;
}

interface FocusPartySectionProps {
  friends?: FriendItem[];
}

export function FocusPartySection({ friends = [] }: FocusPartySectionProps) {
  let router: any = null;
  try {
    router = useRouter();
  } catch {
    router = { push: () => {}, replace: () => {} };
  }

  const {
    party,
    hasActiveParty,
    viewMode,
    isLoading,
  } = useFocusParty();

  const [showInviteModal, setShowInviteModal] = useState(false);

  // If user enters focus or viewMode becomes "room", forward them to the dedicated focus room
  useEffect(() => {
    if (viewMode === "room" && party?.party?.id && router?.push) {
      router.push(`/focus-party/${party.party.id}/focus`);
    }
  }, [viewMode, party, router]);

  // ─── 1. Loading State ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        data-testid="focus-party-loading"
        className="flex flex-col items-center justify-center min-h-[360px] p-8 text-center font-['Rajdhani']"
      >
        <Loader2 className="w-8 h-8 text-accent-text-light animate-spin mb-3" />
        <p className="text-xs uppercase tracking-widest text-text-muted font-bold">
          Synchronizing Focus Party...
        </p>
      </div>
    );
  }

  return (
    <div data-testid="focus-party-section" className="w-full flex flex-col min-h-[400px]">
      {/* ─── State Orchestration ────────────────────────────────────── */}
      {!hasActiveParty ? (
        <FocusPartyEmptyState />
      ) : (
        <FocusPartyLobby onOpenInvite={() => setShowInviteModal(true)} />
      )}

      {/* ─── Invite Modal ───────────────────────────────────────────── */}
      {showInviteModal && (
        <FocusPartyInviteModal
          friends={friends}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}

