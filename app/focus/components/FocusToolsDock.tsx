"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFocusTools, ToolType, DockAnchor } from "./FocusToolsContext";
import { useAcoustics } from "@/app/components/AcousticsContext";
import {
  Calculator,
  Sparkles,
  Headphones,
  FileText,
  BookOpen,
  ChevronUp,
  ChevronDown,
  Wrench,
  GripVertical,
  SunMedium,
  SunDim,
} from "lucide-react";

interface DockItem {
  id: NonNullable<ToolType>;
  label: string;
  hotkey: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  activeBorder: string;
}

/** Eye-Comfort dim control passed in by the Focus page (Light Mode only). */
export interface DimControlProps {
  isDimActive: boolean;
  isLightMode: boolean;
  onToggleDim: () => void;
}

const DOCK_ITEMS: DockItem[] = [
  {
    id: "calculator",
    label: "Calculator",
    hotkey: "Alt+C",
    icon: Calculator,
    color: "text-blue-400 hover:text-blue-300",
    activeBorder: "border-accent-primary bg-accent-primary/15 text-accent-text-light shadow-[0_0_12px_rgba(59,130,246,0.35)]",
  },
  {
    id: "ai",
    label: "AI Assistant",
    hotkey: "Alt+A",
    icon: Sparkles,
    color: "text-purple-400 hover:text-purple-300",
    activeBorder: "border-accent-primary bg-accent-primary/15 text-accent-text-light shadow-[0_0_12px_rgba(168,85,247,0.35)]",
  },
  {
    id: "audio",
    label: "Audio Mixer",
    hotkey: "Alt+M",
    icon: Headphones,
    color: "text-emerald-400 hover:text-emerald-300",
    activeBorder: "border-accent-primary bg-accent-primary/15 text-accent-text-light shadow-[0_0_12px_rgba(16,185,129,0.35)]",
  },
  {
    id: "notes",
    label: "Scratchpad",
    hotkey: "Alt+N",
    icon: FileText,
    color: "text-amber-400 hover:text-amber-300",
    activeBorder: "border-accent-primary bg-accent-primary/15 text-accent-text-light shadow-[0_0_12px_rgba(245,158,11,0.35)]",
  },
  {
    id: "formulas",
    label: "Formulas",
    hotkey: "Alt+F",
    icon: BookOpen,
    color: "text-cyan-400 hover:text-cyan-300",
    activeBorder: "border-accent-primary bg-accent-primary/15 text-accent-text-light shadow-[0_0_12px_rgba(6,182,212,0.35)]",
  },
];

