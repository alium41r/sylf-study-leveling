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
    toggleTool,
    isDockExpanded,
    setIsDockExpanded,
    dockAnchor,
    setDockAnchor,
  } = useFocusTools();

  const acoustics = useAcoustics();
  const isAudioPlaying = acoustics?.isPlaying || false;

  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const dockRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);

  // Compute Anchor Positioning Classes
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

  // Pointer Down Handler for Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only primary button
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
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;

    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 6) {
      if (!hasMovedRef.current) {
        hasMovedRef.current = true;
        setIsDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      }

      const newX = pointerStartRef.current.originX + dx;
      const newY = pointerStartRef.current.originY + dy;

      const dockEl = dockRef.current;
      const dockWidth = dockEl?.offsetWidth || 180;
      const dockHeight = dockEl?.offsetHeight || 52;

      // Clamp within screen boundaries
      const clampedX = Math.max(12, Math.min(window.innerWidth - dockWidth - 12, newX));
      const clampedY = Math.max(12, Math.min(window.innerHeight - dockHeight - 12, newY));

      setDragOffset({ x: clampedX, y: clampedY });
    }
  };

  // Pointer Up & Edge Snapping
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (hasMovedRef.current && dragOffset) {
      // Calculate snap zone based on drop coordinates
      const dockEl = dockRef.current;
      const dockWidth = dockEl?.offsetWidth || 180;
      const dockHeight = dockEl?.offsetHeight || 52;

      const centerX = dragOffset.x + dockWidth / 2;
      const centerY = dragOffset.y + dockHeight / 2;

      const W = window.innerWidth;
      const H = window.innerHeight;

      const distLeft = centerX;
      const distRight = W - centerX;
      const distTop = centerY;
      const distBottom = H - centerY;

      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      let snappedAnchor: DockAnchor = "bottom-right";

      if (minDist === distBottom) {
        if (centerX < W * 0.35) {
          snappedAnchor = "bottom-left";
        } else if (centerX > W * 0.65) {
          snappedAnchor = "bottom-right";
        } else {
          snappedAnchor = "bottom-center";
        }
      } else if (minDist === distLeft) {
        snappedAnchor = "left";
      } else if (minDist === distRight) {
        snappedAnchor = "right";
      } else if (minDist === distTop) {
        if (centerX < W * 0.5) {
          snappedAnchor = "top-left";
        } else {
          snappedAnchor = "top-right";
        }
      }

      setDockAnchor(snappedAnchor);
    }

    // Reset drag state
    pointerStartRef.current = null;
    setDragOffset(null);
    setTimeout(() => {
      setIsDragging(false);
      hasMovedRef.current = false;
    }, 60);
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDockExpanded(!isDockExpanded);
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

  return (
    <div
      ref={dockRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={
        dragOffset
          ? {
              position: "fixed",
              left: `${dragOffset.x}px`,
              top: `${dragOffset.y}px`,
              zIndex: 50,
              touchAction: "none",
              cursor: "grabbing",
            }
          : {
              touchAction: "none",
              // Keep bottom-anchored dock clear of iOS/Android home indicators
              ...(dockAnchor.startsWith("bottom")
                ? { bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }
                : {}),
            }
      }
      className={`fixed z-40 flex items-center select-none ${
        dragOffset ? "" : getAnchorClasses(dockAnchor)
      }`}
    >
      {/* Floating Action Pill Container */}
      <motion.div
        layout
        transition={{ type: "spring", damping: 28, stiffness: 400 }}
        className={`flex items-center gap-2 p-2 rounded-full border border-border-subtle bg-bg-abyss/95 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.5)] hover:border-accent-primary-mid transition-colors duration-200 cursor-grab active:cursor-grabbing ${
          isDragging ? "ring-2 ring-accent-primary/60 shadow-2xl scale-[1.02]" : ""
        }`}
        style={{
          borderColor: isDragging ? "var(--accent-primary)" : "var(--border-subtle)",
        }}
      >
        {/* Subtle Drag Grip Indicator */}
        <div
          className="pl-1 pr-0.5 text-text-muted hover:text-text-primary transition-colors cursor-grab flex items-center"
          title="Drag to reposition dock anywhere"
        >
          <GripVertical className="w-3.5 h-3.5 opacity-60" />
        </div>

        {/* Toggle Pill Button */}
        <button
          onClick={handleToggleClick}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto ${
            isDockExpanded || activeTool !== null
              ? "bg-accent-primary text-white shadow-md shadow-accent-primary/40"
              : "bg-bg-panel/70 text-text-secondary hover:text-text-primary hover:bg-bg-panel border border-border-subtle"
          }`}
          title="Toggle Study Utilities Dock (Alt+D • Drag grip to re-position)"
        >
          <div className="relative">
            <Wrench className="w-4 h-4" />
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
          {isDockExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto border ${
                dimControl.isDimActive
                  ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/60 shadow-[0_0_12px_rgba(6,182,212,0.35)]"
                  : dimControl.isLightMode
                  ? "bg-bg-panel/70 text-text-secondary hover:text-text-primary hover:bg-bg-panel border-border-subtle"
                  : "bg-bg-panel/40 text-text-muted/50 border-border-subtle cursor-not-allowed opacity-50"
              }`}
            >
              {dimControl.isDimActive ? (
                <SunDim className="w-4 h-4" />
              ) : (
                <SunMedium className="w-4 h-4" />
              )}
              <span
                className="text-[0.65rem] font-bold tracking-widest uppercase"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {dimControl.isDimActive ? "DIM: ON" : "DIM: OFF"}
              </span>
            </button>
          )}

        {/* Expanded Quick-Launch Tool Icons */}
        <AnimatePresence>
          {isDockExpanded && (
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
                      className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 border cursor-pointer pointer-events-auto ${
                        isActive
                          ? item.activeBorder
                          : "bg-bg-panel/70 border-border-subtle hover:bg-bg-panel hover:border-accent-primary-mid hover:text-text-primary"
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? "text-accent-text-light" : item.color}`} />

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
  );
}
