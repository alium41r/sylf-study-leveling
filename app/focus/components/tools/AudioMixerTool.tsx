"use client";

import React, { useState, useMemo } from "react";
import { useAcoustics, AcousticTrack } from "@/app/components/AcousticsContext";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  CloudRain,
  Coffee,
  Keyboard,
  Radio,
  Sparkles,
  SkipForward,
  SkipBack,
  Waves,
  Volume1,
  RotateCcw,
  Music,
  Sliders,
  Check,
} from "lucide-react";

interface AmbientLayerConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}

const AMBIENT_LAYERS: AmbientLayerConfig[] = [
  { key: "rain", label: "Rain & Thunder", icon: CloudRain, color: "text-blue-400", description: "Rhythmic rainfall on glass" },
  { key: "cafe", label: "Cafe Atmosphere", icon: Coffee, color: "text-amber-400", description: "Warm coffeehouse murmur" },
  { key: "keyboard", label: "Mechanical Keystrokes", icon: Keyboard, color: "text-purple-400", description: "Tactile acoustic typing" },
  { key: "brownnoise", label: "Deep Brown Noise", icon: Waves, color: "text-orange-400", description: "Deep frequency grounding" },
  { key: "whitenoise", label: "White Noise", icon: Radio, color: "text-emerald-400", description: "High-focus sound masking" },
];

