"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useAcoustics } from "./AcousticsContext";
import { useCustomAudio } from "./CustomAudioContext";
import { useSettings } from "./SettingsContext";

const STORAGE_KEY = "scholar_audio_controller_pos";
const PADDING = 16;
const PILL_WIDTH = 300;
const PILL_HEIGHT = 44;
const EXPANDED_WIDTH = 350;

interface Position {
  x: number;
  y: number;
}

function CustomAudioIslandSeeker({
  customAudio,
}: {
  customAudio: ReturnType<typeof useCustomAudio>;
}) {
  const [time, setTime] = useState<number>(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    return customAudio.subscribeToTime((t) => {
      if (!isDraggingRef.current) {
        setTime(t);
      }
    });
  }, [customAudio]);

  const duration = customAudio.duration || customAudio.activeEntry?.duration || 0;
  const formatTime = (secs: number) => {
    if (!isFinite(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="flex flex-col gap-1 bg-bg-abyss/80 px-2.5 py-1.5 rounded-xl border border-border-subtle"
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span>{formatTime(time)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <input
        type="range"
        min="0"
        max={duration > 0 ? duration : 100}
        step="0.5"
        value={time}
        onPointerDown={() => {
          isDraggingRef.current = true;
        }}
        onChange={(e) => {
          setTime(Number(e.target.value));
        }}
        onPointerUp={(e) => {
          isDraggingRef.current = false;
          customAudio.seek(Number((e.target as HTMLInputElement).value));
        }}
        className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer bg-bg-void rounded"
        aria-label="Seek custom audio"
      />
    </div>
  );
}

export function AcousticsDynamicIsland() {
  const acoustics = useAcoustics();
  const customAudio = useCustomAudio();

  const { isOpen: isSettingsOpen } = useSettings();
  const pathname = usePathname();
  const router = useRouter();

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showLayerMixer, setShowLayerMixer] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isPausedRetained, setIsPausedRetained] = useState<boolean>(false);
  const [prevPlaying, setPrevPlaying] = useState<boolean>(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [viewportBounds, setViewportBounds] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });

  const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // ─── Unified Audio Source Determination ────────────────────
  const isCustomActive = Boolean(
    customAudio.isPlaying || (customAudio.activeTrackId && !acoustics.isPlaying)
  );
  const activeCustomTrack = customAudio.activeEntry;
  const hasActiveTrack = isCustomActive
    ? Boolean(activeCustomTrack)
    : Boolean(acoustics.activeTrack);

  const currentTitle = isCustomActive
    ? activeCustomTrack?.title || "Custom Audio"
    : acoustics.activeTrack?.title || "";

  const currentCategory = isCustomActive
    ? activeCustomTrack?.mimeType.split("/")[1]?.toUpperCase() || "CUSTOM"
    : acoustics.activeTrack?.category || "NATURE";

  const currentSubtitle = isCustomActive
    ? activeCustomTrack?.originalFilename || "Local File"
    : acoustics.activeTrack?.frequency || acoustics.activeTrack?.category || "";

  const currentIsPlaying = isCustomActive ? customAudio.isPlaying : acoustics.isPlaying;
  const currentVolume = isCustomActive ? customAudio.volume : acoustics.masterVolume;

  // Track play/pause state transitions during render
  if (prevPlaying && !currentIsPlaying) {
    setPrevPlaying(false);
    setIsPausedRetained(true);
  } else if (!prevPlaying && currentIsPlaying) {
    setPrevPlaying(true);
    if (isPausedRetained) {
      setIsPausedRetained(false);
    }
  }

  const handleTogglePlay = () => {
    if (isCustomActive) {
      if (acoustics.isPlaying) acoustics.pause();
      customAudio.togglePlay();
    } else {
      if (customAudio.isPlaying) customAudio.pause();
      acoustics.togglePlay();
    }
  };

  const handlePlayNext = () => {
    if (isCustomActive) {
      customAudio.playNextTrack();
    } else {
      acoustics.playNextTrack();
    }
  };

  const handlePlayPrev = () => {
    if (isCustomActive) {
      customAudio.playPreviousTrack();
    } else {
      acoustics.playPreviousTrack();
    }
  };

  const handleSetVolume = (vol: number) => {
    if (isCustomActive) {
      customAudio.setVolume(vol);
    } else {
      acoustics.setMasterVolume(vol);
    }
  };

  // ─── Initialize Coordinates & Viewport Listener ────────────
  useEffect(() => {
    const updateBoundsAndPosition = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewportBounds({ width: vw, height: vh });

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Position;
          const clampedX = Math.max(PADDING, Math.min(vw - PILL_WIDTH - PADDING, parsed.x));
          const clampedY = Math.max(PADDING, Math.min(vh - PILL_HEIGHT - PADDING, parsed.y));
          setPosition({ x: clampedX, y: clampedY });
          return;
        } catch {
          // ignore parsing error
        }
      }

      // Default bottom-right positioning
      setPosition({
        x: Math.max(PADDING, vw - PILL_WIDTH - 24),
        y: Math.max(PADDING, vh - PILL_HEIGHT - 24),
      });
    };

    updateBoundsAndPosition();
    window.addEventListener("resize", updateBoundsAndPosition);
    return () => window.removeEventListener("resize", updateBoundsAndPosition);
  }, []);

  // ─── Auto-Hide & Inactivity Lifecycle ──────────────────────
  useEffect(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }

    if (isPausedRetained && !currentIsPlaying) {
      if (!isHovered && !isExpanded) {
        autoHideTimerRef.current = setTimeout(() => {
          setIsPausedRetained(false);
        }, 5000);
      }
    }

    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [isPausedRetained, currentIsPlaying, isHovered, isExpanded]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (isPausedRetained && !currentIsPlaying && !isExpanded) {
      autoHideTimerRef.current = setTimeout(() => {
        setIsPausedRetained(false);
      }, 5000);
    }
  };

  // ─── Drag Handling & Coordinate Persistence ────────────────
  const handleDragStart = () => {
    isDraggingRef.current = true;
    if (position) {
      dragStartPosRef.current = { ...position };
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 60);

    if (!position) return;
    const newX = Math.max(
      PADDING,
      Math.min(viewportBounds.width - (isExpanded ? EXPANDED_WIDTH : PILL_WIDTH) - PADDING, position.x + info.offset.x)
    );
    const newY = Math.max(
      PADDING,
      Math.min(viewportBounds.height - PILL_HEIGHT - PADDING, position.y + info.offset.y)
    );

    const newPos = { x: newX, y: newY };
    setPosition(newPos);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos));
    } catch {
      // ignore storage error
    }
  };

  const handlePillClick = () => {
    if (!isDraggingRef.current) {
      setIsExpanded(true);
    }
  };

  // Dynamic rhythmic pulse for custom audio
  const [customPulse, setCustomPulse] = useState(0);
  useEffect(() => {
    if (!currentIsPlaying || !isCustomActive) return;
    const interval = setInterval(() => {
      setCustomPulse((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [currentIsPlaying, isCustomActive]);

  // ─── Suppression Rules ─────────────────────────────────────
  const isSettingsRoute = pathname?.startsWith("/settings");
  if (!position || !hasActiveTrack) {
    return null;
  }
  const isVisible = Boolean(
    currentIsPlaying ||
    isPausedRetained ||
    isExpanded ||
    (isHovered && hasActiveTrack)
  );
  const shouldShow = Boolean(isVisible && !isSettingsRoute && !isSettingsOpen);

  // ─── Directional Expansion Calculation ─────────────────────
  const opensUpward = position.y > viewportBounds.height / 2;
  const opensLeftward = position.x > viewportBounds.width / 2;

  // Mini Equalizer Bars
  const miniBar1 = currentIsPlaying
    ? isCustomActive
      ? [50, 85, 40, 95][customPulse]
      : Math.max(25, acoustics.frequencyData[1] || 25)
    : 25;
  const miniBar2 = currentIsPlaying
    ? isCustomActive
      ? [80, 50, 95, 60][customPulse]
      : Math.max(35, acoustics.frequencyData[6] || 35)
    : 25;
  const miniBar3 = currentIsPlaying
    ? isCustomActive
      ? [60, 90, 45, 75][customPulse]
      : Math.max(20, acoustics.frequencyData[11] || 20)
    : 25;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none overflow-hidden select-none">
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            key="draggable-acoustics-anchor"
          drag
          dragMomentum={false}
          dragElastic={0.05}
          dragConstraints={{
            left: PADDING,
            top: PADDING,
            right: Math.max(PADDING, viewportBounds.width - (isExpanded ? EXPANDED_WIDTH : PILL_WIDTH) - PADDING),
            bottom: Math.max(PADDING, viewportBounds.height - PILL_HEIGHT - PADDING),
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          initial={{ x: position.x, y: position.y, opacity: 0, scale: 0.85 }}
          animate={{ x: position.x, y: position.y, opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.25 } }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="absolute top-0 left-0 pointer-events-auto cursor-grab active:cursor-grabbing"
          style={{ touchAction: "none" }}
        >
          {/* ─── Morphing Smooth Shell (Expands Upward or Downward) ── */}
          <motion.div
            layout
            style={{
              transformOrigin: `${opensLeftward ? "right" : "left"} ${opensUpward ? "bottom" : "top"}`,
            }}
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
            className={`bg-[var(--surface-1)]/95 text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-[0_12px_40px_rgba(0,0,0,0.22)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-colors ${
              isExpanded
                ? "rounded-2xl p-5 w-[330px] sm:w-[350px]"
                : "rounded-full px-4 py-2.5 w-[290px] sm:w-[310px] hover:border-accent-primary/60 hover:shadow-[0_0_20px_var(--accent-primary-dim)] opacity-90 hover:opacity-100 group"
            } ${
              opensUpward && isExpanded ? "-translate-y-[calc(100%-44px)]" : ""
            } ${
              opensLeftward && isExpanded ? "-translate-x-[calc(100%-290px)] sm:-translate-x-[calc(100%-310px)]" : ""
            }`}
            onClick={!isExpanded ? handlePillClick : undefined}
          >
            {!isExpanded ? (
              /* ─── Compact Pill Content ──────────────────────── */
              <motion.div
                key="pill-inner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between gap-2.5 w-full"
              >
                {/* Drag Grip Indicator & Mini Equalizer */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col gap-0.5 opacity-40 group-hover:opacity-80 transition-opacity">
                    <div className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-text-muted" />
                      <span className="w-1 h-1 rounded-full bg-text-muted" />
                    </div>
                    <div className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-text-muted" />
                      <span className="w-1 h-1 rounded-full bg-text-muted" />
                    </div>
                  </div>

                  <div className="flex items-end gap-0.5 h-4 w-3.5 shrink-0">
                    <motion.div
                      animate={{ height: `${miniBar1}%` }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className={`w-1 rounded-full ${
                        currentIsPlaying ? "bg-accent-primary" : "bg-text-muted"
                      }`}
                    />
                    <motion.div
                      animate={{ height: `${miniBar2}%` }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className={`w-1 rounded-full ${
                        currentIsPlaying ? "bg-accent-primary-light" : "bg-text-muted"
                      }`}
                    />
                    <motion.div
                      animate={{ height: `${miniBar3}%` }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className={`w-1 rounded-full ${
                        currentIsPlaying ? "bg-accent-primary" : "bg-text-muted"
                      }`}
                    />
                  </div>
                </div>

                {/* Track Title & Category */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-xs font-bold font-['Rajdhani'] text-text-primary truncate">
                    {currentTitle}
                  </span>
                  <span className="text-[9px] font-bold font-['Rajdhani'] uppercase tracking-wider px-1.5 py-0.2 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid shrink-0 hidden sm:inline-block">
                    {currentCategory}
                  </span>
                </div>

                {/* Quick Controls */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePlay();
                    }}
                    className="w-7 h-7 rounded-full bg-accent-primary hover:opacity-90 active:scale-95 text-[var(--accent-foreground,#ffffff)] flex items-center justify-center transition-all shadow"
                    title={currentIsPlaying ? "Pause" : "Play"}
                  >
                    {currentIsPlaying ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayNext();
                    }}
                    className="w-6 h-6 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all text-xs border border-[var(--border-subtle)]"
                    title="Next Track"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ─── Expanded HUD Content ────────────────────────── */
              <motion.div
                key="hud-inner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-3.5 w-full"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[9px] font-bold font-['Rajdhani'] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                        {currentCategory}
                      </span>
                      {currentSubtitle && (
                        <span className="text-[10px] text-text-muted font-['Rajdhani'] font-semibold truncate">
                          {currentSubtitle}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary truncate">
                      {currentTitle}
                    </h4>
                  </div>

                  <div
                    className="flex items-center gap-1.5 shrink-0 ml-2"
                    onPointerDownCapture={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsExpanded(false);
                        router.push("/locker?tab=acoustics");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-bg-abyss hover:bg-bg-shadow text-[11px] font-['Rajdhani'] font-bold text-accent-text-light border border-border-subtle transition-all"
                      title="Open Full Acoustics Studio"
                    >
                      Locker ↗
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsExpanded(false);
                        if (!currentIsPlaying) {
                          setIsPausedRetained(false);
                        }
                      }}
                      className="w-7 h-7 rounded-lg bg-bg-abyss hover:bg-bg-shadow text-text-muted hover:text-text-primary flex items-center justify-center transition-all text-xs border border-border-subtle"
                      title="Collapse"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Live FFT Spectrum Visualizer */}
                <div className="flex items-end gap-1.5 h-8 px-2.5 py-1 bg-bg-abyss/90 rounded-xl border border-border-subtle">
                  {(isCustomActive
                    ? [30, 65, 90, 50, 75, 40, 85, 95, 60, 80, 45, 70, 88, 55, 35]
                    : acoustics.frequencyData
                  ).map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: `${currentIsPlaying ? (isCustomActive ? Math.max(20, h * (customPulse % 2 === 0 ? 1 : 0.65)) : h) : 20}%`,
                      }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className={`w-full rounded-full ${
                        currentIsPlaying
                          ? "bg-gradient-to-t from-accent-primary to-accent-primary-light"
                          : "bg-border-subtle"
                      }`}
                    />
                  ))}
                </div>

                {/* Custom Audio Seeker (if custom audio is active) */}
                {isCustomActive && (
                  <CustomAudioIslandSeeker customAudio={customAudio} />
                )}

                {/* Master Volume Slider */}
                <div
                  className="flex items-center justify-between gap-3 bg-bg-abyss/70 p-2.5 rounded-xl border border-border-subtle"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <span className="text-[11px] font-['Rajdhani'] font-bold text-text-muted uppercase">
                    Volume
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentVolume}
                    onChange={(e) => handleSetVolume(Number(e.target.value))}
                    className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer"
                  />
                  <span className="text-xs font-['Rajdhani'] font-bold text-text-secondary w-7 text-right">
                    {currentVolume}%
                  </span>
                </div>

                {/* Transport Controls */}
                <div
                  className="flex items-center justify-between pt-0.5"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setShowLayerMixer(!showLayerMixer)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider border transition-all ${
                      showLayerMixer
                        ? "bg-accent-primary text-white border-accent-primary shadow-sm"
                        : "bg-bg-abyss text-text-secondary border-border-subtle hover:text-text-primary"
                    }`}
                  >
                    Layers {showLayerMixer ? "▲" : "▼"}
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handlePlayPrev}
                      className="w-8 h-8 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-text-secondary hover:text-text-primary flex items-center justify-center transition-all border border-border-subtle"
                      title="Previous Track"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className="w-9 h-9 rounded-xl bg-accent-primary hover:opacity-90 active:scale-95 text-white flex items-center justify-center transition-all shadow-md"
                      title={currentIsPlaying ? "Pause" : "Play"}
                    >
                      {currentIsPlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handlePlayNext}
                      className="w-8 h-8 rounded-xl bg-bg-abyss hover:bg-bg-shadow text-text-secondary hover:text-text-primary flex items-center justify-center transition-all border border-border-subtle"
                      title="Next Track"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Ambient Mixer Mini-Sliders */}
                <AnimatePresence>
                  {showLayerMixer && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col gap-2 pt-2 border-t border-border-subtle/50 text-xs font-['Rajdhani']"
                      onPointerDownCapture={(e) => e.stopPropagation()}
                    >
                      {/* Rain & Thunder */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-muted w-16 truncate">Rain</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acoustics.layerVolumes.rain}
                          onChange={(e) => acoustics.setLayerVolume("rain", Number(e.target.value))}
                          className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer"
                        />
                        <span className="text-[11px] text-text-secondary w-6 text-right">
                          {acoustics.layerVolumes.rain}%
                        </span>
                      </div>

                      {/* Cafe Chatter */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-muted w-16 truncate">Cafe</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acoustics.layerVolumes.cafe}
                          onChange={(e) => acoustics.setLayerVolume("cafe", Number(e.target.value))}
                          className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer"
                        />
                        <span className="text-[11px] text-text-secondary w-6 text-right">
                          {acoustics.layerVolumes.cafe}%
                        </span>
                      </div>

                      {/* Mechanical Typing */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-muted w-16 truncate">Typing</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acoustics.layerVolumes.keyboard}
                          onChange={(e) => acoustics.setLayerVolume("keyboard", Number(e.target.value))}
                          className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer"
                        />
                        <span className="text-[11px] text-text-secondary w-6 text-right">
                          {acoustics.layerVolumes.keyboard}%
                        </span>
                      </div>

                      {/* White Noise */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-muted w-16 truncate">Noise</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={acoustics.layerVolumes.whitenoise}
                          onChange={(e) => acoustics.setLayerVolume("whitenoise", Number(e.target.value))}
                          className="w-full accent-[var(--accent-primary)] h-1 cursor-pointer"
                        />
                        <span className="text-[11px] text-text-secondary w-6 text-right">
                          {acoustics.layerVolumes.whitenoise}%
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
