"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAcoustics } from "@/app/components/AcousticsContext";
import { useCustomAudio } from "@/app/components/CustomAudioContext";
import {
  CustomAudioTab,
  formatBytes,
  formatTime,
  getFormatChip,
  PlaybackTimeDisplay,
  SeekBar,
} from "./CustomAudioTab";
import styles from "../Locker.module.css";
import {
  Headphones,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
  RotateCcw,
  CloudRain,
  Coffee,
  Keyboard,
  Radio,
  Repeat,
  SkipBack,
} from "lucide-react";

export function AcousticsTab() {
  const {
    tracks,
    activeTrack,
    isPlaying,
    masterVolume,
    layerVolumes,
    frequencyData,
    playTrack,
    togglePlay,
    pause,
    setMasterVolume,
    setLayerVolume,
  } = useAcoustics();

  const customAudio = useCustomAudio();

  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showLayers, setShowLayers] = useState<boolean>(false);

  // ─── Unified Active Source Determination ──────────────────
  // Show custom audio if custom tab is selected and tracks exist, or if custom audio is playing, or if custom audio has an active track and soundscape is not playing
  const isCustomActive = Boolean(
    (selectedCategory === "CUSTOM" && (customAudio.activeEntry || customAudio.library.length > 0)) ||
      customAudio.isPlaying ||
      (customAudio.activeTrackId && !isPlaying)
  );

  const activeCustomTrack =
    customAudio.activeEntry ||
    (selectedCategory === "CUSTOM" && customAudio.library.length > 0 ? customAudio.library[0] : null);

  // Dynamic rhythmic pulse for custom audio waveform
  const [customPulse, setCustomPulse] = useState<number>(0);
  useEffect(() => {
    if (!customAudio.isPlaying || !isCustomActive) return;
    const interval = setInterval(() => {
      setCustomPulse((p) => (p + 1) % 4);
    }, 160);
    return () => clearInterval(interval);
  }, [customAudio.isPlaying, isCustomActive]);

  const customHeights = [35, 75, 90, 50, 85, 40, 95, 65, 80, 55, 70, 90];

  const filteredTracks =
    selectedCategory === "ALL"
      ? tracks
      : tracks.filter((t) => t.category.toUpperCase() === selectedCategory.toUpperCase());

  // Count active ambient layers (volume > 0)
  const activeLayersCount = Object.values(layerVolumes).filter((v) => v > 0).length;

  const handleResetLayers = () => {
    setLayerVolume("rain", 0);
    setLayerVolume("cafe", 0);
    setLayerVolume("keyboard", 0);
    setLayerVolume("whitenoise", 0);
  };

  const AMBIENT_LAYERS = [
    { key: "rain" as const, label: "Rain & Thunder", icon: CloudRain, color: "text-sky-400" },
    { key: "cafe" as const, label: "Cafe Murmur", icon: Coffee, color: "text-amber-400" },
    { key: "keyboard" as const, label: "Mechanical Typing", icon: Keyboard, color: "text-accent-text-light" },
    { key: "whitenoise" as const, label: "White Noise", icon: Radio, color: "text-emerald-400" },
  ];

  return (
    <div className={`${styles.card} p-4 sm:p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden w-full min-w-0`}>
      {/* Top Specular Highlight */}
      <div className={styles.topHighlight} aria-hidden="true" />
      <div className="absolute w-96 h-96 bg-accent-primary-dim/15 rounded-full blur-3xl pointer-events-none -top-20 right-10" />

      {/* ─── Acoustics Header ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5 w-full min-w-0">
        <div className="min-w-0">
          <h2 className={styles.title}>Acoustics</h2>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 max-w-full scrollbar-none shrink-0">
          {[
            { id: "ALL", label: "All" },
            { id: "NATURE", label: "Nature" },
            { id: "AMBIENT", label: "Ambient" },
            { id: "NOISE", label: "Noise" },
            { id: "CUSTOM", label: "Custom Audio" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-['Rajdhani'] font-bold tracking-wider uppercase transition-all shrink-0 border ${
                selectedCategory === tab.id
                  ? "bg-accent-primary text-white border-accent-primary shadow-[0_0_12px_var(--accent-primary-dim)]"
                  : "bg-surface text-text-secondary border-border-subtle hover:text-text-primary hover:border-accent-primary/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Sound Controller (Hero Player Deck) ────────────────── */}
      <div className={`${styles.card} p-4 sm:p-6 relative overflow-hidden flex flex-col gap-4 w-full min-w-0`}>
        {/* Top Specular Highlight */}
        <div className={styles.topHighlight} aria-hidden="true" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 relative z-10 w-full min-w-0">
          {/* Active Track Metadata */}
          {isCustomActive && activeCustomTrack ? (
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-bg-panel border flex items-center justify-center transition-colors shrink-0 shadow-inner ${
                  customAudio.isPlaying
                    ? "border-accent-primary text-accent-primary shadow-[0_0_16px_var(--accent-primary-dim)]"
                    : "border-border-subtle text-accent-text-light"
                }`}
              >
                <Headphones className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                    {getFormatChip(activeCustomTrack.originalFilename, activeCustomTrack.mimeType)}
                  </span>
                  {customAudio.isPlaying ? (
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-['Rajdhani'] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Playing Local Audio</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold">
                      Local Audio Track
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted font-['Rajdhani']">
                    {formatBytes(activeCustomTrack.sizeBytes)} • {formatTime(activeCustomTrack.duration)}
                  </span>
                </div>

                <h3
                  className="text-lg sm:text-xl font-bold font-['Rajdhani'] text-text-primary truncate"
                  title={activeCustomTrack.title}
                >
                  {activeCustomTrack.title}
                </h3>
                <p
                  className="text-xs text-text-secondary font-['Rajdhani'] truncate"
                  title={activeCustomTrack.originalFilename}
                >
                  {activeCustomTrack.originalFilename}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-bg-panel border border-border-subtle flex items-center justify-center text-accent-text-light shadow-inner shrink-0">
                <Headphones className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                    {activeTrack?.category || "Nature"}
                  </span>
                  {activeTrack?.frequency && (
                    <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold">
                      {activeTrack.frequency}
                    </span>
                  )}
                </div>

                <h3 className="text-lg sm:text-xl font-bold font-['Rajdhani'] text-text-primary truncate">
                  {activeTrack?.title || "Forest Wind & Leaves"}
                </h3>
                <p className="text-xs text-text-secondary font-['Rajdhani'] truncate">
                  {activeTrack?.description || "Gentle woodland breeze rustling through forest foliage."}
                </p>
              </div>
            </div>
          )}

          {/* Center: Live FFT Equalizer Waveform */}
          <div className="flex items-end gap-1.5 h-10 px-3 sm:px-4 py-2 bg-bg-panel/60 rounded-xl border border-border-subtle shrink-0 self-center lg:self-auto">
            {isCustomActive && activeCustomTrack
              ? customHeights.map((baseH, i) => {
                  const mod = customAudio.isPlaying
                    ? ((baseH + customPulse * 15) % 85) + 15
                    : 15;
                  return (
                    <motion.div
                      key={i}
                      animate={{ height: `${mod}%` }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      className={`w-1.5 rounded-full transition-colors ${
                        customAudio.isPlaying
                          ? "bg-gradient-to-t from-accent-primary to-accent-primary-light"
                          : "bg-text-muted/20"
                      }`}
                    />
                  );
                })
              : frequencyData.slice(0, 12).map((heightPercent, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: `${Math.max(15, isPlaying ? heightPercent : 15)}%` }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    className={`w-1.5 rounded-full transition-colors ${
                      isPlaying
                        ? "bg-gradient-to-t from-accent-primary to-accent-primary-light"
                        : "bg-text-muted/20"
                    }`}
                  />
                ))}
          </div>

          {/* Right: Primary Controls (Play/Pause, Volume, Layers Toggle) */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-between sm:justify-end w-full lg:w-auto">
            {/* Play / Pause Main Button */}
            {isCustomActive && activeCustomTrack ? (
              <button
                type="button"
                onClick={() => {
                  if (isPlaying) pause();
                  if (customAudio.activeTrackId !== activeCustomTrack.id) {
                    customAudio.playTrack(activeCustomTrack.id);
                  } else {
                    customAudio.togglePlay();
                  }
                }}
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 active:scale-95 shadow-[0_0_20px_var(--accent-primary-dim)] ${
                  customAudio.isPlaying
                    ? "bg-accent-primary text-white"
                    : "bg-accent-primary hover:opacity-90 text-white"
                }`}
                title={customAudio.isPlaying ? "Pause Custom Audio" : "Play Custom Audio"}
              >
                {customAudio.isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (customAudio.isPlaying) customAudio.pause();
                  togglePlay();
                }}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-accent-primary hover:opacity-90 active:scale-95 text-white flex items-center justify-center shadow-[0_0_20px_var(--accent-primary-dim)] transition-all shrink-0"
                title={isPlaying ? "Pause Soundscape" : "Play Soundscape"}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
            )}

            {/* Master Volume Slider */}
            {isCustomActive && activeCustomTrack ? (
              <div className="flex items-center gap-2 bg-bg-panel/80 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border border-border-subtle flex-1 sm:flex-initial min-w-0 justify-between sm:justify-start">
                <button
                  type="button"
                  onClick={customAudio.toggleMute}
                  className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                  title={customAudio.volume === 0 ? "Unmute" : "Mute"}
                >
                  {customAudio.volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customAudio.volume}
                  onChange={(e) => customAudio.setVolume(Number(e.target.value))}
                  className="w-16 sm:w-20 accent-[var(--accent-primary)] h-1.5 cursor-pointer bg-bg-void rounded-lg"
                />
                <span className="text-xs font-mono font-bold text-text-secondary w-7 text-right shrink-0">
                  {customAudio.volume}%
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-bg-panel/80 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl border border-border-subtle flex-1 sm:flex-initial min-w-0 justify-between sm:justify-start">
                <button
                  type="button"
                  onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 75)}
                  className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                  title={masterVolume === 0 ? "Unmute" : "Mute"}
                >
                  {masterVolume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(Number(e.target.value))}
                  className="w-16 sm:w-20 accent-[var(--accent-primary)] h-1.5 cursor-pointer bg-bg-void rounded-lg"
                />
                <span className="text-xs font-mono font-bold text-text-secondary w-7 text-right shrink-0">
                  {masterVolume}%
                </span>
              </div>
            )}

            {/* Layers Toggle Button */}
            <button
              type="button"
              onClick={() => setShowLayers((prev) => !prev)}
              className={`px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs font-['Rajdhani'] font-bold flex items-center gap-1.5 sm:gap-2 transition-all border shrink-0 ${
                showLayers || activeLayersCount > 0
                  ? "bg-accent-primary-dim text-accent-text-light border-accent-primary-mid shadow-sm"
                  : "bg-bg-panel/80 text-text-secondary border-border-subtle hover:border-border-active hover:text-text-primary"
              }`}
              title="Toggle Multi-Track Ambient Layers"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Layers</span>
              {activeLayersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-accent-primary text-white text-[10px] font-mono">
                  {activeLayersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ─── Dedicated Custom Audio Scrubber & Controls ─────── */}
        {isCustomActive && activeCustomTrack && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle/60 w-full min-w-0">
            <SeekBar
              subscribeToTime={customAudio.subscribeToTime}
              getCurrentTime={customAudio.getCurrentTime}
              duration={customAudio.duration || activeCustomTrack.duration}
              onSeek={customAudio.seek}
            />
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={customAudio.restart}
                  className="w-7 h-7 rounded-lg bg-bg-panel hover:bg-bg-shadow text-text-secondary hover:text-text-primary flex items-center justify-center transition-all border border-border-subtle shrink-0"
                  title="Restart track from beginning"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <PlaybackTimeDisplay
                  subscribeToTime={customAudio.subscribeToTime}
                  getCurrentTime={customAudio.getCurrentTime}
                  duration={customAudio.duration || activeCustomTrack.duration}
                  isPlaying={customAudio.isPlaying}
                />
              </div>

              {/* Loop toggle */}
              <button
                type="button"
                onClick={customAudio.toggleLoop}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider transition-all border ${
                  customAudio.loop
                    ? "bg-accent-primary-dim text-accent-text-light border-accent-primary-mid shadow-[0_0_10px_var(--accent-primary-dim)]"
                    : "bg-bg-panel/70 text-text-muted border-border-subtle hover:text-text-primary"
                }`}
                title={customAudio.loop ? "Loop: Active" : "Loop: Off"}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>{customAudio.loop ? "Loop: On" : "Loop: Off"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ─── Integrated Ambient Layers Dropdown / Accordion ───── */}
        <AnimatePresence>
          {showLayers && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-border-subtle pt-4 mt-2 flex flex-col gap-4 overflow-hidden w-full min-w-0"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted">
                  Multi-Track Ambient Mixer
                </span>
                {activeLayersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetLayers}
                    className="text-[11px] font-['Rajdhani'] font-bold text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Layers</span>
                  </button>
                )}
              </div>

              {/* 4 Multi-track Layer Sliders in a 2-Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full min-w-0">
                {AMBIENT_LAYERS.map((layer) => {
                  const LayerIcon = layer.icon;
                  const vol = layerVolumes[layer.key];

                  return (
                    <div
                      key={layer.key}
                      className="p-3 sm:p-3.5 rounded-xl bg-bg-panel/60 border border-border-subtle flex flex-col gap-2 shadow-sm min-w-0"
                    >
                      <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold">
                        <div className="flex items-center gap-2 truncate">
                          <LayerIcon className={`w-4 h-4 ${layer.color} shrink-0`} />
                          <span className="text-text-primary truncate">{layer.label}</span>
                        </div>
                        <span className="text-text-muted font-mono shrink-0 ml-2">{vol}%</span>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={vol}
                        onChange={(e) => setLayerVolume(layer.key, Number(e.target.value))}
                        className="w-full accent-[var(--accent-primary)] h-1.5 cursor-pointer bg-bg-void rounded-lg"
                      />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Content: Soundscapes Grid OR Custom Audio ─────────── */}
      {selectedCategory === "CUSTOM" ? (
        <CustomAudioTab />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0">
          {filteredTracks.map((track) => {
            const isCurrentTrack = activeTrack?.id === track.id;
            const isCurrentPlaying = isCurrentTrack && isPlaying;

            return (
              <div
                key={track.id}
                onClick={() => {
                  if (customAudio.isPlaying) {
                    customAudio.pause();
                  }
                  if (isCurrentTrack) {
                    togglePlay();
                  } else {
                    playTrack(track);
                  }
                }}
                className={`${styles.soundscapeCard} ${
                  isCurrentPlaying ? styles.soundscapeCardActive : ""
                } select-none group min-w-0`}
              >
                {/* Specular Highlight */}
                <div className={styles.topHighlight} aria-hidden="true" />

                <div>
                  {/* Card Top: Category & Frequency */}
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface border border-border-subtle text-accent-text-light truncate">
                      {track.category}
                    </span>
                    {track.frequency && (
                      <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold shrink-0">
                        {track.frequency}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h4 className="font-['Rajdhani'] font-bold text-base text-text-primary mb-1 group-hover:text-accent-text-light transition-colors truncate">
                    {track.title}
                  </h4>

                  <p className="text-xs text-text-secondary line-clamp-2 mb-4 font-['Rajdhani'] leading-relaxed">
                    {track.description}
                  </p>
                </div>

                {/* Card Bottom: Tags & Play Button */}
                <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                    {track.tags.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="text-[10px] text-text-muted font-['Rajdhani'] truncate">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (customAudio.isPlaying) {
                        customAudio.pause();
                      }
                      if (isCurrentTrack) {
                        togglePlay();
                      } else {
                        playTrack(track);
                      }
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 ${
                      isCurrentPlaying
                        ? `${styles.btnPrimaryAction} !py-1 !px-3`
                        : "bg-surface text-accent-text-light border border-border-subtle group-hover:border-accent-primary"
                    }`}
                  >
                    {isCurrentPlaying ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        <span>{isCurrentTrack ? "Resume" : "Play"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
