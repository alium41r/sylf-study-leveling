"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useFocusTools, ToolType } from "./FocusToolsContext";
import { useToolWindowManager, ManagedToolWindow, SafeBounds } from "../hooks/useToolWindowManager";
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
  Maximize2,
  Minimize2,
  GripHorizontal,
} from "lucide-react";

export const TOOL_CONFIG: Record<
  NonNullable<ToolType>,
  { title: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  calculator: { title: "SYSTEM CALCULATOR", icon: Calculator, color: "text-blue-400" },
  ai: { title: "AI STUDY ASSISTANT", icon: Sparkles, color: "text-purple-400" },
  audio: { title: "ACOUSTICS MIXER", icon: Headphones, color: "text-emerald-400" },
  notes: { title: "FOCUS SCRATCHPAD", icon: FileText, color: "text-amber-400" },
  formulas: { title: "FORMULAS & REFERENCE", icon: BookOpen, color: "text-cyan-400" },
};

// ──────────────────────────────────────────────────────────────────
// Ephemeral drag runtime state — lives in refs, never in React state.
// Written at pointermove frequency, read by a single RAF callback.
// ──────────────────────────────────────────────────────────────────
interface DragRuntime {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startRectX: number;
  startRectY: number;
  latestX: number;
  latestY: number;
  isDragging: boolean;
  bounds: SafeBounds;
  rafId: number | null;
}

interface FloatingWindowItemProps {
  windowData: ManagedToolWindow;
  isMobile: boolean;
  displayedTools: NonNullable<ToolType>[];
  activeTool: ToolType;
  isMultiToolMode: boolean;
  onFocus: (toolId: NonNullable<ToolType>) => void;
  onBringToFront: (toolId: NonNullable<ToolType>) => void;
  onClose: (toolId: NonNullable<ToolType>) => void;
  onToggleMinimized: (toolId: NonNullable<ToolType>) => void;
  onToggleMaximize: (toolId: NonNullable<ToolType>) => void;
  onOpenTool: (toolId: NonNullable<ToolType>) => void;
  onDragEnd: (toolId: NonNullable<ToolType>, x: number, y: number) => void;
  getSafeBounds: (toolId: NonNullable<ToolType>, width: number, height: number) => SafeBounds;
}

