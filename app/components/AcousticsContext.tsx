"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { audioEngine, LayerGainMap } from "@/lib/acoustics/audio-engine";

export interface AcousticTrack {
  id: number;
  title: string;
  category: string;
  frequency: string | null;
  audioUrl: string;
  duration: number;
  defaultVolume: number;
  description: string | null;
  tags: string[];
  isPreset: boolean;
  orderIndex: number;
}

interface AcousticsContextType {
  tracks: AcousticTrack[];
  activeTrack: AcousticTrack | null;
  isPlaying: boolean;
  masterVolume: number;
  layerVolumes: LayerGainMap;
  selectedChime: string;
  frequencyData: number[]; // Normalized 0-100 numbers for visualizer bars
  subscribeToFrequency?: (listener: (bars: number[]) => void) => () => void;
  playTrack: (track: AcousticTrack) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  setMasterVolume: (vol: number) => void;
  setLayerVolume: (layer: keyof LayerGainMap, vol: number) => void;
  setSelectedChime: (chimeId: string) => void;
  playChime: (chimeId?: string) => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
}

const DEFAULT_FREQUENCY_DATA: number[] = Object.freeze(new Array(15).fill(20)) as unknown as number[];

const AcousticsContext = createContext<AcousticsContextType | null>(null);

