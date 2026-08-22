"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { SkeletonNode, NodeShape } from "@/lib/skill-tree-skeleton";
import {
  SKELETON_NODES,
  SKELETON_EDGES,
  isNodeAvailable,
  getNodeDisplayCode,
} from "@/lib/skill-tree-skeleton";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Hand,
  Lock,
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

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.6;
const DEFAULT_FOCUS_ZOOM = 1.35;

// ─── Boundary Clamping Helper ───────────────────────────────────

function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  const scaledW = WORLD_W * zoom;
  const scaledH = WORLD_H * zoom;

  const padX = Math.min(100, cw * 0.18);
  const padY = Math.min(100, ch * 0.18);

  const maxPanX = cw - padX;
  const minPanX = padX - scaledW;

  const maxPanY = ch - padY;
  const minPanY = padY - scaledH;

  return {
    x: Math.min(maxPanX, Math.max(minPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(minPanY, pan.y)),
  };
}

// ─── Node Geometry Radii ────────────────────────────────────────

function getNodeRadius(shape: NodeShape): number {
  switch (shape) {
    case "apex_star": return 30;
    case "octagon": return 24;
    case "diamond": return 22;
    case "hexagon": return 20;
    case "circle": return 24;
    default: return 20;
  }
}

// ─── SVG Shape Paths (centered at 0,0) ──────────────────────────