function FloatingWindowItem({
  windowData,
  isMobile,
  displayedTools,
  activeTool,
  isMultiToolMode,
  onFocus,
  onBringToFront,
  onClose,
  onToggleMinimized,
  onToggleMaximize,
  onOpenTool,
  onDragEnd,
  getSafeBounds,
}: FloatingWindowItemProps) {
  const { toolId, rect, isFocused, isMinimized, isMaximized } = windowData;
  const currentConfig = TOOL_CONFIG[toolId];
  const Icon = currentConfig?.icon || Sparkles;

  // ── Refs ──────────────────────────────────────────────────────
  // positionerRef: the outer <div> that owns translate3d(x,y,0).
  //   During drag, we write directly to its style.transform.
  //   At rest, React renders its transform from rect.x/rect.y.
  const positionerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragRuntime | null>(null);

  const isTest = process.env.NODE_ENV === "test";
  const shouldReduceMotion = useReducedMotion();

  // ── Entrance/exit animation (opacity + scale ONLY) ───────────
  // Position is NOT animated by Framer Motion. The outer positioner div
  // handles translate3d imperatively during drag and via React style
  // at rest. Framer Motion only handles fade/scale entrance.
  const motionTransition =
    isTest || shouldReduceMotion
      ? { duration: 0 }
      : { duration: 0.18, ease: [0.2, 0, 0, 1] as const };

  // ── Sync positioner transform from React state ─────────────
  // Always writes the canonical rect position. During active drag,
  // the RAF loop will overwrite this on the next frame — writing
  // the same translate3d is idempotent and invisible to the user.
  // No guard needed since we don't use Framer Motion for positioning.
  useEffect(() => {
    if (!positionerRef.current) return;
    positionerRef.current.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
  }, [rect.x, rect.y]);

  // ── Pointer capture drag: high-performance, zero React rerenders ──

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isMaximized || isMobile) return;

    onFocus(toolId);
    onBringToFront(toolId);

    const bounds = getSafeBounds(toolId, rect.width, rect.height);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* ignore */ }

    // Read the current rendered position from the positioner element.
    // This is the authoritative starting position for the drag.
    let startX = rect.x;
    let startY = rect.y;
    if (positionerRef.current) {
      // Parse current transform to get the rendered position.
      // We avoid DOMMatrix here because jsdom doesn't support it.
      const cs = getComputedStyle(positionerRef.current);
      const transformVal = cs.transform;
      if (transformVal && transformVal !== "none") {
        // Handle both matrix() and translate3d() forms
        const matrixMatch = transformVal.match(/matrix\(([^)]+)\)/);
        if (matrixMatch) {
          const parts = matrixMatch[1].split(",").map(Number);
          if (parts.length >= 6) {
            startX = parts[4];
            startY = parts[5];
          }
        } else {
          const t3dMatch = transformVal.match(/translate3d\(([^,]+),\s*([^,]+)/);
          if (t3dMatch) {
            startX = parseFloat(t3dMatch[1]);
            startY = parseFloat(t3dMatch[2]);
          }
        }
      } else {
        // Fallback: read from inline style if getComputedStyle doesn't resolve transform
        const inlineTransform = positionerRef.current.style.transform;
        if (inlineTransform) {
          const t3dMatch = inlineTransform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
          if (t3dMatch) {
            startX = parseFloat(t3dMatch[1]);
            startY = parseFloat(t3dMatch[2]);
          }
        }
      }
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startRectX: startX,
      startRectY: startY,
      latestX: startX,
      latestY: startY,
      isDragging: false,
      bounds,
      rafId: null,
    };
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startPointerX;
    const dy = e.clientY - drag.startPointerY;

    if (!drag.isDragging) {
      if (Math.hypot(dx, dy) < 4) return;
      drag.isDragging = true;

      // Apply will-change for GPU compositing during drag
      if (positionerRef.current) {
        positionerRef.current.style.willChange = "transform";
      }
    }

    const rawX = drag.startRectX + dx;
    const rawY = drag.startRectY + dy;
    const clampedX = Math.round(Math.max(drag.bounds.minX, Math.min(drag.bounds.maxX, rawX)));
    const clampedY = Math.round(Math.max(drag.bounds.minY, Math.min(drag.bounds.maxY, rawY)));

    drag.latestX = clampedX;
    drag.latestY = clampedY;

    // Schedule at most ONE RAF — the RAF reads latest coordinates
    if (drag.rafId === null) {
      drag.rafId = requestAnimationFrame(() => {
        const d = dragRef.current;
        if (!d || !positionerRef.current) return;
        d.rafId = null;
        positionerRef.current.style.transform = `translate3d(${d.latestX}px, ${d.latestY}px, 0)`;
      });
    }
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    // Cancel any pending RAF
    if (drag.rafId !== null) {
      cancelAnimationFrame(drag.rafId);
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }

    if (drag.isDragging) {
      const finalX = drag.latestX;
      const finalY = drag.latestY;

      // Apply the final visual position immediately to prevent any flicker
      if (positionerRef.current) {
        positionerRef.current.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`;
        positionerRef.current.style.willChange = "";
      }

      // Commit to React state — this causes a render where rect.x/rect.y
      // equal finalX/finalY. The useEffect writes the same transform value,
      // which is idempotent and invisible.
      onDragEnd(toolId, finalX, finalY);
    }

    dragRef.current = null;
  };

  // Handle lostpointercapture as a safety net
  const handleLostPointerCapture = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.rafId !== null) {
      cancelAnimationFrame(drag.rafId);
    }

    if (drag.isDragging) {
      const finalX = drag.latestX;
      const finalY = drag.latestY;

      if (positionerRef.current) {
        positionerRef.current.style.transform = `translate3d(${finalX}px, ${finalY}px, 0)`;
        positionerRef.current.style.willChange = "";
      }

      onDragEnd(toolId, finalX, finalY);
    }

    dragRef.current = null;
  }, [toolId, onDragEnd]);

  // ── Render ────────────────────────────────────────────────────
  //
  // Architecture:
  //
  //   <div ref={positionerRef}>              ← owns translate3d(x,y,0)
  //     <motion.div>                          ← owns opacity + scale (entrance/exit only)
  //       <header (drag handle)>
  //       <content>
  //     </motion.div>
  //   </div>
  //
  // This separation ensures drag never fights entrance animations.

  return (
    <div
      ref={positionerRef}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
        width: `${rect.width}px`,
        height: isMinimized
          ? "48px"
          : toolId === "calculator"
          ? "auto"
          : `${rect.height}px`,
        maxHeight: isMobile ? "92vh" : "calc(100vh - 80px)",
        zIndex: rect.zIndex,
        pointerEvents: "auto",
        display: isMinimized ? "none" : "flex",
      }}
      onPointerDown={() => {
        onFocus(toolId);
        onBringToFront(toolId);
      }}
      role="dialog"
      aria-label={currentConfig.title}
    >
      <motion.div
        initial={isTest ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={
          isTest
            ? undefined
            : {
                opacity: 0,
                scale: 0.96,
                transition: { duration: 0.16, ease: "easeOut" },
              }
        }
        transition={motionTransition}
        className={`flex flex-col rounded-t-2xl md:rounded-2xl border bg-bg-abyss/95 backdrop-blur-2xl overflow-hidden select-text w-full h-full ${
          isFocused
            ? "border-accent-primary ring-1 ring-accent-primary/40 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
            : "border-border-subtle opacity-95 hover:opacity-100 shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
        }`}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {/* Mobile Multi-Tool Tab Bar (visible on small screens when > 1 tool open) */}
        {isMobile && displayedTools.length > 1 && (
          <div
            className="flex items-center gap-1.5 p-2 bg-bg-abyss/95 border-b border-border-subtle overflow-x-auto select-none"
            style={{ pointerEvents: "auto" }}
          >
            {displayedTools.map((tId) => {
              const cfg = TOOL_CONFIG[tId];
              const TabIcon = cfg.icon;
              const isSelected = activeTool === tId;
              return (
                <div
                  key={tId}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold uppercase font-['Rajdhani'] tracking-wider shrink-0 transition-all ${
                    isSelected
                      ? "bg-accent-primary text-white border-accent-primary/60 shadow-md"
                      : "bg-bg-panel/70 text-text-muted border-border-subtle"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onFocus(tId);
                      onBringToFront(tId);
                    }}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <TabIcon className="w-3 h-3" />
                    <span>{tId}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onClose(tId)}
                    className="p-0.5 hover:text-red-400 cursor-pointer ml-1"
                    title={`Close ${cfg.title} Tab`}
                    aria-label={`Close ${cfg.title} Tab`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Header Bar — Acts as the Dedicated Grab & Drag Handle */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
          onLostPointerCapture={handleLostPointerCapture}
          style={{ touchAction: "none" }}
          className="flex items-center justify-between px-3.5 py-2.5 bg-bg-panel/85 border-b border-border-subtle select-none gap-2 cursor-grab active:cursor-grabbing group"
          title="Drag to reposition window"
          aria-label={`Drag ${currentConfig.title} window`}
        >
          {/* Left: Drag Grip + Icon + Title */}
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="w-3.5 h-3.5 opacity-40 group-hover:opacity-80 transition-opacity shrink-0 hidden sm:block" />
            <div
              className={`p-1.5 rounded-lg bg-bg-abyss border border-border-subtle shrink-0 ${currentConfig.color}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span
              className="text-xs font-bold tracking-widest uppercase text-accent-text-light truncate"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {currentConfig.title}
            </span>
          </div>

          {/* Right: Tool Switcher & Window Controls */}
          <div
            className="flex items-center gap-1.5 shrink-0 text-text-muted"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Quick Switch / Open Icons */}
            <div className="flex items-center gap-0.5 bg-bg-abyss/90 border border-border-subtle/80 p-0.5 rounded-lg">
              {(["calculator", "ai", "audio", "notes", "formulas"] as const).map((tId) => {
                const cfg = TOOL_CONFIG[tId];
                const ToolIcon = cfg.icon;
                const isCurrentWindow = toolId === tId;
                const isOpenElsewhere = displayedTools.includes(tId) && !isCurrentWindow;

                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => {
                      if (isCurrentWindow) return;
                      if (isMultiToolMode && isOpenElsewhere) {
                        onFocus(tId);
                        onBringToFront(tId);
                      } else {
                        onOpenTool(tId);
                      }
                    }}
                    className={`relative p-1.5 rounded-md transition-all cursor-pointer ${
                      isCurrentWindow
                        ? "bg-accent-primary text-white shadow-sm"
                        : isOpenElsewhere
                        ? "text-accent-text-light bg-accent-primary/15 border border-accent-primary/40"
                        : "text-text-muted hover:text-text-primary hover:bg-bg-panel"
                    }`}
                    title={
                      isCurrentWindow
                        ? `${cfg.title} (Active)`
                        : isOpenElsewhere
                        ? `Switch to ${cfg.title} (Open)`
                        : `Open ${cfg.title}`
                    }
                    aria-label={`Open or switch to ${cfg.title}`}
                  >
                    <ToolIcon className="w-3.5 h-3.5" />
                    {isOpenElsewhere && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Minimize Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMinimized(toolId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-bg-abyss hover:text-text-primary transition-colors cursor-pointer ml-0.5"
              title={isMinimized ? "Restore Window" : "Minimize Window"}
              aria-label={isMinimized ? `Restore ${currentConfig.title}` : `Minimize ${currentConfig.title}`}
            >
              {isMinimized ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Optional Maximize Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleMaximize(toolId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-bg-abyss hover:text-text-primary transition-colors cursor-pointer"
              title={isMaximized ? "Restore Window Size" : "Maximize Window"}
              aria-label={isMaximized ? `Restore ${currentConfig.title} Size` : `Maximize ${currentConfig.title}`}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(toolId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
              title={`Close ${currentConfig.title} Window`}
              aria-label={`Close ${currentConfig.title} Window`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tool Content Container — Keeps state alive in memory even when presentation is minimized */}
        <div
          className="flex-1 overflow-hidden flex flex-col relative"
          style={{ display: isMinimized ? "none" : "flex" }}
          onPointerDown={() => {
            onFocus(toolId);
            onBringToFront(toolId);
          }}
        >
          <div className="h-full flex flex-col">
            {toolId === "calculator" && <CalculatorTool />}
            {toolId === "ai" && <AiAssistantTool />}
            {toolId === "audio" && <AudioMixerTool />}
            {toolId === "notes" && <ScratchpadTool />}
            {toolId === "formulas" && <FormulasTool />}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function FocusToolWindow() {
  const {
    activeTool,
    openTools,
    isMultiToolMode,
    openTool,
    closeTool,
    focusTool,
    dockAnchor,
    minimizedTools,
    maximizedTools,
    toggleToolMinimized,
    toggleMaximizeTool,
  } = useFocusTools();

  // Canonical window manager with Focus workspace measurement & z-order stack
  const {
    managedWindows,
    displayedTools,
    isMobile,
    bringToFront,
    updateWindowPosition,
    getSafeBounds,
  } = useToolWindowManager({
    openTools,
    activeTool,
    isMultiToolMode,
    dockAnchor,
    minimizedTools,
    maximizedTools,
  });

  const isTest = process.env.NODE_ENV === "test";
  const PresenceWrapper = isTest ? React.Fragment : AnimatePresence;

  const handleDragEnd = useCallback(
    (toolId: NonNullable<ToolType>, x: number, y: number) => {
      updateWindowPosition(toolId, x, y);
    },
    [updateWindowPosition]
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-live="polite">
      <PresenceWrapper>
        {managedWindows.map((windowData) => (
          <FloatingWindowItem
            key={windowData.toolId}
            windowData={windowData}
            isMobile={isMobile}
            displayedTools={displayedTools}
            activeTool={activeTool}
            isMultiToolMode={isMultiToolMode}
            onFocus={focusTool}
            onBringToFront={bringToFront}
            onClose={closeTool}
            onToggleMinimized={toggleToolMinimized}
            onToggleMaximize={toggleMaximizeTool}
            onOpenTool={openTool}
            onDragEnd={handleDragEnd}
            getSafeBounds={getSafeBounds}
          />
        ))}
      </PresenceWrapper>
    </div>
  );
}
