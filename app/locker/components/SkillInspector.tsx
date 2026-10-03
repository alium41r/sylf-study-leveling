"use client";

import React from "react";
import { Check, Lock, Zap, AlertTriangle, Shield, GitBranch } from "lucide-react";
import { SystemInsightsIcon } from "@/app/components/icons";
import type { SkeletonNode } from "@/lib/skill-tree-skeleton";
import { getPrerequisites, TIER_SHAPE_LABELS } from "@/lib/skill-tree-skeleton";
import type { NodeStatus } from "./SkillNodeGraph";

// ─── Types ──────────────────────────────────────────────────────

interface SkillInspectorProps {
  node: SkeletonNode | null;
  status: NodeStatus;
  skillPoints: number;
  unlockedSet: Set<string>;
  branchName: string;
  accentHex: string;
  accentColor: string;
  isUnlocking: boolean;
  isClassLocked: boolean;
  onUnlockNode: (node: SkeletonNode) => void;
}

// ─── Tier Badge Metadata ────────────────────────────────────────

const TIER_BADGES: Record<number, string> = {
  1: "border-emerald-500/50 bg-emerald-950/40 text-emerald-300",
  2: "border-zinc-500/50 bg-zinc-800/80 text-zinc-300",
  3: "border-zinc-500/50 bg-zinc-800/80 text-zinc-300",
  4: "border-blue-500/50 bg-blue-950/40 text-blue-300",
  5: "border-purple-500/50 bg-purple-950/40 text-purple-300",
  6: "border-blue-500/50 bg-blue-950/40 text-blue-300",
  7: "border-indigo-500/50 bg-indigo-950/40 text-indigo-300",
  8: "border-amber-500/50 bg-amber-950/40 text-amber-300",
  9: "border-orange-500/50 bg-orange-950/40 text-orange-300",
  10: "border-amber-400/70 bg-amber-950/50 text-amber-300 animate-pulse",
};

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════

