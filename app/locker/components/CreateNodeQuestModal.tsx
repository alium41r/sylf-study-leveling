"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SkeletonNode } from "@/lib/skill-tree-skeleton";
import { getNodeDisplayCode } from "@/lib/skill-tree-skeleton";
import type { LiveSubjectNode } from "./SubjectConstellationCanvas";
import { calculateSemanticScopeWeight } from "@/lib/ai/scope-evaluator";
import {
  X,
  Target,
  Sparkles,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Loader2,
  Zap,
  Info,
} from "lucide-react";

interface CreateNodeQuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: {
    id: number;
    name: string;
    code: string;
    color: string;
    examBoard: string;
    level: string;
  } | null;
  skeletonNode: SkeletonNode | null;
  liveNode: LiveSubjectNode | null;
  onQuestCreated?: (quest: any) => void;
}

const DURATION_PRESETS = [25, 45, 60, 90];

const SCOPE_PRESETS = [
  { label: "Full Chapter (100%)", text: "Complete entire chapter syllabus and all core past-paper exercises" },
  { label: "Core Subtopics (50%)", text: "Study main theoretical concepts and solve standard derivations" },
  { label: "Past-Paper Drill (75%)", text: "Solve high-yield topical past paper questions and review common mistakes" },
  { label: "Quick Recap (25%)", text: "Review key formulas, SI units, definitions, and active recall flashcards" },
];

