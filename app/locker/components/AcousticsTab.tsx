"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAcoustics, AcousticTrack } from "@/app/components/AcousticsContext";
import {
  Headphones,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sliders,
  RotateCcw,
  Sparkles,
  CloudRain,
  Coffee,
  Keyboard,
  Radio,
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
    setMasterVolume,
    setLayerVolume,
  } = useAcoustics();

  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showLayers, setShowLayers] = useState<boolean>(false);

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
    <div className="system-card rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl p-5 sm:p-8 flex flex-col gap-6 relative overflow-hidden">
      {/* Top Ambient Glow */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent" />
      <div className="absolute w-96 h-96 bg-accent-primary-dim/15 rounded-full blur-3xl pointer-events-none -top-20 right-10" />

      {/* ─── Simple Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="text-2xl font-bold font-['Rajdhani'] text-text-primary flex items-center gap-2.5 tracking-wide">
            <Headphones className="w-5 h-5 text-accent-primary" />
            <span>Acoustics</span>
          </h2>
          <p className="text-xs text-text-muted font-['Rajdhani'] mt-0.5">
            Ambient soundscapes and multi-track audio for deep focus sessions.
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "ALL", label: "All" },
            { id: "NATURE", label: "Nature" },
            { id: "AMBIENT", label: "Ambient" },
            { id: "NOISE", label: "Noise" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-['Rajdhani'] font-bold tracking-wider uppercase transition-all shrink-0 border ${
                selectedCategory === tab.id
                  ? "bg-accent-primary text-white border-accent-primary shadow-[0_0_12px_rgba(124,58,237,0.35)]"
                  : "bg-bg-abyss/80 text-text-secondary border-white/10 hover:text-text-primary hover:border-white/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Sound Controller (Hero Player Deck) ────────────────── */}
      <div className="rounded-2xl bg-bg-abyss/80 border border-white/10 p-5 sm:p-6 shadow-inner relative overflow-hidden flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Active Track Metadata */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-bg-panel border border-white/10 flex items-center justify-center text-accent-text-light shadow-inner shrink-0">
              <Headphones className="w-6 h-6" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent-primary-dim text-accent-text-light border border-accent-primary-mid">
                  {activeTrack?.category || "Nature"}
                </span>
                {activeTrack?.frequency && (
                  <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold">
                    {activeTrack.frequency}
                  </span>
                )}
              </div>

              <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary truncate">
                {activeTrack?.title || "Forest Wind & Leaves"}
              </h3>
              <p className="text-xs text-text-secondary font-['Rajdhani'] truncate">
                {activeTrack?.description || "Gentle woodland breeze rustling through forest foliage."}
              </p>
            </div>
          </div>

          {/* Center: Live FFT Equalizer Waveform */}
          <div className="flex items-end gap-1.5 h-10 px-4 py-2 bg-bg-panel/60 rounded-xl border border-white/10 shrink-0 self-center lg:self-auto">
            {frequencyData.slice(0, 12).map((heightPercent, i) => (
              <motion.div
                key={i}
                animate={{ height: `${Math.max(15, isPlaying ? heightPercent : 15)}%` }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className={`w-1.5 rounded-full transition-colors ${
                  isPlaying
                    ? "bg-gradient-to-t from-accent-primary to-accent-primary-light"
                    : "bg-white/15"
                }`}
              />
            ))}
          </div>

          {/* Right: Primary Controls (Play/Pause, Volume, Layers Toggle) */}
          <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
            {/* Play / Pause Main Button */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-12 h-12 rounded-2xl bg-accent-primary hover:opacity-90 active:scale-95 text-white flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.4)] transition-all shrink-0"
              title={isPlaying ? "Pause Soundscape" : "Play Soundscape"}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* Master Volume Slider */}
            <div className="flex items-center gap-2 bg-bg-panel/80 px-3.5 py-2.5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setMasterVolume(masterVolume > 0 ? 0 : 75)}
                className="text-text-muted hover:text-text-primary transition-colors"
                title={masterVolume === 0 ? "Unmute" : "Mute"}
              >
                {masterVolume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                className="w-20 accent-[var(--accent-primary)] h-1.5 cursor-pointer bg-bg-void rounded-lg"
              />
              <span className="text-xs font-mono font-bold text-text-secondary w-7 text-right">
                {masterVolume}%
              </span>
            </div>

            {/* Layers Toggle Button */}
            <button
              type="button"
              onClick={() => setShowLayers((prev) => !prev)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-['Rajdhani'] font-bold flex items-center gap-2 transition-all border ${
                showLayers || activeLayersCount > 0
                  ? "bg-accent-primary-dim text-accent-text-light border-accent-primary-mid shadow-sm"
                  : "bg-bg-panel/80 text-text-secondary border-white/10 hover:border-white/20 hover:text-text-primary"
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

        {/* ─── Integrated Ambient Layers Dropdown / Accordion ───── */}
        <AnimatePresence>
          {showLayers && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10 pt-4 mt-2 flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {AMBIENT_LAYERS.map((layer) => {
                  const LayerIcon = layer.icon;
                  const vol = layerVolumes[layer.key];

                  return (
                    <div
                      key={layer.key}
                      className="p-3.5 rounded-xl bg-bg-panel/60 border border-white/10 flex flex-col gap-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold">
                        <div className="flex items-center gap-2">
                          <LayerIcon className={`w-4 h-4 ${layer.color}`} />
                          <span className="text-text-primary">{layer.label}</span>
                        </div>
                        <span className="text-text-muted font-mono">{vol}%</span>
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

      {/* ─── Soundscapes Library Grid ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTracks.map((track) => {
          const isCurrentTrack = activeTrack?.id === track.id;
          const isCurrentPlaying = isCurrentTrack && isPlaying;

          return (
            <div
              key={track.id}
              onClick={() => {
                if (isCurrentTrack) {
                  togglePlay();
                } else {
                  playTrack(track);
                }
              }}
              className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between select-none relative overflow-hidden group ${
                isCurrentPlaying
                  ? "bg-accent-primary-dim/25 border-accent-primary shadow-[0_0_20px_rgba(124,58,237,0.25)] scale-[1.01]"
                  : isCurrentTrack
                  ? "bg-bg-panel border-accent-primary/50"
                  : "bg-bg-abyss/80 border-white/10 hover:border-white/25 hover:bg-bg-panel/90"
              }`}
            >
              <div>
                {/* Card Top: Category & Frequency */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full bg-bg-panel border border-white/10 text-accent-text-light">
                    {track.category}
                  </span>
                  {track.frequency && (
                    <span className="text-[10px] text-text-muted font-['Rajdhani'] font-bold">
                      {track.frequency}
                    </span>
                  )}
                </div>

                {/* Title & Description */}
                <h4 className="font-['Rajdhani'] font-bold text-base text-text-primary mb-1 group-hover:text-accent-text-light transition-colors">
                  {track.title}
                </h4>

                <p className="text-xs text-text-secondary line-clamp-2 mb-4 font-['Rajdhani'] leading-relaxed">
                  {track.description}
                </p>
              </div>

              {/* Card Bottom: Tags & Play Button */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {track.tags.slice(0, 2).map((tag, idx) => (
                    <span key={idx} className="text-[10px] text-text-muted font-['Rajdhani']">
                      #{tag}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCurrentTrack) {
                      togglePlay();
                    } else {
                      playTrack(track);
                    }
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                    isCurrentPlaying
                      ? "bg-accent-primary text-white shadow-sm"
                      : "bg-bg-panel text-accent-text-light border border-white/10 group-hover:border-accent-primary/60"
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
    </div>
  );
}
