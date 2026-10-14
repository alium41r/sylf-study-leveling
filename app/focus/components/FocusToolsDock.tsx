"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, bottomSheetVariants } from "@/lib/motion";
import { useFocusTools, ToolType, DockAnchor } from "./FocusToolsContext";
import { useAcoustics } from "@/app/components/AcousticsContext";
import { SylvieIcon } from "@/app/components/icons";
import {
  Calculator,
  Headphones,
  FileText,
  BookOpen,
  ChevronUp,
  Wrench,
  GripVertical,
  SunMedium,
  SunDim,
  Power,
  Eye,
  EyeOff,
  Layers,
} from "lucide-react";

interface DockItem {
  id: NonNullable<ToolType>;
  label: string;
  shortLabel: string;
  description: string;
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

/** Keep-screen-awake control (Web Screen Wake Lock) passed in by the Focus page. */
export interface KeepAwakeControlProps {
  isActive: boolean;
  isSupported: boolean;
  error?: string | null;
  onToggle: () => void | Promise<void>;
}

export interface FocusToolsDockProps {
  dimControl?: DimControlProps;
  keepAwakeControl?: KeepAwakeControlProps;
  defaultExpanded?: boolean;
}

const DOCK_ITEMS: DockItem[] = [
  {
    id: "calculator",
    label: "Calculator",
    shortLabel: "Calc",
    description: "STEM & Scientific Keypad",
    hotkey: "Alt+C",
    icon: Calculator,
    color: "text-blue-400 group-hover:text-blue-300",
    activeBorder: "border-blue-400 bg-blue-500/20 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.35)]",
  },
  {
    id: "ai",
    label: "Sylvie",
    shortLabel: "Sylvie",
    description: "Study with Sylvie",
    hotkey: "Alt+A",
    icon: SylvieIcon,
    color: "text-purple-400 group-hover:text-purple-300",
    activeBorder: "border-purple-400 bg-purple-500/20 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.35)]",
  },
  {
    id: "audio",
    label: "Audio Mixer",
    shortLabel: "Audio",
    description: "Ambient Lo-Fi & Beats",
    hotkey: "Alt+M",
    icon: Headphones,
    color: "text-emerald-400 group-hover:text-emerald-300",
    activeBorder: "border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.35)]",
  },
  {
    id: "notes",
    label: "Scratchpad",
    shortLabel: "Notes",
    description: "Session Scratchpad & Notes",
    hotkey: "Alt+N",
    icon: FileText,
    color: "text-amber-400 group-hover:text-amber-300",
    activeBorder: "border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.35)]",
  },
  {
    id: "formulas",
    label: "Formulas",
    shortLabel: "Reader",
    description: "Dynamic STEM Cheat Sheets",
    hotkey: "Alt+F",
    icon: BookOpen,
    color: "text-cyan-400 group-hover:text-cyan-300",
    activeBorder: "border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.35)]",
  },
];

export default function FocusToolsDock({
  dimControl,
  keepAwakeControl,
  defaultExpanded,
}: FocusToolsDockProps) {
  const {
    activeTool,
    openTools,
    minimizedTools,
    restoreTool,
    focusTool,
    isMultiToolMode,
    toggleMultiToolMode,
    openTool,
    toggleTool,
    isDockExpanded,
    setIsDockExpanded,
    isToolbarHidden,
    setIsToolbarHidden,
    dockAnchor,
    dockPosition,
    setDockPosition,
  } = useFocusTools();

  const acoustics = useAcoustics();
  const isAudioPlaying = acoustics?.isPlaying || false;

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showMobileSheet, setShowMobileSheet] = useState<boolean>(false);

  const dockRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const [internalExpanded, setInternalExpanded] = useState<boolean>(defaultExpanded ?? false);
  const isExpanded = defaultExpanded !== undefined ? (internalExpanded || isDockExpanded) : isDockExpanded;