export default function FocusToolsDock({
  dimControl,
}: {
  dimControl?: DimControlProps;
}) {
  const {
    activeTool,
    openTool,
    toggleTool,
    isDockExpanded,
    setIsDockExpanded,
    dockAnchor,
    dockPosition,
    setDockPosition,
  } = useFocusTools();

  const acoustics = useAcoustics();
  const isAudioPlaying = acoustics?.isPlaying || false;

  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showMobileSheet, setShowMobileSheet] = useState<boolean>(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Track mobile viewport dynamically
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Compute Anchor Positioning Classes (if no custom freeform position set)
  const getAnchorClasses = (anchor: DockAnchor) => {
    switch (anchor) {
      case "bottom-left":
        return "bottom-6 left-6 md:left-8";
      case "bottom-center":
        return "bottom-6 left-1/2 -translate-x-1/2";
      case "left":
        return "left-6 top-1/2 -translate-y-1/2";
      case "right":
        return "right-6 top-1/2 -translate-y-1/2";
      case "top-left":
        return "top-6 left-6 md:left-8";
      case "top-right":
        return "top-6 right-6 md:right-8";
      case "bottom-right":
      default:
        return "bottom-6 right-6 md:right-8";
    }
  };

  // ─── Silky Smooth Freeform Dragging ────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary mouse/touch button
    if (e.button !== 0) return;

    const dockEl = dockRef.current;
    if (!dockEl) return;

    const rect = dockEl.getBoundingClientRect();
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      originX: rect.left,
      originY: rect.top,
    };
    hasMovedRef.current = false;

    const handleWindowPointerMove = (moveEvent: PointerEvent) => {
      if (!pointerStartRef.current) return;

      const dx = moveEvent.clientX - pointerStartRef.current.x;
      const dy = moveEvent.clientY - pointerStartRef.current.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 4) {
        if (!hasMovedRef.current) {
          hasMovedRef.current = true;
          setIsDragging(true);
        }

        const newX = pointerStartRef.current.originX + dx;
        const newY = pointerStartRef.current.originY + dy;

        const currentWidth = dockEl?.offsetWidth || 180;
        const currentHeight = dockEl?.offsetHeight || 50;

        // Clamp smoothly within screen boundaries with 10px safe margin
        const clampedX = Math.max(10, Math.min(window.innerWidth - currentWidth - 10, newX));
        const clampedY = Math.max(10, Math.min(window.innerHeight - currentHeight - 10, newY));

        setDragOffset({ x: clampedX, y: clampedY });
      }
    };

    const handleWindowPointerUp = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);

      if (hasMovedRef.current) {
        setDragOffset((latest) => {
          if (latest) {
            setDockPosition({ x: latest.x, y: latest.y });
          }
          return null;
        });
      }

      pointerStartRef.current = null;
      setTimeout(() => {
        setIsDragging(false);
        hasMovedRef.current = false;
      }, 50);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    if (isMobile) {
      setShowMobileSheet((prev) => !prev);
    } else {
      setIsDockExpanded(!isDockExpanded);
    }
  };

  const handleToolClick = (e: React.MouseEvent, toolId: NonNullable<ToolType>) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    toggleTool(toolId);
    if (isMobile) {
      setShowMobileSheet(false);
    }
  };

  const handleDimClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    dimControl?.onToggleDim();
  };

  // ─── Overlap Prevention on Mobile ──────────────────────────
  // If a tool window is active on mobile, hide the floating dock so it never
  // overlaps keypad buttons, input textareas, or controls!
  if (isMobile && activeTool !== null) {
    return null;
  }

  // Active coordinates (dragOffset takes priority during live drag, then saved dockPosition, then CSS class)
  const activePos = dragOffset || dockPosition;

  return (
    <>
      <div
        ref={dockRef}
        onPointerDown={handlePointerDown}
        style={
          activePos
            ? {
                position: "fixed",
                left: `${activePos.x}px`,
                top: `${activePos.y}px`,
                zIndex: 45,
                touchAction: "none",
              }
            : {
                touchAction: "none",
                ...(dockAnchor.startsWith("bottom")
                  ? { bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }
                  : {}),
              }
        }
        className={`fixed z-45 flex items-center select-none ${
          activePos ? "" : getAnchorClasses(dockAnchor)
        }`}
      >
        {/* Floating Action Pill Container */}
        <motion.div
          layout
          transition={{ type: "spring", damping: 28, stiffness: 400 }}
          className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full border border-border-subtle bg-bg-abyss/95 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.5)] hover:border-accent-primary-mid transition-all duration-200 cursor-grab active:cursor-grabbing ${
            isDragging ? "ring-2 ring-accent-primary/60 shadow-2xl scale-[1.03] cursor-grabbing" : ""
          }`}
          style={{
            borderColor: isDragging ? "var(--accent-primary)" : "var(--border-subtle)",
          }}
        >
          {/* Dedicated Drag Grip Indicator */}
          <div
            className="pl-1 pr-0.5 text-text-muted hover:text-text-primary transition-colors cursor-grab active:cursor-grabbing flex items-center shrink-0"
            title="Drag to reposition anywhere on screen"
          >
            <GripVertical className="w-3.5 h-3.5 opacity-60" />
          </div>

          {/* Toggle Pill Button */}
          <button
            onClick={handleToggleClick}
            onPointerDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto shrink-0 ${
              isDockExpanded || showMobileSheet || activeTool !== null
                ? "bg-accent-primary text-white shadow-md shadow-accent-primary/40"
                : "bg-bg-panel/70 text-text-secondary hover:text-text-primary hover:bg-bg-panel border border-border-subtle"
            }`}
            title="Toggle Study Utilities Dock (Alt+D • Drag grip to re-position)"
          >
            <div className="relative">
              <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {isAudioPlaying && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </div>
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Tools
            </span>
            {isDockExpanded || showMobileSheet ? (
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            ) : (
              <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            )}
          </button>

          {/* Eye-Comfort Dim Toggle (Light Mode only) */}
          {dimControl && (
            <button
              onClick={handleDimClick}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!dimControl.isLightMode}
              title={
                dimControl.isLightMode
                  ? "Dim Screen — Eye Comfort (Shift+D / ⌘D)"
                  : "Only active in Light Mode"
              }
              aria-label={dimControl.isDimActive ? "Dim screen on" : "Dim screen off"}
              aria-pressed={dimControl.isDimActive}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto border shrink-0 ${
                dimControl.isDimActive
                  ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.35)]"
                  : dimControl.isLightMode
                  ? "bg-bg-panel/70 text-text-secondary hover:text-text-primary hover:bg-bg-panel border-border-subtle"
                  : "bg-bg-panel/40 text-text-muted/50 border-border-subtle cursor-not-allowed opacity-50"
              }`}
            >
              {dimControl.isDimActive ? (
                <SunDim className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <SunMedium className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
              <span
                className="text-[0.65rem] font-bold tracking-widest uppercase"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {dimControl.isDimActive ? "DIM: ON" : "DIM: OFF"}
              </span>
            </button>
          )}

          {/* Expanded Quick-Launch Tool Icons (Desktop Only) */}
          <AnimatePresence>
            {!isMobile && isDockExpanded && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: "spring", damping: 24, stiffness: 350 }}
                className="flex items-center gap-2 px-1"
              >
                {DOCK_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTool === item.id;
                  const isHovered = hoveredTool === item.id;

                  return (
                    <div key={item.id} className="relative group">
                      <button
                        onClick={(e) => handleToolClick(e, item.id)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseEnter={() => setHoveredTool(item.id)}
                        onMouseLeave={() => setHoveredTool(null)}
                        className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-150 border cursor-pointer pointer-events-auto ${
                          isActive
                            ? item.activeBorder
                            : "bg-bg-panel/70 border-border-subtle hover:bg-bg-panel hover:border-accent-primary-mid hover:text-text-primary"
                        }`}
                        aria-label={item.label}
                      >
                        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? "text-accent-text-light" : item.color}`} />

                        {/* Playing music badge on Audio icon */}
                        {item.id === "audio" && isAudioPlaying && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </button>

                      {/* Tooltip on Hover */}
                      <AnimatePresence>
                        {isHovered && !isDragging && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.12 }}
                            className="absolute bottom-12 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-bg-abyss/95 border border-border-subtle shadow-xl text-center whitespace-nowrap pointer-events-none z-50 flex flex-col items-center"
                          >
                            <span className="text-[11px] font-bold text-text-primary">
                              {item.label}
                            </span>
                            <span className="text-[9px] font-mono text-accent-text-light">
                              {item.hotkey}
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ─── Dedicated Mobile Focus Tools Quick-Launch Sheet ─── */}
      <AnimatePresence>
        {isMobile && showMobileSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileSheet(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Bottom Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 360 }}
              className="relative z-10 w-full bg-bg-panel/95 border-t border-border-active rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl flex flex-col gap-4"
            >
              {/* Drag Handle Bar */}
              <div className="w-12 h-1.5 rounded-full bg-border-subtle self-center mb-1 opacity-70" />

              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-accent-light" />
                  <h3 className="text-sm font-bold tracking-widest text-text-primary font-['Rajdhani'] uppercase">
                    Study Utilities
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileSheet(false)}
                  className="p-1.5 rounded-lg bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Tool Cards Grid */}
              <div className="grid grid-cols-1 gap-2.5">
                {DOCK_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTool === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        openTool(item.id);
                        setShowMobileSheet(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 text-left ${
                        isActive
                          ? "bg-accent-primary-dim/30 border-accent-primary-mid shadow-md"
                          : "bg-bg-abyss/80 border-border-subtle hover:border-accent-primary-mid/40 hover:bg-bg-abyss"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`p-2.5 rounded-xl bg-bg-panel border border-border-subtle ${item.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm font-['Rajdhani'] text-text-primary uppercase tracking-wide">
                              {item.label}
                            </span>
                            {item.id === "audio" && isAudioPlaying && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                PLAYING
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted">
                            {item.id === "calculator" && "Scientific & STEM Keypad"}
                            {item.id === "ai" && "Interactive Study Assistant"}
                            {item.id === "audio" && "Ambient Lo-Fi & Focus Beats"}
                            {item.id === "notes" && "Session Scratchpad & Notes"}
                            {item.id === "formulas" && "Dynamic Cheat Sheets"}
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-mono text-accent-text-light px-2 py-1 rounded bg-bg-panel border border-border-subtle">
                        {item.hotkey}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Eye Comfort Dim Option in Mobile Drawer */}
              {dimControl && dimControl.isLightMode && (
                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SunDim className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-text-secondary font-['Rajdhani'] uppercase tracking-wider">
                      Eye Comfort Dim Mode
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={dimControl.onToggleDim}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider border transition-all ${
                      dimControl.isDimActive
                        ? "bg-cyan-400/20 text-cyan-300 border-cyan-400/50"
                        : "bg-bg-abyss text-text-muted border-border-subtle"
                    }`}
                  >
                    {dimControl.isDimActive ? "ACTIVE" : "TURN ON"}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
