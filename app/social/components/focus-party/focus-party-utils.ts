import type { FocusTimerState } from "@/lib/focus-party-types";

/**
 * Formats total seconds into MM:SS (or HH:MM:SS if >= 1 hour).
 */
export function formatFocusTime(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Returns Sylf theme badge styles for Hunter Rank.
 */
export function getRankBadgeStyles(rank?: string | null): string {
  switch (rank?.toUpperCase()) {
    case "S":
      return "border-rose-500/50 text-rose-400 bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.25)]";
    case "A":
      return "border-amber-500/50 text-amber-400 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
    case "B":
      return "border-purple-500/50 text-purple-300 bg-purple-500/10";
    case "C":
      return "border-sky-500/50 text-sky-300 bg-sky-500/10";
    case "D":
      return "border-emerald-500/50 text-emerald-300 bg-emerald-500/10";
    default:
      return "border-slate-500/40 text-slate-300 bg-slate-500/10";
  }
}

/**
 * Returns badge styling for focus timer state.
 */
export function getTimerStateBadgeStyles(state: FocusTimerState): {
  badgeClass: string;
  label: string;
  dotClass: string;
} {
  switch (state) {
    case "FOCUSING":
      return {
        badgeClass: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
        label: "FOCUSING",
        dotClass: "bg-emerald-400 animate-pulse",
      };
    case "PAUSED":
      return {
        badgeClass: "border-amber-500/40 text-amber-300 bg-amber-500/10",
        label: "PAUSED",
        dotClass: "bg-amber-400",
      };
    case "LEFT":
      return {
        badgeClass: "border-slate-500/30 text-slate-400 bg-slate-500/10",
        label: "LEFT",
        dotClass: "bg-slate-500",
      };
    case "NOT_STARTED":
    default:
      return {
        badgeClass: "border-slate-600/30 text-slate-300 bg-slate-800/40",
        label: "NOT STARTED",
        dotClass: "bg-slate-400",
      };
  }
}
