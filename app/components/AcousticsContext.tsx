"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
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
  const [frequencyData, setFrequencyData] = useState<number[]>(new Array(15).fill(20));

  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Fetch tracks from API
  useEffect(() => {
    fetch("/api/acoustics")
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (data?.tracks && data.tracks.length > 0) {
          setTracks(data.tracks);
          if (!activeTrack) {
            setActiveTrack(data.tracks[0]);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Update MediaSession metadata & action handlers
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (activeTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeTrack.title,
        artist: `The System • ${activeTrack.frequency || activeTrack.category}`,
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
    } catch (e) {}
  }, [activeTrack, isPlaying, tracks]);

  // Frequency Analyser Polling Loop
  useEffect(() => {
    const updateFrequency = () => {
      if (isPlaying) {
        const rawData = audioEngine.getFrequencyData();
        // Sample down to 15 bars for sleek UI visualization
        const bars: number[] = [];
        const step = Math.max(1, Math.floor(rawData.length / 15));
        for (let i = 0; i < 15; i++) {
          const val = rawData[i * step] || 0;
          // Normalize 0-255 to 15-100% height
          const normalized = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          bars.push(normalized);
        }
        setFrequencyData(bars);
        animationFrameRef.current = requestAnimationFrame(updateFrequency);
      } else {
        setFrequencyData(new Array(15).fill(20));
      }
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateFrequency);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setFrequencyData(new Array(15).fill(20));
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying]);

  const playTrack = useCallback((track: AcousticTrack) => {
    setActiveTrack(track);
    audioEngine.playTrack(track.audioUrl, track.defaultVolume || 0.75);
    setIsPlaying(true);

    // Mobile silent audio bridge for lockscreen background playback
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(() => {});
    }
  }, []);

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
  }, [isPlaying, activeTrack, tracks]);

  const pause = useCallback(() => {
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

  return (
    <AcousticsContext.Provider
      value={{
        tracks,
        activeTrack,
        isPlaying,
        masterVolume,
        layerVolumes,
        selectedChime,
        frequencyData,
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
      }}
    >
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

export function useAcoustics() {
  const context = useContext(AcousticsContext);
  if (!context) {
    throw new Error("useAcoustics must be used within an AcousticsProvider");
  }
  return context;
}