export function CreateNodeQuestModal({
  isOpen,
  onClose,
  subject,
  skeletonNode,
  liveNode,
  onQuestCreated,
}: CreateNodeQuestModalProps) {
  const router = useRouter();

  const nodeTitle =
    liveNode?.title ||
    `${subject?.name || "Subject"} - ${skeletonNode?.label || "Node"}`;
  const nodeDesc = liveNode?.description || skeletonNode?.description || "";

  const [title, setTitle] = useState(`Practice: ${nodeTitle}`);
  const [description, setDescription] = useState("");
  const [targetMinutes, setTargetMinutes] = useState(45);
  const [isCustomMinutes, setIsCustomMinutes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEvaluatingAI, setIsEvaluatingAI] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdQuest, setCreatedQuest] = useState<any>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync default state when modal opens or node changes
  useEffect(() => {
    if (isOpen && skeletonNode) {
      setTitle(`Practice: ${nodeTitle}`);
      setDescription("");
      setTargetMinutes(45);
      setIsCustomMinutes(false);
      setError(null);
      setCreatedQuest(null);
      setAiEvaluation(null);
    }
  }, [isOpen, skeletonNode, nodeTitle]);

  // Dynamic high-precision semantic scope evaluation (0ms client NLP)
  const semanticEval = useMemo(() => {
    return calculateSemanticScopeWeight({
      nodeTitle,
      nodeDescription: nodeDesc,
      nodeTier: skeletonNode?.tier || 1,
      questTitle: title,
      planDescription: description,
      targetMinutes,
    });
  }, [nodeTitle, nodeDesc, skeletonNode, title, description, targetMinutes]);

  // Debounced real-time LLM AI evaluation endpoint call
  useEffect(() => {
    if (!isOpen || !description.trim()) {
      setAiEvaluation(null);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        setIsEvaluatingAI(true);
        const res = await fetch("/api/quests/evaluate-scope", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nodeTitle,
            nodeDescription: nodeDesc,
            nodeTier: skeletonNode?.tier || 1,
            questTitle: title,
            planDescription: description,
            targetMinutes,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.chapterPortionPercent === "number") {
            setAiEvaluation(data);
          }
        }
      } catch {
        // Fallback already active via semanticEval
      } finally {
        setIsEvaluatingAI(false);
      }
    }, 450);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isOpen, description, title, targetMinutes, nodeTitle, nodeDesc, skeletonNode]);

  if (!isOpen || !skeletonNode || !subject) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveNode?.id) {
      setError("Unable to locate syllabus node identifier.");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a quest title.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/quests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectId: subject.id,
          subjectNodeId: liveNode.id,
          title: title.trim(),
          description: description.trim() || undefined,
          targetMinutes,
        }),
      });

      if (res.ok) {
        const quest = await res.json();
        setCreatedQuest(quest);
        if (onQuestCreated) onQuestCreated(quest);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create quest.");
      }
    } catch (err: any) {
      setError(err.message || "Network communication failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLaunchTimer = () => {
    if (!createdQuest) return;
    router.push(
      `/focus?questId=${createdQuest.id}&subjectId=${subject.id}&nodeId=${liveNode?.id}&subjectName=${encodeURIComponent(
        `${subject.name} - ${nodeTitle}`
      )}`
    );
  };

  const currentBoost = aiEvaluation?.estimatedMasteryBoost ?? semanticEval.estimatedMasteryBoost;
  const currentPortion = aiEvaluation?.chapterPortionPercent ?? semanticEval.chapterPortionPercent;
  const displayRationale = aiEvaluation?.rationale || semanticEval.rationale;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-bg-panel border border-border-subtle shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-bg-abyss/80">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-8 rounded-full"
              style={{ backgroundColor: subject.color || "#8B5CF6" }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-accent-primary-dim/30 border border-accent-primary/40 text-purple-300">
                  {getNodeDisplayCode(skeletonNode.id)}
                </span>
                <span className="text-xs font-rajdhani font-semibold text-text-secondary uppercase">
                  {subject.name} ({subject.code})
                </span>
              </div>
              <h3 className="text-base font-bold font-rajdhani text-text-primary mt-0.5">
                Create Node Focus Quest
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
          {createdQuest ? (
            /* Success State */
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold font-rajdhani text-text-primary">
                  Quest Bound to Constellation Node
                </h4>
                <p className="text-xs text-text-secondary font-rajdhani max-w-sm mx-auto">
                  Completing this {createdQuest.targetMinutes}-minute focus session will reconcile{" "}
                  <span className="text-purple-300 font-bold font-mono">
                    ~+{Math.round(createdQuest.scopeWeight * 100)}%
                  </span>{" "}
                  mastery toward {getNodeDisplayCode(skeletonNode.id)}.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-bg-abyss border border-border-subtle text-left max-w-md mx-auto space-y-1 text-xs font-rajdhani">
                <div className="flex justify-between font-mono">
                  <span className="text-text-secondary">Assigned Rewards:</span>
                  <span className="text-amber-300 font-bold">
                    +{createdQuest.xpReward} XP • +{createdQuest.sylphReward} Sylph
                  </span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-text-secondary">Target Duration:</span>
                  <span className="text-text-primary font-bold">
                    {createdQuest.targetMinutes} Minutes
                  </span>
                </div>
                <div className="flex justify-between font-mono pt-1 border-t border-border-subtle">
                  <span className="text-text-secondary">AI Scope Weight:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {Math.round(createdQuest.scopeWeight * 100)}% Chapter Coverage
                  </span>
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleLaunchTimer}
                  className="px-6 py-3 rounded-xl bg-accent-primary text-white font-rajdhani font-bold text-xs uppercase tracking-wider hover:bg-accent-primary-light transition-all flex items-center justify-center gap-2 shadow-lg group"
                >
                  <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                  <span>Launch in Focus Timer</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl bg-bg-abyss hover:bg-bg-panel border border-border-subtle text-text-secondary font-rajdhani font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Close & Return
                </button>
              </div>
            </div>
          ) : (
            /* Creation Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Learning Objectives Reference */}
              <div className="p-3.5 rounded-xl bg-bg-abyss/90 border border-border-subtle space-y-1">
                <div className="flex items-center gap-2 text-xs font-rajdhani font-bold text-purple-300 uppercase tracking-wide">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Syllabus Learning Objectives</span>
                </div>
                <p className="text-xs text-text-secondary font-rajdhani leading-relaxed">
                  {nodeDesc}
                </p>
              </div>

              {/* Quest Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase text-text-secondary">
                  Quest Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Derive 2D Projectile Equations and solve 5 past paper problems"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-bg-abyss border border-border-subtle text-text-primary text-xs font-rajdhani focus:outline-none focus:border-accent-primary"
                  required
                />
              </div>

              {/* Scope & Study Plan */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono font-bold uppercase text-text-secondary flex items-center gap-2">
                    <span>Scope & Practice Plan (AI Weighted)</span>
                    {isEvaluatingAI && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-purple-400 normal-case font-normal animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>AI evaluating...</span>
                      </span>
                    )}
                  </label>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border transition-all ${
                      isEvaluatingAI
                        ? "bg-purple-950/40 text-purple-300 border-purple-500/40 animate-pulse"
                        : currentBoost >= 90
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40"
                        : currentBoost >= 50
                        ? "bg-cyan-950/40 text-cyan-300 border-cyan-500/40"
                        : "bg-amber-950/40 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {isEvaluatingAI ? "AI Calculating..." : `Est. Coverage: ~+${currentPortion}%`}
                  </span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setAiEvaluation(null);
                  }}
                  placeholder="e.g. Complete chapter / Focus on SI prefixes & unit conversions / Solve past paper problems"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-bg-abyss border border-border-subtle text-text-primary text-xs font-rajdhani focus:outline-none focus:border-accent-primary resize-none"
                />

                {/* Scope Quick Fill Presets */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SCOPE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setDescription(preset.text);
                        setAiEvaluation(null);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-rajdhani font-semibold bg-bg-abyss border border-border-subtle hover:border-accent-primary/60 hover:text-text-primary text-text-muted transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-bold uppercase text-text-secondary">
                  Target Focus Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setTargetMinutes(m);
                        setIsCustomMinutes(false);
                        setAiEvaluation(null);
                      }}
                      className={`py-2 rounded-xl border text-xs font-mono font-bold transition-all ${
                        targetMinutes === m && !isCustomMinutes
                          ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                          : "bg-bg-abyss border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-active"
                      }`}
                    >
                      {m} Min
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope Telemetry Preview */}
              <div className="p-3.5 rounded-xl bg-accent-primary-dim/20 border border-accent-primary/30 space-y-1.5 transition-all">
                <div className="flex items-center justify-between text-xs font-rajdhani">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-300" />
                    <span className="text-text-primary font-semibold">
                      Estimated Node Mastery Boost:
                    </span>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      isEvaluatingAI
                        ? "text-purple-300 animate-pulse"
                        : currentBoost >= 90
                        ? "text-emerald-400"
                        : currentBoost >= 50
                        ? "text-cyan-400"
                        : "text-amber-300"
                    }`}
                  >
                    {isEvaluatingAI ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin inline" />
                        <span>Evaluating...</span>
                      </span>
                    ) : (
                      `~+${currentBoost}% on Session Completion`
                    )}
                  </span>
                </div>

                {displayRationale && (
                  <div className="flex items-start gap-1.5 text-[11px] text-text-secondary font-rajdhani pt-1 border-t border-accent-primary/10">
                    <Info className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span className="leading-snug">{displayRationale}</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs font-rajdhani">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-bg-abyss border border-border-subtle text-text-secondary font-rajdhani font-bold text-xs uppercase tracking-wider hover:bg-bg-card transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-accent-primary text-white font-rajdhani font-bold text-xs uppercase tracking-wider hover:bg-accent-primary-light transition-all flex items-center gap-2 shadow-md disabled:opacity-60 disabled:cursor-wait"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>AI Evaluating Scope & Creating Quest...</span>
                    </>
                  ) : (
                    <>
                      <Target className="w-3.5 h-3.5" />
                      <span>Create Focus Quest</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
