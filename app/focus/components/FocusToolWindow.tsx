"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFocusTools, ToolType } from "./FocusToolsContext";
import CalculatorTool from "./tools/CalculatorTool";
import AiAssistantTool from "./tools/AiAssistantTool";
import AudioMixerTool from "./tools/AudioMixerTool";
import ScratchpadTool from "./tools/ScratchpadTool";
import FormulasTool from "./tools/FormulasTool";
import {
  Calculator,
  Sparkles,
  Headphones,
  FileText,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const TOOL_CONFIG: Record<
  NonNullable<ToolType>,
  { title: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  calculator: { title: "SYSTEM CALCULATOR", icon: Calculator, color: "text-blue-400" },
  ai: { title: "AI STUDY ASSISTANT", icon: Sparkles, color: "text-purple-400" },
  audio: { title: "ACOUSTICS MIXER", icon: Headphones, color: "text-emerald-400" },
  notes: { title: "FOCUS SCRATCHPAD", icon: FileText, color: "text-amber-400" },
  formulas: { title: "FORMULAS & REFERENCE", icon: BookOpen, color: "text-cyan-400" },
};

export default function FocusToolWindow() {
  const { activeTool, closeTool, windowMode, setWindowMode, dockAnchor } = useFocusTools();

  if (!activeTool) return null;

  const currentConfig = TOOL_CONFIG[activeTool];
  const Icon = currentConfig?.icon || Sparkles;
  const isMinimized = windowMode === "minimized";

  // Desktop dock-anchored positioning (md+). On mobile the window is a
  // full-width bottom sheet, so every anchor class is prefixed with md:.
  const isLeftAnchored =
    dockAnchor === "bottom-left" || dockAnchor === "left" || dockAnchor === "top-left";
  const isTopAnchored = dockAnchor === "top-left" || dockAnchor === "top-right";

    const positionClasses = isLeftAnchored
    ? isTopAnchored
      ? "md:top-16 md:left-4 lg:left-8"
      : "md:bottom-20 md:left-4 lg:left-8"
    : isTopAnchored
    ? "md:top-16 md:right-4 lg:right-8"
    : "md:bottom-20 md:right-4 lg:right-8";

  return (
    <AnimatePresence>
      <motion.div
        key={activeTool}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: "spring", damping: 26, stiffness: 350 }}
        className={`fixed z-40 inset-x-0 bottom-0 md:inset-x-auto md:bottom-auto w-full max-w-full md:w-[460px] flex flex-col rounded-t-2xl md:rounded-2xl border border-border-subtle bg-bg-abyss/95 backdrop-blur-2xl shadow-[0_16px_50px_rgba(0,0,0,0.65)] overflow-hidden ${positionClasses}`}
        style={{
          height: isMinimized
            ? "48px"
            : activeTool === "calculator"
            ? "auto"
            : "min(600px, 82vh)",
          maxHeight: "calc(100vh - 100px)",
          borderColor: "var(--border-active)",
        }}
      >
        {/* Header Bar (No Maximize/Expand button - Auto-Expanded by Default) */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-bg-panel/70 border-b border-border-subtle select-none">
          {/* Left: Icon + Title */}
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-lg bg-bg-abyss border border-border-subtle ${currentConfig.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span
              className="text-xs font-bold tracking-widest uppercase text-accent-text-light truncate"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {currentConfig.title}
            </span>
          </div>

          {/* Right: Window Controls */}
          <div className="flex items-center gap-1 text-text-muted">
            {/* Minimize Toggle */}
            <button
              onClick={() => setWindowMode(isMinimized ? "normal" : "minimized")}
              className="p-1.5 rounded-lg hover:bg-bg-abyss hover:text-text-primary transition-colors"
              title={isMinimized ? "Restore Window" : "Minimize Window"}
            >
              {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {/* Hotkey hint */}
            <span className="hidden sm:inline-block text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg-void/60 border border-border-subtle text-text-muted">
              ESC
            </span>

            {/* Close Button */}
            <button
              onClick={closeTool}
              className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors ml-0.5"
              title="Close Tool (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tool Content Container */}
        {!isMinimized && (
          <div className="flex-1 overflow-hidden flex flex-col relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="h-full flex flex-col"
              >
                {activeTool === "calculator" && <CalculatorTool />}
                {activeTool === "ai" && <AiAssistantTool />}
                {activeTool === "audio" && <AudioMixerTool />}
                {activeTool === "notes" && <ScratchpadTool />}
                {activeTool === "formulas" && <FormulasTool />}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
