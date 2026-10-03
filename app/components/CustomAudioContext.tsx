"use client";

/**
 * CustomAudioContext — React Context for Custom Audio Playback
 *
 * Architecture decision: Custom audio uses HTMLAudioElement (not WebAudio API)
 * because users import finite-length songs with seek/loop/time-display needs.
 * The existing AcousticsAudioEngine uses WebAudio BufferSource nodes which
 * don't support efficient seeking and would require decoding entire large files
 * into memory.
 *
 * Custom audio coexists with built-in ambience — it does NOT stop ambient
 * layers or the nature soundscape engine. The existing engine suspends its
 * entire AudioContext on pause; custom audio has its own independent lifecycle.
 *
 * High-frequency playback time is NOT pushed through React context.
 * Components subscribe to time updates via a ref-based callback pattern.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import type { CustomAudioEntry } from "@/lib/acoustics/custom-audio-store";
import { audioEngine } from "@/lib/acoustics/audio-engine";

// ─── Types ──────────────────────────────────────────────────────

export interface CustomAudioState {
  /** Currently selected/active track ID */
  activeTrackId: string | null;
  /** Whether custom audio is currently playing */
  isPlaying: boolean;
  /** Duration of current track in seconds */
  duration: number;
  /** Volume 0-100 */
  volume: number;
  /** Whether loop is enabled */
  loop: boolean;
  /** Loading state during import or track switching */
  isLoading: boolean;
  /** Error message if something went wrong */
  error: string | null;
}

export interface CustomAudioContextType extends CustomAudioState {
  /** All imported entries in the library */
  library: CustomAudioEntry[];
  /** Currently active custom audio entry */
  activeEntry: CustomAudioEntry | null;
  /** Set active track ID manually */
  setActiveTrackId: (id: string | null) => void;
  /** Refresh library from IndexedDB */
  refreshLibrary: () => Promise<void>;
  /** Import a file from the user's device */
  importFile: (file: File) => Promise<{ success: boolean; error?: string }>;
  /** Start playing a track by ID */
  playTrack: (id: string) => Promise<void>;
  /** Pause current track */
  pause: () => void;
  /** Resume current track */
  resume: () => void;
  /** Toggle play/pause */
  togglePlay: () => void;
  /** Play next track in custom audio library */
  playNextTrack: () => void;
  /** Play previous track in custom audio library */
  playPreviousTrack: () => void;
  /** Seek to a specific time in seconds */
  seek: (time: number) => void;
  /** Restart current track from beginning */
  restart: () => void;
  /** Set volume (0-100) */
  setVolume: (vol: number) => void;
  /** Toggle mute / restore previous volume */
  toggleMute: () => void;
  /** Toggle loop on/off */
  toggleLoop: () => void;
  /** Rename a library entry */
  renameTrack: (id: string, newTitle: string) => Promise<boolean>;
  /** Remove a track from the library */
  removeTrack: (id: string) => Promise<boolean>;
  /**
   * Subscribe to high-frequency playback time updates.
   * Returns an unsubscribe function. The callback receives currentTime in seconds.
   * This avoids pushing time through React context which would cause app-wide renders.
   */
  subscribeToTime: (callback: (currentTime: number) => void) => () => void;
  /** Get current playback time (imperative, no re-render) */
  getCurrentTime: () => number;
}

export const CustomAudioContext = createContext<CustomAudioContextType | null>(null);

// ─── Provider ───────────────────────────────────────────────────

