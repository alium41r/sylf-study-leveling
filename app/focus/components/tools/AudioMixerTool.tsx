"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAcoustics, AcousticTrack } from "@/app/components/AcousticsContext";
import { LayerGainMap } from "@/lib/acoustics/audio-engine";
import { useCustomAudio } from "@/app/components/CustomAudioContext";
import { formatTime, formatBytes, getFormatChip } from "@/app/locker/components/CustomAudioTab";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  CloudRain,
  Coffee,
  Keyboard,
  Radio,
  SkipForward,
  SkipBack,
  Waves,
  Volume1,
  RotateCcw,
  Music,
  Sliders,
  FolderOpen,
  Upload,
  FileAudio,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface AmbientLayerConfig {
  key: keyof LayerGainMap;
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

function FocusCustomAudioSeeker({
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

  return (
    <div className="flex items-center gap-2 pt-1 border-t border-border-subtle/40 text-[10px] font-mono text-text-muted">
      <span className="w-8 shrink-0">{formatTime(time)}</span>
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
        className="flex-1 accent-[var(--accent-primary)] h-1 cursor-pointer bg-bg-panel rounded"
        aria-label="Seek custom audio"
      />
      <span className="w-8 text-right shrink-0">{formatTime(duration)}</span>
    </div>
  );
}

export default function AudioMixerTool() {
  const acoustics = useAcoustics();
  const customAudio = useCustomAudio();
  const [viewMode, setViewMode] = useState<"soundscapes" | "custom" | "layers">("soundscapes");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Dynamic rhythmic pulse for custom audio FFT equalizer
  const [customPulse, setCustomPulse] = useState(0);
  useEffect(() => {
    if (!customAudio.isPlaying) return;
    const interval = setInterval(() => {
      setCustomPulse((prev) => (prev + 1) % 4);
    }, 180);
    return () => clearInterval(interval);
  }, [customAudio.isPlaying]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImportLoading(true);
      setImportError(null);
      try {
        const result = await customAudio.importFile(file);
        if (!result.success) {
          setImportError(result.error || "Import failed.");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to import file.";
        setImportError(message);
      } finally {
        setImportLoading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [customAudio]
  );

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

  const categories = ["ALL", "NATURE", "AMBIENT", "NOISE", "CUSTOM"];

  const isCustomActive = Boolean(
    customAudio.isPlaying || (customAudio.activeTrackId && !isPlaying)
  );
  const activeCustomTrack = customAudio.activeEntry;

  const filteredTracks = useMemo(() => {
    if (selectedCategory === "ALL" || selectedCategory === "CUSTOM") return allTracks;
    return allTracks.filter(
      (t) => t.category.toUpperCase() === selectedCategory.toUpperCase()
    );
  }, [allTracks, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: allTracks.length + customAudio.library.length,
      NATURE: 0,
      AMBIENT: 0,
      NOISE: 0,
      CUSTOM: customAudio.library.length,
    };
    allTracks.forEach((t) => {
      const cat = t.category.toUpperCase();
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [allTracks, customAudio.library.length]);

  const handleResetAllLayers = () => {
    AMBIENT_LAYERS.forEach((l) => {
      setLayerVolume(l.key, 0);
    });
  };

  const activeLayerCount = AMBIENT_LAYERS.filter(
    (l) => (layerVolumes[l.key] ?? 0) > 0
  ).length;

  return (
    <div className="flex flex-col h-full text-text-primary select-none font-sans text-xs bg-bg-void/40 overflow-hidden">
      {/* ─── Top: Compact Now Playing Card (Unified for Soundscapes & Custom Audio) ─── */}
      <div className="p-3.5 bg-bg-abyss border-b border-border-subtle flex flex-col gap-2.5 shadow-sm shrink-0">
        {/* Track Title & Play/Pause */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Play/Pause Button */}
            {isCustomActive && activeCustomTrack ? (
              <button
                onClick={() => {
                  if (isPlaying) acoustics.pause();
                  customAudio.togglePlay();
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  customAudio.isPlaying
                    ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/40 scale-105"
                    : "bg-bg-panel text-text-primary hover:bg-accent-primary hover:text-white border border-border-subtle"
                }`}
                title={customAudio.isPlaying ? "Pause Custom Audio" : "Play Custom Audio"}
              >
                {customAudio.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (customAudio.isPlaying) customAudio.pause();
                  togglePlay();
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  isPlaying
                    ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/40 scale-105"
                    : "bg-bg-panel text-text-primary hover:bg-accent-primary hover:text-white border border-border-subtle"
                }`}
                title={isPlaying ? "Pause Audio" : "Play Audio"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            )}

            {/* Track Info */}
            {isCustomActive && activeCustomTrack ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-bold text-sm text-text-primary truncate"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    title={activeCustomTrack.title}
                  >
                    {activeCustomTrack.title}
                  </span>
                  {customAudio.isPlaying && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-text-secondary truncate">
                  {getFormatChip(activeCustomTrack.originalFilename, activeCustomTrack.mimeType)} • Local Audio • {formatBytes(activeCustomTrack.sizeBytes)}
                </p>
              </div>
            ) : (
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
            )}
          </div>

          {/* Mini Equalizer Visualizer */}
          <div className="flex items-end gap-0.5 h-7 px-2 py-1 bg-bg-void/70 rounded-lg border border-border-subtle shrink-0">
            {isCustomActive && activeCustomTrack
              ? [35, 75, 45, 90, 60, 85, 40, 95, 55, 70].map((baseH, idx) => {
                  const h = customAudio.isPlaying
                    ? ((baseH + customPulse * 20) % 85) + 15
                    : 15;
                  return (
                    <div
                      key={idx}
                      className="w-1 bg-accent-primary rounded-t transition-all duration-75"
                      style={{
                        height: `${h}%`,
                        opacity: customAudio.isPlaying ? 0.95 : 0.25,
                      }}
                    />
                  );
                })
              : frequencyData.slice(0, 10).map((val, idx) => (
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
              onClick={() => {
                if (isCustomActive) {
                  customAudio.playPreviousTrack();
                } else {
                  playPreviousTrack();
                }
              }}
              className="p-1.5 rounded-lg hover:bg-bg-panel text-text-secondary hover:text-text-primary transition-colors"
              title="Previous Track"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (isCustomActive) {
                  customAudio.playNextTrack();
                } else {
                  playNextTrack();
                }
              }}
              className="p-1.5 rounded-lg hover:bg-bg-panel text-text-secondary hover:text-text-primary transition-colors"
              title="Next Track"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Volume Slider */}
          {isCustomActive && activeCustomTrack ? (
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={customAudio.toggleMute}
                className="text-text-muted hover:text-text-primary transition-colors shrink-0"
                title={customAudio.volume === 0 ? "Unmute Master" : "Mute Master"}
              >
                {customAudio.volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : customAudio.volume < 40 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={customAudio.volume}
                onChange={(e) => customAudio.setVolume(parseInt(e.target.value, 10))}
                className="w-full accent-accent-primary h-1.5 bg-bg-panel rounded-lg cursor-pointer"
              />
              <span className="text-[10px] font-mono font-bold text-text-muted w-7 text-right">
                {customAudio.volume}%
              </span>
            </div>
          ) : (
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
          )}
        </div>

        {/* Custom Audio Seeker */}
        {isCustomActive && activeCustomTrack && (
          <FocusCustomAudioSeeker customAudio={customAudio} />
        )}
      </div>

      {/* ─── Mode Switcher: Soundscapes vs Custom Audio vs Ambient Mixer ─── */}
      <div className="px-3.5 py-2.5 bg-bg-panel/50 border-b border-border-subtle flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => {
              setViewMode("soundscapes");
              if (selectedCategory === "CUSTOM") setSelectedCategory("ALL");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
              viewMode === "soundscapes" && selectedCategory !== "CUSTOM"
                ? "bg-accent-primary text-white shadow-sm font-extrabold"
                : "bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle"
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Soundscapes ({allTracks.length})</span>
          </button>

          <button
            onClick={() => {
              setViewMode("custom");
              setSelectedCategory("CUSTOM");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
              viewMode === "custom" || selectedCategory === "CUSTOM"
                ? "bg-accent-primary text-white shadow-sm font-extrabold"
                : "bg-bg-abyss text-text-muted hover:text-text-primary border border-border-subtle"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Custom Audio ({customAudio.library.length})</span>
          </button>

          <button
            onClick={() => setViewMode("layers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
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
            className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* ─── Soundscape Category Filter Pills Bar (Dedicated non-overlapping row) ─── */}
      {viewMode === "soundscapes" && selectedCategory !== "CUSTOM" && (
        <div className="px-3.5 py-2 bg-bg-abyss/60 border-b border-border-subtle flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {categories.map((cat) => {
            const count = categoryCounts[cat] ?? 0;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  if (cat === "CUSTOM") {
                    setViewMode("custom");
                  }
                }}
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

      {/* ─── Content Area: Soundscapes List OR Custom Audio OR Ambient Layers ─── */}
      {viewMode === "custom" || selectedCategory === "CUSTOM" ? (
        /* Custom Audio View */
        <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar flex flex-col gap-2.5 min-h-0">
          {/* Hidden file input for quick direct import */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/webm,.mp3,.wav,.ogg,.aac,.m4a,.webm"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-border-subtle/50">
            <div className="flex items-center gap-1.5 text-text-secondary font-mono text-[10px] font-bold uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5 text-accent-text-light" />
              <span>Local Audio Files ({customAudio.library.length})</span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-primary hover:bg-accent-primary-light active:scale-95 text-white text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50"
              title="Import audio from device"
            >
              {importLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              <span>Import Audio</span>
            </button>
          </div>

          {importError && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[11px]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{importError}</span>
            </div>
          )}

          {customAudio.library.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
              <div className="p-3.5 rounded-2xl bg-bg-panel border border-border-subtle text-accent-text-light">
                <FileAudio className="w-8 h-8 opacity-60 mx-auto" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-text-primary font-['Rajdhani'] uppercase tracking-wider">
                  No Local Audio Added Yet
                </h4>
                <p className="text-[11px] text-text-muted mt-1 leading-relaxed max-w-[240px]">
                  Import your own focus tracks, binaural beats, or local study audio from this device.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white font-['Rajdhani'] font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Audio File</span>
              </button>
            </div>
          ) : (
            /* Tracks List */
            <div className="flex flex-col gap-2">
              {customAudio.library.map((entry) => {
                const isCurrent = customAudio.activeTrackId === entry.id;
                const isCurrentlyPlaying = isCurrent && customAudio.isPlaying;

                return (
                  <div
                    key={entry.id}
                    onClick={() => {
                      if (isPlaying) acoustics.pause();
                      if (isCurrent) {
                        customAudio.togglePlay();
                      } else {
                        customAudio.playTrack(entry.id);
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPlaying) acoustics.pause();
                          if (isCurrent) {
                            customAudio.togglePlay();
                          } else {
                            customAudio.playTrack(entry.id);
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                          isCurrentlyPlaying
                            ? "bg-accent-primary text-white shadow-sm"
                            : "bg-bg-panel text-text-secondary group-hover:text-text-primary border border-border-subtle group-hover:border-accent-primary-mid"
                        }`}
                        title={isCurrentlyPlaying ? "Pause Track" : "Play Track"}
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
                            {entry.title}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-bg-panel text-text-muted border border-border-subtle shrink-0">
                            {getFormatChip(entry.originalFilename, entry.mimeType)}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate">
                          {formatBytes(entry.sizeBytes)} • {formatTime(entry.duration)}
                        </p>
                      </div>
                    </div>

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
          )}
        </div>
      ) : viewMode === "soundscapes" ? (
        <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar flex flex-col gap-2.5 min-h-0">
          {/* All Soundscapes Songs from Locker Page */}
          <div className="flex flex-col gap-2">
            {filteredTracks.map((track) => {
              const isCurrent = activeTrack?.id === track.id && !isCustomActive;
              const isCurrentlyPlaying = isCurrent && isPlaying;

              return (
                <div
                  key={track.id}
                  onClick={() => {
                    if (customAudio.isPlaying) customAudio.pause();
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
                        if (customAudio.isPlaying) customAudio.pause();
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
            const vol = layerVolumes[layer.key] ?? 0;
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
                      onClick={() => setLayerVolume(layer.key, isActive ? 0 : 50)}
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
                  onChange={(e) => setLayerVolume(layer.key, parseInt(e.target.value, 10))}
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

