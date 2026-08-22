"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { SkeletonNode, NodeShape } from "@/lib/skill-tree-skeleton";
import { SKELETON_NODES, SKELETON_EDGES, getNodeDisplayCode } from "@/lib/skill-tree-skeleton";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Lock,
  Check,
  Sparkles,
  Flame,
} from "lucide-react";

export interface LiveSubjectNode {
  id: number;
  nodeId: string;
  tier: number;
  title: string;
  description: string;
  difficulty: number;
  spAward: number;
  progress: number;
  isMastered: boolean;
  masteredAt: string | null;
}

interface SubjectConstellationCanvasProps {
  nodes: LiveSubjectNode[];
  mintedSP: number;
  selectedNodeId: string | null;
  accentColor?: string;
  onSelectNode: (selection: { skeleton: SkeletonNode; live?: LiveSubjectNode }) => void;
  searchQuery?: string;
  matchingNodeIds?: string[];
  focusTargetNodeId?: string | null;
}

interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

const WORLD_W = 1000;
const WORLD_H = 1200;

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.4;

/**
 * Invisible Boundary Clamping:
 * Prevents the user from panning or zooming infinitely into the void.
 * Ensures that at least 35% of the viewport always overlaps the constellation world.
 */
function clampPan(
  pan: { x: number; y: number },
  zoom: number,
  cw: number,
  ch: number
): { x: number; y: number } {
  const scaledW = WORLD_W * zoom;
  const scaledH = WORLD_H * zoom;

  const marginX = Math.min(200, cw * 0.35);
  const marginY = Math.min(200, ch * 0.35);

  const minPanX = marginX - scaledW;
  const maxPanX = cw - marginX;

  const minPanY = marginY - scaledH;
  const maxPanY = ch - marginY;

  return {
    x: Math.min(maxPanX, Math.max(minPanX, pan.x)),
    y: Math.min(maxPanY, Math.max(minPanY, pan.y)),
  };
}

function getNodeRadius(shape: NodeShape): number {
  switch (shape) {
    case "apex_star":
      return 32;
    case "octagon":
      return 24;
    case "diamond":
      return 22;
    case "hexagon":
      return 20;
    case "circle":
      return 22;
    default:
      return 20;
  }
}

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
      const points: [number, number][] = [];
      const outerR = r;
      const innerR = r * 0.52;
      for (let i = 0; i < 10; i++) {
        const rad = (i * Math.PI) / 5 - Math.PI / 2;
        const currentR = i % 2 === 0 ? outerR : innerR;
        points.push([currentR * Math.cos(rad), currentR * Math.sin(rad)]);
      }
      return `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
    }

    default:
      return `M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
  }
}