export function CustomAudioProvider({ children }: { children: React.ReactNode }) {
  const [library, setLibrary] = useState<CustomAudioEntry[]>([]);
  const [state, setState] = useState<CustomAudioState>({
    activeTrackId: null,
    isPlaying: false,
    duration: 0,
    volume: 75,
    loop: false,
    isLoading: false,
    error: null,
  });

  // Refs for the audio element and time subscribers
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);
  const timeSubscribersRef = useRef<Set<(time: number) => void>>(new Set());
  const rafRef = useRef<number | null>(null);

  // Lazily import the store to avoid SSR issues
  const storeRef = useRef<typeof import("@/lib/acoustics/custom-audio-store") | null>(null);

  const getStore = useCallback(async () => {
    if (!storeRef.current) {
      storeRef.current = await import("@/lib/acoustics/custom-audio-store");
    }
    return storeRef.current;
  }, []);

  // ─── Time update loop ───────────────────────────────────────

  const startTimeUpdates = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (audio && timeSubscribersRef.current.size > 0) {
        const time = audio.currentTime;
        timeSubscribersRef.current.forEach((cb) => cb(time));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const stopTimeUpdates = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // ─── Library operations ─────────────────────────────────────

  const refreshLibrary = useCallback(async () => {
    try {
      const store = await getStore();
      const entries = await store.listAudio();
      setLibrary(entries);
    } catch {
      setLibrary([]);
    }
  }, [getStore]);

  // ─── Initialize ─────────────────────────────────────────────

  useEffect(() => {
    // Create the shared audio element once
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
    }

    // Load library on mount
    refreshLibrary();

    return () => {
      // Cleanup on unmount
      stopTimeUpdates();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      // Revoke all object URLs
      getStore().then((store) => store.revokeAllPlaybackUrls());
    };
  }, [getStore, refreshLibrary, stopTimeUpdates]);

  // ─── Audio event handlers ───────────────────────────────────

  const setupAudioListeners = useCallback(
    (audio: HTMLAudioElement) => {
      audio.onplay = () => {
        setState((prev) => ({ ...prev, isPlaying: true, error: null }));
        startTimeUpdates();
      };

      audio.onpause = () => {
        setState((prev) => ({ ...prev, isPlaying: false }));
        stopTimeUpdates();
      };

      audio.onended = () => {
        setState((prev) => ({ ...prev, isPlaying: false }));
        stopTimeUpdates();
        // Notify time subscribers of reset to 0 if not looping
        if (!audio.loop) {
          timeSubscribersRef.current.forEach((cb) => cb(0));
        }
      };

      audio.onloadedmetadata = () => {
        setState((prev) => ({
          ...prev,
          duration: audio.duration || 0,
          isLoading: false,
        }));
      };

      audio.onerror = () => {
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          isLoading: false,
          error: "Failed to play this audio file. It may be corrupt or unsupported.",
        }));
        stopTimeUpdates();
      };
    },
    [startTimeUpdates, stopTimeUpdates]
  );

  const importFile = useCallback(
    async (file: File): Promise<{ success: boolean; error?: string }> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const store = await getStore();
        const result = await store.importAudio(file);
        if (result.success) {
          await refreshLibrary();
          setState((prev) => ({
            ...prev,
            isLoading: false,
            activeTrackId: prev.activeTrackId || (result.entry ? result.entry.id : null),
          }));
          return { success: true };
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: result.error || "Import failed.",
          }));
          return { success: false, error: result.error };
        }
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message || "Import failed.";
        setState((prev) => ({ ...prev, isLoading: false, error: msg }));
        return { success: false, error: msg };
      }
    },
    [getStore, refreshLibrary]
  );

  // ─── Playback controls ─────────────────────────────────────

  const playTrack = useCallback(
    async (id: string) => {
      const audio = audioRef.current;
      if (!audio) return;

      // Pause built-in soundscape so they don't clash
      if (audioEngine.getIsPlaying()) {
        audioEngine.pause();
      }

      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        activeTrackId: id,
      }));

      try {
        const store = await getStore();

        // Revoke previous URL if different track
        if (activeUrlRef.current) {
          store.revokePlaybackUrl(state.activeTrackId || "");
        }

        const url = await store.getPlaybackUrl(id);
        if (!url) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: "Audio file not found in library.",
          }));
          return;
        }

        activeUrlRef.current = url;
        setupAudioListeners(audio);
        audio.src = url;
        audio.volume = state.volume / 100;
        audio.loop = state.loop;
        await audio.play();
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isPlaying: false,
          error: "Failed to start playback.",
        }));
      }
    },
    [getStore, setupAudioListeners, state.activeTrackId, state.volume, state.loop]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (audioEngine.getIsPlaying()) {
      audioEngine.pause();
    }
    if (audio && audio.src) {
      audio.play().catch(() => {});
    } else if (state.activeTrackId) {
      playTrack(state.activeTrackId);
    } else if (library.length > 0) {
      playTrack(library[0].id);
    }
  }, [state.activeTrackId, library, playTrack]);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [state.isPlaying, pause, resume]);

  const playNextTrack = useCallback(() => {
    if (library.length === 0) return;
    const currentIndex = library.findIndex((t) => t.id === state.activeTrackId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % library.length : 0;
    playTrack(library[nextIndex].id);
  }, [library, state.activeTrackId, playTrack]);

  const playPreviousTrack = useCallback(() => {
    if (library.length === 0) return;
    const currentIndex = library.findIndex((t) => t.id === state.activeTrackId);
    const prevIndex =
      currentIndex >= 0
        ? (currentIndex - 1 + library.length) % library.length
        : library.length - 1;
    playTrack(library[prevIndex].id);
  }, [library, state.activeTrackId, playTrack]);

  const setActiveTrackId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, activeTrackId: id }));
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio && audio.src && isFinite(time)) {
      audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0));
    }
  }, []);

  const restart = useCallback(() => {
    seek(0);
    resume();
  }, [seek, resume]);

  const lastNonZeroVolumeRef = useRef<number>(75);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(100, vol));
    if (clamped > 0) {
      lastNonZeroVolumeRef.current = clamped;
    }
    setState((prev) => ({ ...prev, volume: clamped }));
    if (audioRef.current) {
      audioRef.current.volume = clamped / 100;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const next = prev.volume > 0 ? 0 : (lastNonZeroVolumeRef.current || 75);
      if (audioRef.current) {
        audioRef.current.volume = next / 100;
      }
      return { ...prev, volume: next };
    });
  }, []);

  const toggleLoop = useCallback(() => {
    setState((prev) => {
      const newLoop = !prev.loop;
      if (audioRef.current) {
        audioRef.current.loop = newLoop;
      }
      return { ...prev, loop: newLoop };
    });
  }, []);

  // ─── Library management ─────────────────────────────────────

  const renameTrack = useCallback(
    async (id: string, newTitle: string): Promise<boolean> => {
      const store = await getStore();
      const ok = await store.renameAudio(id, newTitle);
      if (ok) await refreshLibrary();
      return ok;
    },
    [getStore, refreshLibrary]
  );

  const removeTrack = useCallback(
    async (id: string): Promise<boolean> => {
      const store = await getStore();

      // If removing the currently active track, stop playback
      if (state.activeTrackId === id) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        stopTimeUpdates();
        setState((prev) => ({
          ...prev,
          activeTrackId: null,
          isPlaying: false,
          duration: 0,
        }));
      }

      const ok = await store.removeAudio(id);
      if (ok) await refreshLibrary();
      return ok;
    },
    [getStore, refreshLibrary, state.activeTrackId, stopTimeUpdates]
  );

  // ─── Time subscription (no React re-renders) ───────────────

  const subscribeToTime = useCallback(
    (callback: (currentTime: number) => void): (() => void) => {
      timeSubscribersRef.current.add(callback);
      // Start updates if we have subscribers and audio is playing
      if (state.isPlaying) {
        startTimeUpdates();
      }
      return () => {
        timeSubscribersRef.current.delete(callback);
        if (timeSubscribersRef.current.size === 0) {
          stopTimeUpdates();
        }
      };
    },
    [state.isPlaying, startTimeUpdates, stopTimeUpdates]
  );

  const getCurrentTime = useCallback((): number => {
    return audioRef.current?.currentTime || 0;
  }, []);

  // ─── Render ─────────────────────────────────────────────────

  const activeEntry = useMemo(
    () => library.find((t) => t.id === state.activeTrackId) || null,
    [library, state.activeTrackId]
  );

  const contextValue: CustomAudioContextType = {
    ...state,
    library,
    activeEntry,
    setActiveTrackId,
    refreshLibrary,
    importFile,
    playTrack,
    pause,
    resume,
    togglePlay,
    playNextTrack,
    playPreviousTrack,
    seek,
    restart,
    setVolume,
    toggleMute,
    toggleLoop,
    renameTrack,
    removeTrack,
    subscribeToTime,
    getCurrentTime,
  };

  return (
    <CustomAudioContext.Provider value={contextValue}>
      {children}
    </CustomAudioContext.Provider>
  );
}

// ─── Safe Default Context (for standalone testing / outside provider) ──
const DEFAULT_CUSTOM_AUDIO: CustomAudioContextType = {
  library: [],
  activeTrackId: null,
  activeEntry: null,
  isPlaying: false,
  duration: 0,
  volume: 75,
  loop: false,
  isLoading: false,
  error: null,
  importFile: async () => ({ success: false, error: "CustomAudioProvider not mounted" }),
  playTrack: async () => {},
  pause: () => {},
  resume: () => {},
  togglePlay: () => {},
  setActiveTrackId: () => {},
  playNextTrack: () => {},
  playPreviousTrack: () => {},
  seek: () => {},
  restart: () => {},
  setVolume: () => {},
  toggleMute: () => {},
  toggleLoop: () => {},
  renameTrack: async () => false,
  removeTrack: async () => false,
  refreshLibrary: async () => {},
  subscribeToTime: () => () => {},
  getCurrentTime: () => 0,
};

// ─── Hook ───────────────────────────────────────────────────────

export function useCustomAudio(): CustomAudioContextType {
  const context = useContext(CustomAudioContext);
  return context || DEFAULT_CUSTOM_AUDIO;
}
