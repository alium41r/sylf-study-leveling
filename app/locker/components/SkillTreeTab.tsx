"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import {
  SubjectConstellationCanvas,
  type LiveSubjectNode,
} from "./SubjectConstellationCanvas";
import type { SkeletonNode } from "@/lib/skill-tree-skeleton";
import { SKELETON_NODES, getNodeDisplayCode } from "@/lib/skill-tree-skeleton";
import {
  Loader2,
  BookOpen,
  CheckCircle2,
  Lock,
  Award,
  Star,
  ArrowRight,
  Crown,
  Search,
  X,
  Filter,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  QuestEmblemIcon,
  SystemInsightsIcon,
  SystemApertureIcon,
  StreakFlameIcon,
  FocusClockIcon,
} from "@/app/components/icons";
import Link from "next/link";
import { CreateNodeQuestModal } from "./CreateNodeQuestModal";

interface SubjectSummary {
  id: number;
  name: string;
  code: string;
  examBoard: string;
  level: string;
  color: string;
  nodesCount: number;
  todaySeconds: number;
  /** Set once the subject's syllabus has been compiled — a one-time action. */
  lastCompiledAt: string | null;
}

const TIER_NAMES: Record<number, string> = {
  1: "Root Foundation",
  2: "Core Pillars",
  3: "Branch Foundations",
  4: "Conceptual Expansion",
  5: "Mid-Keystones",
  6: "Deep Analysis",
  7: "Convergence Nexus",
  8: "Advanced Synthesis",
  9: "Apex Gateways",
  10: "Apex Keystone",
};

const TIER_BADGE_STYLES: Record<number, string> = {
  1: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  2: "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  3: "border-orange-400/50 bg-orange-400/10 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  4: "border-rose-400/50 bg-rose-400/10 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  5: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  6: "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-300",
  7: "border-purple-500/50 bg-purple-500/10 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  8: "border-indigo-400/50 bg-indigo-400/10 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  9: "border-indigo-600/50 bg-indigo-600/10 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  10: "border-purple-500/80 bg-purple-500/15 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 animate-pulse",
};

