"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { SkeletonNode } from "@/lib/skill-tree-skeleton";
import {
  SKELETON_NODES,
  SKELETON_EDGES,
  isNodeAvailable,
  getNodeDisplayCode,
} from "@/lib/skill-tree-skeleton";
import {
  TIER_THEMES,
  getTierTheme,
  getScallopedMedallionPath,
  getApexCelestialStarPath,
  getApexStarFacetLines,
  getApexCoronaStarPath,
  getSparkleStarPath,
  getLaurelLeavesSVG,
  getWhirlwindManaPath,
} from "@/lib/skill-tree-theme";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Hand,
  Check,
  Flame,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

export type NodeStatus = "UNLOCKED" | "AVAILABLE" | "LOCKED";
type EdgeStatus = "ACTIVE" | "AVAILABLE" | "LOCKED";

interface SkillNodeGraphProps {
  unlockedSet: Set<string>;
  selectedNodeId: string | null;
  onSelectNode: (node: SkeletonNode) => void;
  accentColor: string;
  accentHex: string;
  skillPoints: number;
}

interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

// ─── SVG World Dimensions ───────────────────────────────────────

const WORLD_W = 1000;
const WORLD_H = 1200;

// Responsive zoom bounds (allows full constellation fitting even on narrow mobile devices)
const MIN_ZOOM = 0.20;
const MAX_ZOOM = 2.6;
const DEFAULT_FOCUS_ZOOM = 1.25;

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  const scaledW = WORLD_W * zoom;
  const scaledH = WORLD_H * zoom;

  let minPanX: number;
  let maxPanX: number;
  if (scaledW <= cw) {
    const centerPanX = (cw - scaledW) / 2;
    const slack = Math.max(30, (cw - scaledW) * 0.35);
    minPanX = centerPanX - slack;
    maxPanX = centerPanX + slack;
  } else {
    const marginX = Math.min(160, cw * 0.25);
    minPanX = cw - scaledW - marginX;
    maxPanX = marginX;
  }

  let minPanY: number;
  let maxPanY: number;
  if (scaledH <= ch) {
    const centerPanY = (ch - scaledH) / 2;
    const slack = Math.max(30, (ch - scaledH) * 0.35);
    minPanY = centerPanY - slack;
    maxPanY = centerPanY + slack;
  } else {
    const marginY = Math.min(160, ch * 0.25);
    minPanY = ch - scaledH - marginY;
    maxPanY = marginY;
  }

  return {
    x: Math.min(maxPanX, Math.max(minPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(minPanY, pan.y)),
  };
}

function resolveNodeStatus(
  nodeId: string,
  unlockedSet: Set<string>
): NodeStatus {
  if (unlockedSet.has(nodeId)) return "UNLOCKED";
  if (isNodeAvailable(nodeId, unlockedSet)) return "AVAILABLE";
  return "LOCKED";
}

function resolveEdgeStatus(
  parentId: string,
  childId: string,
  unlockedSet: Set<string>
): EdgeStatus {
  const parentUnlocked = unlockedSet.has(parentId);
  const childUnlocked = unlockedSet.has(childId);
  if (parentUnlocked && childUnlocked) return "ACTIVE";
  if (parentUnlocked) return "AVAILABLE";
  return "LOCKED";
}

const SPARKLE_NODE_IDS = new Set([
  "N3_1", "N3_6",
  "N4_1", "N4_8",
  "N5_1", "N5_6",
  "N6_1", "N6_8",
  "N7_1", "N7_7",
  "N8_1", "N8_5",
  "N9_1", "N9_2", "N9_3",
]);

