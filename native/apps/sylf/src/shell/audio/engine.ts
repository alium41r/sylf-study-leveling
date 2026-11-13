// Sound is owned by the shell, so changing Spaces, closing the dock or opening a second control never creates another player.
import { useSyncExternalStore } from "react";
import { createPlayer } from "./player";

export interface AudioTrack { id: string; title: string; url: string; release?: () => void }
export type Playback = "loading" | "playing" | "paused" | "failed";
export interface AudioState { track: AudioTrack | null; status: Playback | "idle"; volume: number }
export interface Player { play(): void; pause(): void; setVolume(volume: number): void; dispose(): void }
export type PlayerFactory = (url: string, report: (status: Playback) => void) => Player | Promise<Player>;

const LOAD_TIMEOUT = 15_000;

export function createAudioEngine(makePlayer: PlayerFactory) {
  let state: AudioState = { track: null, status: "idle", volume: 0.6 };
  let player: Player | null = null;
  let generation = 0;
  let wanted = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  function publish(next: Partial<AudioState>) {
    if (Object.entries(next).every(([key, value]) => state[key as keyof AudioState] === value)) return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }

  function unload() {
    generation += 1;
    wanted = false;
    clearTimeout(deadline);
    const previous = player;
    player = null;
    previous?.dispose();
  }

  function fail() {
    unload();
    publish({ status: "failed" });
  }

  function waitForPlayback() {
    clearTimeout(deadline);
    deadline = setTimeout(fail, LOAD_TIMEOUT);
  }

  function play(track: AudioTrack) {
    if (state.track?.id !== track.id || state.track.url !== track.url) {
      unload();
      state.track?.release?.();
      publish({ track });
    }
    if (wanted && state.status !== "paused") return;

    wanted = true;
    publish({ status: "loading" });
    waitForPlayback();
    const attempt = generation;
    const report = (status: Playback) => {
      if (generation !== attempt) return;
      if (status === "failed") { fail(); return; }
      if (!wanted) return;
      if (status === "loading") {
        if (state.status !== "loading") waitForPlayback();
        publish({ status });
      } else if (status === "playing") {
        clearTimeout(deadline);
        publish({ status });
      } else if (state.status === "playing") {
        // An interruption paused the player. It can be resumed from any sound control.
        clearTimeout(deadline);
        publish({ status });
      }
    };

    const begin = (ready: Player) => {
      if (attempt !== generation || !wanted) { ready.dispose(); return; }
      player = ready;
      try { ready.setVolume(state.volume); ready.play(); }
      catch { fail(); }
    };
    try {
      if (player) begin(player);
      else {
        const created = makePlayer(track.url, report);
        // Web playback starts in the same user gesture that chose the sound.
        if (created instanceof Promise) void created.then(begin, () => { if (attempt === generation) fail(); });
        else begin(created);
      }
    } catch {
      fail();
    }
  }

  function pause() {
    if (!state.track) return;
    wanted = false;
    clearTimeout(deadline);
    if (!player || state.status === "loading") unload();
    else player.pause();
    publish({ status: "paused" });
  }

  return {
    state: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    play,
    pause,
    toggle() { if (state.status === "playing" || state.status === "loading") pause(); else if (state.track) play(state.track); },
    stop() {
      unload();
      state.track?.release?.();
      publish({ status: "idle", track: null, volume: 0.6 });
    },
    setVolume(volume: number) {
      const next = Math.max(0, Math.min(1, volume));
      player?.setVolume(next);
      publish({ volume: next });
    },
  };
}

export const audioEngine = createAudioEngine(createPlayer);
export const useAudio = () => useSyncExternalStore(audioEngine.subscribe, audioEngine.state, audioEngine.state);