export function SkillTreeTab() {
  const { user } = useAuth();

  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);

  // Nodes for the active subject
  const [nodes, setNodes] = useState<LiveSubjectNode[]>([]);
  const [mintedSP, setMintedSP] = useState<number>(0);
  const [isLoadingNodes, setIsLoadingNodes] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationError, setCompilationError] = useState<string | null>(null);

  // Modal & Apex Forging state
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false);
  const [isForgingApex, setIsForgingApex] = useState(false);

  // Inspector selection state
  const [selectedSkeleton, setSelectedSkeleton] = useState<SkeletonNode | null>(
    SKELETON_NODES[0] // Default to N1_1
  );
  const [selectedLive, setSelectedLive] = useState<LiveSubjectNode | null>(null);

  // Search & Category Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    "ALL" | "IN_PROGRESS" | "MASTERED" | "UNTOUCHED" | "TIER_1_3" | "TIER_4_6" | "TIER_7_10"
  >("ALL");
  const [focusTargetNodeId, setFocusTargetNodeId] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const searchContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut: / or Cmd+K to focus search, Esc to clear
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === "Escape" && isSearchFocused) {
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchFocused]);

  // 1. Fetch user subjects on mount
  const fetchSubjects = useCallback(async () => {
    if (!user) return;
    setIsLoadingSubjects(true);
    try {
      const res = await fetch("/api/subjects");
      if (res.ok) {
        const data = await res.json();
        const list: SubjectSummary[] = Array.isArray(data) ? data : [];
        setSubjects(list);
        if (list.length > 0 && !activeSubjectId) {
          setActiveSubjectId(list[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch subjects:", err);
    } finally {
      setIsLoadingSubjects(false);
    }
  }, [user?.id, activeSubjectId]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // 2. Fetch subject nodes whenever activeSubjectId changes
  const fetchSubjectNodes = useCallback(
    async (subjectId: number) => {
      if (!user) return;
      setIsLoadingNodes(true);
      setCompilationError(null);
      try {
        const res = await fetch(`/api/subjects/${subjectId}/nodes`);
        if (res.ok) {
          const data = await res.json();
          const liveNodes: LiveSubjectNode[] = Array.isArray(data.nodes) ? data.nodes : [];
          setNodes(liveNodes);
          setMintedSP(typeof data.mintedSP === "number" ? data.mintedSP : 0);

          // Update selected live node if previously selected
          if (selectedSkeleton) {
            const found = liveNodes.find((n) => n.nodeId === selectedSkeleton.id);
            setSelectedLive(found || null);
          }
        }
      } catch (err) {
        console.error("Failed to fetch subject nodes:", err);
      } finally {
        setIsLoadingNodes(false);
      }
    },
    [user?.id, selectedSkeleton]
  );

  useEffect(() => {
    if (activeSubjectId) {
      fetchSubjectNodes(activeSubjectId);
    }
  }, [activeSubjectId, fetchSubjectNodes]);

  const activeSubject = useMemo(
    () => subjects.find((s) => s.id === activeSubjectId) || null,
    [subjects, activeSubjectId]
  );

  // Handle node selection from canvas
  const handleSelectNode = useCallback(
    ({ skeleton, live }: { skeleton: SkeletonNode; live?: LiveSubjectNode }) => {
      setSelectedSkeleton(skeleton);
      setSelectedLive(live || null);
    },
    []
  );

  // Trigger one-time AI Syllabus Compilation (compile once per subject, forever)
  const handleCompileSyllabus = async () => {
    if (!activeSubjectId || isCompiling) return;
    if (activeSubject?.lastCompiledAt) return;
    setIsCompiling(true);
    setCompilationError(null);

    try {
      const res = await fetch(`/api/subjects/${activeSubjectId}/compile`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Compilation failed");
      }

      // Re-fetch fresh live nodes immediately
      await fetchSubjectNodes(activeSubjectId);
      // The subject is now compiled — refresh so the button disappears.
      fetchSubjects();
    } catch (err: any) {
      console.error("AI Syllabus Compilation error:", err);
      setCompilationError(err.message || "Failed to compile syllabus");
    } finally {
      setIsCompiling(false);
    }
  };

  // Trigger Apex Keystone Forging
  const handleForgeApex = async () => {
    if (!activeSubjectId || isForgingApex) return;
    setIsForgingApex(true);
    try {
      const res = await fetch(`/api/subjects/${activeSubjectId}/forge-apex`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to forge Apex Keystone");
      } else {
        await fetchSubjectNodes(activeSubjectId);
      }
    } catch (err: any) {
      console.error("Apex forging error:", err);
      alert(err.message || "Apex forging encountered an error");
    } finally {
      setIsForgingApex(false);
    }
  };

  // Compute live node map
  const liveNodeMap = useMemo(() => {
    const map = new Map<string, LiveSubjectNode>();
    nodes.forEach((n) => map.set(n.nodeId, n));
    return map;
  }, [nodes]);

  // Filtered & Matched Skeleton Nodes based on search query and category filters
  const filteredAndMatchedNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return SKELETON_NODES.filter((sk) => {
      const live = liveNodeMap.get(sk.id);
      const progress = live?.progress ?? 0;
      const isMastered = live?.isMastered || progress >= 100;
      const isStarted = progress > 0 && !isMastered;
      const isUntouched = progress === 0;

      // Category filter
      if (activeCategoryFilter === "IN_PROGRESS" && !isStarted) return false;
      if (activeCategoryFilter === "MASTERED" && !isMastered) return false;
      if (activeCategoryFilter === "UNTOUCHED" && !isUntouched) return false;
      if (activeCategoryFilter === "TIER_1_3" && sk.tier > 3) return false;
      if (activeCategoryFilter === "TIER_4_6" && (sk.tier < 4 || sk.tier > 6)) return false;
      if (activeCategoryFilter === "TIER_7_10" && sk.tier < 7) return false;

      // Query text matching
      if (!query) return true;

      const displayCode = getNodeDisplayCode(sk.id).toLowerCase();
      const rawId = sk.id.toLowerCase();
      const unitNum = displayCode.replace("#", "");
      const title = (live?.title || sk.label).toLowerCase();
      const description = (live?.description || sk.description).toLowerCase();
      const tierName = (TIER_NAMES[sk.tier] || "").toLowerCase();

      return (
        displayCode.includes(query) ||
        rawId.includes(query) ||
        `unit ${unitNum}`.includes(query) ||
        title.includes(query) ||
        description.includes(query) ||
        tierName.includes(query) ||
        `tier ${sk.tier}`.includes(query)
      );
    });
  }, [searchQuery, activeCategoryFilter, liveNodeMap]);

  const matchingNodeIds = useMemo(
    () => filteredAndMatchedNodes.map((n) => n.id),
    [filteredAndMatchedNodes]
  );

  const masteredCount = useMemo(
    () => nodes.filter((n) => n.isMastered || n.progress >= 100).length,
    [nodes]
  );

  if (isLoadingSubjects && subjects.length === 0) {
    return (
      <div className="w-full min-h-[480px] flex flex-col items-center justify-center gap-3 p-12 text-center rounded-2xl bg-bg-panel/60 border border-border-subtle shadow-card">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
        <p className="text-sm font-rajdhani font-semibold text-text-secondary uppercase tracking-wider">
          Mapping Subject Constellation Graph...
        </p>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="w-full p-12 text-center rounded-2xl bg-bg-panel/70 border border-border-subtle shadow-card flex flex-col items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-accent-primary-dim/30 border border-accent-primary-mid/40 flex items-center justify-center text-accent-primary shadow-glow-sm">
          <BookOpen className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-xl font-bold font-rajdhani text-text-primary tracking-wide">
            No Subjects Registered
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed font-rajdhani">
            Enroll your academic subjects, syllabus codes, and exam boards in settings to initialize your personalized 48-node constellation trees.
          </p>
        </div>
        <Link
          href="/settings/account"
          className="px-6 py-2.5 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white text-xs font-rajdhani font-bold uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
        >
          <span>Configure Subjects</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* ─── Subject Selector Horizontal Tab Bar ───────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-bg-panel/90 border border-border-subtle shadow-card">
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          {subjects.map((sub) => {
            const isActive = sub.id === activeSubjectId;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => setActiveSubjectId(sub.id)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center gap-2.5 transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-accent-primary text-white border-accent-primary shadow-md scale-[1.02]"
                    : "bg-bg-abyss border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-active"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: sub.color || "#8B5CF6" }}
                />
                <span>{sub.name}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isActive
                      ? "bg-white/20 text-white font-bold"
                      : "bg-accent-primary-dim text-accent-text-light font-medium"
                  }`}
                >
                  {sub.code}
                </span>
              </button>
            );
          })}
        </div>

        {/* Telemetry Gauge Overview */}
        {activeSubject && (
          <div className="flex items-center gap-4 text-xs font-rajdhani shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-text-secondary uppercase text-[10px] font-mono">
                Constellation Progress
              </span>
              <span className="font-bold text-accent-primary-dark dark:text-accent-primary-light">
                {masteredCount} / 48 Mastered ({Math.round((masteredCount / 48) * 100)}%)
              </span>
            </div>
            <div className="h-8 w-[1px] bg-border-subtle hidden sm:block" />
            <div className="flex flex-col items-end">
              <span className="text-text-secondary uppercase text-[10px] font-mono">
                Subject SP Ledger
              </span>
              <span className="font-bold text-amber-600 dark:text-amber-300 font-mono">
                {mintedSP} / 115 SP
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Active Subject Progress Header Banner ─────────────────── */}
      {activeSubject && (
        <div className="p-4 rounded-2xl bg-bg-panel/80 border border-border-subtle shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-3.5 h-12 rounded-full"
              style={{ backgroundColor: activeSubject.color || "#8B5CF6" }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-rajdhani text-text-primary">
                  {activeSubject.name}
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-abyss border border-border-subtle font-bold text-text-secondary">
                  {activeSubject.examBoard} • {activeSubject.level}
                </span>
              </div>
              <p className="text-xs text-text-secondary font-rajdhani mt-0.5">
                Universal 48-Node Syllabus Constellation • 68 Interconnected Edge Vectors
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* One-time AI Syllabus Compilation — only before the first compile.
                After that the subject is locked; no recompile, ever. */}
            {!activeSubject.lastCompiledAt && (
              <button
                type="button"
                onClick={handleCompileSyllabus}
                disabled={isCompiling}
                className={`px-3.5 py-2 rounded-xl text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm ${
                  isCompiling
                    ? "bg-purple-500/10 border border-purple-500/40 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 cursor-wait animate-pulse"
                    : "bg-purple-600 hover:bg-purple-500 text-white shadow-md scale-[1.02]"
                }`}
                title="Decompose syllabus chapters using Google Gemini (one-time)"
              >
                {isCompiling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500 dark:text-purple-300" />
                    <span>Decomposing Syllabus (AI)...</span>
                  </>
                ) : (
                  <>
                    <SystemApertureIcon size={14} />
                    <span>Compile Syllabus (AI)</span>
                  </>
                )}
              </button>
            )}

            {/* SP Progress Meter */}
            <div className="flex flex-col gap-1.5 md:w-56">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-text-secondary">Apex Unlock:</span>
                <span className="font-bold text-amber-600 dark:text-amber-300 font-mono">
                  {mintedSP} / 115 SP
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-bg-abyss border border-border-subtle overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-amber-500 transition-all duration-500 shadow-sm"
                  style={{ width: `${Math.min(100, (mintedSP / 115) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {compilationError && (
        <div className="px-4 py-2 rounded-xl bg-accent-red/10 border border-accent-red/30 text-accent-red text-xs font-rajdhani font-semibold">
          AI Compilation Warning: {compilationError}
        </div>
      )}

      {/* ─── Search & Category Filter Toolbar ──────────────────────── */}
      {activeSubject && (
        <div
          ref={searchContainerRef}
          className="p-3.5 rounded-2xl bg-bg-panel/80 border border-border-subtle shadow-card relative z-30 flex flex-col gap-3"
        >
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                onFocus={() => setIsSearchFocused(true)}
                placeholder="Search 48 syllabus chapters, subtopics, or unit (e.g. 'Diffraction', 'Kinematics', '#05')..."
                className="w-full pl-10 pr-24 py-2 rounded-xl bg-bg-abyss border border-border-subtle text-xs font-rajdhani font-semibold text-text-primary placeholder:text-text-muted focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setIsSearchFocused(false);
                    }}
                    className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-panel transition-colors"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-bg-panel border border-border-subtle text-[10px] font-mono text-text-muted select-none">
                    /
                  </kbd>
                )}
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-400">
                  {filteredAndMatchedNodes.length}/48
                </span>
              </div>
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
              <span className="text-[10px] font-mono uppercase text-text-muted shrink-0 hidden lg:inline-block mr-1">
                Filter:
              </span>
              {[
                { id: "ALL", label: "All (48)" },
                { id: "IN_PROGRESS", label: "In Progress" },
                { id: "MASTERED", label: "Mastered" },
                { id: "UNTOUCHED", label: "Untouched" },
                { id: "TIER_1_3", label: "Tier 1–3" },
                { id: "TIER_4_6", label: "Tier 4–6" },
                { id: "TIER_7_10", label: "Tier 7–10" },
              ].map((filter) => {
                const isActive = activeCategoryFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveCategoryFilter(filter.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-rajdhani font-bold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-cyan-500 text-white shadow-sm font-extrabold"
                        : "bg-bg-abyss border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-active"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Autocomplete / Live Search Results Dropdown List */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-2 max-h-72 overflow-y-auto bg-bg-panel/95 border border-cyan-500/40 rounded-2xl shadow-2xl backdrop-blur-xl p-2 z-50 custom-scrollbar">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle text-[11px] font-mono text-text-muted">
                <span>Matching Topics ({filteredAndMatchedNodes.length})</span>
                <span className="text-[10px]">Click a topic to focus constellation</span>
              </div>
              {filteredAndMatchedNodes.length === 0 ? (
                <div className="p-6 text-center text-xs font-rajdhani text-text-muted">
                  No syllabus nodes found matching &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="flex flex-col gap-1 mt-1">
                  {filteredAndMatchedNodes.map((sk) => {
                    const live = liveNodeMap.get(sk.id);
                    const progress = live?.progress ?? 0;
                    const isMastered = live?.isMastered || progress >= 100;
                    const isStarted = progress > 0 && !isMastered;
                    const isSelected = selectedSkeleton?.id === sk.id;

                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => {
                          handleSelectNode({ skeleton: sk, live: live || undefined });
                          setFocusTargetNodeId(sk.id);
                          setIsSearchFocused(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? "bg-cyan-500/20 border border-cyan-500/50"
                            : "hover:bg-bg-abyss/80 border border-transparent hover:border-border-subtle"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded text-xs shrink-0">
                            {getNodeDisplayCode(sk.id)}
                          </span>
                          <div className="min-w-0">
                            <h5 className="text-xs font-bold font-rajdhani text-text-primary truncate">
                              {live?.title || `${activeSubject?.name} - ${sk.label}`}
                            </h5>
                            <p className="text-[11px] text-text-secondary font-rajdhani line-clamp-1">
                              {live?.description || sk.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-right">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-abyss border border-border-subtle text-text-muted">
                            Tier {sk.tier}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              isMastered
                                ? "bg-purple-950/60 text-purple-300 border-purple-500/40"
                                : isStarted
                                ? "bg-cyan-950/60 text-cyan-300 border-cyan-500/40"
                                : "bg-bg-abyss text-text-muted border-border-subtle"
                            }`}
                          >
                            {isMastered
                              ? "Mastered"
                              : isStarted
                              ? `${Math.round(progress)}%`
                              : "Untouched"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Two-Column Responsive Workspace ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left/Center Constellation Canvas Column */}
        <div className="lg:col-span-8 xl:col-span-9">
          {isLoadingNodes ? (
            <div className="w-full h-[650px] lg:h-[750px] rounded-2xl bg-bg-abyss border border-border-subtle flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
              <p className="text-xs font-rajdhani text-text-secondary uppercase tracking-wider">
                Syncing Constellation Nodes...
              </p>
            </div>
          ) : (
            <SubjectConstellationCanvas
              nodes={nodes}
              mintedSP={mintedSP}
              selectedNodeId={selectedSkeleton?.id || null}
              accentColor={activeSubject?.color || "#8B5CF6"}
              onSelectNode={handleSelectNode}
              searchQuery={searchQuery}
              matchingNodeIds={matchingNodeIds}
              focusTargetNodeId={focusTargetNodeId}
            />
          )}
        </div>

        {/* Right Column: Sticky Node Inspector Dock */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="lg:sticky lg:top-6 flex flex-col gap-4">
            {selectedSkeleton ? (
              <div className="p-5 rounded-2xl bg-bg-panel/90 border border-border-subtle backdrop-blur-xl shadow-card flex flex-col gap-4">
                {/* Inspector Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-0.5 rounded text-xs">
                      {getNodeDisplayCode(selectedSkeleton.id)}
                    </span>
                    <span className="text-xs font-rajdhani font-semibold text-text-secondary uppercase">
                      {selectedSkeleton.tier === 10
                        ? "APEX SYLLABUS CAPSTONE"
                        : `UNIT ${getNodeDisplayCode(selectedSkeleton.id).replace("#", "")} · TIER ${selectedSkeleton.tier}`}
                    </span>
                  </div>
                  {activeSubject && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-abyss border border-border-subtle text-text-muted">
                      {activeSubject.code}
                    </span>
                  )}
                </div>

                {/* Node Title & Description */}
                <div className="space-y-1.5">
                  <h4 className="text-base font-bold font-rajdhani text-text-primary leading-snug">
                    {selectedLive?.title || `${activeSubject?.name || "Subject"} - ${selectedSkeleton.label}`}
                  </h4>
                  <p className="text-xs text-text-secondary font-rajdhani leading-relaxed">
                    {selectedLive?.description || selectedSkeleton.description}
                  </p>
                </div>

                {/* Telemetry Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-bg-abyss border border-border-subtle">
                  <div>
                    <span className="block text-[10px] font-mono uppercase text-text-muted">
                      Difficulty
                    </span>
                    <div className="flex items-center gap-1 mt-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < (selectedLive?.difficulty || Math.ceil(selectedSkeleton.tier / 2))
                              ? "fill-amber-500 text-amber-500"
                              : "text-slate-300 dark:text-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase text-text-muted">
                      SP Mint Reward
                    </span>
                    <span className="text-xs font-bold font-mono text-purple-700 dark:text-purple-300 mt-1 block">
                      {selectedSkeleton.tier === 10
                        ? "Apex Keystone (0 SP)"
                        : `+${selectedLive?.spAward ?? (selectedSkeleton.tier <= 3 ? 1 : selectedSkeleton.tier <= 5 ? 2 : selectedSkeleton.tier <= 7 ? 3 : 4)} Subject SP`}
                    </span>
                  </div>
                </div>

                {/* Progress Status Meter */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-rajdhani">
                    <span className="text-text-secondary font-medium">Node Mastery Progress</span>
                    <span className="font-bold text-text-primary">
                      {Math.round(selectedLive?.progress || 0)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-bg-abyss border border-border-subtle overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        (selectedLive?.progress || 0) >= 100
                          ? "bg-purple-600 dark:bg-purple-500 shadow-sm"
                          : (selectedLive?.progress || 0) > 0
                          ? "bg-cyan-500 dark:bg-cyan-400"
                          : "bg-slate-300 dark:bg-zinc-700"
                      }`}
                      style={{ width: `${selectedLive?.progress || 0}%` }}
                    />
                  </div>
                </div>

                {/* Status Badges */}
                <div>
                  {selectedSkeleton.tier === 10 ? (
                    mintedSP >= 115 ? (
                      <div className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                        <StreakFlameIcon size={16} className="text-amber-500 dark:text-amber-400" />
                        <span>Apex Keystone Ready to Forge</span>
                      </div>
                    ) : (
                      <div className="w-full py-2.5 px-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 dark:bg-zinc-900/80 dark:border-zinc-800 dark:text-zinc-500 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                        <Lock className="w-4 h-4" />
                        <span>Sealed • Requires 115 Subject SP</span>
                      </div>
                    )
                  ) : (selectedLive?.progress || 0) >= 100 ? (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-purple-500/10 border border-purple-500/40 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span>Syllabus Node Mastered (+{selectedLive?.spAward} SP)</span>
                    </div>
                  ) : (selectedLive?.progress || 0) > 0 ? (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                      <FocusClockIcon size={16} className="text-cyan-600 dark:text-cyan-400" />
                      <span>In Progress ({Math.round(selectedLive?.progress || 0)}%)</span>
                    </div>
                  ) : (
                    <div className="w-full py-2.5 px-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 dark:bg-bg-abyss dark:border-border-subtle dark:text-text-muted text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                      <span>Untouched Syllabus Node</span>
                    </div>
                  )}
                </div>

                {/* Quest / Apex Action Trigger */}
                <div className="pt-2 border-t border-border-subtle">
                  {selectedSkeleton.tier === 10 ? (
                    mintedSP >= 115 && !selectedLive?.isMastered ? (
                      <button
                        type="button"
                        onClick={handleForgeApex}
                        disabled={isForgingApex}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white text-xs font-rajdhani font-bold uppercase tracking-wider hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-md animate-pulse disabled:opacity-50"
                      >
                        {isForgingApex ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Forging Apex Keystone...</span>
                          </>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 text-amber-200 fill-amber-200" />
                            <span>Forge Apex Keystone (+5,000 XP)</span>
                          </>
                        )}
                      </button>
                    ) : selectedLive?.isMastered ? (
                      <div className="w-full py-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                        <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
                        <span>Apex Syllabus Mastered (Decree Claimed)</span>
                      </div>
                    ) : (
                      <div className="w-full py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 dark:bg-bg-abyss dark:border-border-subtle dark:text-zinc-500 text-xs font-rajdhani font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                        <Lock className="w-4 h-4" />
                        <span>Sealed • Requires {115 - mintedSP} More SP</span>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsQuestModalOpen(true)}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-rajdhani font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md group"
                    >
                      <QuestEmblemIcon className="w-4 h-4 transition-transform group-hover:rotate-45" />
                      <span>
                        {(selectedLive?.progress || 0) >= 100
                          ? "Review Node in Focus Quest"
                          : "Create Node Focus Quest"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Empty Inspector Dock */
              <div className="p-6 rounded-2xl bg-bg-panel/70 border border-border-subtle text-center flex flex-col items-center justify-center gap-3 min-h-[320px]">
                <div className="w-12 h-12 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-center text-text-muted opacity-50">
                  <SystemInsightsIcon size={24} />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold font-rajdhani text-text-primary uppercase tracking-wide">
                    Node Inspector
                  </h4>
                  <p className="text-xs text-text-secondary font-rajdhani max-w-[200px]">
                    Select any syllabus node from the constellation canvas to view learning objectives and launch focus quests.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contextual Node Quest Creation Modal */}
      <CreateNodeQuestModal
        isOpen={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        subject={activeSubject}
        skeletonNode={selectedSkeleton}
        liveNode={selectedLive}
        onQuestCreated={() => {
          if (activeSubjectId) fetchSubjectNodes(activeSubjectId);
        }}
      />
    </div>
  );
}