export function SkillInspector({
  node,
  status,
  skillPoints,
  unlockedSet,
  branchName,
  accentHex,
  accentColor,
  isUnlocking,
  isClassLocked,
  onUnlockNode,
}: SkillInspectorProps) {
  // ─── Empty State ─────────────────────────────────────────
  if (!node) {
    return (
      <div className="rounded-2xl bg-bg-panel/70 border border-white/10 p-6 flex flex-col items-center justify-center text-center gap-4 min-h-[380px] backdrop-blur-xl">
        <div className="w-16 h-16 rounded-2xl bg-bg-abyss/80 border border-white/10 flex items-center justify-center">
          <SystemInsightsIcon size={28} className="text-text-muted opacity-40" />
        </div>
        <div className="space-y-1.5">
          <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wide">
            Node Inspector
          </h4>
          <p className="text-xs text-text-secondary font-['Rajdhani'] max-w-[220px]">
            Select a skill node from the constellation graph to view its structural telemetry and unlock requirements.
          </p>
        </div>
      </div>
    );
  }

  // ─── Resolved Data ───────────────────────────────────────
  const tierLabel = TIER_SHAPE_LABELS[node.tier] || `Tier ${node.tier}`;
  const tierBadge = TIER_BADGES[node.tier] || "border-zinc-600 bg-zinc-800 text-zinc-300";
  const cost = node.costSP;
  const hasEnoughSP = skillPoints >= cost;

  // Prerequisite status
  const prereqs = getPrerequisites(node.id);
  const prereqMet = prereqs.length === 0 || prereqs.some((p) => unlockedSet.has(p));

  // ─── Action Button State ─────────────────────────────────
  let actionButton: React.ReactNode;

  if (isClassLocked) {
    actionButton = (
      <div className="w-full py-3 rounded-xl bg-slate-900/5 dark:bg-zinc-900/80 border border-border-subtle dark:border-zinc-800 text-text-muted text-sm font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2">
        <Lock className="w-4 h-4" />
        <span>Locked — Requires Class Mastery</span>
      </div>
    );
  } else if (status === "UNLOCKED") {
    actionButton = (
      <div className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2">
        <Check className="w-4 h-4" />
        <span>Acquired</span>
      </div>
    );
  } else if (status === "AVAILABLE" && hasEnoughSP) {
    actionButton = (
      <button
        type="button"
        disabled={isUnlocking}
        onClick={() => onUnlockNode(node)}
        className="w-full py-3 rounded-xl text-sm font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${accentHex}, ${accentHex}cc)`,
          color: "white",
          boxShadow: `0 0 24px rgba(${accentColor}, 0.4)`,
        }}
      >
        {isUnlocking ? (
          <>
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span>Unlocking...</span>
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            <span>Unlock Node ({cost} SP)</span>
          </>
        )}
      </button>
    );
  } else if (status === "AVAILABLE" && !hasEnoughSP) {
    actionButton = (
      <div className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2 opacity-90">
        <AlertTriangle className="w-4 h-4" />
        <span>Need {cost - skillPoints} More SP</span>
      </div>
    );
  } else {
    actionButton = (
      <div className="w-full py-3 rounded-xl bg-slate-900/5 dark:bg-zinc-900/60 border border-border-subtle dark:border-zinc-800 text-text-muted text-sm font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center justify-center gap-2">
        <Lock className="w-4 h-4" />
        <span>Locked (Prerequisites Required)</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-panel/70 border border-border-subtle backdrop-blur-xl overflow-hidden flex flex-col shadow-2xl">
      {/* ─── Header Accent Bar ─────────────────────────────── */}
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, transparent, rgba(${accentColor}, 0.7), transparent)`,
        }}
      />

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        {/* ─── Node Identity ───────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black font-['Rajdhani'] uppercase tracking-wider border ${tierBadge}`}
            >
              Tier {node.tier} — {tierLabel}
            </span>
            <span
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider border"
              style={{
                borderColor: `rgba(${accentColor}, 0.4)`,
                backgroundColor: `rgba(${accentColor}, 0.1)`,
                color: accentHex,
              }}
            >
              {branchName}
            </span>
          </div>

          {/* Node ID */}
          <h3 className="text-2xl font-extrabold font-['Rajdhani'] text-text-primary uppercase tracking-wide leading-tight">
            {node.label}
          </h3>

          {/* Generic structural placeholder description */}
          <p className="text-xs text-text-secondary leading-relaxed font-['Rajdhani']">
            {node.description}
          </p>
        </div>

        {/* ─── Telemetry Metadata ───────────────────────────── */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted">
            Structural Telemetry
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 rounded-xl bg-bg-abyss/60 border border-border-subtle flex flex-col">
              <span className="text-[10px] font-['Rajdhani'] text-text-muted uppercase">Geometry</span>
              <span className="text-xs font-bold font-mono uppercase text-text-primary">
                {node.shape.replace("_", " ")}
              </span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-bg-abyss/60 border border-border-subtle flex flex-col">
              <span className="text-[10px] font-['Rajdhani'] text-text-muted uppercase">SP Cost</span>
              <span className="text-xs font-bold font-mono text-amber-600 dark:text-amber-400">
                {node.costSP} SP
              </span>
            </div>
          </div>
        </div>

        {/* ─── Prerequisite Chain ───────────────────────────── */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest text-text-muted">
            Prerequisite Chain
          </span>
          <div className="space-y-1.5">
            {/* SP Requirement */}
            <div
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-['Rajdhani'] ${
                hasEnoughSP || status === "UNLOCKED"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
              }`}
            >
              {hasEnoughSP || status === "UNLOCKED" ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                Skill Points: <strong>{skillPoints}</strong> / {cost} SP required
              </span>
            </div>

            {/* Parent Node Requirement */}
            {prereqs.length > 0 ? (
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-['Rajdhani'] ${
                  prereqMet
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                }`}
              >
                {prereqMet ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <GitBranch className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  Requires any parent: <strong>{prereqs.join(" or ")}</strong>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-['Rajdhani']">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Tier 1 Root Foundation — no parent prerequisites</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Action Button ───────────────────────────────── */}
        {actionButton}
      </div>
    </div>
  );
}
