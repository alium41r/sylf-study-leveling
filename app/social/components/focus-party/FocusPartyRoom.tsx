"use client";

// ============================================================================
// FocusPartyRoom — Dedicated Focus Room (Unified Background & Timer Architecture)
// ============================================================================
// Unifies the Focus Party Focus Room with the authoritative Solo Focus
// Background & Preference system:
//   1. Shared Background Engine: FocusBackgroundRenderer renders the active
//      environment wallpaper (Classic gradient, official image with focal crop,
//      or signed custom background).
//   2. Personal Viewers: Each member client renders its own saved preference.
//      Leader preference is never forced; party realtime state is unaffected.
//   3. Reserved Member Stage: FocusPartyMemberStage displays the 4 member cards
//      and vacant slots 1:1, stationary and unaffected by background focal point.
//   4. Party-Safe Timer Router: FocusPartyTimerLayoutRouter renders Classic,
//      Anime, Landscape, or Fantasy timer styling strictly in the lower dock,
//      guaranteeing zero obstruction of the member cards.
//   5. Shared Picker: Directly reuses FocusBackgroundPicker to view/select
//      Classic, Anime, Landscape, Fantasy, and My Backgrounds.
// ============================================================================

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LogOut,
  Loader2,
  AlertCircle,
  X,
  CheckCircle2,
  Compass,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFocusParty } from "./FocusPartyContext";
import { formatFocusTime } from "./focus-party-utils";
import { useAuth } from "@/app/components/AuthProvider";
import type { MemberTimerView, FocusPartyMemberView } from "@/lib/focus-party-types";
import { useFocusBackground } from "@/app/focus/hooks/useFocusBackground";
import { FocusBackgroundRenderer } from "@/app/focus/components/FocusBackgroundRenderer";
import FocusBackgroundPicker from "@/app/focus/components/FocusBackgroundPicker";
import {
  FocusPartyMemberStage,
  FocusPartyStageParticipant,
} from "./FocusPartyMemberStage";
import { FocusPartyTimerLayoutRouter } from "./FocusPartyTimerLayoutRouter";