function getShapePath(shape: NodeShape, r: number): string {
  switch (shape) {
    case "circle":
      return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;

    case "hexagon": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
      }
      return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
    }

    case "diamond":
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;

    case "octagon": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i - Math.PI / 8;
        pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
      }
      return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
    }

    case "apex_star": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.48;
        pts.push([rad * Math.cos(angle), rad * Math.sin(angle)]);
      }
      return `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
    }

    default:
      return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
  }
}

// ─── Status Resolvers ───────────────────────────────────────────

function resolveNodeStatus(
  nodeId: string,
  unlockedSet: Set<string>,
  skillPoints: number,
  nodeCost: number
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

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════

export function SkillNodeGraph({
  unlockedSet,
  selectedNodeId,
  onSelectNode,
  accentColor,
  accentHex,
  skillPoints,
}: SkillNodeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Unified Viewport State & Sync Ref ───────────────────────
  const [viewport, setViewport] = useState<ViewportTransform>({
    zoom: DEFAULT_FOCUS_ZOOM,
    panX: 0,
    panY: 0,
  });
  const viewportRef = useRef<ViewportTransform>(viewport);
  viewportRef.current = viewport;

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);

  // Drag tracking refs
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const touchDistanceRef = useRef<number | null>(null);
  const isClickRef = useRef<boolean>(true);

  // Build node lookup
  const nodeMap = useMemo(() => {
    const m = new Map<string, SkeletonNode>();
    for (const n of SKELETON_NODES) m.set(n.id, n);
    return m;
  }, []);

  // Resolve all node statuses
  const nodeStatuses = useMemo(() => {
    const m = new Map<string, NodeStatus>();
    for (const node of SKELETON_NODES) {
      m.set(node.id, resolveNodeStatus(node.id, unlockedSet, skillPoints, node.costSP));
    }
    return m;
  }, [unlockedSet, skillPoints]);

  // Edge data with status
  const edgeData = useMemo(() => {
    return SKELETON_EDGES.map(([parentId, childId]) => {
      const parent = nodeMap.get(parentId)!;
      const child = nodeMap.get(childId)!;
      return {
        parentId,
        childId,
        x1: parent.x,
        y1: parent.y,
        x2: child.x,
        y2: child.y,
        status: resolveEdgeStatus(parentId, childId, unlockedSet),
      };
    });
  }, [nodeMap, unlockedSet]);

  // ─── Center Camera on Specific World Coordinate ─────────────
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

  // ─── Center on Target Node ──────────────────────────────────
  const centerOnNode = useCallback(
    (nodeId: string, targetZoom: number = DEFAULT_FOCUS_ZOOM) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        centerOnCoord(node.x, node.y, targetZoom);
      }
    },
    [nodeMap, centerOnCoord]
  );

  // ─── Fit Entire Constellation in View ───────────────────────
  const fitView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cw = rect.width || 600;
    const ch = rect.height || 600;

    const scaleX = (cw - 40) / WORLD_W;
    const scaleY = (ch - 40) / WORLD_H;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    const rawPanX = (cw - WORLD_W * fitScale) / 2;
    const rawPanY = (ch - WORLD_H * fitScale) / 2;

    const clamped = clampPan({ x: rawPanX, y: rawPanY }, fitScale, cw, ch);
    const next = { zoom: fitScale, panX: clamped.x, panY: clamped.y };
    viewportRef.current = next;
    setViewport(next);
  }, []);

  // ─── Initial Center on Active Progression Frontier ──────────
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

  // ─── Native Non-Passive Wheel Event Listener ────────────────
  // Pure In-Place Zoom centered at screen center (no lateral drift or sideways jumping)
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

      // Calculate the world point at the exact center of the screen
      const wx = (cx - current.panX) / current.zoom;
      const wy = (cy - current.panY) / current.zoom;

      // New pan keeps the center world point at screen center
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

  // ─── Zoom Button Controls ───────────────────────────────────
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

  // ─── Mouse Drag Handlers ────────────────────────────────────
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

  // ─── Touch Drag & Pinch Zoom ────────────────────────────────
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

  // Node selection with centering
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
      className={`relative w-full h-[580px] sm:h-[640px] rounded-2xl overflow-hidden select-none border border-white/10 bg-bg-abyss/95 backdrop-blur-2xl shadow-2xl ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        touchAction: "none",
        overscrollBehavior: "contain",
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(${accentColor}, 0.05) 0%, transparent 80%),
          linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 40px 40px, 40px 40px",
      }}
    >
      {/* ─── Floating Viewport Navigation HUD ────────────────── */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-panel/80 border border-white/10 backdrop-blur-md shadow-lg pointer-events-none">
        <Hand className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-text-secondary">
          Scroll to Zoom • Drag to Pan
        </span>
      </div>

      <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-panel/90 border border-white/10 backdrop-blur-xl shadow-2xl">
        {/* Zoom In */}
        <button
          type="button"
          onClick={() => handleZoomDelta(0.25)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/10 active:scale-95 transition-all"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Zoom Level Indicator */}
        <span className="text-[11px] font-mono font-bold text-text-primary px-1.5 min-w-[42px] text-center">
          {Math.round(viewport.zoom * 100)}%
        </span>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={() => handleZoomDelta(-0.25)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/10 active:scale-95 transition-all"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-4 bg-white/10 my-auto mx-0.5" />

        {/* Focus Selected/Frontier Node */}
        <button
          type="button"
          onClick={() => {
            if (selectedNodeId) centerOnNode(selectedNodeId, DEFAULT_FOCUS_ZOOM);
            else centerOnNode("N1_1", DEFAULT_FOCUS_ZOOM);
          }}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-secondary hover:text-cyan-300 hover:bg-cyan-950/40 active:scale-95 transition-all"
          title="Focus Selected Node"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Fit Entire Constellation */}
        <button
          type="button"
          onClick={fitView}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/10 active:scale-95 transition-all"
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
            {/* Active edge glow */}
            <filter id="skill-tree-edge-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#8b5cf6" floodOpacity="0.55" />
            </filter>
            {/* Node glow for unlocked / active */}
            <filter id="skill-tree-glow-violet" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#8b5cf6" floodOpacity="0.55" />
            </filter>
            <filter id="skill-tree-glow-cyan" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.55" />
            </filter>
            {/* Apex star glow */}
            <filter id="skill-tree-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.65" />
            </filter>
            {/* Sector boundary frame glow */}
            <filter id="skill-tree-boundary-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradients */}
            <linearGradient id="skill-tree-grad-unlocked" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="skill-tree-grad-available" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#083344" />
              <stop offset="100%" stopColor="#0e7490" />
            </linearGradient>
            <linearGradient id="skill-tree-grad-locked" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#11131f" />
              <stop offset="100%" stopColor="#090a10" />
            </linearGradient>
            <linearGradient id="skill-tree-grad-apex" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>

            {/* Animated dash for active edges */}
            <style>{`
              @keyframes skill-tree-edge-flow {
                from { stroke-dashoffset: 80; }
                to { stroke-dashoffset: 0; }
              }
              .skill-tree-edge-active {
                animation: skill-tree-edge-flow 20s linear infinite;
              }
              @keyframes skill-tree-pulse {
                0%, 100% { opacity: 0.8; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.03); }
              }
              .skill-tree-node-available {
                animation: skill-tree-pulse 2.5s ease-in-out infinite;
                transform-origin: center;
              }
            `}</style>
          </defs>

          {/* ─── Celestial Sector Border & Perimeter Brackets ─── */}
          <g opacity="0.85">
            {/* Outer Boundary Frame */}
            <rect
              x="20"
              y="20"
              width={WORLD_W - 40}
              height={WORLD_H - 40}
              rx="28"
              fill="none"
              stroke={`rgba(${accentColor}, 0.25)`}
              strokeWidth="2"
              strokeDasharray="16 8"
              filter="url(#skill-tree-boundary-glow)"
            />
            <rect
              x="28"
              y="28"
              width={WORLD_W - 56}
              height={WORLD_H - 56}
              rx="22"
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="1"
            />

            {/* Top-Left Bracket */}
            <path
              d="M 16 56 L 16 16 L 56 16"
              fill="none"
              stroke={accentHex}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Top-Right Bracket */}
            <path
              d={`M ${WORLD_W - 56} 16 L ${WORLD_W - 16} 16 L ${WORLD_W - 16} 56`}
              fill="none"
              stroke={accentHex}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Bottom-Left Bracket */}
            <path
              d={`M 16 ${WORLD_H - 56} L 16 ${WORLD_H - 16} L 56 ${WORLD_H - 16}`}
              fill="none"
              stroke={accentHex}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Bottom-Right Bracket */}
            <path
              d={`M ${WORLD_W - 56} ${WORLD_H - 16} L ${WORLD_W - 16} ${WORLD_H - 16} L ${WORLD_W - 16} ${WORLD_H - 56}`}
              fill="none"
              stroke={accentHex}
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Sector Boundary Labeling */}
            <text
              x={WORLD_W / 2}
              y="48"
              textAnchor="middle"
              dominantBaseline="central"
              fill={accentHex}
              fontSize="10"
              fontFamily="'Rajdhani', monospace"
              fontWeight="800"
              letterSpacing="3"
              opacity="0.6"
            >
              ▲ APEX CONVERGENCE SECTOR [TIER 10] ▲
            </text>

            <text
              x={WORLD_W / 2}
              y={WORLD_H - 36}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgb(113, 113, 122)"
              fontSize="9"
              fontFamily="'Rajdhani', monospace"
              fontWeight="700"
              letterSpacing="2"
              opacity="0.6"
            >
              ▼ FOUNDATION ORIGIN SECTOR [TIER 1] ▼
            </text>
          </g>

          {/* ─── Edge Connection Layer ───────────────────────── */}
          {edgeData.map((edge, idx) => {
            const { x1, y1, x2, y2, status } = edge;
            const midY = (y1 + y2) / 2;
            const pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

            if (status === "ACTIVE") {
              return (
                <g key={`e-${idx}`}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={accentHex}
                    strokeWidth="2.5"
                    strokeOpacity="0.8"
                    filter="url(#skill-tree-glow-violet)"
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={accentHex}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    className="skill-tree-edge-active"
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
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  strokeOpacity="0.85"
                  filter="url(#skill-tree-glow-cyan)"
                  className="skill-tree-edge-active"
                />
              );
            }

            return (
              <path
                key={`e-${idx}`}
                d={pathD}
                fill="none"
                stroke="rgb(39,39,42)"
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
            );
          })}

          {/* ─── Node Interactive Layer ──────────────────────── */}
          {SKELETON_NODES.map((node) => {
            const status = nodeStatuses.get(node.id) || "LOCKED";
            const isSelected = selectedNodeId === node.id;
            const isApex = node.tier === 10;
            const r = getNodeRadius(node.shape);
            const shapePath = getShapePath(node.shape, r);
            const nodeCode = getNodeDisplayCode(node.id);

            // Selected node accent outline
            const selectionRing = isSelected ? (
              <path
                d={getShapePath(node.shape, r + 7)}
                fill="none"
                stroke={accentHex}
                strokeWidth="2.5"
                strokeDasharray="5 3"
                opacity="0.9"
                transform={`translate(${node.x}, ${node.y})`}
              />
            ) : null;

            return (
              <g
                key={node.id}
                className="cursor-pointer group transition-transform duration-200"
                onClick={() => handleNodeClick(node)}
                role="button"
                tabIndex={0}
              >
                {/* Invisible Hitbox for touch targets (>= 44x44px) */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 12}
                  fill="transparent"
                  pointerEvents="all"
                />

                {selectionRing}

                {/* ─── APEX NODE ─── */}
                {isApex ? (
                  <>
                    <path
                      d={shapePath}
                      fill={
                        status === "UNLOCKED"
                          ? "url(#skill-tree-grad-apex)"
                          : status === "AVAILABLE"
                          ? "rgba(245,158,11,0.2)"
                          : "#18181b"
                      }
                      stroke={
                        isSelected
                          ? "#ffffff"
                          : status === "UNLOCKED"
                          ? "#f59e0b"
                          : status === "AVAILABLE"
                          ? "#fbbf24"
                          : "#3f3f46"
                      }
                      strokeWidth={isSelected ? 3.5 : 2.5}
                      strokeLinejoin="round"
                      filter={
                        status === "UNLOCKED" || status === "AVAILABLE"
                          ? "url(#skill-tree-glow-gold)"
                          : undefined
                      }
                      transform={`translate(${node.x}, ${node.y})`}
                    />
                    <g
                      transform={`translate(${node.x - 10}, ${node.y - 10})`}
                      className="pointer-events-none"
                    >
                      {status === "UNLOCKED" || status === "AVAILABLE" ? (
                        <Flame className="w-5 h-5 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,1)]" />
                      ) : (
                        <Lock className="w-5 h-5 text-zinc-500" />
                      )}
                    </g>
                  </>
                ) : status === "UNLOCKED" ? (
                  /* ─── UNLOCKED / MASTERED NODE ─── */
                  <>
                    <path
                      d={shapePath}
                      fill="url(#skill-tree-grad-unlocked)"
                      stroke={isSelected ? "#ffffff" : accentHex}
                      strokeWidth={isSelected ? 3 : 2.5}
                      strokeLinejoin="round"
                      filter="url(#skill-tree-glow-violet)"
                      transform={`translate(${node.x}, ${node.y})`}
                    />
                    {/* Centered Checkmark */}
                    <path
                      d="M -5 0.5 L -1.5 4.5 L 6 -3.5"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                      transform={`translate(${node.x}, ${node.y})`}
                    />
                    {/* Top-Right SP Chip */}
                    {node.costSP > 0 && (
                      <g transform={`translate(${node.x + r * 0.72}, ${node.y - r * 0.72})`}>
                        <circle
                          r={8.5}
                          fill="#3b0764"
                          stroke="#c084fc"
                          strokeWidth={1.5}
                          className="drop-shadow-sm"
                        />
                        <text
                          x={0}
                          y={0}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="font-mono font-bold text-[8.5px] fill-white select-none pointer-events-none"
                        >
                          +{node.costSP}
                        </text>
                      </g>
                    )}
                  </>
                ) : status === "AVAILABLE" ? (
                  /* ─── AVAILABLE / IN-PROGRESS NODE ─── */
                  <>
                    <path
                      d={shapePath}
                      fill="url(#skill-tree-grad-available)"
                      stroke={isSelected ? "#ffffff" : "#06b6d4"}
                      strokeWidth={isSelected ? 3 : 2.5}
                      strokeLinejoin="round"
                      filter="url(#skill-tree-glow-cyan)"
                      className="skill-tree-node-available"
                      transform={`translate(${node.x}, ${node.y})`}
                    />
                    {/* Centered Monospace Code */}
                    <text
                      x={node.x}
                      y={node.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-mono font-bold text-[11px] fill-cyan-300 select-none pointer-events-none"
                    >
                      {nodeCode}
                    </text>
                  </>
                ) : (
                  /* ─── LOCKED NODE ─── */
                  <>
                    <path
                      d={shapePath}
                      fill="url(#skill-tree-grad-locked)"
                      stroke={isSelected ? "#ffffff" : "rgb(63,63,70)"}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeLinejoin="round"
                      transform={`translate(${node.x}, ${node.y})`}
                    />
                    <text
                      x={node.x}
                      y={node.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-mono font-bold text-[11px] fill-zinc-500 select-none pointer-events-none"
                    >
                      {nodeCode}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