export function SkillNodeGraph({
  unlockedSet,
  selectedNodeId,
  onSelectNode,
}: SkillNodeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      const polarity = document.documentElement.getAttribute("data-surface-polarity");
      const mode = document.documentElement.getAttribute("data-mode");
      setIsLightMode(polarity ? polarity === "light" : mode === "light");
    };
    checkMode();
    const observer = new MutationObserver(checkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "data-surface-polarity"],
    });
    return () => observer.disconnect();
  }, []);

  const [viewport, setViewport] = useState<ViewportTransform>({
    zoom: DEFAULT_FOCUS_ZOOM,
    panX: 0,
    panY: 0,
  });
  const viewportRef = useRef<ViewportTransform>(viewport);
  viewportRef.current = viewport;

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const touchDistanceRef = useRef<number | null>(null);
  const isClickRef = useRef<boolean>(true);

  const nodeMap = useMemo(() => {
    const m = new Map<string, SkeletonNode>();
    for (const n of SKELETON_NODES) m.set(n.id, n);
    return m;
  }, []);

  const nodeStatuses = useMemo(() => {
    const m = new Map<string, NodeStatus>();
    for (const node of SKELETON_NODES) {
      m.set(node.id, resolveNodeStatus(node.id, unlockedSet));
    }
    return m;
  }, [unlockedSet]);

  const edgeData = useMemo(() => {
    return SKELETON_EDGES.map(([parentId, childId]) => {
      const parent = nodeMap.get(parentId)!;
      const child = nodeMap.get(childId)!;
      return {
        parentId,
        childId,
        parentTier: parent.tier,
        childTier: child.tier,
        x1: parent.x,
        y1: parent.y,
        x2: child.x,
        y2: child.y,
        status: resolveEdgeStatus(parentId, childId, unlockedSet),
      };
    });
  }, [nodeMap, unlockedSet]);

  const standardMedallionPath = useMemo(() => getScallopedMedallionPath(18, 12, 2.5), []);
  const rootMedallionPath = useMemo(() => getScallopedMedallionPath(32, 16, 3.2), []);
  const apexStarPath = useMemo(() => getApexCelestialStarPath(68, 32), []);
  const apexCoronaStarPath = useMemo(() => getApexCoronaStarPath(82, 40), []);
  const apexFacetLines = useMemo(() => getApexStarFacetLines(68, 32), []);
  const sparklePath = useMemo(() => getSparkleStarPath(5.5), []);
  const largeSparklePath = useMemo(() => getSparkleStarPath(8.5), []);
  const miniSparklePath = useMemo(() => getSparkleStarPath(3.5), []);
  const leftLaurel = useMemo(() => getLaurelLeavesSVG("left", "#D97706"), []);
  const rightLaurel = useMemo(() => getLaurelLeavesSVG("right", "#D97706"), []);

  // Wavy Whirlwind Mana Paths (calibrated to safely clear all nodes including #45 & #47)
  const leftManaStreamA = useMemo(() => getWhirlwindManaPath("left", 0, 14, 3.2), []);
  const leftManaStreamB = useMemo(() => getWhirlwindManaPath("left", Math.PI, 10, 3.2), []);
  const rightManaStreamA = useMemo(() => getWhirlwindManaPath("right", 0, 14, 3.2), []);
  const rightManaStreamB = useMemo(() => getWhirlwindManaPath("right", Math.PI, 10, 3.2), []);

  const centerOnCoord = useCallback(
    (wx: number, wy: number, targetZoom: number = viewportRef.current.zoom) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cw = rect.width || 600;
      const ch = rect.height || 600;

      const rawPanX = cw / 2 - wx * targetZoom;
      const rawPanY = ch / 2 - wy * targetZoom;

      const clamped = clampPan({ x: rawPanX, y: rawPanY }, targetZoom, cw, ch);
      const next = { zoom: targetZoom, panX: clamped.x, panY: clamped.y };
      viewportRef.current = next;
      setViewport(next);
    },
    []
  );

  const centerOnNode = useCallback(
    (nodeId: string, targetZoom: number = DEFAULT_FOCUS_ZOOM) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        centerOnCoord(node.x, node.y, targetZoom);
      }
    },
    [nodeMap, centerOnCoord]
  );

  const fitView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cw = rect.width || 600;
    const ch = rect.height || 600;

    const padX = cw < 640 ? 16 : 36;
    const padY = ch < 640 ? 16 : 36;

    const scaleX = (cw - padX) / WORLD_W;
    const scaleY = (ch - padY) / WORLD_H;
    const fitScale = Math.min(scaleX, scaleY);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitScale));

    const rawPanX = (cw - WORLD_W * zoom) / 2;
    const rawPanY = (ch - WORLD_H * zoom) / 2;

    const clamped = clampPan({ x: rawPanX, y: rawPanY }, zoom, cw, ch);
    const next = { zoom, panX: clamped.x, panY: clamped.y };
    viewportRef.current = next;
    setViewport(next);
  }, []);

  useEffect(() => {
    if (hasInteracted) return;

    let targetNodeId = "N1_1";
    if (selectedNodeId) {
      targetNodeId = selectedNodeId;
    } else {
      const availableNode = SKELETON_NODES.find((n) => nodeStatuses.get(n.id) === "AVAILABLE");
      if (availableNode) {
        targetNodeId = availableNode.id;
      }
    }

    const timer = setTimeout(() => {
      centerOnNode(targetNodeId, DEFAULT_FOCUS_ZOOM);
    }, 60);

    return () => clearTimeout(timer);
  }, [centerOnNode, hasInteracted, nodeStatuses, selectedNodeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const cw = rect.width || 600;
      const ch = rect.height || 600;
      const cx = cw / 2;
      const cy = ch / 2;

      const current = viewportRef.current;
      const zoomFactor = 1 - e.deltaY * 0.0012;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * zoomFactor));

      const wx = (cx - current.panX) / current.zoom;
      const wy = (cy - current.panY) / current.zoom;

      const rawPanX = cx - wx * newZoom;
      const rawPanY = cy - wy * newZoom;

      const clamped = clampPan({ x: rawPanX, y: rawPanY }, newZoom, cw, ch);
      const next = { zoom: newZoom, panX: clamped.x, panY: clamped.y };
      viewportRef.current = next;
      setViewport(next);
      setHasInteracted(true);
    };

    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheelNative);
    };
  }, []);

  const handleZoomDelta = (delta: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cw = rect.width || 600;
    const ch = rect.height || 600;
    const cx = cw / 2;
    const cy = ch / 2;

    const current = viewportRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + delta));

    const wx = (cx - current.panX) / current.zoom;
    const wy = (cy - current.panY) / current.zoom;

    const rawPanX = cx - wx * newZoom;
    const rawPanY = cy - wy * newZoom;

    const clamped = clampPan({ x: rawPanX, y: rawPanY }, newZoom, cw, ch);
    const next = { zoom: newZoom, panX: clamped.x, panY: clamped.y };
    viewportRef.current = next;
    setViewport(next);
    setHasInteracted(true);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    isClickRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: viewportRef.current.panX,
      panY: viewportRef.current.panY,
    };
    setHasInteracted(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      isClickRef.current = false;
    }

    const rawPan = {
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    };

    const clamped = clampPan(rawPan, viewportRef.current.zoom, rect.width, rect.height);
    const next = { zoom: viewportRef.current.zoom, panX: clamped.x, panY: clamped.y };
    viewportRef.current = next;
    setViewport(next);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setIsDragging(true);
      isClickRef.current = true;
      dragStartRef.current = {
        x: t.clientX,
        y: t.clientY,
        panX: viewportRef.current.panX,
        panY: viewportRef.current.panY,
      };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceRef.current = Math.hypot(dx, dy);
    }
    setHasInteracted(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const current = viewportRef.current;

    if (e.touches.length === 1 && isDragging) {
      const t = e.touches[0];
      const dx = t.clientX - dragStartRef.current.x;
      const dy = t.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isClickRef.current = false;
      }
      const rawPan = {
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      };
      const clamped = clampPan(rawPan, current.zoom, rect.width, rect.height);
      const next = { zoom: current.zoom, panX: clamped.x, panY: clamped.y };
      viewportRef.current = next;
      setViewport(next);
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchDistanceRef.current;

      const cw = rect.width || 600;
      const ch = rect.height || 600;
      const cx = cw / 2;
      const cy = ch / 2;

      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
      const wx = (cx - current.panX) / current.zoom;
      const wy = (cy - current.panY) / current.zoom;

      const rawPanX = cx - wx * newZoom;
      const rawPanY = cy - wy * newZoom;

      const clamped = clampPan({ x: rawPanX, y: rawPanY }, newZoom, cw, ch);
      const next = { zoom: newZoom, panX: clamped.x, panY: clamped.y };
      viewportRef.current = next;
      setViewport(next);
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  const handleNodeClick = (node: SkeletonNode) => {
    if (!isClickRef.current) return;
    onSelectNode(node);
    centerOnCoord(node.x, node.y, Math.max(viewportRef.current.zoom, DEFAULT_FOCUS_ZOOM));
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative w-full h-[540px] sm:h-[640px] rounded-3xl overflow-hidden select-none border ${
        isLightMode ? "border-purple-200/50 shadow-2xl" : "border-white/10 shadow-2xl"
      } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        touchAction: "none",
        overscrollBehavior: "contain",
        backgroundImage: isLightMode
          ? `
            radial-gradient(ellipse at 50% 12%, rgba(139, 92, 246, 0.10) 0%, transparent 65%),
            radial-gradient(ellipse at 50% 88%, rgba(245, 158, 11, 0.10) 0%, transparent 65%),
            linear-gradient(to bottom, #faf8fd, #ffffff, #fffaf5)
          `
          : `
            radial-gradient(ellipse at 50% 12%, rgba(139, 92, 246, 0.20) 0%, transparent 65%),
            radial-gradient(ellipse at 50% 88%, rgba(245, 158, 11, 0.15) 0%, transparent 65%),
            linear-gradient(to bottom, #090a12, #0d0e1a, #0a0808)
          `,
      }}
    >
      {/* ─── Floating HUD ────────────────────────────────────── */}
      <div
        className={`absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-lg pointer-events-none ${
          isLightMode
            ? "bg-white/80 border-purple-100 text-slate-600"
            : "bg-zinc-950/80 border-white/10 text-zinc-400"
        }`}
      >
        <Hand className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider">
          Scroll to Zoom • Drag to Pan
        </span>
      </div>

      <div
        className={`absolute top-4 right-4 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl border backdrop-blur-xl shadow-2xl ${
          isLightMode
            ? "bg-white/80 border-purple-100 shadow-purple-900/5"
            : "bg-zinc-950/80 border-white/10 shadow-black/40"
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoomDelta(0.25)}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <span className="text-[11px] font-mono font-bold text-text-primary px-1.5 min-w-[42px] text-center">
          {Math.round(viewport.zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => handleZoomDelta(-0.25)}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className={`w-[1px] h-4 my-auto mx-0.5 ${isLightMode ? "bg-slate-200" : "bg-white/10"}`} />

        <button
          type="button"
          onClick={() => {
            if (selectedNodeId) centerOnNode(selectedNodeId, DEFAULT_FOCUS_ZOOM);
            else centerOnNode("N1_1", DEFAULT_FOCUS_ZOOM);
          }}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-purple-600 hover:bg-purple-100/60"
              : "text-purple-400 hover:bg-purple-950/40"
          }`}
          title="Focus Selected Node"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={fitView}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Fit Full Constellation"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Transformed World Canvas ────────────────────────── */}
      <div
        className="absolute top-0 left-0 will-change-transform pointer-events-none"
        style={{
          width: WORLD_W,
          height: WORLD_H,
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
          className="w-full h-full pointer-events-auto"
          style={{ overflow: "visible" }}
        >
          <defs>
            {/* Glow Filters */}
            <filter id="sk-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity={isLightMode ? 0.45 : 0.65} />
            </filter>
            <filter id="sk-glow-violet" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#8b5cf6" floodOpacity={isLightMode ? 0.5 : 0.75} />
            </filter>
            <filter id="sk-glow-mana" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#a855f7" floodOpacity={isLightMode ? 0.65 : 0.85} />
            </filter>
            <filter id="sk-glow-warm" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity={isLightMode ? 0.5 : 0.75} />
            </filter>

            {/* Tier Gradients */}
            {Object.values(TIER_THEMES).map((t) => (
              <React.Fragment key={`sk-tgrad-${t.tier}`}>
                <linearGradient id={`sk-tier-fill-${t.tier}-light`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={t.fillLightStart} />
                  <stop offset="100%" stopColor={t.fillLightEnd} />
                </linearGradient>
                <linearGradient id={`sk-tier-fill-${t.tier}-dark`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={t.fillDarkStart} />
                  <stop offset="100%" stopColor={t.fillDarkEnd} />
                </linearGradient>
              </React.Fragment>
            ))}

            {/* Universal Full-Tree Gradient */}
            <linearGradient
              id="sk-global-tree-gradient-light"
              x1="500"
              y1="1150"
              x2="500"
              y2="70"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="10%" stopColor="#EA580C" />
              <stop offset="20%" stopColor="#F97316" />
              <stop offset="32%" stopColor="#E11D48" />
              <stop offset="45%" stopColor="#BE123C" />
              <stop offset="58%" stopColor="#C026D3" />
              <stop offset="70%" stopColor="#9333EA" />
              <stop offset="82%" stopColor="#6366F1" />
              <stop offset="92%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>

            <linearGradient
              id="sk-global-tree-gradient-dark"
              x1="500"
              y1="1150"
              x2="500"
              y2="70"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="10%" stopColor="#FB923C" />
              <stop offset="20%" stopColor="#FDBA74" />
              <stop offset="32%" stopColor="#FB7185" />
              <stop offset="45%" stopColor="#F43F5E" />
              <stop offset="58%" stopColor="#E879F9" />
              <stop offset="70%" stopColor="#C084FC" />
              <stop offset="82%" stopColor="#A5B4FC" />
              <stop offset="92%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#A78BFA" />
            </linearGradient>

            <style>{`
              @keyframes skEdgeFlowDash {
                from { stroke-dashoffset: 40; }
                to { stroke-dashoffset: 0; }
              }
              .sk-active-edge {
                animation: skEdgeFlowDash 8s linear infinite;
              }
              @keyframes skPulseAura {
                0%, 100% { transform: scale(1); opacity: 0.75; }
                50% { transform: scale(1.06); opacity: 1; }
              }
              .sk-celestial-pulse {
                animation: skPulseAura 3s ease-in-out infinite;
                transform-origin: center;
              }
              @keyframes skManaWhirlwindPrimary {
                from { stroke-dashoffset: 400; }
                to { stroke-dashoffset: 0; }
              }
              @keyframes skManaWhirlwindSecondary {
                from { stroke-dashoffset: 0; }
                to { stroke-dashoffset: -400; }
              }
              .sk-mana-primary {
                animation: skManaWhirlwindPrimary 11s linear infinite;
              }
              .sk-mana-secondary {
                animation: skManaWhirlwindSecondary 15s linear infinite;
              }
            `}</style>
          </defs>

          {/* ─── Organic Wavy Whirlwind Mana Flow & Celestial Backdrop ─── */}
          <g className="celestial-backdrop">
            {/* Left Flank — Wavy Whirlwind Mana Streams */}
            <path
              d={leftManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#sk-global-tree-gradient-light)" : "url(#sk-global-tree-gradient-dark)"}
              strokeWidth="1.8"
              strokeDasharray="4 7"
              opacity={isLightMode ? 0.42 : 0.48}
            />
            <path
              d={leftManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#sk-global-tree-gradient-light)" : "url(#sk-global-tree-gradient-dark)"}
              strokeWidth="2.4"
              strokeDasharray="16 54"
              strokeLinecap="round"
              filter="url(#sk-glow-mana)"
              opacity={isLightMode ? 0.72 : 0.88}
              className="sk-mana-primary"
            />
            <path
              d={leftManaStreamB}
              fill="none"
              stroke={isLightMode ? "rgba(244, 63, 94, 0.35)" : "rgba(244, 63, 94, 0.45)"}
              strokeWidth="1.4"
              strokeDasharray="3 9"
              filter="url(#sk-glow-warm)"
              opacity={isLightMode ? 0.5 : 0.65}
              className="sk-mana-secondary"
            />

            {/* Right Flank — Wavy Whirlwind Mana Streams */}
            <path
              d={rightManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#sk-global-tree-gradient-light)" : "url(#sk-global-tree-gradient-dark)"}
              strokeWidth="1.8"
              strokeDasharray="4 7"
              opacity={isLightMode ? 0.42 : 0.48}
            />
            <path
              d={rightManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#sk-global-tree-gradient-light)" : "url(#sk-global-tree-gradient-dark)"}
              strokeWidth="2.4"
              strokeDasharray="16 54"
              strokeLinecap="round"
              filter="url(#sk-glow-mana)"
              opacity={isLightMode ? 0.72 : 0.88}
              className="sk-mana-primary"
            />
            <path
              d={rightManaStreamB}
              fill="none"
              stroke={isLightMode ? "rgba(244, 63, 94, 0.35)" : "rgba(244, 63, 94, 0.45)"}
              strokeWidth="1.4"
              strokeDasharray="3 9"
              filter="url(#sk-glow-warm)"
              opacity={isLightMode ? 0.5 : 0.65}
              className="sk-mana-secondary"
            />

            {/* Apex Concentric Celestial Orbit Halos */}
            <circle
              cx="500"
              cy="100"
              r="96"
              fill="none"
              stroke={isLightMode ? "rgba(139, 92, 246, 0.32)" : "rgba(168, 85, 247, 0.36)"}
              strokeWidth="1.1"
              strokeDasharray="4 6"
            />
            <circle
              cx="500"
              cy="100"
              r="145"
              fill="none"
              stroke={isLightMode ? "rgba(139, 92, 246, 0.2)" : "rgba(168, 85, 247, 0.24)"}
              strokeWidth="0.8"
            />
            <line x1="500" y1="28" x2="500" y2="6" stroke={isLightMode ? "#8b5cf6" : "#c084fc"} strokeWidth="1.8" strokeLinecap="round" />
            <path d={largeSparklePath} transform="translate(500, 6)" fill={isLightMode ? "#8b5cf6" : "#c084fc"} />
            <path d={miniSparklePath} transform="translate(500, 18)" fill={isLightMode ? "#8b5cf6" : "#c084fc"} />
            <circle cx="500" cy="1100" r="62" fill="none" stroke={isLightMode ? "rgba(245, 158, 11, 0.28)" : "rgba(251, 191, 36, 0.32)"} strokeWidth="1" strokeDasharray="2 4" />
          </g>

          {/* ─── S-Curved Gradient Edges ─── */}
          <g className="edges-layer">
            {edgeData.map((edge, idx) => {
              const { x1, y1, x2, y2, status } = edge;
              let pathD: string;
              if (x1 === x2) {
                pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              } else {
                const midY = (y1 + y2) / 2;
                pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              }

              const edgeGradient = isLightMode
                ? "url(#sk-global-tree-gradient-light)"
                : "url(#sk-global-tree-gradient-dark)";

              if (status === "ACTIVE") {
                return (
                  <g key={`e-${idx}`}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edgeGradient}
                      strokeWidth="2.6"
                      strokeOpacity="0.95"
                      filter={isLightMode ? undefined : "url(#sk-glow-violet)"}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={edgeGradient}
                      strokeWidth="2"
                      strokeDasharray="4 6"
                      className="sk-active-edge"
                    />
                  </g>
                );
              }

              if (status === "AVAILABLE") {
                return (
                  <path
                    key={`e-${idx}`}
                    d={pathD}
                    fill="none"
                    stroke={edgeGradient}
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeOpacity="0.8"
                  />
                );
              }

              return (
                <path
                  key={`e-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={edgeGradient}
                  strokeWidth="1.6"
                  strokeOpacity={isLightMode ? "0.4" : "0.35"}
                />
              );
            })}
          </g>

          {/* ─── 48 Celestial Medallion Nodes ─── */}
          <g className="nodes-layer">
            {SKELETON_NODES.map((node) => {
              const status = nodeStatuses.get(node.id) || "LOCKED";
              const isSelected = selectedNodeId === node.id;
              const isApex = node.tier === 10;
              const isRoot = node.tier === 1;

              const theme = getTierTheme(node.tier);
              const nodeCode = getNodeDisplayCode(node.id);
              const baseRadius = isRoot ? 34 : isApex ? 48 : 20;

              const strokeColor = isLightMode ? theme.strokeLight : theme.strokeDark;
              const textColor = isLightMode ? theme.textLight : theme.textDark;
              const fillUrl = isLightMode ? `url(#sk-tier-fill-${node.tier}-light)` : `url(#sk-tier-fill-${node.tier}-dark)`;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  className="cursor-pointer group transition-all duration-300"
                  role="button"
                  tabIndex={0}
                >
                  <circle r={baseRadius + 14} fill="transparent" pointerEvents="all" />

                  {/* Selection Ring */}
                  {isSelected && (
                    <g className="animate-spin-slow" style={{ animationDuration: "14s" }}>
                      <circle
                        r={baseRadius + 9}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="2"
                        strokeDasharray="5 4"
                        opacity="0.9"
                      />
                      <circle cx={baseRadius + 9} cy="0" r="2.5" fill={strokeColor} />
                      <circle cx={-(baseRadius + 9)} cy="0" r="2.5" fill={strokeColor} />
                    </g>
                  )}

                  {/* Sparkle star */}
                  {SPARKLE_NODE_IDS.has(node.id) && (
                    <path
                      d={sparklePath}
                      transform={`translate(${node.x > 500 ? 18 : node.x < 500 ? -18 : 0}, -20)`}
                      fill={strokeColor}
                      opacity={isLightMode ? 0.75 : 0.9}
                      className="sk-celestial-pulse"
                    />
                  )}

                  {/* ─── CASE A: ROOT NODE (#01) ─── */}
                  {isRoot ? (
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      <g fill={strokeColor} stroke={strokeColor} strokeWidth="1.2" opacity={isLightMode ? "0.88" : "0.95"}>
                        <path d={leftLaurel.stem} fill="none" strokeWidth="1.6" strokeLinecap="round" />
                        {leftLaurel.leaves.map((leaf, lIdx) => (
                          <path key={`sk-ll-${lIdx}`} d={leaf.d} />
                        ))}
                        <path d={rightLaurel.stem} fill="none" strokeWidth="1.6" strokeLinecap="round" />
                        {rightLaurel.leaves.map((leaf, lIdx) => (
                          <path key={`sk-rl-${lIdx}`} d={leaf.d} />
                        ))}
                      </g>

                      <circle r="44" fill="none" stroke={strokeColor} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
                      <path d={sparklePath} transform="translate(0, -44)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(0, 44)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(-44, 0)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(44, 0)" fill={strokeColor} />

                      <path
                        d={rootMedallionPath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth="2.2"
                        filter={isLightMode ? undefined : "url(#sk-glow-gold)"}
                      />
                      <circle r="25" fill="none" stroke={strokeColor} strokeWidth="1" opacity="0.5" />

                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={textColor}
                        className="font-['Rajdhani'] font-bold text-[18px] tracking-wide select-none pointer-events-none"
                      >
                        #01
                      </text>
                    </g>
                  ) : isApex ? (
                    /* ─── CASE B: GRANDER APEX KEYSTONE ─── */
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      {/* Ethereal Corona Aura Star behind main star */}
                      <path
                        d={apexCoronaStarPath}
                        fill="none"
                        stroke={isLightMode ? "rgba(168, 85, 247, 0.4)" : "rgba(192, 132, 252, 0.55)"}
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        filter="url(#sk-glow-mana)"
                        className="sk-celestial-pulse"
                      />

                      {/* Main Multifaceted Celestial Star */}
                      <path
                        d={apexStarPath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3.4 : 2.6}
                        strokeLinejoin="round"
                        filter="url(#sk-glow-violet)"
                      />

                      {/* Facet Bevel Radiants */}
                      {apexFacetLines.map((line, lIdx) => (
                        <line
                          key={`sk-apex-facet-${lIdx}`}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={isLightMode ? "#c084fc" : "#a78bfa"}
                          strokeWidth="1.1"
                          opacity={lIdx % 2 === 0 ? 0.75 : 0.45}
                        />
                      ))}

                      {/* Outer Astral Orbit Dial */}
                      <circle
                        r="36"
                        fill="none"
                        stroke={isLightMode ? "#c084fc" : "#a78bfa"}
                        strokeWidth="1.2"
                        strokeDasharray="3 4"
                        opacity="0.8"
                      />

                      {/* Core Sovereign Medallion */}
                      <circle
                        r="25"
                        fill={isLightMode ? "#f3e8ff" : "#3b0764"}
                        stroke={strokeColor}
                        strokeWidth="2"
                        filter="url(#sk-glow-violet)"
                      />
                      <circle
                        r="21"
                        fill="none"
                        stroke={isLightMode ? "#ddd6fe" : "#7c3aed"}
                        strokeWidth="1"
                        opacity="0.85"
                      />

                      {/* 100% Mathematically Centered Vector Padlock or Flame */}
                      {status === "UNLOCKED" ? (
                        <g transform="translate(-13, -13)" className="pointer-events-none">
                          <Flame className="w-6.5 h-6.5 text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,1)]" />
                        </g>
                      ) : (
                        <g
                          transform="translate(0, -1)"
                          className="pointer-events-none"
                          fill="none"
                          stroke={isLightMode ? "#7c3aed" : "#c084fc"}
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M -6.5 -2 V -7 C -6.5 -11.5 6.5 -11.5 6.5 -7 V -2" />
                          <rect
                            x="-9.5"
                            y="-2"
                            width="19"
                            height="14"
                            rx="3"
                            fill={isLightMode ? "rgba(124, 58, 237, 0.2)" : "rgba(192, 132, 252, 0.3)"}
                          />
                          <circle cx="0" cy="3.5" r="1.6" fill={isLightMode ? "#7c3aed" : "#c084fc"} stroke="none" />
                          <line x1="0" y1="4.5" x2="0" y2="7.5" strokeWidth="1.8" />
                        </g>
                      )}
                    </g>
                  ) : (
                    /* ─── CASE C: INTERMEDIATE NODES ─── */
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      {status === "AVAILABLE" && (
                        <circle
                          r={baseRadius + 4}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1.5"
                          className="sk-celestial-pulse opacity-70"
                        />
                      )}

                      <path
                        d={standardMedallionPath}
                        fill={fillUrl}
                        stroke={isSelected ? (isLightMode ? "#0f172a" : "#ffffff") : strokeColor}
                        strokeWidth={isSelected ? 2.6 : 1.8}
                        strokeLinejoin="round"
                        filter={status === "UNLOCKED" ? (isLightMode ? undefined : "url(#sk-glow-violet)") : undefined}
                      />
                      <circle r="13.5" fill="none" stroke={strokeColor} strokeWidth="0.8" opacity="0.45" />

                      <text
                        x="0"
                        y="1"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={textColor}
                        className="font-['Rajdhani'] font-bold text-[11px] tracking-tight select-none pointer-events-none"
                      >
                        {nodeCode}
                      </text>

                      {status === "UNLOCKED" && (
                        <g transform="translate(12, -12)">
                          <circle r="6.5" fill={strokeColor} stroke={isLightMode ? "#ffffff" : "#090a12"} strokeWidth="1" />
                          <Check className="w-2.5 h-2.5 text-white stroke-[3] -translate-x-[5px] -translate-y-[5px]" />
                        </g>
                      )}

                      {status === "UNLOCKED" && node.costSP > 0 && (
                        <g transform="translate(-13, -12)">
                          <circle r="6" fill={isLightMode ? "#6d28d9" : "#3b0764"} stroke={isLightMode ? "#ddd6fe" : "#c084fc"} strokeWidth="1" />
                          <text
                            x="0"
                            y="0.5"
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="font-mono font-bold text-[7px] fill-white select-none pointer-events-none"
                          >
                            +{node.costSP}
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