export function SubjectConstellationCanvas({
  nodes,
  mintedSP,
  selectedNodeId,
  accentColor = "#8B5CF6",
  onSelectNode,
  searchQuery = "",
  matchingNodeIds,
  focusTargetNodeId,
}: SubjectConstellationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Light/Dark Theme Observer for crisp SVG canvas rendering
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      const mode = document.documentElement.getAttribute("data-mode");
      setIsLightMode(mode === "light");
    };

    checkMode();
    const observer = new MutationObserver(checkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });

    return () => observer.disconnect();
  }, []);

  // Map live nodes by nodeId ("N1_1", etc.)
  const liveMap = useMemo(() => {
    const map = new Map<string, LiveSubjectNode>();
    for (const node of nodes) {
      map.set(node.nodeId, node);
    }
    return map;
  }, [nodes]);

  const skeletonMap = useMemo(() => {
    const map = new Map<string, SkeletonNode>();
    for (const node of SKELETON_NODES) {
      map.set(node.id, node);
    }
    return map;
  }, []);

  // Viewport transformation state
  const [transform, setTransform] = useState<ViewportTransform>({
    zoom: 0.82,
    panX: 0,
    panY: 0,
  });

  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Fit view automatically on mount or container resize
  const centerConstellation = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return;

    const scaleW = cw / WORLD_W;
    const scaleH = ch / WORLD_H;
    const fitScale = Math.min(scaleW, scaleH) * 0.94;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitScale));

    const panX = (cw - WORLD_W * zoom) / 2;
    const panY = (ch - WORLD_H * zoom) / 2;

    setTransform({ zoom, panX, panY });
  }, []);

  useEffect(() => {
    centerConstellation();
    const ro = new ResizeObserver(() => centerConstellation());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [centerConstellation]);

  // Recenter & Zoom directly on the Active / Selected Node
  const recenterOnActiveNode = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return;

    // Target node prioritization: Selected node -> In-Progress Node -> First Unmastered Node -> Root N1_1
    let targetNodeId = selectedNodeId;
    if (!targetNodeId) {
      const inProgress = nodes.find((n) => n.progress > 0 && !n.isMastered);
      if (inProgress) {
        targetNodeId = inProgress.nodeId;
      } else {
        const firstUnmastered = nodes.find((n) => !n.isMastered);
        targetNodeId = firstUnmastered?.nodeId || "N1_1";
      }
    }

    const targetSkeleton = skeletonMap.get(targetNodeId) || SKELETON_NODES[0];
    const focusZoom = 1.18; // Optimal high-clarity focus zoom level

    const targetPanX = cw / 2 - targetSkeleton.x * focusZoom;
    const targetPanY = ch / 2 - targetSkeleton.y * focusZoom;

    const clamped = clampPan({ x: targetPanX, y: targetPanY }, focusZoom, cw, ch);
    setTransform({ zoom: focusZoom, panX: clamped.x, panY: clamped.y });
  }, [selectedNodeId, nodes, skeletonMap]);

  // Smooth auto-centering when a search match or external target node is focused
  useEffect(() => {
    if (focusTargetNodeId && containerRef.current) {
      const targetSkeleton = skeletonMap.get(focusTargetNodeId);
      if (targetSkeleton) {
        const { clientWidth: cw, clientHeight: ch } = containerRef.current;
        if (cw > 0 && ch > 0) {
          const focusZoom = 1.22;
          const targetPanX = cw / 2 - targetSkeleton.x * focusZoom;
          const targetPanY = ch / 2 - targetSkeleton.y * focusZoom;
          const clamped = clampPan({ x: targetPanX, y: targetPanY }, focusZoom, cw, ch);
          setTransform({ zoom: focusZoom, panX: clamped.x, panY: clamped.y });
        }
      }
    }
  }, [focusTargetNodeId, skeletonMap]);

  // Centered 1D Zoom Control (No horizontal sideways drift)
  const handleZoom = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    setTransform((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom + delta));
      if (nextZoom === prev.zoom) return prev;

      // Pure 1D radial zoom anchored strictly to viewport center
      const centerWorldX = (cw / 2 - prev.panX) / prev.zoom;
      const centerWorldY = (ch / 2 - prev.panY) / prev.zoom;

      const nextPanX = cw / 2 - centerWorldX * nextZoom;
      const nextPanY = ch / 2 - centerWorldY * nextZoom;

      const clamped = clampPan({ x: nextPanX, y: nextPanY }, nextZoom, cw, ch);
      return { zoom: nextZoom, panX: clamped.x, panY: clamped.y };
    });
  }, []);

  // Native Non-Passive Wheel Listener: Completely prevents outer page scroll & ensures 1D centered zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // 1. Unconditionally stop page scroll propagation
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY < 0 ? 1.10 : 0.90;
      const { clientWidth: cw, clientHeight: ch } = container;

      setTransform((prev) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * zoomFactor));
        if (nextZoom === prev.zoom) return prev;

        // Centered 1D zoom on viewport center: prevents ANY sideways horizontal shift
        const centerWorldX = (cw / 2 - prev.panX) / prev.zoom;
        const centerWorldY = (ch / 2 - prev.panY) / prev.zoom;

        const nextPanX = cw / 2 - centerWorldX * nextZoom;
        const nextPanY = ch / 2 - centerWorldY * nextZoom;

        const clamped = clampPan({ x: nextPanX, y: nextPanY }, nextZoom, cw, ch);
        return { zoom: nextZoom, panX: clamped.x, panY: clamped.y };
      });
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  // Pan gesture listeners (Mouse)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: transform.panX,
      panY: transform.panY,
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !containerRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const { clientWidth: cw, clientHeight: ch } = containerRef.current;

      const rawPan = {
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      };

      const clamped = clampPan(rawPan, transform.zoom, cw, ch);
      setTransform((prev) => ({ ...prev, panX: clamped.x, panY: clamped.y }));
    },
    [isPanning, transform.zoom]
  );

  const handleMouseUp = () => setIsPanning(false);

  // Touch Gesture Listeners (Single finger pan & 2-finger pinch zoom without page scroll)
  const touchStateRef = useRef<{
    mode: "pan" | "pinch" | null;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    startDist: number;
    startZoom: number;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
    startDist: 0,
    startZoom: 1,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStateRef.current = {
          mode: "pan",
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          panX: transform.panX,
          panY: transform.panY,
          startDist: 0,
          startZoom: transform.zoom,
        };
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStateRef.current = {
          mode: "pinch",
          startX: 0,
          startY: 0,
          panX: transform.panX,
          panY: transform.panY,
          startDist: dist,
          startZoom: transform.zoom,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const state = touchStateRef.current;
      const { clientWidth: cw, clientHeight: ch } = container;

      if (state.mode === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - state.startX;
        const dy = e.touches[0].clientY - state.startY;
        const rawPan = { x: state.panX + dx, y: state.panY + dy };
        const clamped = clampPan(rawPan, transform.zoom, cw, ch);
        setTransform((prev) => ({ ...prev, panX: clamped.x, panY: clamped.y }));
      } else if (state.mode === "pinch" && e.touches.length === 2 && state.startDist > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = dist / state.startDist;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.startZoom * scale));

        const centerWorldX = (cw / 2 - state.panX) / state.startZoom;
        const centerWorldY = (ch / 2 - state.panY) / state.startZoom;

        const nextPanX = cw / 2 - centerWorldX * nextZoom;
        const nextPanY = ch / 2 - centerWorldY * nextZoom;

        const clamped = clampPan({ x: nextPanX, y: nextPanY }, nextZoom, cw, ch);
        setTransform({ zoom: nextZoom, panX: clamped.x, panY: clamped.y });
      }
    };

    const handleTouchEnd = () => {
      touchStateRef.current.mode = null;
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [transform]);

  // Node Click Handlers
  const handleNodeClick = (skeleton: SkeletonNode) => {
    const live = liveMap.get(skeleton.id);
    onSelectNode({ skeleton, live });
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ touchAction: "none" }}
      className={`relative w-full h-[420px] sm:h-[560px] lg:h-[750px] rounded-2xl bg-bg-abyss border border-border-subtle overflow-hidden select-none cursor-grab touch-none shadow-card ${
        isPanning ? "cursor-grabbing" : ""
      }`}
    >
      {/* ─── HUD Floating Control Bar ─────────────────────────────── */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-bg-panel/90 border border-border-subtle backdrop-blur-md shadow-card">
        <button
          type="button"
          onClick={() => handleZoom(0.15)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-abyss transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.15)}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-abyss transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-[1px] h-4 bg-border-subtle mx-0.5" />
        <button
          type="button"
          onClick={recenterOnActiveNode}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-accent-primary hover:bg-bg-abyss transition-colors"
          title="Recenter & Focus Active Node"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={centerConstellation}
          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-abyss transition-colors"
          title="Reset Constellation View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Legend HUD ────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-3.5 px-4 py-2.5 rounded-xl bg-bg-panel/90 border border-border-subtle backdrop-blur-md text-[11px] font-rajdhani font-semibold text-text-secondary shadow-lg">
        {/* Untouched */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
            <polygon
              points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4"
              fill={isLightMode ? "#f1f5f9" : "#11131f"}
              stroke={isLightMode ? "#94a3b8" : "#475569"}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>Untouched</span>
        </div>

        {/* In Progress */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill={isLightMode ? "#e0f2fe" : "#083344"}
              stroke={isLightMode ? "#0284c7" : "#22d3ee"}
              strokeWidth="1.5"
              strokeDasharray="4 2"
              className="animate-spin-slow"
              style={{ animationDuration: "8s" }}
            />
          </svg>
          <span>In Progress</span>
        </div>

        {/* Mastered */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
            <polygon
              points="7,1 12.5,4 12.5,10 7,13 1.5,10 1.5,4"
              fill="url(#constellation-grad-mastered)"
              stroke="#c084fc"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M 4.5 7 L 6.2 8.7 L 9.5 5.5"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Mastered</span>
        </div>

        {/* Apex */}
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
            <polygon
              points="7,0.5 8.8,4.5 13.5,4.8 9.8,8 11,12.5 7,10 3,12.5 4.2,8 0.5,4.8 5.2,4.5"
              fill="url(#constellation-grad-apex)"
              stroke="#f59e0b"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span>Apex (115 SP)</span>
        </div>
      </div>

      {/* ─── Main SVG Graph Viewport ──────────────────────────────── */}
      <svg
        className="w-full h-full pointer-events-none"
        style={{
          transformOrigin: "0 0",
          overflow: "visible",
        }}
      >
        <defs>
          {/* Glow Filters */}
          <filter id="constellation-glow-violet" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#8b5cf6" floodOpacity="0.55" />
          </filter>
          <filter id="constellation-glow-cyan" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#06b6d4" floodOpacity="0.55" />
          </filter>
          <filter id="constellation-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.65" />
          </filter>

          {/* Gradients */}
          <linearGradient id="constellation-grad-mastered" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
          <linearGradient id="constellation-grad-mastered-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id="constellation-grad-in-progress" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#083344" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
          <linearGradient id="constellation-grad-in-progress-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <linearGradient id="constellation-grad-apex" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="constellation-grad-untouched-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#11131f" />
            <stop offset="100%" stopColor="#090a10" />
          </linearGradient>
          <linearGradient id="constellation-grad-untouched-light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>

          <style>{`
            @keyframes constellation-edge-flow {
              from { stroke-dashoffset: 80; }
              to { stroke-dashoffset: 0; }
            }
            .constellation-edge-active {
              animation: constellation-edge-flow 20s linear infinite;
            }
          `}</style>
        </defs>

        <g
          style={{
            transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom})`,
            transition: isPanning ? "none" : "transform 0.15s ease-out",
          }}
          className="pointer-events-auto"
        >
          {/* ─── 68 Cubic Bézier Edges ─────────────────────────────── */}
          <g className="edges-layer">
            {SKELETON_EDGES.map(([srcId, tgtId], idx) => {
              const srcNode = skeletonMap.get(srcId);
              const tgtNode = skeletonMap.get(tgtId);
              if (!srcNode || !tgtNode) return null;

              const liveSrc = liveMap.get(srcId);
              const liveTgt = liveMap.get(tgtId);

              const isSrcMastered = liveSrc?.isMastered || (liveSrc?.progress ?? 0) >= 100;
              const isTgtMastered = liveTgt?.isMastered || (liveTgt?.progress ?? 0) >= 100;

              const isSrcActive = (liveSrc?.progress ?? 0) > 0;
              const isTgtActive = (liveTgt?.progress ?? 0) > 0;

              const isEdgeMastered = isSrcMastered && isTgtMastered;
              // Active conduit: Mastered -> Available / In-Progress or active progression path
              const isEdgeActiveConduit =
                (isSrcMastered && (isTgtActive || (liveTgt?.progress ?? 0) === 0)) ||
                (isTgtMastered && isSrcActive) ||
                (isSrcActive && isTgtActive);

              const midY = (srcNode.y + tgtNode.y) / 2;
              const d = `M ${srcNode.x} ${srcNode.y} C ${srcNode.x} ${midY}, ${tgtNode.x} ${midY}, ${tgtNode.x} ${tgtNode.y}`;

              let stroke = isLightMode ? "#cbd5e1" : "#27272a";
              let strokeWidth = 1.5;
              let strokeDasharray: string | undefined = undefined;
              let filter: string | undefined = undefined;
              let edgeClass = "";

              if (isEdgeMastered) {
                stroke = isLightMode ? "#9333ea" : "#a855f7";
                strokeWidth = 2.5;
                filter = isLightMode ? undefined : "url(#constellation-glow-violet)";
              } else if (isEdgeActiveConduit && (isSrcActive || isTgtActive || isSrcMastered)) {
                stroke = isLightMode ? "#0284c7" : "#06b6d4";
                strokeWidth = 2;
                strokeDasharray = "4 4";
                filter = isLightMode ? undefined : "url(#constellation-glow-cyan)";
                edgeClass = "constellation-edge-active";
              }

              const isSearchActive =
                Boolean(searchQuery && searchQuery.trim().length > 0) ||
                (matchingNodeIds !== undefined &&
                  matchingNodeIds !== null &&
                  matchingNodeIds.length < SKELETON_NODES.length);
              const isEdgeMatching =
                !isSearchActive ||
                matchingNodeIds?.includes(srcId) ||
                matchingNodeIds?.includes(tgtId);
              const edgeOpacity = isSearchActive ? (isEdgeMatching ? 0.9 : 0.12) : 1;

              return (
                <path
                  key={`edge-${srcId}-${tgtId}-${idx}`}
                  d={d}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  filter={filter}
                  strokeLinecap="round"
                  style={{ opacity: edgeOpacity }}
                  className={`transition-all duration-300 ${edgeClass}`}
                />
              );
            })}
          </g>

          {/* ─── 48 Constellation Nodes ────────────────────────────── */}
          <g className="nodes-layer">
            {SKELETON_NODES.map((node) => {
              const live = liveMap.get(node.id);
              const isSelected = selectedNodeId === node.id;
              const isApex = node.tier === 10;

              const progress = live?.progress ?? 0;
              const isMastered = live?.isMastered || progress >= 100;
              const isStarted = progress > 0 && !isMastered;
              const isUntouched = progress === 0 && !isMastered;

              const isApexReady = isApex && mintedSP >= 115;
              const isApexSealed = isApex && mintedSP < 115;

              const isSearchActive =
                Boolean(searchQuery && searchQuery.trim().length > 0) ||
                (matchingNodeIds !== undefined &&
                  matchingNodeIds !== null &&
                  matchingNodeIds.length < SKELETON_NODES.length);
              const isNodeMatching = !isSearchActive || matchingNodeIds?.includes(node.id);
              const nodeOpacity = isSearchActive ? (isNodeMatching ? 1 : 0.2) : 1;

              const r = getNodeRadius(node.shape);
              const shapePath = getShapePath(node.shape, r);
              const nodeCode = getNodeDisplayCode(node.id);
              const spReward = live?.spAward || 0;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  className="cursor-pointer group transition-opacity duration-300"
                  style={{ opacity: nodeOpacity }}
                >
                  {/* Invisible Hitbox for touch targets (>= 44x44px) */}
                  <circle r={r + 12} fill="transparent" pointerEvents="all" />

                  {/* Selection Ring */}
                  {isSelected && (
                    <circle
                      r={r + 8}
                      fill="none"
                      stroke={accentColor}
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      className="animate-spin-slow opacity-90"
                      style={{ animationDuration: "12s" }}
                    />
                  )}

                  {/* Pulsing Aura for Active or Apex-Ready Nodes */}
                  {(isStarted || isApexReady) && (
                    <circle
                      r={r + 6}
                      fill="none"
                      stroke={
                        isApexReady
                          ? isLightMode
                            ? "#d97706"
                            : "#f59e0b"
                          : isLightMode
                          ? "#0284c7"
                          : "#06b6d4"
                      }
                      strokeWidth={1.5}
                      className="animate-ping opacity-30"
                      style={{ animationDuration: "3s" }}
                    />
                  )}

                  {/* ─── 4-Tier Node Visual Hierarchy ─── */}

                  {/* 1. APEX NODE */}
                  {isApex ? (
                    <>
                      <path
                        d={shapePath}
                        fill={
                          isApexReady
                            ? "url(#constellation-grad-apex)"
                            : isLightMode
                            ? "#e2e8f0"
                            : "#18181b"
                        }
                        stroke={
                          isSelected
                            ? isLightMode
                              ? "#0f172a"
                              : "#ffffff"
                            : isApexReady
                            ? isLightMode
                              ? "#b45309"
                              : "#f59e0b"
                            : isLightMode
                            ? "#94a3b8"
                            : "#3f3f46"
                        }
                        strokeWidth={isSelected ? 3.5 : isApexReady ? 3 : 2}
                        strokeLinejoin="round"
                        filter={isApexReady ? "url(#constellation-glow-gold)" : undefined}
                        className="transition-all duration-300 group-hover:scale-105"
                        style={{ transformOrigin: "0px 0px" }}
                      />
                      <g transform="translate(-10, -10)" className="pointer-events-none">
                        {isApexReady ? (
                          <Flame
                            className={`w-5 h-5 ${
                              isLightMode
                                ? "text-amber-950 drop-shadow-sm"
                                : "text-amber-100 drop-shadow-[0_0_8px_rgba(245,158,11,1)]"
                            }`}
                          />
                        ) : (
                          <Lock
                            className={`w-5 h-5 ${
                              isLightMode ? "text-slate-500" : "text-zinc-500"
                            }`}
                          />
                        )}
                      </g>
                    </>
                  ) : isMastered ? (
                    /* 2. MASTERED NODE */
                    <>
                      <path
                        d={shapePath}
                        fill={
                          isLightMode
                            ? "url(#constellation-grad-mastered-light)"
                            : "url(#constellation-grad-mastered)"
                        }
                        stroke={
                          isSelected
                            ? isLightMode
                              ? "#0f172a"
                              : "#ffffff"
                            : isLightMode
                            ? "#7c3aed"
                            : "#c084fc"
                        }
                        strokeWidth={isSelected ? 3 : 2.5}
                        strokeLinejoin="round"
                        filter={isLightMode ? undefined : "url(#constellation-glow-violet)"}
                        className="transition-all duration-300 group-hover:scale-105"
                        style={{ transformOrigin: "0px 0px" }}
                      />

                      {/* Center Checkmark Icon */}
                      <path
                        d="M -5 0.5 L -1.5 4.5 L 6 -3.5"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                      />

                      {/* Clean Floating SP Bonus Chip at 45° Top-Right Vertex */}
                      {spReward > 0 && (
                        <g transform={`translate(${r * 0.72}, ${-r * 0.72})`}>
                          <circle
                            r={8.5}
                            fill={isLightMode ? "#6d28d9" : "#3b0764"}
                            stroke={isLightMode ? "#ede9fe" : "#c084fc"}
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
                            +{spReward}
                          </text>
                        </g>
                      )}
                    </>
                  ) : isStarted ? (
                    /* 3. IN PROGRESS NODE */
                    <>
                      <path
                        d={shapePath}
                        fill={
                          isLightMode
                            ? "url(#constellation-grad-in-progress-light)"
                            : "url(#constellation-grad-in-progress)"
                        }
                        stroke={
                          isSelected
                            ? isLightMode
                              ? "#0f172a"
                              : "#ffffff"
                            : isLightMode
                            ? "#0284c7"
                            : "#22d3ee"
                        }
                        strokeWidth={isSelected ? 3 : 2.5}
                        strokeLinejoin="round"
                        filter={isLightMode ? undefined : "url(#constellation-glow-cyan)"}
                        className="transition-all duration-300 group-hover:scale-105"
                        style={{ transformOrigin: "0px 0px" }}
                      />

                      {/* Perimeter Progress Ring Gauge */}
                      <circle
                        r={r + 3}
                        fill="none"
                        stroke={isLightMode ? "#0284c7" : "#06b6d4"}
                        strokeWidth={2.5}
                        strokeDasharray={`${(progress / 100) * (2 * Math.PI * (r + 3))} ${
                          2 * Math.PI * (r + 3)
                        }`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                        transform="rotate(-90)"
                      />

                      {/* Monospace Completion Percentage */}
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`font-mono font-bold text-[10px] tracking-tight select-none pointer-events-none ${
                          isLightMode ? "fill-sky-950 font-extrabold" : "fill-cyan-300"
                        }`}
                      >
                        {Math.round(progress)}%
                      </text>
                    </>
                  ) : (
                    /* 4. UNTOUCHED / LOCKED NODE */
                    <>
                      <path
                        d={shapePath}
                        fill={
                          isLightMode
                            ? "url(#constellation-grad-untouched-light)"
                            : "url(#constellation-grad-untouched-dark)"
                        }
                        stroke={
                          isSelected
                            ? isLightMode
                              ? "#0f172a"
                              : "#ffffff"
                            : isLightMode
                            ? "#cbd5e1"
                            : "#334155"
                        }
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeLinejoin="round"
                        className="transition-all duration-300 group-hover:scale-105"
                        style={{ transformOrigin: "0px 0px" }}
                      />

                      {/* Sharp Monospace Index */}
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`font-mono font-bold text-[11px] tracking-wider select-none pointer-events-none transition-colors ${
                          isLightMode
                            ? "fill-slate-600 group-hover:fill-slate-900"
                            : "fill-slate-400 group-hover:fill-slate-200"
                        }`}
                      >
                        {nodeCode}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
