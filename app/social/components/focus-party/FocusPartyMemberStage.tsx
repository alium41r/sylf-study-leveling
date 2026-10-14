"use client";
import { TargetPixelCompanion } from "@/app/components/companion/TargetPixelCompanion";
import type { SelectedPixelCompanion } from "@/lib/pixel-companion-contract";


// ============================================================================
// FocusPartyMemberStage — Multiplayer Member Cards Reserved UI Zone
// ============================================================================
// Mechanically extracts the exact Focus Party member card UI 1:1:
//   - Preserves card dimensions (min-h-[220px] sm:min-h-[260px])
//   - Chibi character placement with active focusing aura
//   - State beacon (FOCUSING / PAUSED / NOT STARTED) and Hunter Rank badge
//   - Scholar name with (YOU) indicator and live individual timer
//   - Vacant carrel slot appearance with dashed icon and slot label
//   - ZERO dependency on background data: the stage remains stationary
//     and visually dominant in the center/upper viewport.
// ============================================================================

import React, { memo } from "react";
import { BookMarked } from "lucide-react";
import { formatFocusTime, getRankBadgeStyles } from "./focus-party-utils";

export interface FocusPartyStageParticipant {
  userId: number;
  name: string;
  username: string;
  hunterRank?: string;
  characterConfig?: unknown;
  companion?: SelectedPixelCompanion;
  avatarUrl?: string | null;
  timerState: "NOT_STARTED" | "FOCUSING" | "PAUSED" | "LEFT";
  liveSeconds: number;
  isCurrentUser: boolean;
}

interface FocusPartyMemberStageProps {
  participants: FocusPartyStageParticipant[];
  maxCapacity?: number;
}

export const FocusPartyMemberStage = memo(function FocusPartyMemberStage({
  participants,
  maxCapacity = 4,
}: FocusPartyMemberStageProps) {
  const stations: (FocusPartyStageParticipant | null)[] = Array.from(
    { length: maxCapacity },
    (_, idx) => participants[idx] || null
  );

  return (
    <section
      data-testid="focus-party-member-stage"
      aria-label="Party Study Stations"
      className="w-full max-w-6xl mx-auto px-2 sm:px-4 my-auto py-2 z-10 select-none"
    >
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        {stations.map((participant, index) => {
          if (!participant) {
            return (
              <div
                key={`party-vacant-${index}`}
                role="listitem"
                aria-label="Unoccupied study chair"
                className="relative group rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-end min-h-[220px] sm:min-h-[260px] border border-amber-900/20 bg-gradient-to-b from-[#0b0c1c]/60 via-[#121024]/70 to-[#19110a]/80 backdrop-blur-md shadow-[0_8px_25px_rgba(0,0,0,0.5)] transition-all duration-300"
              >
                <div className="my-auto flex flex-col items-center justify-center opacity-40 group-hover:opacity-60 transition-opacity">
                  <div className="w-14 h-14 rounded-full border border-dashed border-amber-500/30 bg-amber-500/5 flex items-center justify-center text-amber-200/70 mb-2 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                    <BookMarked className="w-6 h-6 stroke-[1.5]" />
                  </div>
                  <span className="text-[10px] font-mono tracking-widest text-amber-100/70 uppercase">
                    VACANT CARREL
                  </span>
                </div>

                <div className="w-full pt-3 border-t border-amber-900/40 flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500/30" />
                  <span className="text-[10px] font-mono tracking-wider text-amber-200/50 uppercase font-bold">
                    Carrel {index + 1}
                  </span>
                </div>
              </div>
            );
          }

          const isFocusing = participant.timerState === "FOCUSING";
          const isPaused = participant.timerState === "PAUSED";
          const rankStyles = getRankBadgeStyles(participant.hunterRank);

          return (
            <div
              key={`participant-station-${participant.userId}`}
              data-testid={`room-participant-${participant.userId}`}
              role="listitem"
              aria-label={`${participant.name}${participant.isCurrentUser ? ", you" : ""}, ${
                isFocusing ? "Focusing" : isPaused ? "Paused" : "Not started"
              }`}
              className={`relative rounded-3xl p-3.5 sm:p-5 flex flex-col items-center justify-between min-h-[220px] sm:min-h-[260px] border transition-all duration-500 backdrop-blur-md shadow-[0_12px_36px_rgba(0,0,0,0.6)] ${
                isFocusing
                  ? "border-emerald-500/40 bg-gradient-to-b from-[#0a1524]/85 via-[#0e1c34]/90 to-[#20150d]/95 shadow-[0_12px_40px_rgba(16,185,129,0.15)]"
                  : isPaused
                  ? "border-amber-500/30 bg-gradient-to-b from-[#141022]/85 via-[#1a132a]/90 to-[#22120a]/95"
                  : "border-white/[0.12] bg-gradient-to-b from-[#0c0d1e]/80 via-[#12142e]/85 to-[#1a100a]/90"
              }`}
            >
              {/* Desk Ambient Glow */}
              {isFocusing && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-amber-500/15 blur-[45px] pointer-events-none" />
              )}

              {/* Top: State Beacon & Rank */}
              <div className="w-full flex items-center justify-between gap-1.5 relative z-10">
                <span
                  className={`inline-flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${
                    isFocusing
                      ? "bg-emerald-500/20 border-emerald-500/45 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : isPaused
                      ? "bg-amber-500/20 border-amber-500/45 text-amber-300"
                      : "bg-white/5 border-white/10 text-text-muted"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isFocusing
                        ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                        : isPaused
                        ? "bg-amber-400"
                        : "bg-slate-500"
                    }`}
                  />
                  {isFocusing ? "FOCUSING" : isPaused ? "PAUSED" : "NOT STARTED"}
                </span>

                {participant.hunterRank && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[9px] font-bold border font-['Rajdhani'] ${rankStyles}`}
                  >
                    {participant.hunterRank}
                  </span>
                )}
              </div>

              {/* Center: Chibi Character Studying at Station */}
              <div className="relative my-auto flex flex-col items-center justify-center py-2 sm:py-3">
                <div className="relative z-10 transform sm:scale-105 transition-transform">
                  <TargetPixelCompanion companion={participant.companion} size={100} label={`${participant.username} companion`} />
                </div>

                {/* Dark Oak Desk Surface Under Chibi */}
                <div className="w-24 sm:w-32 h-2 rounded-full bg-gradient-to-r from-amber-950/20 via-[#422212] to-amber-950/20 -mt-1 border-b border-amber-500/30 shadow-[0_3px_12px_rgba(245,158,11,0.25)]" />
              </div>

              {/* Bottom: Scholar Name & Timer */}
              <div className="w-full text-center pt-2.5 border-t border-amber-900/30 relative z-10">
                <div className="text-xs sm:text-sm font-bold text-text-primary uppercase tracking-wide truncate max-w-[130px] mx-auto flex items-center justify-center gap-1">
                  <span>{participant.name}</span>
                  {participant.isCurrentUser && (
                    <span className="text-[9px] text-amber-400 font-mono font-bold">(YOU)</span>
                  )}
                </div>

                <div
                  data-testid={`participant-timer-${participant.userId}`}
                  className={`font-mono text-xs sm:text-sm font-bold mt-0.5 tracking-wider ${
                    isFocusing ? "text-emerald-400" : isPaused ? "text-amber-300" : "text-text-muted"
                  }`}
                >
                  {formatFocusTime(participant.liveSeconds)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});