export const FALLBACK_SOUNDSCAPES: AcousticTrack[] = [
  {
    id: 1,
    title: "Forest Wind & Leaves",
    category: "NATURE",
    frequency: "Organic Wind",
    audioUrl: "/audio/ambient/wind.ogg",
    duration: 60,
    defaultVolume: 0.65,
    description: "Gentle woodland breeze rustling through high canopies and forest foliage.",
    tags: ["Forest", "Wind", "Nature"],
    isPreset: true,
    orderIndex: 0,
  },
  {
    id: 2,
    title: "Ocean Waves & Surf",
    category: "NATURE",
    frequency: "0.1Hz Swell",
    audioUrl: "/audio/ambient/waves.ogg",
    duration: 60,
    defaultVolume: 0.75,
    description: "Deep oceanic swells and gentle foaming surf rolling rhythmically onto shore.",
    tags: ["Ocean", "Waves", "Nature"],
    isPreset: true,
    orderIndex: 1,
  },
  {
    id: 3,
    title: "Running Mountain Stream",
    category: "NATURE",
    frequency: "Flowing Water",
    audioUrl: "/audio/ambient/stream.ogg",
    duration: 60,
    defaultVolume: 0.7,
    description: "Gentle bubbling mountain stream with natural water resonance.",
    tags: ["Stream", "Water", "Nature"],
    isPreset: true,
    orderIndex: 2,
  },
  {
    id: 4,
    title: "Summer Night Crickets",
    category: "NATURE",
    frequency: "Nocturnal Field",
    audioUrl: "/audio/ambient/summer-night.ogg",
    duration: 60,
    defaultVolume: 0.65,
    description: "Calm evening breeze and distant meadow crickets for quiet nocturnal study.",
    tags: ["Night", "Summer", "Nature"],
    isPreset: true,
    orderIndex: 3,
  },
  {
    id: 5,
    title: "Night Campfire Glow",
    category: "NATURE",
    frequency: "Thermal Glow",
    audioUrl: "/audio/ambient/fireplace.ogg",
    duration: 60,
    defaultVolume: 0.7,
    description: "Subtle ember crackles and warm low flame hum for quiet study sessions.",
    tags: ["Campfire", "Night", "Warmth"],
    isPreset: true,
    orderIndex: 4,
  },
  {
    id: 6,
    title: "Forest Birds & Foliage",
    category: "NATURE",
    frequency: "Woodland Canopy",
    audioUrl: "/audio/ambient/birds.ogg",
    duration: 60,
    defaultVolume: 0.65,
    description: "Gentle woodland canopy atmosphere with distant birdsong.",
    tags: ["Birds", "Forest", "Morning"],
    isPreset: true,
    orderIndex: 5,
  },
  {
    id: 7,
    title: "Gentle Rain on Window",
    category: "AMBIENT",
    frequency: "Precipitation Field",
    audioUrl: "/audio/ambient/rain.ogg",
    duration: 60,
    defaultVolume: 0.75,
    description: "Soothing rhythmic rainfall and gentle droplet patter on glass.",
    tags: ["Rain", "Atmosphere", "Calm"],
    isPreset: true,
    orderIndex: 6,
  },
  {
    id: 8,
    title: "Distant Thunder & Storm",
    category: "AMBIENT",
    frequency: "Storm Atmosphere",
    audioUrl: "/audio/ambient/storm.ogg",
    duration: 60,
    defaultVolume: 0.75,
    description: "Gentle precipitation accompanied by rolling distant thunder claps.",
    tags: ["Storm", "Thunder", "Atmosphere"],
    isPreset: true,
    orderIndex: 7,
  },
  {
    id: 9,
    title: "Quiet Cafe Murmur",
    category: "AMBIENT",
    frequency: "Warm Room Tone",
    audioUrl: "/audio/ambient/coffee-shop.ogg",
    duration: 60,
    defaultVolume: 0.7,
    description: "Subtle cafe murmur, soft ceramic clinks, and warm coffeehouse atmosphere.",
    tags: ["Cafe", "Workspace", "Study"],
    isPreset: true,
    orderIndex: 8,
  },
  {
    id: 10,
    title: "Mechanical Typing Room",
    category: "AMBIENT",
    frequency: "Acoustic Keystrokes",
    audioUrl: "/audio/ambient/keyboard.wav",
    duration: 60,
    defaultVolume: 0.6,
    description: "Rhythmic tactile mechanical keystroke ambiance for high-velocity coding.",
    tags: ["Keyboard", "Typing", "Coding"],
    isPreset: true,
    orderIndex: 9,
  },
  {
    id: 11,
    title: "City Rain & Ambience",
    category: "AMBIENT",
    frequency: "Urban Rain Field",
    audioUrl: "/audio/ambient/city.ogg",
    duration: 60,
    defaultVolume: 0.65,
    description: "Distant urban rain atmosphere and gentle city background tones.",
    tags: ["City", "Rain", "Urban"],
    isPreset: true,
    orderIndex: 10,
  },
  {
    id: 12,
    title: "Studio White Noise",
    category: "NOISE",
    frequency: "Broadband Spectrum",
    audioUrl: "/audio/ambient/white-noise.ogg",
    duration: 60,
    defaultVolume: 0.65,
    description: "Even broadband acoustic masking for high-noise study environments.",
    tags: ["White Noise", "Masking"],
    isPreset: true,
    orderIndex: 11,
  },
  {
    id: 13,
    title: "Pure Pink Noise",
    category: "NOISE",
    frequency: "1/f Equal-Energy",
    audioUrl: "/audio/ambient/pink-noise.ogg",
    duration: 60,
    defaultVolume: 0.7,
    description: "Mellow balanced noise aiding memory retention and deep concentration.",
    tags: ["Pink Noise", "Focus"],
    isPreset: true,
    orderIndex: 12,
  },
  {
    id: 14,
    title: "Obsidian Brown Noise",
    category: "NOISE",
    frequency: "Sub-bass Brownian",
    audioUrl: "/audio/soundscapes/deep-brown-noise.wav",
    duration: 60,
    defaultVolume: 0.8,
    description: "Deep waterfall rumble filtered for zero ear fatigue and complete distraction masking.",
    tags: ["Brown Noise", "Deep Focus"],
    isPreset: true,
    orderIndex: 13,
  },
];

