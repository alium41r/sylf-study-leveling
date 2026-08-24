"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { SkeletonNode } from "@/lib/skill-tree-skeleton";
import { SKELETON_NODES, SKELETON_EDGES, getNodeDisplayCode } from "@/lib/skill-tree-skeleton";
import {
  TIER_THEMES,
  getTierTheme,
  getScallopedMedallionPath,
  getApexCelestialStarPath,
  getApexStarFacetLines,
  getSparkleStarPath,
  getLaurelLeavesSVG,
  getWhirlwindManaPath,
} from "@/lib/skill-tree-theme";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Flame,
  Check,
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

const SPARKLE_NODE_IDS = new Set([
  "N3_1", "N3_6",
  "N4_1", "N4_8",
  "N5_1", "N5_6",
  "N6_1", "N6_8",
  "N7_1", "N7_7",
  "N8_1", "N8_5",
  "N9_1", "N9_2", "N9_3",
]);

export function SubjectConstellationCanvas({
  nodes,
  mintedSP,
  selectedNodeId,
  onSelectNode,
  searchQuery = "",
  matchingNodeIds,
  focusTargetNodeId,
}: SubjectConstellationCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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

  // Precomputed geometry
  const standardMedallionPath = useMemo(() => getScallopedMedallionPath(18, 12, 2.5), []);
  const rootMedallionPath = useMemo(() => getScallopedMedallionPath(32, 16, 3.2), []);
  const apexStarPath = useMemo(() => getApexCelestialStarPath(48, 22), []);
  const apexFacetLines = useMemo(() => getApexStarFacetLines(48, 22), []);
  const sparklePath = useMemo(() => getSparkleStarPath(5.5), []);
  const largeSparklePath = useMemo(() => getSparkleStarPath(8.5), []);
  const miniSparklePath = useMemo(() => getSparkleStarPath(3.5), []);
  const leftLaurel = useMemo(() => getLaurelLeavesSVG("left", "#D97706"), []);
  const rightLaurel = useMemo(() => getLaurelLeavesSVG("right", "#D97706"), []);

  // Wavy Whirlwind Mana Paths
  const leftManaStreamA = useMemo(() => getWhirlwindManaPath("left", 0, 26, 3.2), []);
  const leftManaStreamB = useMemo(() => getWhirlwindManaPath("left", Math.PI, 18, 3.2), []);
  const rightManaStreamA = useMemo(() => getWhirlwindManaPath("right", 0, 26, 3.2), []);
  const rightManaStreamB = useMemo(() => getWhirlwindManaPath("right", Math.PI, 18, 3.2), []);

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

  const recenterOnActiveNode = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    if (cw === 0 || ch === 0) return;

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
    const focusZoom = 1.18;

    const targetPanX = cw / 2 - targetSkeleton.x * focusZoom;
    const targetPanY = ch / 2 - targetSkeleton.y * focusZoom;

    const clamped = clampPan({ x: targetPanX, y: targetPanY }, focusZoom, cw, ch);
    setTransform({ zoom: focusZoom, panX: clamped.x, panY: clamped.y });
  }, [selectedNodeId, nodes, skeletonMap]);

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

  const handleZoom = useCallback((delta: number) => {
    if (!containerRef.current) return;
    const { clientWidth: cw, clientHeight: ch } = containerRef.current;
    setTransform((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom + delta));
      if (nextZoom === prev.zoom) return prev;

      const centerWorldX = (cw / 2 - prev.panX) / prev.zoom;
      const centerWorldY = (ch / 2 - prev.panY) / prev.zoom;

      const nextPanX = cw / 2 - centerWorldX * nextZoom;
      const nextPanY = ch / 2 - centerWorldY * nextZoom;

      const clamped = clampPan({ x: nextPanX, y: nextPanY }, nextZoom, cw, ch);
      return { zoom: nextZoom, panX: clamped.x, panY: clamped.y };
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = e.deltaY < 0 ? 1.10 : 0.90;
      const { clientWidth: cw, clientHeight: ch } = container;

      setTransform((prev) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * zoomFactor));
        if (nextZoom === prev.zoom) return prev;

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
      style={{
        touchAction: "none",
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
      className={`relative w-full h-[460px] sm:h-[600px] lg:h-[820px] rounded-3xl border ${
        isLightMode ? "border-purple-200/50 shadow-2xl" : "border-white/10 shadow-2xl"
      } overflow-hidden select-none cursor-grab touch-none ${
        isPanning ? "cursor-grabbing" : ""
      }`}
    >
      {/* ─── HUD Floating Control Bar ─────────────────────────────── */}
      <div
        className={`absolute top-4 right-4 z-20 flex items-center gap-1.5 p-1.5 rounded-2xl backdrop-blur-xl border shadow-xl ${
          isLightMode
            ? "bg-white/80 border-purple-100 shadow-purple-900/5"
            : "bg-zinc-950/80 border-white/10 shadow-black/40"
        }`}
      >
        <button
          type="button"
          onClick={() => handleZoom(0.15)}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.15)}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div
          className={`w-[1px] h-4 mx-0.5 ${
            isLightMode ? "bg-slate-200" : "bg-white/10"
          }`}
        />
        <button
          type="button"
          onClick={recenterOnActiveNode}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-purple-600 hover:bg-purple-100/60"
              : "text-purple-400 hover:bg-purple-950/40"
          }`}
          title="Recenter Active Node"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={centerConstellation}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-all ${
            isLightMode
              ? "text-slate-600 hover:text-purple-600 hover:bg-purple-50"
              : "text-zinc-400 hover:text-purple-300 hover:bg-white/10"
          }`}
          title="Reset Constellation View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
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
          <filter id="celestial-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#f59e0b" floodOpacity={isLightMode ? 0.45 : 0.65} />
          </filter>
          <filter id="celestial-glow-violet" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#8b5cf6" floodOpacity={isLightMode ? 0.5 : 0.75} />
          </filter>
          <filter id="celestial-glow-mana" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#a855f7" floodOpacity={isLightMode ? 0.65 : 0.85} />
          </filter>
          <filter id="celestial-glow-warm" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity={isLightMode ? 0.5 : 0.75} />
          </filter>

          {/* Tier Fill Gradients */}
          {Object.values(TIER_THEMES).map((t) => (
            <React.Fragment key={`tgrad-${t.tier}`}>
              <linearGradient id={`tier-fill-${t.tier}-light`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={t.fillLightStart} />
                <stop offset="100%" stopColor={t.fillLightEnd} />
              </linearGradient>
              <linearGradient id={`tier-fill-${t.tier}-dark`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={t.fillDarkStart} />
                <stop offset="100%" stopColor={t.fillDarkEnd} />
              </linearGradient>
            </React.Fragment>
          ))}

          {/* Universal Full-Tree Vertical Gradient */}
          <linearGradient
            id="global-tree-gradient-light"
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
            id="global-tree-gradient-dark"
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
            @keyframes edgeFlowDash {
              from { stroke-dashoffset: 40; }
              to { stroke-dashoffset: 0; }
            }
            .constellation-active-edge {
              animation: edgeFlowDash 8s linear infinite;
            }
            @keyframes pulseAura {
              0%, 100% { transform: scale(1); opacity: 0.7; }
              50% { transform: scale(1.08); opacity: 1; }
            }
            .celestial-pulse {
              animation: pulseAura 3s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes celestialRotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .celestial-spin {
              animation: celestialRotate 20s linear infinite;
              transform-origin: center;
            }
            @keyframes manaWhirlwindPrimary {
              from { stroke-dashoffset: 400; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes manaWhirlwindSecondary {
              from { stroke-dashoffset: 0; }
              to { stroke-dashoffset: -400; }
            }
            .mana-flow-primary {
              animation: manaWhirlwindPrimary 11s linear infinite;
            }
            .mana-flow-secondary {
              animation: manaWhirlwindSecondary 15s linear infinite;
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
          {/* ═══════════════════════════════════════════════════════════════
              1. ORGANIC WAVY WHIRLWIND MANA FLOW & CELESTIAL BACKDROP
             ═══════════════════════════════════════════════════════════════ */}
          <g className="celestial-backdrop">
            {/* Left Flank — Wavy Whirlwind Mana Streams */}
            {/* Stream A: Primary Dotted Wavy Guide */}
            <path
              d={leftManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#global-tree-gradient-light)" : "url(#global-tree-gradient-dark)"}
              strokeWidth="1.8"
              strokeDasharray="4 7"
              opacity={isLightMode ? 0.42 : 0.48}
            />
            {/* Stream A: Ascending Ethereal Whirlwind Mana Pulse */}
            <path
              d={leftManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#global-tree-gradient-light)" : "url(#global-tree-gradient-dark)"}
              strokeWidth="2.4"
              strokeDasharray="16 54"
              strokeLinecap="round"
              filter="url(#celestial-glow-mana)"
              opacity={isLightMode ? 0.72 : 0.88}
              className="mana-flow-primary"
            />
            {/* Stream B: Intertwining Counter-Spiral Ribbon */}
            <path
              d={leftManaStreamB}
              fill="none"
              stroke={isLightMode ? "rgba(244, 63, 94, 0.35)" : "rgba(244, 63, 94, 0.45)"}
              strokeWidth="1.4"
              strokeDasharray="3 9"
              filter="url(#celestial-glow-warm)"
              opacity={isLightMode ? 0.5 : 0.65}
              className="mana-flow-secondary"
            />

            {/* Right Flank — Wavy Whirlwind Mana Streams */}
            {/* Stream A: Primary Dotted Wavy Guide */}
            <path
              d={rightManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#global-tree-gradient-light)" : "url(#global-tree-gradient-dark)"}
              strokeWidth="1.8"
              strokeDasharray="4 7"
              opacity={isLightMode ? 0.42 : 0.48}
            />
            {/* Stream A: Ascending Ethereal Whirlwind Mana Pulse */}
            <path
              d={rightManaStreamA}
              fill="none"
              stroke={isLightMode ? "url(#global-tree-gradient-light)" : "url(#global-tree-gradient-dark)"}
              strokeWidth="2.4"
              strokeDasharray="16 54"
              strokeLinecap="round"
              filter="url(#celestial-glow-mana)"
              opacity={isLightMode ? 0.72 : 0.88}
              className="mana-flow-primary"
            />
            {/* Stream B: Intertwining Counter-Spiral Ribbon */}
            <path
              d={rightManaStreamB}
              fill="none"
              stroke={isLightMode ? "rgba(244, 63, 94, 0.35)" : "rgba(244, 63, 94, 0.45)"}
              strokeWidth="1.4"
              strokeDasharray="3 9"
              filter="url(#celestial-glow-warm)"
              opacity={isLightMode ? 0.5 : 0.65}
              className="mana-flow-secondary"
            />

            {/* Apex Concentric Celestial Orbit Halos (Aligned to 500, 100) */}
            <circle
              cx="500"
              cy="100"
              r="80"
              fill="none"
              stroke={isLightMode ? "rgba(139, 92, 246, 0.28)" : "rgba(168, 85, 247, 0.32)"}
              strokeWidth="1"
              strokeDasharray="3 5"
            />
            <circle
              cx="500"
              cy="100"
              r="130"
              fill="none"
              stroke={isLightMode ? "rgba(139, 92, 246, 0.18)" : "rgba(168, 85, 247, 0.22)"}
              strokeWidth="0.8"
            />
            <circle
              cx="500"
              cy="100"
              r="185"
              fill="none"
              stroke={isLightMode ? "rgba(139, 92, 246, 0.12)" : "rgba(168, 85, 247, 0.16)"}
              strokeWidth="0.6"
              strokeDasharray="6 8"
            />

            {/* Apex Top Spire Needle (Aligned to 500, 100) */}
            <line
              x1="500"
              y1="52"
              x2="500"
              y2="24"
              stroke={isLightMode ? "#8b5cf6" : "#c084fc"}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d={largeSparklePath}
              transform="translate(500, 24)"
              fill={isLightMode ? "#8b5cf6" : "#c084fc"}
            />
            <path
              d={miniSparklePath}
              transform="translate(500, 38)"
              fill={isLightMode ? "#8b5cf6" : "#c084fc"}
            />

            {/* Cardinal Sparkles at Apex */}
            <line x1="360" y1="100" x2="340" y2="100" stroke={isLightMode ? "#8b5cf6" : "#a855f7"} strokeWidth="1" />
            <line x1="640" y1="100" x2="660" y2="100" stroke={isLightMode ? "#8b5cf6" : "#a855f7"} strokeWidth="1" />
            <path d={sparklePath} transform="translate(340, 100)" fill={isLightMode ? "#8b5cf6" : "#c084fc"} />
            <path d={sparklePath} transform="translate(660, 100)" fill={isLightMode ? "#8b5cf6" : "#c084fc"} />

            {/* Root #01 Halo Background (Aligned to 500, 1100) */}
            <circle
              cx="500"
              cy="1100"
              r="62"
              fill="none"
              stroke={isLightMode ? "rgba(245, 158, 11, 0.28)" : "rgba(251, 191, 36, 0.32)"}
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          </g>

          {/* ═══════════════════════════════════════════════════════════════
              2. 68 S-CURVED GRADIENT CONNECTING EDGES
             ═══════════════════════════════════════════════════════════════ */}
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
              const isEdgeActive =
                (isSrcMastered && (isTgtActive || (liveTgt?.progress ?? 0) === 0)) ||
                (isTgtMastered && isSrcActive) ||
                (isSrcActive && isTgtActive);

              let d: string;
              if (srcNode.x === tgtNode.x) {
                d = `M ${srcNode.x} ${srcNode.y} L ${tgtNode.x} ${tgtNode.y}`;
              } else {
                const midY = (srcNode.y + tgtNode.y) / 2;
                d = `M ${srcNode.x} ${srcNode.y} C ${srcNode.x} ${midY}, ${tgtNode.x} ${midY}, ${tgtNode.x} ${tgtNode.y}`;
              }

              const edgeGradient = isLightMode
                ? "url(#global-tree-gradient-light)"
                : "url(#global-tree-gradient-dark)";

              const isSearchActive =
                Boolean(searchQuery && searchQuery.trim().length > 0) ||
                (matchingNodeIds !== undefined &&
                  matchingNodeIds !== null &&
                  matchingNodeIds.length < SKELETON_NODES.length);
              const isEdgeMatching =
                !isSearchActive ||
                matchingNodeIds?.includes(srcId) ||
                matchingNodeIds?.includes(tgtId);
              const edgeOpacity = isSearchActive ? (isEdgeMatching ? 1 : 0.15) : 1;

              return (
                <g key={`edge-${srcId}-${tgtId}-${idx}`} style={{ opacity: edgeOpacity }}>
                  <path
                    d={d}
                    fill="none"
                    stroke={edgeGradient}
                    strokeWidth={isEdgeMastered ? 2.6 : 1.8}
                    strokeLinecap="round"
                    strokeOpacity={isEdgeMastered ? 0.95 : 0.75}
                    filter={isEdgeMastered ? (isLightMode ? undefined : "url(#celestial-glow-violet)") : undefined}
                    className="transition-all duration-300"
                  />

                  {isEdgeActive && (
                    <path
                      d={d}
                      fill="none"
                      stroke={edgeGradient}
                      strokeWidth={2}
                      strokeDasharray="4 6"
                      strokeOpacity="0.9"
                      strokeLinecap="round"
                      className="constellation-active-edge"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* ═══════════════════════════════════════════════════════════════
              3. 48 CELESTIAL MEDALLION NODES
             ═══════════════════════════════════════════════════════════════ */}
          <g className="nodes-layer">
            {SKELETON_NODES.map((node) => {
              const live = liveMap.get(node.id);
              const isSelected = selectedNodeId === node.id;
              const isApex = node.tier === 10;
              const isRoot = node.tier === 1;

              const progress = live?.progress ?? 0;
              const isMastered = live?.isMastered || progress >= 100;
              const isStarted = progress > 0 && !isMastered;
              const isApexReady = isApex && mintedSP >= 115;

              const theme = getTierTheme(node.tier);
              const nodeCode = getNodeDisplayCode(node.id);
              const spReward = live?.spAward || 0;

              const isSearchActive =
                Boolean(searchQuery && searchQuery.trim().length > 0) ||
                (matchingNodeIds !== undefined &&
                  matchingNodeIds !== null &&
                  matchingNodeIds.length < SKELETON_NODES.length);
              const isNodeMatching = !isSearchActive || matchingNodeIds?.includes(node.id);
              const nodeOpacity = isSearchActive ? (isNodeMatching ? 1 : 0.22) : 1;

              const baseRadius = isRoot ? 34 : isApex ? 48 : 20;

              const strokeColor = isLightMode ? theme.strokeLight : theme.strokeDark;
              const textColor = isLightMode ? theme.textLight : theme.textDark;
              const fillUrl = isLightMode ? `url(#tier-fill-${node.tier}-light)` : `url(#tier-fill-${node.tier}-dark)`;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  className="cursor-pointer group transition-all duration-300"
                  style={{ opacity: nodeOpacity }}
                >
                  <circle r={baseRadius + 14} fill="transparent" pointerEvents="all" />

                  {/* Selection Ring */}
                  {isSelected && (
                    <g className="celestial-spin">
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
                      <circle cx="0" cy={baseRadius + 9} r="2.5" fill={strokeColor} />
                      <circle cx="0" cy={-(baseRadius + 9)} r="2.5" fill={strokeColor} />
                    </g>
                  )}

                  {/* Sparkle star on keystones */}
                  {SPARKLE_NODE_IDS.has(node.id) && (
                    <path
                      d={sparklePath}
                      transform={`translate(${node.x > 500 ? 18 : node.x < 500 ? -18 : 0}, -20)`}
                      fill={strokeColor}
                      opacity={isLightMode ? 0.75 : 0.9}
                      className="celestial-pulse"
                    />
                  )}

                  {/* ════════════════════════════════════════════════════
                      CASE A: ROOT NODE (#01) WITH BOTANICAL LAUREL WREATH
                     ════════════════════════════════════════════════════ */}
                  {isRoot ? (
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      <g
                        fill={strokeColor}
                        stroke={strokeColor}
                        strokeWidth="1.2"
                        opacity={isLightMode ? "0.88" : "0.95"}
                      >
                        <path d={leftLaurel.stem} fill="none" strokeWidth="1.6" strokeLinecap="round" />
                        {leftLaurel.leaves.map((leaf, lIdx) => (
                          <path key={`ll-${lIdx}`} d={leaf.d} />
                        ))}
                        <path d={rightLaurel.stem} fill="none" strokeWidth="1.6" strokeLinecap="round" />
                        {rightLaurel.leaves.map((leaf, lIdx) => (
                          <path key={`rl-${lIdx}`} d={leaf.d} />
                        ))}
                      </g>

                      <circle
                        r="44"
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                        strokeDasharray="3 4"
                        opacity="0.6"
                      />
                      <path d={sparklePath} transform="translate(0, -44)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(0, 44)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(-44, 0)" fill={strokeColor} />
                      <path d={sparklePath} transform="translate(44, 0)" fill={strokeColor} />

                      <path
                        d={rootMedallionPath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth="2.2"
                        filter={isLightMode ? undefined : "url(#celestial-glow-gold)"}
                      />

                      <circle
                        r="25"
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="1"
                        opacity="0.5"
                      />

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
                    /* ════════════════════════════════════════════════════
                        CASE B: GRANDER MULTIFACETED APEX CELESTIAL STAR
                       ════════════════════════════════════════════════════ */
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      <path
                        d={apexStarPath}
                        fill={fillUrl}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 3 : 2.4}
                        strokeLinejoin="round"
                        filter="url(#celestial-glow-violet)"
                      />

                      {apexFacetLines.map((line, lIdx) => (
                        <line
                          key={`apex-facet-${lIdx}`}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={isLightMode ? "#c084fc" : "#a78bfa"}
                          strokeWidth="0.9"
                          opacity="0.65"
                        />
                      ))}

                      <circle
                        r="26"
                        fill="none"
                        stroke={isLightMode ? "#c084fc" : "#a78bfa"}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                        opacity="0.75"
                      />

                      <circle
                        r="18"
                        fill={isLightMode ? "#f3e8ff" : "#3b0764"}
                        stroke={strokeColor}
                        strokeWidth="1.6"
                      />
                      <circle
                        r="15"
                        fill="none"
                        stroke={isLightMode ? "#ddd6fe" : "#7c3aed"}
                        strokeWidth="0.8"
                        opacity="0.8"
                      />

                      {/* 100% Mathematically Centered Vector Padlock or Flame */}
                      {isApexReady || isMastered ? (
                        <g transform="translate(-9, -9)" className="pointer-events-none">
                          <Flame className="w-4.5 h-4.5 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,1)]" />
                        </g>
                      ) : (
                        <g
                          transform="translate(0, -0.6)"
                          className="pointer-events-none"
                          fill="none"
                          stroke={isLightMode ? "#7c3aed" : "#c084fc"}
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M -4.5 -1.5 V -5 C -4.5 -8 4.5 -8 4.5 -5 V -1.5" />
                          <rect
                            x="-6.5"
                            y="-1.5"
                            width="13"
                            height="9.5"
                            rx="2.2"
                            fill={isLightMode ? "rgba(124, 58, 237, 0.15)" : "rgba(192, 132, 252, 0.25)"}
                          />
                          <circle cx="0" cy="2.2" r="1.1" fill={isLightMode ? "#7c3aed" : "#c084fc"} stroke="none" />
                          <line x1="0" y1="3" x2="0" y2="5" strokeWidth="1.2" />
                        </g>
                      )}
                    </g>
                  ) : (
                    /* ════════════════════════════════════════════════════
                        CASE C: INTERMEDIATE NODES (#02 TO #47)
                       ════════════════════════════════════════════════════ */
                    <g className="transition-transform duration-300 group-hover:scale-105">
                      {isStarted && (
                        <circle
                          r={baseRadius + 4}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1.5"
                          className="celestial-pulse opacity-70"
                        />
                      )}

                      <path
                        d={standardMedallionPath}
                        fill={fillUrl}
                        stroke={isSelected ? (isLightMode ? "#0f172a" : "#ffffff") : strokeColor}
                        strokeWidth={isSelected ? 2.6 : 1.8}
                        strokeLinejoin="round"
                        filter={isMastered || isStarted ? (isLightMode ? undefined : "url(#celestial-glow-violet)") : undefined}
                      />

                      <circle
                        r="13.5"
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="0.8"
                        opacity="0.45"
                      />

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

                      {isMastered && (
                        <g transform="translate(12, -12)">
                          <circle
                            r="6.5"
                            fill={strokeColor}
                            stroke={isLightMode ? "#ffffff" : "#090a12"}
                            strokeWidth="1"
                          />
                          <Check className="w-2.5 h-2.5 text-white stroke-[3] -translate-x-[5px] -translate-y-[5px]" />
                        </g>
                      )}

                      {isMastered && spReward > 0 && (
                        <g transform="translate(-13, -12)">
                          <circle
                            r="6"
                            fill={isLightMode ? "#6d28d9" : "#3b0764"}
                            stroke={isLightMode ? "#ddd6fe" : "#c084fc"}
                            strokeWidth="1"
                          />
                          <text
                            x="0"
                            y="0.5"
                            textAnchor="middle"
                            dominantBaseline="central"
                            className="font-mono font-bold text-[7px] fill-white select-none pointer-events-none"
                          >
                            +{spReward}
                          </text>
                        </g>
                      )}

                      {isStarted && (
                        <circle
                          r="16"
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="2"
                          strokeDasharray={`${(progress / 100) * (2 * Math.PI * 16)} ${2 * Math.PI * 16}`}
                          strokeDashoffset="0"
                          strokeLinecap="round"
                          transform="rotate(-90)"
                          opacity="0.85"
                        />
                      )}
                    </g>
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
