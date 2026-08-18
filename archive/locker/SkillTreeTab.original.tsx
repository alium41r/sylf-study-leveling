"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface SkillNodeData {
  id: string;
  name: string;
  icon: string;
  tier: number;
  costSP: number;
  x: number; // SVG coordinate x (0-900)
  y: number; // SVG coordinate y (0-480)
  parentIds: string[];
  branchName: string;
  perkDescription: string;
}

export interface ClassSkillTreeConfig {
  classId: string;
  className: string;
  icon: string;
  themeColor: string;
  tagline: string;
  nodes: SkillNodeData[];
}

// ─── 8 Unique Class Tree Topology Layouts ────────────────────────
export const CLASS_SKILL_TREES: Record<string, ClassSkillTreeConfig> = {
  class_scholar: {
    classId: "class_scholar",
    className: "Scholar",
    icon: "📖",
    themeColor: "var(--accent-primary)",
    tagline: "Retention & Synthesis Constellation",
    nodes: [
      { id: "sch-0", name: "Scholar Axiom", icon: "📖", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Foundational baseline for cognitive endurance." },
      { id: "sch-1", name: "Spaced Recall", icon: "🔄", tier: 1, costSP: 1, x: 280, y: 140, parentIds: ["sch-0"], branchName: "Memory", perkDescription: "Optimizes review intervals for long-term retention." },
      { id: "sch-2", name: "Feynman Engine", icon: "🗣️", tier: 1, costSP: 1, x: 280, y: 340, parentIds: ["sch-0"], branchName: "Synthesis", perkDescription: "Deconstructs complex concepts into fundamental axioms." },
      { id: "sch-3", name: "Memory Palace", icon: "🏛️", tier: 2, costSP: 2, x: 500, y: 90, parentIds: ["sch-1"], branchName: "Memory", perkDescription: "Spatial indexing for massive factual databases." },
      { id: "sch-4", name: "Concept Cross-Link", icon: "🌐", tier: 2, costSP: 2, x: 500, y: 240, parentIds: ["sch-1", "sch-2"], branchName: "Synergy", perkDescription: "Bridges disparate knowledge domains seamlessly." },
      { id: "sch-5", name: "Speed Synthesis", icon: "⚡", tier: 2, costSP: 2, x: 500, y: 390, parentIds: ["sch-2"], branchName: "Synthesis", perkDescription: "Accelerates extraction of core thesis from literature." },
      { id: "sch-6", name: "Omni-Scholar Apex", icon: "👑", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["sch-3", "sch-4", "sch-5"], branchName: "Capstone", perkDescription: "Mastery milestone: +30% EXP across all study goals." },
    ],
  },
  class_analyst: {
    classId: "class_analyst",
    className: "Analyst",
    icon: "📊",
    themeColor: "#38bdf8",
    tagline: "Pattern & Calculation Branching Matrix",
    nodes: [
      { id: "ana-0", name: "Data Ingestion", icon: "📊", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Baseline sensory parsing and quantitative indexing." },
      { id: "ana-1", name: "Pattern Detection", icon: "📈", tier: 1, costSP: 1, x: 290, y: 150, parentIds: ["ana-0"], branchName: "Algorithms", perkDescription: "Uncovers underlying logic trends in complex problems." },
      { id: "ana-2", name: "Error Debugger", icon: "🐞", tier: 1, costSP: 1, x: 290, y: 330, parentIds: ["ana-0"], branchName: "Verification", perkDescription: "Isolates false assumptions and calculation errors instantly." },
      { id: "ana-3", name: "Statistical Intuition", icon: "🎯", tier: 2, costSP: 2, x: 520, y: 150, parentIds: ["ana-1"], branchName: "Algorithms", perkDescription: "High-speed Bayesian probabilistic estimation." },
      { id: "ana-4", name: "Model Optimization", icon: "⚙️", tier: 2, costSP: 2, x: 520, y: 330, parentIds: ["ana-2"], branchName: "Verification", perkDescription: "Prunes unnecessary problem-solving steps." },
      { id: "ana-5", name: "Oracle Calculus Apex", icon: "🔮", tier: 3, costSP: 3, x: 750, y: 240, parentIds: ["ana-3", "ana-4"], branchName: "Capstone", perkDescription: "Apex calculation speed and analytical synthesis." },
    ],
  },
  class_engineer: {
    classId: "class_engineer",
    className: "Engineer",
    icon: "⚙️",
    themeColor: "#f59e0b",
    tagline: "System Pipeline & Workflow Circuit",
    nodes: [
      { id: "eng-0", name: "System Architecture", icon: "⚙️", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Foundational structure for learning pipelines." },
      { id: "eng-1", name: "Pipeline Automation", icon: "🤖", tier: 1, costSP: 1, x: 300, y: 130, parentIds: ["eng-0"], branchName: "Workflows", perkDescription: "Automates repetitive revision schedules." },
      { id: "eng-2", name: "Modular Chunking", icon: "🧱", tier: 1, costSP: 1, x: 300, y: 350, parentIds: ["eng-0"], branchName: "Mechanics", perkDescription: "Deconstructs large syllabi into discrete micro-units." },
      { id: "eng-3", name: "Fault Tolerance", icon: "🛡️", tier: 2, costSP: 2, x: 520, y: 130, parentIds: ["eng-1"], branchName: "Workflows", perkDescription: "Resilience against study schedule interruptions." },
      { id: "eng-4", name: "Rapid Prototyping", icon: "⚡", tier: 2, costSP: 2, x: 520, y: 350, parentIds: ["eng-2"], branchName: "Mechanics", perkDescription: "Immediate practice testing upon theory ingestion." },
      { id: "eng-5", name: "Singularity Engine", icon: "🚀", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["eng-3", "eng-4"], branchName: "Capstone", perkDescription: "Flawless end-to-end study workflow automation." },
    ],
  },
  class_scientist: {
    classId: "class_scientist",
    className: "Scientist",
    icon: "🔬",
    themeColor: "#10b981",
    tagline: "Empirical Research & Experimentation Tree",
    nodes: [
      { id: "sci-0", name: "Hypothesis Core", icon: "🔬", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Scientific inquiry methodology." },
      { id: "sci-1", name: "Empirical Testing", icon: "🧪", tier: 1, costSP: 1, x: 280, y: 140, parentIds: ["sci-0"], branchName: "Methodology", perkDescription: "Rigorous active recall testing against source data." },
      { id: "sci-2", name: "Literature Matrix", icon: "📑", tier: 1, costSP: 1, x: 280, y: 340, parentIds: ["sci-0"], branchName: "Evidence", perkDescription: "Systematic cross-referencing of academic papers." },
      { id: "sci-3", name: "Variable Isolation", icon: "📐", tier: 2, costSP: 2, x: 500, y: 140, parentIds: ["sci-1"], branchName: "Methodology", perkDescription: "Isolates core problem variables with precision." },
      { id: "sci-4", name: "Peer Review Engine", icon: "🔍", tier: 2, costSP: 2, x: 500, y: 340, parentIds: ["sci-2"], branchName: "Evidence", perkDescription: "Deep critical evaluation of study notes." },
      { id: "sci-5", name: "Scientific Breakthrough", icon: "✨", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["sci-3", "sci-4"], branchName: "Capstone", perkDescription: "Unlocks breakthrough comprehension rates." },
    ],
  },
  class_researcher: {
    classId: "class_researcher",
    className: "Researcher",
    icon: "🧭",
    themeColor: "#818cf8",
    tagline: "Literature Deep-Dive & Source Web",
    nodes: [
      { id: "res-0", name: "Primary Sources", icon: "🧭", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Access directly into foundational texts." },
      { id: "res-1", name: "Citation Web", icon: "🕸️", tier: 1, costSP: 1, x: 280, y: 120, parentIds: ["res-0"], branchName: "Archive", perkDescription: "Traces concepts to their historical origins." },
      { id: "res-2", name: "Deep Annotation", icon: "✍️", tier: 1, costSP: 1, x: 280, y: 240, parentIds: ["res-0"], branchName: "Archive", perkDescription: "Dense contextual margin note integration." },
      { id: "res-3", name: "Synthesis Index", icon: "🗂️", tier: 1, costSP: 1, x: 280, y: 360, parentIds: ["res-0"], branchName: "Archive", perkDescription: "Zettelkasten knowledge web indexing." },
      { id: "res-4", name: "Archival Mastery", icon: "📜", tier: 2, costSP: 2, x: 520, y: 180, parentIds: ["res-1", "res-2"], branchName: "Synthetics", perkDescription: "Infinite query recall from study archives." },
      { id: "res-5", name: "Domain Hegemony", icon: "🌐", tier: 2, costSP: 2, x: 520, y: 300, parentIds: ["res-2", "res-3"], branchName: "Synthetics", perkDescription: "Rapid assimilation of entirely new disciplines." },
      { id: "res-6", name: "Grand Archivist Apex", icon: "🏛️", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["res-4", "res-5"], branchName: "Capstone", perkDescription: "Total academic domain supremacy." },
    ],
  },
  class_psychologist: {
    classId: "class_psychologist",
    className: "Psychologist",
    icon: "🧠",
    themeColor: "#ec4899",
    tagline: "Neuro-Cognition & Flow State Dendrites",
    nodes: [
      { id: "psy-0", name: "Neural Attunement", icon: "🧠", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Regulates autonomic focus and flow readiness." },
      { id: "psy-1", name: "Dopamine Resensitization", icon: "⚡", tier: 1, costSP: 1, x: 290, y: 140, parentIds: ["psy-0"], branchName: "Drive", perkDescription: "Restores intrinsic enjoyment of deep work." },
      { id: "psy-2", name: "Cognitive Firewall", icon: "🛡️", tier: 1, costSP: 1, x: 290, y: 340, parentIds: ["psy-0"], branchName: "Endurance", perkDescription: "Complete immunity to mental fatigue spikes." },
      { id: "psy-3", name: "Flow State Trigger", icon: "🌊", tier: 2, costSP: 2, x: 510, y: 140, parentIds: ["psy-1"], branchName: "Drive", perkDescription: "Instant immersion into alpha brainwave focus." },
      { id: "psy-4", name: "Stress Transmutation", icon: "🔥", tier: 2, costSP: 2, x: 510, y: 340, parentIds: ["psy-2"], branchName: "Endurance", perkDescription: "Converts exam pressure into sharp alertness." },
      { id: "psy-5", name: "Apex Transcendent Mind", icon: "🧘", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["psy-3", "psy-4"], branchName: "Capstone", perkDescription: "Permanent uninterrupted flow state access." },
    ],
  },
  class_strategist: {
    classId: "class_strategist",
    className: "Strategist",
    icon: "♟️",
    themeColor: "#a855f7",
    tagline: "Tactical Campaign & Milestone Roadmap",
    nodes: [
      { id: "str-0", name: "Grand Strategy", icon: "♟️", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Long-range study roadmap architecture." },
      { id: "str-1", name: "Milestone Pacing", icon: "🚩", tier: 1, costSP: 1, x: 290, y: 150, parentIds: ["str-0"], branchName: "Tactics", perkDescription: "Optimizes workload distribution before deadlines." },
      { id: "str-2", name: "Triage Protocol", icon: "⚔️", tier: 1, costSP: 1, x: 290, y: 330, parentIds: ["str-0"], branchName: "Execution", perkDescription: "Prioritizes highest-yield exam topics." },
      { id: "str-3", name: "Contingency Shield", icon: "🛡️", tier: 2, costSP: 2, x: 510, y: 150, parentIds: ["str-1"], branchName: "Tactics", perkDescription: "Guarantees goal completion despite setbacks." },
      { id: "str-4", name: "Resource Maximizer", icon: "💎", tier: 2, costSP: 2, x: 510, y: 330, parentIds: ["str-2"], branchName: "Execution", perkDescription: "Doubles efficiency of study materials." },
      { id: "str-5", name: "Grand Tactician Apex", icon: "🏆", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["str-3", "str-4"], branchName: "Capstone", perkDescription: "Supreme mastery of goal planning & milestones." },
    ],
  },
  class_creative: {
    classId: "class_creative",
    className: "Creative",
    icon: "✨",
    themeColor: "#f43f5e",
    tagline: "Lateral Insight & Synthesis Lattice",
    nodes: [
      { id: "cre-0", name: "Lateral Sparks", icon: "✨", tier: 0, costSP: 0, x: 100, y: 240, parentIds: [], branchName: "Core", perkDescription: "Intuitive cross-domain creative synthesis." },
      { id: "cre-1", name: "Metaphor Engine", icon: "🎨", tier: 1, costSP: 1, x: 290, y: 130, parentIds: ["cre-0"], branchName: "Imagination", perkDescription: "Translates abstract theory into visual metaphors." },
      { id: "cre-2", name: "Non-Linear Leaps", icon: "🌀", tier: 1, costSP: 1, x: 290, y: 350, parentIds: ["cre-0"], branchName: "Insight", perkDescription: "Discovers novel solutions to complex paradoxes." },
      { id: "cre-3", name: "Synesthesia Protocol", icon: "🌈", tier: 2, costSP: 2, x: 510, y: 130, parentIds: ["cre-1"], branchName: "Imagination", perkDescription: "Multi-sensory associative memorization." },
      { id: "cre-4", name: "Eureka State", icon: "💡", tier: 2, costSP: 2, x: 510, y: 350, parentIds: ["cre-2"], branchName: "Insight", perkDescription: "Frequent high-yield spontaneous insights." },
      { id: "cre-5", name: "Infinite Muse Apex", icon: "🌌", tier: 3, costSP: 3, x: 740, y: 240, parentIds: ["cre-3", "cre-4"], branchName: "Capstone", perkDescription: "Uncapped intuitive learning velocity." },
    ],
  },
};

interface ClassTreeState {
  unlockedNodeIds: string[];
  availableSP: number;
  investedSP: number;
}

const STORAGE_KEY = "scholar_skill_tree_states_v2";

export function SkillTreeTab() {
  const [activeClassId, setActiveClassId] = useState<string>("class_scholar");
  const [selectedNode, setSelectedNode] = useState<SkillNodeData | null>(null);

  // Persistent state dictionary across all 8 classes
  const [treeStates, setTreeStates] = useState<Record<string, ClassTreeState>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load skill tree state", e);
      }
    }
    // Default initialization: Root node unlocked, 5 SP available per class
    const initial: Record<string, ClassTreeState> = {};
    Object.keys(CLASS_SKILL_TREES).forEach((cId) => {
      const rootNode = CLASS_SKILL_TREES[cId].nodes[0];
      initial[cId] = {
        unlockedNodeIds: rootNode ? [rootNode.id] : [],
        availableSP: 5,
        investedSP: 0,
      };
    });
    return initial;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(treeStates));
    } catch (e) {
      console.error("Failed to persist skill tree state", e);
    }
  }, [treeStates]);

  const currentConfig = CLASS_SKILL_TREES[activeClassId] || CLASS_SKILL_TREES.class_scholar;
  const currentClassState: ClassTreeState = treeStates[activeClassId] || {
    unlockedNodeIds: [currentConfig.nodes[0]?.id || ""],
    availableSP: 5,
    investedSP: 0,
  };

  // Set default selected node when switching class
  useEffect(() => {
    setSelectedNode(currentConfig.nodes[0] || null);
  }, [activeClassId]);

  // Check if a node can be unlocked
  const isNodeUnlocked = (nodeId: string) => currentClassState.unlockedNodeIds.includes(nodeId);

  const canUnlockNode = (node: SkillNodeData) => {
    if (isNodeUnlocked(node.id)) return false;
    if (currentClassState.availableSP < node.costSP) return false;
    // Must have at least one parent unlocked (or tier 0)
    if (node.parentIds.length === 0) return true;
    return node.parentIds.some(pId => isNodeUnlocked(pId));
  };

  // Unlock Node Action
  const handleUnlockNode = (node: SkillNodeData) => {
    if (!canUnlockNode(node)) return;

    setTreeStates(prev => ({
      ...prev,
      [activeClassId]: {
        unlockedNodeIds: [...(prev[activeClassId]?.unlockedNodeIds || []), node.id],
        availableSP: (prev[activeClassId]?.availableSP || 5) - node.costSP,
        investedSP: (prev[activeClassId]?.investedSP || 0) + node.costSP,
      },
    }));
  };

  // Reset current class tree
  const handleResetClassTree = () => {
    const rootNode = currentConfig.nodes[0];
    const totalSP = currentClassState.availableSP + currentClassState.investedSP;

    setTreeStates(prev => ({
      ...prev,
      [activeClassId]: {
        unlockedNodeIds: rootNode ? [rootNode.id] : [],
        availableSP: totalSP,
        investedSP: 0,
      },
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Class Selector Header Bar ─────────────────── */}
      <div className="system-card p-4 bg-bg-panel/90 border border-border-subtle shadow-xl backdrop-blur-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-accent-text-light px-2 py-0.5 rounded bg-accent-primary-dim border border-accent-primary-mid">
                Class Constellations
              </span>
              <span className="text-xs text-text-muted font-['Rajdhani'] font-semibold">
                8 Unique Path Trees
              </span>
            </div>
            <h2 className="text-xl font-bold font-['Rajdhani'] text-text-primary flex items-center gap-2">
              <span>{currentConfig.icon}</span>
              <span>{currentConfig.className} Skill Tree</span>
              <span className="text-xs font-medium text-text-secondary">({currentConfig.tagline})</span>
            </h2>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="bg-bg-abyss px-3.5 py-1.5 rounded-xl border border-border-subtle flex items-center gap-2">
              <span className="text-base">⭐</span>
              <span className="text-sm font-bold font-['Rajdhani'] text-amber-400">
                {currentClassState.availableSP} SP
              </span>
              <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">Available</span>
            </div>

            <button
              type="button"
              onClick={handleResetClassTree}
              className="px-3 py-1.5 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle text-text-secondary hover:text-text-primary rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all"
            >
              Reset Class SP
            </button>
          </div>
        </div>

        {/* 8 Class Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {Object.values(CLASS_SKILL_TREES).map((cls) => {
            const isSelected = cls.classId === activeClassId;
            const clsState = treeStates[cls.classId];
            const unlockedCount = clsState?.unlockedNodeIds.length || 1;

            return (
              <button
                key={cls.classId}
                type="button"
                onClick={() => setActiveClassId(cls.classId)}
                className={`px-3.5 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold tracking-wider uppercase transition-all shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? "bg-accent-primary text-white shadow-[0_0_12px_var(--accent-primary-dim)]"
                    : "bg-bg-abyss/80 text-text-secondary border border-border-subtle hover:text-text-primary hover:border-border-active"
                }`}
              >
                <span>{cls.icon}</span>
                <span>{cls.className}</span>
                <span className="text-[10px] opacity-70">({unlockedCount}/{cls.nodes.length})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SVG Branching Node Graph & Inspector ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Interactive SVG Constellation Canvas */}
        <div className="lg:col-span-2 system-card p-4 bg-bg-abyss/90 border border-border-subtle rounded-2xl shadow-2xl relative overflow-hidden flex flex-col items-center">
          {/* Subtle Grid Background */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle, var(--accent-primary) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="w-full overflow-x-auto scrollbar-thin">
            <div className="relative min-w-[700px] w-full" style={{ aspectRatio: "900 / 480" }}>
              <svg
                viewBox="0 0 900 480"
                className="w-full h-full"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <linearGradient id="unlockedLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="var(--accent-primary-light)" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="lockedLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                  </linearGradient>
                  <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Draw Connection Lines between Nodes */}
                {currentConfig.nodes.map((node) => {
                  return node.parentIds.map((pId) => {
                    const parentNode = currentConfig.nodes.find(n => n.id === pId);
                    if (!parentNode) return null;

                    const isLineActive = isNodeUnlocked(parentNode.id) && isNodeUnlocked(node.id);
                    const isLineAvailable = isNodeUnlocked(parentNode.id) && !isNodeUnlocked(node.id);

                    // Curved Bezier Connection Path
                    const dx = node.x - parentNode.x;
                    const pathD = `M ${parentNode.x} ${parentNode.y} C ${parentNode.x + dx * 0.5} ${parentNode.y}, ${node.x - dx * 0.5} ${node.y}, ${node.x} ${node.y}`;

                    return (
                      <g key={`${pId}-${node.id}`}>
                        <path
                          d={pathD}
                          fill="none"
                          stroke={isLineActive ? "url(#unlockedLineGrad)" : isLineAvailable ? "rgba(0, 229, 255, 0.4)" : "url(#lockedLineGrad)"}
                          strokeWidth={isLineActive ? 3 : isLineAvailable ? 2 : 1.5}
                          strokeDasharray={isLineAvailable ? "4 4" : undefined}
                          className="transition-all duration-500"
                        />
                      </g>
                    );
                  });
                })}

                {/* Draw Interactive Nodes */}
                {currentConfig.nodes.map((node) => {
                  const isUnlocked = isNodeUnlocked(node.id);
                  const isAvailable = canUnlockNode(node);
                  const isSelected = selectedNode?.id === node.id;

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onClick={() => setSelectedNode(node)}
                      className="cursor-pointer group"
                    >
                      {/* Outer Pulse/Selection Ring */}
                      {isSelected && (
                        <circle
                          r="34"
                          fill="none"
                          stroke="var(--accent-primary)"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                          className="animate-spin"
                          style={{ transformOrigin: "0 0", animationDuration: "12s" }}
                        />
                      )}

                      {/* Unlocked Glow Aura */}
                      {isUnlocked && (
                        <circle
                          r="28"
                          fill="var(--accent-primary-dim)"
                          filter="url(#nodeGlow)"
                          opacity="0.6"
                        />
                      )}

                      {/* Main Node Hexagon/Circle Body */}
                      <circle
                        r="24"
                        fill={isUnlocked ? "var(--bg-panel)" : isAvailable ? "var(--bg-shadow)" : "var(--bg-void)"}
                        stroke={isUnlocked ? "var(--accent-primary)" : isAvailable ? "rgba(0, 229, 255, 0.6)" : "var(--border-subtle)"}
                        strokeWidth={isSelected ? 3 : isUnlocked ? 2 : 1.5}
                        className="transition-all duration-300 group-hover:scale-110"
                        style={{ transformOrigin: "0 0" }}
                      />

                      {/* Icon */}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="16"
                        className="select-none pointer-events-none"
                      >
                        {node.icon}
                      </text>

                      {/* Tier / Cost Label Below */}
                      <text
                        y="38"
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="'Rajdhani', sans-serif"
                        fontWeight="bold"
                        fill={isUnlocked ? "var(--accent-primary-light)" : isAvailable ? "#38bdf8" : "var(--text-muted)"}
                        className="select-none pointer-events-none uppercase tracking-wider"
                      >
                        {isUnlocked ? "Mastered" : isAvailable ? `Unlock (${node.costSP} SP)` : `Tier ${node.tier}`}
                      </text>

                      {/* Node Title Above */}
                      <text
                        y="-34"
                        textAnchor="middle"
                        fontSize="11"
                        fontFamily="'Rajdhani', sans-serif"
                        fontWeight="600"
                        fill={isSelected ? "var(--text-primary)" : "var(--text-secondary)"}
                        className="select-none pointer-events-none"
                      >
                        {node.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Right Col: Node Inspector & Unlock Action */}
        {selectedNode && (
          <div className="system-card p-6 bg-bg-panel/90 border border-border-subtle shadow-xl sticky top-8 flex flex-col gap-5">
            <div className="border-b border-border-subtle pb-3 flex items-center justify-between">
              <span className="text-xs font-['Rajdhani'] font-bold tracking-widest uppercase text-accent-text-light">
                Node Inspector
              </span>
              <span
                className={`text-[10px] font-bold font-['Rajdhani'] px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isNodeUnlocked(selectedNode.id)
                    ? "bg-green-500/20 text-green-400 border border-green-500/40"
                    : canUnlockNode(selectedNode)
                    ? "bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid"
                    : "bg-bg-void text-text-muted border border-border-subtle"
                }`}
              >
                {isNodeUnlocked(selectedNode.id)
                  ? "Mastered"
                  : canUnlockNode(selectedNode)
                  ? "Available to Unlock"
                  : "Locked Node"}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-bg-abyss border border-border-subtle flex items-center justify-center text-3xl shadow-inner shrink-0">
                {selectedNode.icon}
              </div>
              <div>
                <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold uppercase tracking-wider block">
                  {selectedNode.branchName} Branch • Tier {selectedNode.tier}
                </span>
                <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
                  {selectedNode.name}
                </h3>
              </div>
            </div>

            {/* Perk Effect */}
            <div className="bg-bg-abyss/80 rounded-xl p-4 border border-border-subtle flex flex-col gap-1">
              <span className="text-[10px] font-['Rajdhani'] font-bold uppercase text-text-muted">
                Perk Description
              </span>
              <p className="text-xs font-bold text-accent-text-light font-['Rajdhani'] leading-relaxed">
                ⚡ {selectedNode.perkDescription}
              </p>
            </div>

            {/* Unlock Requirements */}
            <div className="flex flex-col gap-2 text-xs font-['Rajdhani']">
              <div className="flex justify-between py-1.5 border-b border-border-subtle/50">
                <span className="text-text-muted">Cost</span>
                <span className="font-bold text-amber-400">{selectedNode.costSP} Skill Points</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border-subtle/50">
                <span className="text-text-muted">Prerequisites</span>
                <span className="font-bold text-text-primary">
                  {selectedNode.parentIds.length === 0 ? "None (Root)" : "Parent Node Connection"}
                </span>
              </div>
            </div>

            {/* Unlock Action Button */}
            <div className="pt-2">
              {isNodeUnlocked(selectedNode.id) ? (
                <div className="w-full py-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl font-['Rajdhani'] font-bold text-center text-xs tracking-widest uppercase flex items-center justify-center gap-2">
                  <span>✓</span> Node Mastered
                </div>
              ) : canUnlockNode(selectedNode) ? (
                <button
                  type="button"
                  onClick={() => handleUnlockNode(selectedNode)}
                  className="w-full py-3 bg-accent-primary hover:opacity-90 active:scale-98 text-text-primary rounded-xl font-['Rajdhani'] font-bold text-sm tracking-widest uppercase transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>INVEST {selectedNode.costSP} SP</span>
                  <span className="text-xs opacity-80">(Unlock Node)</span>
                </button>
              ) : (
                <div className="w-full py-3 bg-bg-void border border-border-subtle text-text-muted rounded-xl font-['Rajdhani'] font-bold text-xs tracking-wider uppercase text-center flex items-center justify-center gap-1.5">
                  <span>🔒</span>
                  <span>{currentClassState.availableSP < selectedNode.costSP ? "Insufficient SP" : "Parent Prerequisites Locked"}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