export default function AudioMixerTool() {
  const acoustics = useAcoustics();
  const [viewMode, setViewMode] = useState<"soundscapes" | "layers">("soundscapes");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  if (!acoustics) {
    return (
      <div className="p-6 text-center text-text-muted text-xs">
        <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-40 animate-spin" />
        <span>Initializing studio audio engine...</span>
      </div>
    );
  }

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
    playNextTrack,
    playPreviousTrack,
  } = acoustics;

  const allTracks = tracks.length > 0 ? tracks : FALLBACK_SOUNDSCAPES;

  const categories = ["ALL", "NATURE", "AMBIENT", "NOISE"];

  const filteredTracks = useMemo(() => {
    if (selectedCategory === "ALL") return allTracks;
    return allTracks.filter(
      (t) => t.category.toUpperCase() === selectedCategory.toUpperCase()
    );
  }, [allTracks, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: allTracks.length,
      NATURE: 0,
      AMBIENT: 0,
      NOISE: 0,
    };
    allTracks.forEach((t) => {
      const cat = t.category.toUpperCase();
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [allTracks]);

  const handleResetAllLayers = () => {
    AMBIENT_LAYERS.forEach((l) => {
      setLayerVolume(l.key as any, 0);
    });
  };

  const activeLayerCount = AMBIENT_LAYERS.filter(
    (l) => ((layerVolumes as any)[l.key] || 0) > 0
  ).length;

  return (
    <div className="flex flex-col h-full text-text-primary select-none font-sans text-xs bg-bg-void/40 overflow-hidden">
      {/* ─── Top: Compact Now Playing Card ─── */}
      <div className="p-3.5 bg-bg-abyss border-b border-border-subtle flex flex-col gap-2.5 shadow-sm shrink-0">
        {/* Track Title & Play/Pause */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                isPlaying
                  ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/40 scale-105"
                  : "bg-bg-panel text-text-primary hover:bg-accent-primary hover:text-white border border-border-subtle"
              }`}
              title={isPlaying ? "Pause Audio" : "Play Audio"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            {/* Track Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="font-bold text-sm text-text-primary truncate"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  {activeTrack?.title || "Forest Wind & Leaves"}
                </span>
                {isPlaying && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                )}
              </div>
              <p className="text-[11px] text-text-secondary truncate">
                {activeTrack?.frequency
                  ? `${activeTrack.frequency} • ${activeTrack.category || "Ambient"}`
                  : isPlaying
                  ? "Active Music Channel"
                  : "Playback Paused"}
              </p>
            </div>
          </div>

          {/* Mini Equalizer Visualizer */}
          <div className="flex items-end gap-0.5 h-7 px-2 py-1 bg-bg-void/70 rounded-lg border border-border-subtle shrink-0">
            {frequencyData.slice(0, 10).map((val, idx) => (
              <div
                key={idx}
                className="w-1 bg-accent-primary rounded-t transition-all duration-75"
                style={{
                  height: isPlaying ? `${Math.max(15, val)}%` : "15%",
                  opacity: isPlaying ? 0.95 : 0.25,
                }}
              />
            ))}
          </div>
        </div>

        {/* Master Volume & Track Nav Controls */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-border-subtle/50">
          {/* Previous / Next buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={playPreviousTrack}
              className="p-1.5 rounded-lg hover:bg-bg-panel text-text-secondary hover:text-text-primary transition-colors"
              title="Previous Track"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={playNextTrack}
              className="p-1.5 rounded-lg hover:bg-bg-panel text-text-secondary hover:text-text-primary transition-colors"
              title="Next Track"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Master Volume Slider */}
          <div className="flex items-center gap-2 flex-1">
            <button
              onClick={() => setMasterVolume(masterVolume === 0 ? 75 : 0)}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              title={masterVolume === 0 ? "Unmute Master" : "Mute Master"}
            >
              {masterVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : masterVolume < 40 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={masterVolume}
              onChange={(e) => setMasterVolume(parseInt(e.target.value, 10))}
              className="w-full accent-accent-primary h-1.5 bg-bg-panel rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-mono font-bold text-text-muted w-7 text-right">
              {masterVolume}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── Mode Switcher: Soundscapes vs Ambient Mixer ─── */}
      <div className="px-3.5 py-2.5 bg-bg-panel/50 border-b border-border-subtle flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode("soundscapes")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              viewMode === "soundscapes"
                ? "bg-accent-primary text-white shadow-sm font-extrabold"
                : "bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle"
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Soundscapes ({allTracks.length})</span>
          </button>

          <button
            onClick={() => setViewMode("layers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              viewMode === "layers"
                ? "bg-accent-primary text-white shadow-sm font-extrabold"
                : "bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ambient Mixer</span>
            {activeLayerCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white text-[9px] font-mono">
                {activeLayerCount}
              </span>
            )}
          </button>
        </div>

        {viewMode === "layers" && activeLayerCount > 0 && (
          <button
            onClick={handleResetAllLayers}
            className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* ─── Soundscape Category Filter Pills Bar (Dedicated non-overlapping row) ─── */}
      {viewMode === "soundscapes" && (
        <div className="px-3.5 py-2 bg-bg-abyss/60 border-b border-border-subtle flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {categories.map((cat) => {
            const count = categoryCounts[cat] ?? 0;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                aria-label={`Category filter: ${cat}`}
                title={`Filter soundscapes by ${cat}`}
                className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? "bg-accent-primary text-white shadow-sm border border-accent-primary"
                    : "bg-bg-panel/70 text-text-muted hover:text-text-primary hover:bg-bg-panel border border-border-subtle hover:border-accent-primary/40"
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-sans font-semibold ${
                    isSelected ? "bg-white/25 text-white" : "bg-bg-abyss text-text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Content Area: Soundscapes List OR Ambient Layers ─── */}
      {viewMode === "soundscapes" ? (
        <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar flex flex-col gap-2.5 min-h-0">
          {/* All Soundscapes Songs from Locker Page */}
          <div className="flex flex-col gap-2">
            {filteredTracks.map((track) => {
              const isCurrent = activeTrack?.id === track.id;
              const isCurrentlyPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => {
                    if (isCurrent) {
                      togglePlay();
                    } else {
                      playTrack(track);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                    isCurrentlyPlaying
                      ? "bg-accent-primary-dim/30 border-accent-primary shadow-sm"
                      : isCurrent
                      ? "bg-bg-panel border-accent-primary/50"
                      : "bg-bg-abyss/80 border-border-subtle hover:border-accent-primary-dim hover:bg-bg-panel/70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Play/Pause Button on Track Card */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCurrent) {
                          togglePlay();
                        } else {
                          playTrack(track);
                        }
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                        isCurrentlyPlaying
                          ? "bg-accent-primary text-white shadow-sm"
                          : "bg-bg-panel text-text-secondary group-hover:text-text-primary border border-border-subtle group-hover:border-accent-primary-mid"
                      }`}
                    >
                      {isCurrentlyPlaying ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-xs text-text-primary truncate">
                          {track.title}
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-bg-panel text-text-muted border border-border-subtle shrink-0">
                          {track.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted truncate">
                        {track.frequency ? `${track.frequency} • ` : ""}
                        {track.description}
                      </p>
                    </div>
                  </div>

                  {/* Active Playing Indicator */}
                  {isCurrentlyPlaying && (
                    <div className="flex items-center gap-1 text-[10px] text-accent-text-light font-mono font-bold shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="hidden sm:inline">Playing</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Ambient Layers Mixer View */
        <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] text-text-muted pb-0.5">
            <span className="font-semibold uppercase tracking-wider text-text-secondary">
              Independent Noise Layers
            </span>
          </div>

          {AMBIENT_LAYERS.map((layer) => {
            const Icon = layer.icon;
            const vol = (layerVolumes as any)[layer.key] || 0;
            const isActive = vol > 0;

            return (
              <div
                key={layer.key}
                className={`p-3 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                  isActive
                    ? "bg-bg-panel/80 border-accent-primary-mid shadow-sm"
                    : "bg-bg-panel/40 border-border-subtle hover:border-accent-primary-dim"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setLayerVolume(layer.key as any, isActive ? 0 : 50)}
                      className={`p-2 rounded-xl border transition-all ${
                        isActive
                          ? `bg-bg-abyss ${layer.color} border-accent-primary-mid shadow-sm`
                          : "bg-bg-abyss text-text-muted border-border-subtle hover:text-text-primary"
                      }`}
                      title={isActive ? "Mute channel" : "Unmute channel (50%)"}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                    <div>
                      <p className="font-semibold text-text-primary text-xs">{layer.label}</p>
                      <p className="text-[10px] text-text-muted">{layer.description}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                      isActive
                        ? "bg-accent-primary-dim text-accent-text-light"
                        : "bg-bg-abyss text-text-muted"
                    }`}
                  >
                    {vol}%
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={vol}
                  onChange={(e) => setLayerVolume(layer.key as any, parseInt(e.target.value, 10))}
                  className="w-full accent-accent-primary h-1.5 bg-bg-abyss rounded-lg cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