// Short silent WAV base64 to keep iOS Safari audio session & lock screen widget active
const SILENT_AUDIO_URI = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export function AcousticsProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<AcousticTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<AcousticTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [masterVolume, setMasterVolumeState] = useState<number>(75);
  const [layerVolumes, setLayerVolumes] = useState<LayerGainMap>({
    rain: 0,
    cafe: 0,
    keyboard: 0,
    whitenoise: 0,
  });
  const [selectedChime, setSelectedChime] = useState<string>("system-ping");

  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const frequencyRef = useRef<number[]>(DEFAULT_FREQUENCY_DATA);
  const frequencySubscribersRef = useRef<Set<(bars: number[]) => void>>(new Set());

  // Fetch tracks from API
  useEffect(() => {
    fetch("/api/acoustics")
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (data?.tracks && data.tracks.length > 0) {
          setTracks(data.tracks);
          setActiveTrack((prev) => prev ?? data.tracks[0]);
        }
      })
      .catch(console.error);
  }, []);

  const stopFrequencyLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startFrequencyLoop = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    if (!isPlayingRef.current || frequencySubscribersRef.current.size === 0) return;

    const updateFrequency = () => {
      animationFrameRef.current = null;
      if (!isPlayingRef.current || frequencySubscribersRef.current.size === 0) {
        frequencyRef.current = DEFAULT_FREQUENCY_DATA;
        return;
      }
      if (typeof document === "undefined" || document.visibilityState !== "hidden") {
        const rawData = audioEngine.getFrequencyData();
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(rawData.length / 15));
        let changed = false;
        const prev = frequencyRef.current;
        for (let i = 0; i < 15; i++) {
          const val = rawData[i * step] || 0;
          const normalized = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          bars.push(normalized);
          if (prev[i] !== normalized) changed = true;
        }
        if (changed) {
          frequencyRef.current = bars;
          for (const listener of frequencySubscribersRef.current) {
            listener(bars);
          }
        }
      }
      if (isPlayingRef.current && frequencySubscribersRef.current.size > 0) {
        animationFrameRef.current = requestAnimationFrame(updateFrequency);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateFrequency);
  }, []);

  const subscribeToFrequency = useCallback(
    (listener: (bars: number[]) => void) => {
      frequencySubscribersRef.current.add(listener);
      if (isPlayingRef.current) {
        startFrequencyLoop();
      }
      return () => {
        frequencySubscribersRef.current.delete(listener);
        if (frequencySubscribersRef.current.size === 0) {
          stopFrequencyLoop();
        }
      };
    },
    [startFrequencyLoop, stopFrequencyLoop]
  );

  // Manage frequency analyser loop when playback state changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying && frequencySubscribersRef.current.size > 0) {
      startFrequencyLoop();
    } else {
      stopFrequencyLoop();
      frequencyRef.current = DEFAULT_FREQUENCY_DATA;
      for (const listener of frequencySubscribersRef.current) {
        listener(DEFAULT_FREQUENCY_DATA);
      }
    }
    return () => {
      stopFrequencyLoop();
    };
  }, [isPlaying, startFrequencyLoop, stopFrequencyLoop]);

  const playTrack = useCallback((track: AcousticTrack) => {
    isPlayingRef.current = true;
    setActiveTrack(track);
    audioEngine.playTrack(track.audioUrl, track.defaultVolume || 0.75);
    setIsPlaying(true);

    // Mobile silent audio bridge for lockscreen background playback
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(() => {});
    }
  }, []);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    audioEngine.pause();
    setIsPlaying(false);
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (!activeTrack && tracks.length > 0) {
      playTrack(tracks[0]);
      return;
    }
    if (activeTrack) {
      isPlayingRef.current = true;
      if (audioEngine.getActiveTrackUrl() === activeTrack.audioUrl) {
        audioEngine.resume();
      } else {
        audioEngine.playTrack(activeTrack.audioUrl, activeTrack.defaultVolume || 0.75);
      }
      setIsPlaying(true);
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(() => {});
      }
    }
  }, [activeTrack, tracks, playTrack]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      if (activeTrack) {
        resume();
      } else if (tracks.length > 0) {
        playTrack(tracks[0]);
      }
    }
  }, [isPlaying, activeTrack, tracks, pause, resume, playTrack]);

  const setMasterVolume = useCallback((vol: number) => {
    setMasterVolumeState(vol);
    audioEngine.setMasterVolume(vol);
  }, []);

  const setLayerVolume = useCallback((layer: keyof LayerGainMap, vol: number) => {
    setLayerVolumes(prev => ({ ...prev, [layer]: vol }));
    audioEngine.setLayerVolume(layer, vol);
  }, []);

  const playChime = useCallback((chimeId?: string) => {
    const id = chimeId || selectedChime;
    if (id !== "muted") {
      audioEngine.playSystemChime(id);
    }
  }, [selectedChime]);

  const playNextTrack = useCallback(() => {
    if (!activeTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex(t => t.id === activeTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    playTrack(tracks[nextIndex]);
  }, [activeTrack, tracks, playTrack]);

  const playPreviousTrack = useCallback(() => {
    if (!activeTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex(t => t.id === activeTrack.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    playTrack(tracks[prevIndex]);
  }, [activeTrack, tracks, playTrack]);

  // Update MediaSession metadata & action handlers
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (activeTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeTrack.title,
        artist: `Sylf • ${activeTrack.frequency || activeTrack.category}`,
        album: "Neural Study Entrainment",
        artwork: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      });
    }

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    try {
      navigator.mediaSession.setActionHandler("play", () => resume());
      navigator.mediaSession.setActionHandler("pause", () => pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
      navigator.mediaSession.setActionHandler("previoustrack", () => playPreviousTrack());
    } catch {
      // ignore unsupported mediaSession actions
    }
  }, [activeTrack, isPlaying, tracks, resume, pause, playNextTrack, playPreviousTrack]);

  const contextValue = useMemo<AcousticsContextType>(
    () => ({
      tracks,
      activeTrack,
      isPlaying,
      masterVolume,
      layerVolumes,
      selectedChime,
      frequencyData: DEFAULT_FREQUENCY_DATA,
      subscribeToFrequency,
      playTrack,
      togglePlay,
      pause,
      resume,
      setMasterVolume,
      setLayerVolume,
      setSelectedChime,
      playChime,
      playNextTrack,
      playPreviousTrack,
    }),
    [
      tracks,
      activeTrack,
      isPlaying,
      masterVolume,
      layerVolumes,
      selectedChime,
      subscribeToFrequency,
      playTrack,
      togglePlay,
      pause,
      resume,
      setMasterVolume,
      setLayerVolume,
      setSelectedChime,
      playChime,
      playNextTrack,
      playPreviousTrack,
    ]
  );

  return (
    <AcousticsContext.Provider value={contextValue}>
      {children}
      {/* Hidden audio element bridge for iOS Safari background lock screen audio */}
      <audio
        ref={silentAudioRef}
        src={SILENT_AUDIO_URI}
        loop
        playsInline
        preload="auto"
        className="hidden"
      />
    </AcousticsContext.Provider>
  );
}

export function useAcoustics(options?: { subscribeFrequency?: boolean }) {
  const context = useContext(AcousticsContext);
  if (!context) {
    throw new Error("useAcoustics must be used within an AcousticsProvider");
  }
  const [liveFrequency, setLiveFrequency] = useState<number[]>(context.frequencyData);
  const shouldSubscribe = Boolean(
    options?.subscribeFrequency && context.isPlaying && context.subscribeToFrequency
  );

  useEffect(() => {
    if (!shouldSubscribe || !context.subscribeToFrequency) return;
    return context.subscribeToFrequency(setLiveFrequency);
  }, [shouldSubscribe, context]);

  if (shouldSubscribe) {
    return { ...context, frequencyData: liveFrequency };
  }
  return context;
}