  const handleClosePanel = useCallback(() => {
    setIsDockExpanded(false);
    setInternalExpanded(false);
  }, [setIsDockExpanded]);

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

        const currentWidth = dockEl?.offsetWidth || 140;
        const currentHeight = dockEl?.offsetHeight || 50;

        // Clamp smoothly within screen boundaries with 10px safe margin
        const clampedX = Math.max(10, Math.min(window.innerWidth - currentWidth - 10, newX));
        const clampedY = Math.max(10, Math.min(window.innerHeight - currentHeight - 10, newY));

        const nextPos = { x: clampedX, y: clampedY };
        dragOffsetRef.current = nextPos;
        setDragOffset(nextPos);
      }
    };

    const handleWindowPointerUp = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);

      if (hasMovedRef.current && dragOffsetRef.current) {
        setDockPosition({ x: dragOffsetRef.current.x, y: dragOffsetRef.current.y });
      }
      dragOffsetRef.current = null;
      setDragOffset(null);

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
      const next = !isExpanded;
      setIsDockExpanded(next);
      setInternalExpanded(next);
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
    if (minimizedTools[toolId]) {
      restoreTool(toolId);
    } else {
      toggleTool(toolId);
    }
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

  const handleWakeClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    keepAwakeControl?.onToggle();
  };

  const handleHideClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsToolbarHidden(true);
  };

  const handleUnhideClick = (e: React.MouseEvent) => {
    if (hasMovedRef.current || isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsToolbarHidden(false);
  };

  // Close island on click outside or Escape key
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClosePanel();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        handleClosePanel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded, handleClosePanel]);

  // Keep the dock fully on-screen
  const clampDock = useCallback(() => {
    const el = dockRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 10;
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    let nx = r.left;
    let ny = r.top;
    if (r.right > iw - margin) nx = iw - r.width - margin;
    else if (r.left < margin) nx = margin;
    if (r.bottom > ih - margin) ny = ih - r.height - margin;
    else if (r.top < margin) ny = margin;
    if (Math.abs(nx - r.left) > 0.5 || Math.abs(ny - r.top) > 0.5) {
      setDockPosition({ x: Math.round(nx), y: Math.round(ny) });
    }
  }, [setDockPosition]);

  useEffect(() => {
    if (!dockPosition || isMobile) return;
    clampDock();
  }, [dockPosition, isMobile, clampDock]);

  useEffect(() => {
    if (!dockPosition || isMobile) return;
    const settleTimer = setTimeout(clampDock, 700);
    const onResizeClamp = () => clampDock();
    window.addEventListener("resize", onResizeClamp);
    return () => {
      clearTimeout(settleTimer);
      window.removeEventListener("resize", onResizeClamp);
    };
  }, [dockPosition, isMobile, clampDock]);

  // Overlap Prevention on Mobile: If a visible (unminimized) tool window is active on mobile, hide the floating dock
  const hasVisibleToolOnMobile = isMobile && openTools.some((t) => !minimizedTools[t]);
  if (hasVisibleToolOnMobile) {
    return null;
  }

  const activePos = dragOffset || dockPosition;
  const isNearTop = activePos ? activePos.y < 320 : dockAnchor.startsWith("top");
  const isNearLeft = activePos ? activePos.x < 320 : dockAnchor.endsWith("left");

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
        {/* Floating Tool Island Popover Panel (Desktop) */}
        <AnimatePresence>
          {!isMobile && isExpanded && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, scale: 0.94, y: isNearTop ? -10 : 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: isNearTop ? -10 : 10 }}
              transition={{ type: "spring", damping: 26, stiffness: 380 }}
              className={`absolute ${isNearTop ? "top-full mt-2.5" : "bottom-full mb-2.5"} ${
                isNearLeft ? "left-0" : "right-0"
              } w-[300px] sm:w-[325px] rounded-2xl liquid-glass-dock p-3 sm:p-3.5 shadow-2xl border border-white/15 backdrop-blur-2xl flex flex-col gap-2.5 z-50`}
              role="dialog"
              aria-label="Tool Island"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10 text-text-muted">
                <div className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-accent-text-light" />
                  <span className="text-[11px] font-bold tracking-widest uppercase font-['Rajdhani'] text-text-secondary">
                    Tool Island
                  </span>
                  {openTools.length > 0 && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-accent-primary text-white">
                      {openTools.length} OPEN
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Session Controls Visibility Toggle */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsToolbarHidden(!isToolbarHidden);
                    }}
                    className="p-1 rounded-lg liquid-glass-dock-btn hover:text-text-primary text-text-muted transition-colors"
                    title={isToolbarHidden ? "Show Session Controls (Alt+H)" : "Hide Session Controls (Alt+H)"}
                    aria-label={isToolbarHidden ? "Show Session Controls" : "Hide Session Controls"}
                  >
                    {isToolbarHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>

                  {/* Close Panel Button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleClosePanel();
                    }}
                    className="p-1 rounded-lg liquid-glass-dock-btn hover:text-text-primary text-text-muted transition-colors text-xs font-mono"
                    title="Close Tool Island (Esc)"
                    aria-label="Close Tool Island"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Section A: Tools Grid (Primary Content) */}
              <div className="grid grid-cols-3 gap-2">
                {DOCK_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isMinimized = !!minimizedTools[item.id];
                  const isOpen = openTools.includes(item.id);
                  const isActive = (isOpen && !isMinimized) || activeTool === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={(e) => handleToolClick(e, item.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label={item.label}
                      className={`group relative flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-xl border transition-all duration-150 cursor-pointer text-center ${
                        isMinimized
                          ? "border-amber-400/50 bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                          : isActive
                          ? item.activeBorder
                          : "liquid-glass-dock-btn hover:border-white/20 hover:bg-white/[0.08]"
                      }`}
                      title={
                        isMinimized
                          ? `${item.label} (Minimized • Click to restore)`
                          : `${item.label} (${item.hotkey}) — ${item.description}`
                      }
                    >
                      <div className="relative mb-1">
                        <Icon className={`w-5 h-5 transition-transform duration-150 group-hover:scale-110 ${isMinimized ? "text-amber-300" : isActive ? "text-accent-text-light" : item.color}`} />
                        {item.id === "audio" && isAudioPlaying && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        )}
                        {isMinimized && (
                          <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        )}
                      </div>
                      <span className="text-[11px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary truncate max-w-full leading-tight">
                        {item.label}
                      </span>
                      {isMinimized ? (
                        <span className="text-[8px] font-mono font-bold text-amber-300 bg-amber-500/30 px-1 py-0.2 rounded mt-0.5 border border-amber-400/30">
                          MINIMIZED
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-text-muted/70 bg-black/20 px-1 py-0.2 rounded mt-0.5 border border-white/5">
                          {item.hotkey}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Section B: Session Controls Row (Secondary Content) */}
              <AnimatePresence>
                {!isToolbarHidden ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                    className="border-t border-white/10 pt-2 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-wider uppercase font-['Rajdhani'] text-text-muted/70">
                        Session Controls
                      </span>
                      <button
                        onClick={handleHideClick}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="liquid-glass-dock-btn flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-['Rajdhani'] text-text-muted hover:text-text-primary"
                        title="Hide Toolbar (Alt+H)"
                        aria-label="Hide Toolbar"
                      >
                        <EyeOff className="w-2.5 h-2.5" />
                        <span>Hide</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Dim Screen Toggle (Light Mode only) */}
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
                          className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all duration-150 border text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider ${
                            dimControl.isDimActive
                              ? "bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-sm"
                              : dimControl.isLightMode
                              ? "liquid-glass-dock-btn hover:text-text-primary"
                              : "bg-white/[0.02] text-text-muted/40 border-white/[0.04] cursor-not-allowed opacity-40"
                          }`}
                        >
                          {dimControl.isDimActive ? (
                            <SunDim className="w-3.5 h-3.5 text-cyan-300" />
                          ) : (
                            <SunMedium className="w-3.5 h-3.5 opacity-70" />
                          )}
                          <span className="truncate">
                            {dimControl.isDimActive ? "DIM: ON" : "DIM: OFF"}
                          </span>
                        </button>
                      )}

                      {/* Keep Screen Awake Toggle */}
                      {keepAwakeControl && (
                        <button
                          onClick={handleWakeClick}
                          onPointerDown={(e) => e.stopPropagation()}
                          disabled={!keepAwakeControl.isSupported}
                          title={
                            keepAwakeControl.error ||
                            (keepAwakeControl.isSupported
                              ? "Keep the screen awake while studying"
                              : "Keep screen awake is not supported on this device")
                          }
                          aria-label={keepAwakeControl.isActive ? "Keep screen on" : "Keep screen off"}
                          aria-pressed={keepAwakeControl.isActive}
                          className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all duration-150 border text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider ${
                            keepAwakeControl.isActive
                              ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/50 shadow-sm"
                              : keepAwakeControl.isSupported
                              ? "liquid-glass-dock-btn hover:text-text-primary"
                              : "bg-white/[0.02] text-text-muted/40 border-white/[0.04] cursor-not-allowed opacity-40"
                          }`}
                        >
                          <Power className={`w-3.5 h-3.5 ${keepAwakeControl.isActive ? "text-emerald-300" : "opacity-70"}`} />
                          <span className="truncate">
                            {keepAwakeControl.isActive ? "KEEP: ON" : "KEEP: OFF"}
                          </span>
                        </button>
                      )}

                      {/* Multi-Tool Mode Toggle */}
                      <button
                        onClick={(e) => {
                          if (hasMovedRef.current || isDragging) return;
                          e.preventDefault();
                          e.stopPropagation();
                          toggleMultiToolMode();
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all duration-150 border text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider ${
                          isMultiToolMode
                            ? "bg-purple-500/20 text-purple-200 border-purple-400/50 shadow-sm"
                            : "liquid-glass-dock-btn hover:text-text-primary"
                        }`}
                        title={`Multi-Tool Mode: ${isMultiToolMode ? "ON" : "OFF"} (Alt+U • Open multiple tools simultaneously)`}
                        aria-label="Toggle Multi-Tool Mode"
                        aria-pressed={isMultiToolMode}
                      >
                        <Layers className={`w-3.5 h-3.5 ${isMultiToolMode ? "text-purple-300" : "opacity-70"}`} />
                        <span className="truncate">
                          {isMultiToolMode ? "MULTI: ON" : "MULTI: OFF"}
                        </span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="border-t border-white/10 pt-1.5">
                    <button
                      onClick={handleUnhideClick}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="text-[10px] font-['Rajdhani'] text-text-muted/60 hover:text-text-primary flex items-center justify-center gap-1.5 w-full py-1 rounded-lg hover:bg-white/[0.04] transition-colors"
                      title="Show Study Tools Toolbar (Alt+H • Click to reveal)"
                      aria-label="Show Study Tools Toolbar"
                    >
                      <Eye className="w-3 h-3 opacity-60" />
                      <span>Session toggles hidden (Alt+H)</span>
                    </button>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsed Compact Floating Trigger Pill */}
        <motion.div
          layout
          transition={{ type: "spring", damping: 28, stiffness: 400 }}
          className={`flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-full liquid-glass-dock transition-all duration-300 cursor-grab active:cursor-grabbing ${
            isDragging
              ? "ring-2 ring-accent-primary/60 scale-[1.02] shadow-2xl opacity-100"
              : isExpanded || activeTool !== null || openTools.length > 0
              ? "opacity-100 shadow-2xl ring-1 ring-accent-primary/40"
              : "opacity-75 hover:opacity-100 hover:shadow-xl"
          }`}
          style={{
            borderColor: isDragging ? "var(--accent-primary)" : undefined,
          }}
        >
          {/* Dedicated Drag Grip Indicator */}
          <div
            className="pl-1.5 pr-0.5 text-text-muted/60 hover:text-text-primary transition-colors cursor-grab active:cursor-grabbing flex items-center shrink-0"
            title="Drag to reposition Tool Island"
            aria-label="Drag to reposition"
          >
            <GripVertical className="w-3.5 h-3.5 opacity-50 hover:opacity-100 transition-opacity" />
          </div>

          {/* Tools Trigger Button */}
          <button
            onClick={handleToggleClick}
            onPointerDown={(e) => e.stopPropagation()}
            aria-expanded={isExpanded}
            aria-haspopup="dialog"
            aria-label={isExpanded ? "Close Study Utilities Island" : "Toggle Study Utilities Dock"}
            title="Toggle Study Utilities Dock (Alt+D • Drag grip to re-position)"
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full transition-all duration-200 cursor-pointer pointer-events-auto shrink-0 select-none ${
              isExpanded || showMobileSheet || activeTool !== null || openTools.length > 0
                ? "bg-accent-primary/80 border border-accent-primary/60 text-white shadow-sm"
                : "liquid-glass-dock-btn hover:text-text-primary"
            }`}
          >
            <div className="relative flex items-center">
              <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-light" />
              {isAudioPlaying && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
              {keepAwakeControl?.isActive && (
                <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
            <span className="text-xs font-bold tracking-wider uppercase font-['Rajdhani']">
              Tools
            </span>
            {openTools.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-accent-primary text-white shadow-xs">
                {openTools.length}
              </span>
            )}
            <ChevronUp
              className={`w-3.5 h-3.5 opacity-70 transition-transform duration-200 ${
                isExpanded
                  ? isNearTop ? "rotate-180" : "rotate-0"
                  : isNearTop ? "rotate-0" : "rotate-180"
              }`}
            />
          </button>

          {/* Minimized Tools Tray inside Dock */}
          {openTools.filter((tId) => !!minimizedTools[tId]).map((tId) => {
            const item = DOCK_ITEMS.find((d) => d.id === tId);
            if (!item) return null;
            const ItemIcon = item.icon;
            return (
              <button
                key={tId}
                type="button"
                onClick={(e) => {
                  if (hasMovedRef.current || isDragging) return;
                  e.preventDefault();
                  e.stopPropagation();
                  restoreTool(tId);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-full bg-accent-primary/20 hover:bg-accent-primary/35 border border-accent-primary/50 text-accent-text-light text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 shrink-0"
                title={`Restore ${item.label} (Click to reopen)`}
                aria-label={`Restore ${item.label}`}
              >
                <ItemIcon className="w-3 h-3 text-accent-light" />
                <span className="hidden sm:inline">{item.shortLabel}</span>
              </button>
            );
          })}
        </motion.div>
      </div>

      {/* ─── Dedicated Mobile Focus Tools Quick-Launch Sheet ─── */}
      <AnimatePresence>
        {isMobile && showMobileSheet && (
          <motion.div
            key="mobile-sheet-backdrop"
            variants={backdropVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="fixed inset-0 z-50 flex flex-col justify-end"
          >
            {/* Backdrop */}
            <div
              onClick={() => setShowMobileSheet(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Bottom Drawer */}
            <motion.div
              key="mobile-sheet-drawer"
              variants={bottomSheetVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="relative z-10 w-full bg-bg-panel/95 border-t border-border-active rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsToolbarHidden(!isToolbarHidden)}
                    className="p-1.5 rounded-lg bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle text-xs"
                    title={isToolbarHidden ? "Show Session Controls" : "Hide Session Controls"}
                    aria-label={isToolbarHidden ? "Show Session Controls" : "Hide Session Controls"}
                  >
                    {isToolbarHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMobileSheet(false)}
                    className="p-1.5 rounded-lg bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle text-xs"
                    aria-label="Close sheet"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Tool Cards Grid (Mobile) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DOCK_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTool === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (minimizedTools[item.id]) {
                          restoreTool(item.id);
                        } else {
                          openTool(item.id);
                        }
                        setShowMobileSheet(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 text-left ${
                        minimizedTools[item.id]
                          ? "bg-amber-500/10 border-amber-400/50 shadow-md"
                          : isActive
                          ? "bg-accent-primary-dim/30 border-accent-primary-mid shadow-md"
                          : "bg-bg-abyss/80 border-border-subtle hover:border-accent-primary-mid/40 hover:bg-bg-abyss"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`p-2.5 rounded-xl bg-bg-panel border border-border-subtle ${minimizedTools[item.id] ? "text-amber-400" : item.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm font-['Rajdhani'] text-text-primary uppercase tracking-wide">
                              {item.label}
                            </span>
                            {minimizedTools[item.id] && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                MINIMIZED
                              </span>
                            )}
                            {item.id === "audio" && isAudioPlaying && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                PLAYING
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-text-muted">
                            {item.description}
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

              {/* Session Controls in Mobile Drawer (when not hidden) */}
              {!isToolbarHidden ? (
                <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
                  {/* Eye Comfort Dim Option */}
                  {dimControl && dimControl.isLightMode && (
                    <div className="flex items-center justify-between py-1">
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

                  {/* Keep Screen Awake Option */}
                  {keepAwakeControl && (
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-2">
                        <Power className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-text-secondary font-['Rajdhani'] uppercase tracking-wider">
                          Keep Screen Awake
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => keepAwakeControl.onToggle()}
                        disabled={!keepAwakeControl.isSupported}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider border transition-all ${
                          keepAwakeControl.isActive
                            ? "bg-emerald-400/20 text-emerald-300 border-emerald-400/50"
                            : keepAwakeControl.isSupported
                            ? "bg-bg-abyss text-text-muted border-border-subtle"
                            : "bg-bg-abyss text-text-muted/40 border-border-subtle cursor-not-allowed opacity-60"
                        }`}
                      >
                        {keepAwakeControl.isActive
                          ? "ACTIVE"
                          : keepAwakeControl.isSupported
                          ? "TURN ON"
                          : "N/A"}
                      </button>
                    </div>
                  )}

                  {/* Multi-Tool Mode Option */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold text-text-secondary font-['Rajdhani'] uppercase tracking-wider">
                        Multi-Tool Windows
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMultiToolMode()}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider border transition-all ${
                        isMultiToolMode
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                          : "bg-bg-abyss text-text-muted border-border-subtle"
                      }`}
                    >
                      {isMultiToolMode ? "MULTI: ON" : "MULTI: OFF"}
                    </button>
                  </div>

                  {/* Hide Controls Option in Mobile Drawer */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-text-muted" />
                      <span className="text-xs font-bold text-text-secondary font-['Rajdhani'] uppercase tracking-wider">
                        Session Controls Row
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsToolbarHidden(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider border border-border-subtle bg-bg-abyss text-text-muted hover:text-text-primary transition-all"
                    >
                      HIDE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setIsToolbarHidden(false)}
                    className="w-full py-2 px-3 rounded-xl bg-bg-abyss text-text-secondary hover:text-text-primary border border-border-subtle text-xs font-['Rajdhani'] font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4 text-accent-light" />
                    <span>Show Session Controls</span>
                  </button>
                </div>
              )}

              {keepAwakeControl?.error && (
                <p className="pt-1 text-[10px] text-amber-300/90 font-mono leading-relaxed">
                  {keepAwakeControl.error}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
