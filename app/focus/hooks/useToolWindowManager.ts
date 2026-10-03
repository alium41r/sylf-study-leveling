"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ToolType, DockAnchor, getMaxOpenTools } from "../components/FocusToolsContext";

export type WindowState = "open" | "minimized" | "maximized";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface ManagedToolWindow {
  toolId: NonNullable<ToolType>;
  slotIndex: number;
  rect: WindowRect;
  state: WindowState;
  isFocused: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  prevRect?: WindowRect;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface SafeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface UseToolWindowManagerProps {
  openTools: NonNullable<ToolType>[];
  activeTool: ToolType;
  isMultiToolMode: boolean;
  dockAnchor: DockAnchor;
  minimizedTools: Record<string, boolean>;
  maximizedTools?: Record<string, boolean>;
}

export function useToolWindowManager({
  openTools,
  activeTool,
  isMultiToolMode,
  dockAnchor,
  minimizedTools,
  maximizedTools = {},
}: UseToolWindowManagerProps) {
  // Synchronous initial viewport measurement with safe SSR fallback
  const [viewport, setViewport] = useState<ViewportSize>(() => {
    if (typeof window !== "undefined") {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1440, height: 900 };
  });

  const isMobile = viewport.width < 768;
  const isTablet = viewport.width >= 768 && viewport.width < 1024;
  const maxAllowed = getMaxOpenTools();

  // Persistent slot mapping: maps toolId -> assigned slot index (0, 1, 2)
  const slotMapRef = useRef<Map<string, number>>(new Map());

  // ──────────────────────────────────────────────────────────────────
  // CRITICAL: Custom positions live in STATE so commits trigger renders.
  // This is the fix for the snap-back bug: the old ref-only approach
  // had an async gap where Framer Motion's animate target used the
  // stale pre-drag rect between commit and the next render.
  // ──────────────────────────────────────────────────────────────────
  const [customPositions, setCustomPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Prior rect before maximizing: maps toolId -> WindowRect
  const preMaximizeRectsRef = useRef<Map<string, WindowRect>>(new Map());

  // Z-Order Stack: frontmost tool is at the end of the array
  const zStackRef = useRef<NonNullable<ToolType>[]>([]);

  // Revision counter for z-stack changes (z-stack is still a ref for perf,
  // but we bump this when we need the z-order change to render)
  const [, setZRevision] = useState<number>(0);

  // Track resize with immediate update and boundary clamping
  useEffect(() => {
    const handleResize = () => {
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;
      setViewport({ width: newWidth, height: newHeight });

      // Reflow and clamp custom positions within new viewport bounds
      const isMob = newWidth < 768;
      setCustomPositions((prev) => {
        const entries = Object.entries(prev);
        if (entries.length === 0) return prev;

        const next: Record<string, { x: number; y: number }> = {};
        let changed = false;
        for (const [toolId, pos] of entries) {
          if (isMob) {
            const newPos = { x: 0, y: Math.max(0, newHeight - 480) };
            if (newPos.x !== pos.x || newPos.y !== pos.y) changed = true;
            next[toolId] = newPos;
          } else {
            const defaultWidth = Math.min(420, Math.round(newWidth * 0.45));
            const minX = 16;
            const maxX = Math.max(minX, newWidth - defaultWidth - 16);
            const minY = 16;
            const maxY = Math.max(minY, newHeight - 48 - 80);
            const newPos = {
              x: Math.max(minX, Math.min(maxX, pos.x)),
              y: Math.max(minY, Math.min(maxY, pos.y)),
            };
            if (newPos.x !== pos.x || newPos.y !== pos.y) changed = true;
            next[toolId] = newPos;
          }
        }
        return changed ? next : prev;
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Determine which tools to display
  const rawDisplayedTools: NonNullable<ToolType>[] = useMemo(() => {
    if (isMultiToolMode) {
      if (openTools.length > 0) return openTools.slice(-maxAllowed);
      if (activeTool) return [activeTool];
      return [];
    }
    // Single mode: only the active tool (or the last open tool)
    if (activeTool) return [activeTool];
    if (openTools.length > 0) return [openTools[openTools.length - 1]];
    return [];
  }, [isMultiToolMode, openTools, activeTool, maxAllowed]);

  // Update slot allocations stably
  const slotAssignments = useMemo(() => {
    const map = slotMapRef.current;
    const currentTools = rawDisplayedTools;

    if (!isMultiToolMode) {
      // In single mode, the displayed tool is always in primary slot 0
      map.clear();
      if (currentTools.length > 0) {
        map.set(currentTools[0], 0);
      }
      return map;
    }

    // Clean up tools that are no longer open
    const currentToolSet = new Set(currentTools);
    for (const tool of Array.from(map.keys())) {
      if (!currentToolSet.has(tool as NonNullable<ToolType>)) {
        map.delete(tool);
        // Clean up custom positions for closed tools
        setCustomPositions((prev) => {
          if (!(tool in prev)) return prev;
          const next = { ...prev };
          delete next[tool];
          return next;
        });
        preMaximizeRectsRef.current.delete(tool);
      }
    }

    // Assign slots to any tools that don't have one yet
    const usedSlots = new Set(Array.from(map.values()));
    for (const tool of currentTools) {
      if (!map.has(tool)) {
        let slot = 0;
        while (usedSlots.has(slot) && slot < maxAllowed) {
          slot++;
        }
        map.set(tool, slot);
        usedSlots.add(slot);
      }
    }

    return map;
  }, [rawDisplayedTools, isMultiToolMode, maxAllowed]);

  // Synchronously compute and update Z-stack during render
  const currentTools = rawDisplayedTools;
  const currentSet = new Set(currentTools);
  let currentStack = zStackRef.current.filter((t) => currentSet.has(t));

  // Add any newly opened tools to the top of stack
  for (const tool of currentTools) {
    if (!currentStack.includes(tool)) {
      currentStack.push(tool);
    }
  }

  // If activeTool is specified, ensure it is frontmost at top of stack
  if (activeTool && currentStack.includes(activeTool) && currentStack[currentStack.length - 1] !== activeTool) {
    currentStack = [...currentStack.filter((t) => t !== activeTool), activeTool];
  }
  zStackRef.current = currentStack;

  // Safe boundary calculation relative to the Focus workspace
  const getSafeBounds = useCallback(
    (toolId: NonNullable<ToolType>, width: number, height: number): SafeBounds => {
      let wsLeft = 0;
      let wsTop = 0;
      let wsWidth = viewport.width;
      let wsHeight = viewport.height;

      if (typeof document !== "undefined") {
        const wsEl = document.querySelector('[data-focus-workspace="true"]');
        if (wsEl) {
          const r = wsEl.getBoundingClientRect();
          wsLeft = r.left;
          wsTop = r.top;
          wsWidth = r.width;
          wsHeight = r.height;
        }
      }

      if (isMobile) {
        return {
          minX: wsLeft,
          maxX: wsLeft,
          minY: wsTop,
          maxY: Math.max(wsTop, wsTop + wsHeight - height),
        };
      }

      const margin = 16;
      const topSafeInset = 70; // safe clearance below top controls
      const bottomSafeInset = 88; // safe clearance above bottom Focus dock / controls

      const minX = wsLeft + margin;
      const maxX = Math.max(minX, wsLeft + wsWidth - width - margin);
      const minY = wsTop + topSafeInset;
      const maxY = Math.max(minY, wsTop + wsHeight - 44 - bottomSafeInset);

      return { minX, maxX, minY, maxY };
    },
    [isMobile, viewport]
  );

  // Bring tool to front of z-stack
  const bringToFront = useCallback((toolId: NonNullable<ToolType>) => {
    const stack = zStackRef.current;
    if (stack[stack.length - 1] === toolId) return;
    zStackRef.current = [...stack.filter((t) => t !== toolId), toolId];
    setZRevision((v) => v + 1);
  }, []);

  // Update window position on drag end — commits to STATE (not just ref)
  const updateWindowPosition = useCallback(
    (toolId: NonNullable<ToolType>, x: number, y: number) => {
      const defaultWidth = isMobile
        ? viewport.width
        : isTablet
        ? Math.min(380, viewport.width - 32)
        : Math.min(420, Math.round(viewport.width * 0.45));
      const defaultHeight = toolId === "calculator" ? 460 : Math.min(600, Math.round(viewport.height * 0.82));

      const bounds = getSafeBounds(toolId, defaultWidth, defaultHeight);
      const clampedX = Math.round(Math.max(bounds.minX, Math.min(bounds.maxX, x)));
      const clampedY = Math.round(Math.max(bounds.minY, Math.min(bounds.maxY, y)));

      // Commit to render state — this triggers a synchronous React render
      // that updates rect.x/rect.y BEFORE the drag transform is cleared
      setCustomPositions((prev) => {
        const existing = prev[toolId];
        if (existing && existing.x === clampedX && existing.y === clampedY) {
          return prev;
        }
        return { ...prev, [toolId]: { x: clampedX, y: clampedY } };
      });

      bringToFront(toolId);
    },
    [isMobile, isTablet, viewport, getSafeBounds, bringToFront]
  );

  // Calculate target rectangle for any given tool
  const calculateWindowRect = useCallback(
    (
      toolId: NonNullable<ToolType>,
      slotIndex: number,
      isFocused: boolean
    ): WindowRect => {
      const isMinimized = !!minimizedTools[toolId];
      const isMaximized = !!maximizedTools[toolId];

      if (isMobile) {
        // Mobile bottom sheet layout
        const mobileHeight = isMinimized
          ? 48
          : toolId === "calculator"
          ? 420
          : Math.min(600, Math.round(viewport.height * 0.82));
        return {
          x: 0,
          y: Math.max(0, viewport.height - mobileHeight),
          width: viewport.width,
          height: mobileHeight,
          zIndex: isFocused ? 50 : 45,
        };
      }

      // Maximized Desktop layout
      if (isMaximized) {
        return {
          x: 16,
          y: 72,
          width: Math.max(320, viewport.width - 32),
          height: Math.max(300, viewport.height - 150),
          zIndex: isFocused ? 55 : 50,
        };
      }

      // Default Desktop layout dimensions
      const windowWidth = isTablet
        ? Math.min(380, viewport.width - 32)
        : Math.min(420, Math.round(viewport.width * 0.45));

      const windowHeight = isMinimized
        ? 48
        : toolId === "calculator"
        ? 460
        : Math.min(600, Math.round(viewport.height * 0.82));

      // Check if user has dragged this window to a custom position
      const customPos = customPositions[toolId];
      if (customPos) {
        const bounds = getSafeBounds(toolId, windowWidth, windowHeight);
        const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, customPos.x));
        const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, customPos.y));

        const stack = zStackRef.current;
        const stackIdx = stack.indexOf(toolId);
        const zIndex = isFocused ? 50 + stack.length * 2 : 40 + (stackIdx >= 0 ? stackIdx * 2 : slotIndex);

        return {
          x: Math.round(clampedX),
          y: Math.round(clampedY),
          width: Math.round(windowWidth),
          height: Math.round(windowHeight),
          zIndex,
        };
      }

      // Slot-based initial coordinate calculation
      const isLeftAnchored =
        dockAnchor === "bottom-left" || dockAnchor === "left" || dockAnchor === "top-left";
      const isTopAnchored = dockAnchor === "top-left" || dockAnchor === "top-right";

      const margin = isTablet ? 16 : 28;
      const gap = 16;
      const bottomOffset = 88; // safe distance above the bottom dock / island
      const topOffset = 72;

      // Base Y coordinate
      const targetY = isTopAnchored
        ? topOffset
        : Math.max(margin, viewport.height - bottomOffset - windowHeight);

      // Base X coordinate calculation per slot
      let targetX: number;
      if (isLeftAnchored) {
        targetX = margin + slotIndex * (windowWidth + gap);
        if (targetX + windowWidth > viewport.width - margin) {
          targetX = Math.max(margin, viewport.width - margin - windowWidth);
        }
      } else {
        targetX = viewport.width - margin - windowWidth - slotIndex * (windowWidth + gap);
        if (targetX < margin) {
          targetX = margin;
        }
      }

      const stack = zStackRef.current;
      const stackIdx = stack.indexOf(toolId);
      const zIndex = isFocused ? 50 + stack.length * 2 : 40 + (stackIdx >= 0 ? stackIdx * 2 : slotIndex);

      return {
        x: Math.round(targetX),
        y: Math.round(targetY),
        width: Math.round(windowWidth),
        height: Math.round(windowHeight),
        zIndex,
      };
    },
    [viewport, isMobile, isTablet, dockAnchor, minimizedTools, maximizedTools, getSafeBounds, customPositions]
  );

  // Generate the managed window objects with deterministic rects
  const managedWindows: ManagedToolWindow[] = useMemo(() => {
    const toolsToRender =
      isMobile && rawDisplayedTools.length > 1
        ? rawDisplayedTools.filter((t) => t === activeTool).length > 0
          ? [activeTool as NonNullable<ToolType>]
          : [rawDisplayedTools[rawDisplayedTools.length - 1]]
        : rawDisplayedTools;

    return toolsToRender.map((toolId) => {
      const stack = zStackRef.current;
      const topTool = stack.length > 0 ? stack[stack.length - 1] : activeTool;
      const isFocused = topTool === toolId || (toolsToRender.length === 1 && (activeTool === toolId || !activeTool));
      const slotIndex = isMultiToolMode ? slotAssignments.get(toolId) ?? 0 : 0;
      const isMinimized = !!minimizedTools[toolId];
      const isMaximized = !!maximizedTools[toolId];
      const rect = calculateWindowRect(toolId, slotIndex, isFocused);

      const state: WindowState = isMinimized
        ? "minimized"
        : isMaximized
        ? "maximized"
        : "open";

      return {
        toolId,
        slotIndex,
        rect,
        state,
        isFocused,
        isMinimized,
        isMaximized,
        prevRect: preMaximizeRectsRef.current.get(toolId),
      };
    });
  }, [
    rawDisplayedTools,
    isMobile,
    activeTool,
    isMultiToolMode,
    slotAssignments,
    minimizedTools,
    maximizedTools,
    calculateWindowRect,
  ]);

  return {
    managedWindows,
    displayedTools: rawDisplayedTools,
    isMobile,
    viewport,
    bringToFront,
    updateWindowPosition,
    getSafeBounds,
  };
}
