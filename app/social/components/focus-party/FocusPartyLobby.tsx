"use client";

// ============================================================================
// FocusPartyLobby — Squad Gathering Dais & Multiplayer Study Lobby
// ============================================================================
// Visual & UX Implementation (Phase 4A)
// Inspired by party gathering concepts: friends gather on an atmospheric stage,
// chibis are prominently featured on holographic pedestals, and any scholar
// can enter focus whenever ready without arbitrary wait-for-everyone locks.
// ============================================================================

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Users,
  UserPlus,
  Play,
  LogOut,
  Trash2,
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { StreakFlameIcon } from "@/app/components/icons";
import { useFocusParty } from "./FocusPartyContext";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import { getDefaultCharacterConfig } from "@/lib/character-traits";
import { getRankBadgeStyles, formatFocusTime } from "./focus-party-utils";
import type { FocusPartyMemberView, MemberTimerView } from "@/lib/focus-party-types";

interface FocusPartyLobbyProps {
  onOpenInvite: () => void;
}

export function FocusPartyLobby({ onOpenInvite }: FocusPartyLobbyProps) {
  let router: any = null;
  try {
    router = useRouter();
  } catch {
    router = { push: () => {}, replace: () => {} };
  }

  const {
    party,
    session,
    connectionState,
    isLeader,
    isInFocus,
    collectiveSeconds,
    enterFocus,
    leaveParty,
    kickMember,
    setViewMode,
    isActionLoading,
    error,
    clearError,
  } = useFocusParty();

  const [confirmKickId, setConfirmKickId] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (!party) return null;

  const members = party.members || [];
  const memberCount = members.length;
  const maxCapacity = 4;
  const emptySlotsCount = Math.max(0, maxCapacity - memberCount);

  // Map of member timer views in current session
  const sessionMemberMap = new Map<number, MemberTimerView>(
    (session?.members || []).map((m: MemberTimerView) => [m.userId, m])
  );

  // Set of userIds currently participating in active focus session
  const activeParticipantIds = new Set(
    (session?.members || [])
      .filter((p: MemberTimerView) => p.timerState !== "LEFT")
      .map((p: MemberTimerView) => p.userId)
  );

  const handleEnterFocus = async () => {
    if (isInFocus) {
      setViewMode("room");
      if (router?.push) {
        router.push(`/focus-party/${party.party.id}/focus`);
      }
    } else {
      const res = await enterFocus();
      if (res?.success) {
        if (router?.push) {
          router.push(`/focus-party/${party.party.id}/focus`);
        }
      }
    }
  };

  const handleKickConfirm = async (memberId: number) => {
    await kickMember(memberId);
    setConfirmKickId(null);
  };

  const handleLeaveConfirm = async () => {
    await leaveParty();
    setConfirmLeave(false);
  };

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6 py-2 sm:py-4 font-['Rajdhani'] select-none">
      {/* ─── The Squad Gathering Dais (Multiplayer Stage) ───────────── */}
      <div className="relative rounded-3xl p-5 sm:p-8 bg-white dark:bg-bg-panel border border-border-subtle shadow-card dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] overflow-hidden backdrop-blur-2xl">
        {/* Stage Atmosphere: Upper Specular Light Beam */}
        <div className="absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent pointer-events-none" />

        {/* Ambient Stage Glow Behind Characters */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-accent-primary/10 blur-[100px] pointer-events-none rounded-full" />

        {/* ─── Integrated Dais Header ──────────────────────────────────── */}
        <div className="relative z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-border-subtle">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-11 h-11 rounded-2xl bg-accent-primary/10 dark:bg-accent-primary/20 border border-accent-primary/30 flex items-center justify-center text-accent-text-light shadow-inner flex-shrink-0">
              <StreakFlameIcon size={24} className="animate-pulse text-accent-primary-light" />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold tracking-widest text-accent-text-light uppercase">
                  FOCUS PARTY LOBBY
                </span>
                {connectionState === "connected" && (
                  <>
                    <span className="text-text-muted">•</span>
                    <span className="text-[11px] font-mono uppercase text-emerald-600 dark:text-emerald-400 font-bold">
                      Live Sync
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-text-primary drop-shadow-sm">
                  {party.party.name}
                </h2>
                <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full bg-accent-primary/15 border border-accent-primary/30 text-accent-text-light">
                  {memberCount} / {maxCapacity}
                </span>
              </div>
            </div>
          </div>

          {/* Secondary Lobby Controls */}
          <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-center">
            {/* Invite Friend Trigger */}
            {memberCount < maxCapacity && (
              <button
                type="button"
                data-testid="lobby-invite-btn"
                onClick={onOpenInvite}
                className="py-2.5 px-4 rounded-xl border border-border-subtle hover:border-accent-primary/50 bg-white hover:bg-slate-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-accent-text-light" />
                <span>Invite</span>
              </button>
            )}

            {/* Leave Party Trigger */}
            {!confirmLeave ? (
              <button
                type="button"
                data-testid="leave-party-btn"
                onClick={() => setConfirmLeave(true)}
                className="py-2.5 px-3 rounded-xl border border-border-subtle bg-white hover:bg-rose-500/10 dark:bg-white/[0.02] text-text-muted hover:text-rose-500 dark:hover:text-rose-400 hover:border-rose-500/30 transition-all duration-200 cursor-pointer shadow-sm"
                title="Leave Party"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 p-1 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <span className="text-[11px] font-bold text-rose-300 px-2">Leave party?</span>
                <button
                  type="button"
                  data-testid="confirm-leave-party-btn"
                  onClick={handleLeaveConfirm}
                  disabled={isActionLoading}
                  className="py-1 px-2.5 rounded-lg bg-rose-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-rose-600 transition-colors cursor-pointer"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmLeave(false)}
                  className="py-1 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-text-secondary hover:text-text-primary cursor-pointer flex items-center justify-center transition-colors"
                  aria-label="Cancel leaving party"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Error Alert Banner ────────────────────────────────────── */}
        {error && (
          <div className="system-message msg-warning relative z-20 mb-6 py-2.5 px-4 rounded-xl text-xs font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={clearError} className="text-text-muted hover:text-text-primary ml-2 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ─── Active Study Session Telemetry Banner ──────────────────── */}
        {session && (
          <div className="relative z-20 mb-6 overflow-hidden p-4 sm:p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] dark:bg-emerald-950/40 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <StreakFlameIcon size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className="text-sm sm:text-base font-bold uppercase tracking-wider text-text-primary">
                    Study Session In Progress
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold tracking-wider animate-pulse">
                    {session.members.filter((m: MemberTimerView) => m.timerState !== "LEFT").length} ACTIVE
                  </span>
                </div>
                <p className="text-xs text-text-muted font-mono mt-0.5">
                  Collective Focus:{" "}
                  <span className="text-emerald-400 font-bold tracking-wider">
                    {formatFocusTime(collectiveSeconds)}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleEnterFocus}
              className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer active:scale-[0.98]"
            >
              <span>{isInFocus ? "View Room" : "Join Session"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 4 Podiums Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative z-10">
          {/* Render Occupied Member Podiums */}
          {members.map((member: FocusPartyMemberView) => {
            const isUserInFocus = activeParticipantIds.has(member.userId);
            const isPartyLeader = member.isLeader || member.userId === party.party.leaderId;
            const isCurrentTargetKick = confirmKickId === member.userId;
            const timerView = sessionMemberMap.get(member.userId);

            return (
              <div
                key={member.userId}
                data-testid={`lobby-member-${member.userId}`}
                className={`group relative flex flex-col items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all duration-300 text-center overflow-hidden min-h-[380px] ${
                  isUserInFocus
                    ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.08] via-emerald-500/[0.02] to-transparent shadow-[0_0_25px_rgba(16,185,129,0.14)]"
                    : "border-border-subtle bg-slate-900/[0.02] dark:bg-white/[0.02] hover:border-accent-primary/40 shadow-sm hover:shadow-md"
                }`}
              >
                {/* Top Status & Role Badges */}
                <div className="w-full flex items-center justify-between gap-2 z-20">
                  {/* Leader Badge */}
                  {isPartyLeader ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                      <Crown className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400" />
                      <span>Leader</span>
                    </div>
                  ) : (
                    <div className="w-2 h-2" />
                  )}

                  {/* Activity State Badge */}
                  {isUserInFocus ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      <span>In Focus</span>
                    </div>
                  ) : (
                    <div className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/40 text-text-muted text-[10px] font-bold uppercase tracking-wider">
                      <span>In Lobby</span>
                    </div>
                  )}
                </div>

                {/* Chibi Character Stage on Dais Platform */}
                <div className="my-2 relative flex flex-col items-center justify-center min-h-[190px] w-full">
                  {/* Floating idle breath animation container */}
                  <div className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 animate-[float_4s_ease-in-out_infinite]">
                    <CharacterRenderer
                      config={(member.characterConfig as any) || getDefaultCharacterConfig(member.username || "scholar")}
                      seed={member.username || "scholar"}
                      size={140}
                      showPedestal={true}
                      showAura={isUserInFocus}
                    />
                  </div>

                  {/* Holographic energy ring / Dais grounding disk directly under pedestal */}
                  <div
                    className={`w-32 h-6 rounded-[100%] blur-sm pointer-events-none -mt-4 transition-all duration-500 ${
                      isUserInFocus
                        ? "bg-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                        : "bg-accent-primary/20 group-hover:bg-accent-primary/35 shadow-[0_0_15px_var(--accent-primary-dim)]"
                    }`}
                  />
                </div>

                {/* Player Nameplate & Details */}
                <div className="w-full flex flex-col items-center z-10">
                  <div className="flex items-center justify-center gap-2 max-w-full">
                    <h3 className="text-base sm:text-lg font-bold text-text-primary truncate tracking-wider">
                      {member.name || member.username}
                    </h3>
                    {member.hunterRank && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getRankBadgeStyles(
                          member.hunterRank
                        )}`}
                      >
                        {member.hunterRank}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted font-mono truncate mt-0.5">
                    @{member.username}
                  </p>

                  {/* Timer preview if currently focusing */}
                  {isUserInFocus && timerView && (
                    <div className="mt-2 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-bold flex items-center gap-1">
                      <StreakFlameIcon size={12} className="text-current" />
                      <span>{formatFocusTime(timerView.accumulatedSeconds)}</span>
                    </div>
                  )}

                  {/* Leader Removal Action */}
                  {isLeader && !isPartyLeader && (
                    <div className="mt-3 w-full pt-2 border-t border-border-subtle dark:border-white/[0.08] flex justify-center">
                      {!isCurrentTargetKick ? (
                        <button
                          type="button"
                          data-testid={`kick-member-${member.userId}`}
                          onClick={() => setConfirmKickId(member.userId)}
                          className="text-[11px] text-text-muted hover:text-rose-500 dark:hover:text-rose-400 flex items-center gap-1.5 transition-colors uppercase font-bold tracking-wider cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleKickConfirm(member.userId)}
                            className="px-2.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold uppercase hover:bg-rose-600 transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmKickId(null)}
                            className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Render Empty Dais Slots ("Holographic Stations") */}
          {Array.from({ length: emptySlotsCount }).map((_, idx) => (
            <div
              key={`empty-slot-${idx}`}
              data-testid={`empty-lobby-slot-${idx}`}
              onClick={onOpenInvite}
              className="group relative p-5 sm:p-6 rounded-2xl border-2 border-dashed border-border-subtle hover:border-accent-primary/50 bg-slate-900/[0.01] hover:bg-slate-900/[0.03] dark:bg-white/[0.01] dark:hover:bg-white/[0.03] transition-all duration-300 flex flex-col items-center justify-between min-h-[380px] text-center cursor-pointer"
            >
              {/* Header Label */}
              <div className="w-full flex items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted/80 group-hover:text-accent-primary-light transition-colors">
                  OPEN DAIS • Slot {memberCount + idx + 1} of {maxCapacity}
                </span>
              </div>

              {/* Holographic Projection Platform */}
              <div className="my-auto flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-white dark:bg-white/[0.04] border border-border-subtle group-hover:border-accent-primary/40 group-hover:bg-accent-primary/10 group-hover:scale-110 flex items-center justify-center text-text-muted group-hover:text-accent-primary-light transition-all duration-300 shadow-sm">
                  <UserPlus className="w-7 h-7" />
                </div>

                {/* Holographic Ground Dais Ring */}
                <div className="w-28 h-5 rounded-[100%] border border-dashed border-border-subtle group-hover:border-accent-primary/40 transition-colors duration-300" />

                <div className="mt-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-text-primary transition-colors">
                    Empty Slot
                  </p>
                  <p className="text-[11px] text-text-muted/70 font-mono">
                    Click to invite friend
                  </p>
                </div>
              </div>

              {/* Direct Invite Action Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInvite();
                }}
                className="py-2 px-3.5 rounded-xl border border-border-subtle group-hover:border-accent-primary/40 bg-white hover:bg-slate-100 dark:bg-white/[0.03] group-hover:bg-accent-primary/10 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5 text-accent-text-light" />
                <span>Invite Friend</span>
              </button>
            </div>
          ))}
        </div>

        {/* ─── 5. The Grand Launchpad ("ENTER FOCUS") ──────────────────── */}
        <div className="mt-8 pt-6 border-t border-border-subtle flex flex-col items-center justify-center gap-2.5">
          <button
            type="button"
            data-testid="enter-focus-btn"
            onClick={handleEnterFocus}
            disabled={isActionLoading}
            className="w-full sm:w-auto py-4 px-10 sm:px-14 rounded-2xl text-sm sm:text-base font-bold uppercase tracking-widest flex items-center justify-center gap-3 shadow-[0_4px_25px_var(--accent-primary-dim)] hover:shadow-[0_6px_36px_var(--accent-primary-mid)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
            style={{
              background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
              color: "#ffffff",
            }}
          >
            {isActionLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" />
            ) : (
              <Play className="w-5 h-5 fill-current text-white" />
            )}
            <span className="text-white">{isInFocus ? "Return to Room" : "Enter Focus"}</span>
          </button>

          <p className="text-[11px] text-text-secondary dark:text-text-muted font-mono tracking-wide text-center">
            Individual timers • Study at your own pace • No ready check required
          </p>
        </div>
      </div>
    </div>
  );
}