export function FocusPartyRoom() {
  let router: any = null;
  try {
    router = useRouter();
  } catch {
    router = { push: () => {}, replace: () => {}, back: () => {} };
  }

  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const {
    party,
    session,
    timerViews,
    collectiveSeconds,
    myTimerState,
    myLiveSeconds,
    startTimer,
    pauseTimer,
    resumeTimer,
    leaveFocus,
    setViewMode,
    isActionLoading,
    error,
    clearError,
    isLoading,
    connectionState,
  } = useFocusParty();

  // ─── Shared Focus Background Engine ─────────────────────────────────────────
  const focusBg = useFocusBackground();

  const [sessionEndingMessage, setSessionEndingMessage] = useState<string | null>(null);

  // ─── 1. Session Ending & Navigation Safety Watcher ───────────────────────────
  useEffect(() => {
    // If party disbanded or session ended while in room
    if (!isLoading && party && !session && !sessionEndingMessage) {
      setSessionEndingMessage("Study session concluded. Returning to lobby...");
      const t = setTimeout(() => {
        setViewMode("lobby");
        if (router?.push) {
          router.push("/social?tab=party");
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isLoading, party, session, sessionEndingMessage, router, setViewMode]);

  if (!party || !session) {
    if (sessionEndingMessage) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-bg-void dark:bg-bg-abyss text-center font-['Rajdhani']">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold uppercase tracking-wider text-text-primary mb-1">
            Session Ended
          </h3>
          <p className="text-sm text-text-muted font-mono">{sessionEndingMessage}</p>
        </div>
      );
    }
    return (
      <div
        data-testid="focus-room-loading"
        className="min-h-[400px] w-full flex flex-col items-center justify-center p-8 text-center font-['Rajdhani']"
      >
        <Loader2 className="w-8 h-8 text-accent-primary-light animate-spin mb-3" />
        <p className="text-xs uppercase tracking-widest text-text-muted font-bold">
          Connecting to Study Room...
        </p>
      </div>
    );
  }

  const partyMembers = party.members || [];
  const memberMap = new Map<number, FocusPartyMemberView>(
    partyMembers.map((m) => [m.userId, m])
  );

  const sessionMembers = session.members || [];
  // Actively participating in current session
  const activeParticipants = sessionMembers.filter(
    (p: MemberTimerView) => p.timerState !== "LEFT"
  );

  // ─── 2. Timer Action Handler (Single Primary Action) ────────────────────────
  const handleTimerAction = async () => {
    if (myTimerState === "NOT_STARTED") {
      await startTimer();
    } else if (myTimerState === "FOCUSING") {
      await pauseTimer();
    } else if (myTimerState === "PAUSED") {
      await resumeTimer();
    }
  };

  // Back to Lobby: Keeps session active, user remains in study room
  const handleBackToLobby = () => {
    setViewMode("lobby");
    if (router?.push) {
      router.push("/social?tab=party");
    }
  };

  // Leave Focus: Banks study time and exits session
  const handleConfirmLeaveFocus = async () => {
    const res = await leaveFocus();
    if (res?.success) {
      setViewMode("lobby");
      if (router?.push) {
        router.push("/social?tab=party");
      }
    }
  };

  // ─── 3. Normalized Participants for Presentational Stage ───────────────────
  const normalizedParticipants: FocusPartyStageParticipant[] = activeParticipants.map(
    (p) => {
      const profile = memberMap.get(p.userId);
      const liveSeconds = timerViews[p.userId]?.liveSeconds ?? p.accumulatedSeconds ?? 0;
      const state = timerViews[p.userId]?.timerState ?? p.timerState;
      return {
        userId: p.userId,
        name: profile?.name || profile?.username || `Scholar #${p.userId}`,
        username: profile?.username || `user_${p.userId}`,
        hunterRank: profile?.hunterRank,
        characterConfig: profile?.characterConfig,
        avatarUrl: profile?.avatarUrl,
        timerState: state,
        liveSeconds,
        isCurrentUser: p.userId === currentUserId,
      };
    }
  );

  const activeEnvName = focusBg.isClassic
    ? "Classic Sylf"
    : focusBg.activeBackground?.name || "Environment";

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between font-['Rajdhani'] select-none overflow-x-hidden isolate">
      {/* ─── 0. Unified Focus Background Wallpaper (z-0) ────────────────── */}
      <FocusBackgroundRenderer
        activeBackground={focusBg.activeBackground}
        isClassic={focusBg.isClassic}
        phase={myTimerState === "PAUSED" ? "short-break" : "focus"}
        layoutKey={focusBg.layoutKey}
        onImageError={focusBg.onImageDeliveryError}
      />

      {/* ─── 1. Lightweight Minimal Header Bar (z-30) ────────────────────── */}
      <header className="w-full px-4 sm:px-6 py-2.5 border-b border-border-subtle bg-white/95 dark:bg-bg-panel/95 backdrop-blur-md relative z-30 flex items-center justify-between min-h-[54px] shadow-sm">
        {/* Left: Quiet Navigation Back to Lobby */}
        <div className="flex items-center z-10">
          <button
            type="button"
            data-testid="back-to-lobby-btn"
            aria-label="Back to Lobby"
            onClick={handleBackToLobby}
            className="flex items-center gap-1.5 py-1.5 px-3 sm:px-3.5 rounded-xl border border-border-subtle dark:border-white/10 hover:border-text-secondary/40 bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.08] text-text-muted hover:text-text-primary text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            title="Return to Party Lobby (Timer & session keep running in background)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lobby</span>
          </button>
        </div>

        {/* Center: Perfectly Centered Room Title + Solidarity Counter */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex flex-col items-center text-center pointer-events-none max-w-[50%] sm:max-w-[60%]">
          <div className="flex items-center gap-2">
            {connectionState === "connected" && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
            )}
            <h1 className="text-xs sm:text-sm font-bold tracking-wider text-text-primary uppercase truncate max-w-[140px] sm:max-w-xs">
              {party.party.name}
            </h1>
            <span className="text-text-muted/60 text-xs hidden sm:inline">•</span>
            <span className="text-[11px] font-mono font-bold tracking-widest text-accent-text-light uppercase hidden sm:inline">
              FOCUS ROOM
            </span>
            <span className="sr-only">ACTIVE FOCUS ROOM</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted mt-0.5">
            <span className="text-text-secondary">{activeParticipants.length} STUDYING</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <span>Together</span>
              <span
                data-testid="collective-focus-timer"
                className="text-emerald-400 font-bold tracking-wider"
              >
                {formatFocusTime(collectiveSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Shared Focus Environment Selector + Leave Focus */}
        <div className="flex items-center gap-2 z-10">
          <button
            type="button"
            data-testid="env-selector-btn"
            aria-label={`Change study environment, current: ${activeEnvName}`}
            onClick={focusBg.openPicker}
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl border border-border-subtle dark:border-white/10 hover:border-text-secondary/40 bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.08] text-text-secondary hover:text-text-primary text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Change Study Environment"
          >
            <Compass className="w-3.5 h-3.5 text-accent-light" />
            <span className="hidden md:inline">{activeEnvName}</span>
          </button>

          <button
            type="button"
            data-testid="leave-focus-room-btn"
            aria-label="Leave Focus"
            onClick={handleConfirmLeaveFocus}
            disabled={isActionLoading}
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Bank study time and exit focus session"
          >
            {isActionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Leave Focus</span>
          </button>
        </div>
      </header>

      {/* ─── Error Notification ─────────────────────────────────────────── */}
      <AnimatePresence>
        {(error || focusBg.loadError || focusBg.syncError) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 sm:mx-6 my-2 py-2 px-4 rounded-xl border border-rose-500/30 bg-rose-950/50 text-rose-300 text-xs font-mono flex items-center justify-between z-30"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error || focusBg.loadError || focusBg.syncError}</span>
            </div>
            <button
              onClick={() => {
                clearError();
                focusBg.clearLoadError();
                focusBg.clearSyncError();
              }}
              className="text-text-muted hover:text-text-primary ml-2 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. Main Stage: Reserved Member Card Zone + Lower Timer Dock ── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-col justify-between items-center z-10">
        {/* Reserved Member Card Stage: Stationary center/upper viewport */}
        <FocusPartyMemberStage
          participants={normalizedParticipants}
          maxCapacity={4}
        />

        {/* Party-Safe Timer Presentation Router: strictly docked below member cards */}
        <FocusPartyTimerLayoutRouter
          myTimerState={myTimerState}
          myLiveSeconds={myLiveSeconds}
          isActionLoading={isActionLoading}
          onAction={handleTimerAction}
          layoutKey={focusBg.layoutKey}
          background={
            focusBg.activeSource === "custom"
              ? (focusBg.activeCustomBackground as any)
              : focusBg.activeBackground
          }
        />
      </main>

      {/* ─── 3. Shared Focus Background Picker Modal ────────────────────── */}
      <FocusBackgroundPicker
        isOpen={focusBg.isPickerOpen}
        onClose={focusBg.closePicker}
        catalog={focusBg.catalog}
        activeCategory={focusBg.activeCategory}
        activeBackground={focusBg.activeBackground}
        isClassic={focusBg.isClassic}
        isPreloadingImage={focusBg.isPreloadingImage}
        loadError={focusBg.loadError || focusBg.syncError}
        onSelectBackground={focusBg.selectBackground}
        userCustomBackgrounds={focusBg.customBackgrounds}
        activeSource={focusBg.activeSource}
        activeCustomBackground={focusBg.activeCustomBackground}
        onSelectCustomBackground={focusBg.selectCustomBackground}
      />
    </div>
  );
}
