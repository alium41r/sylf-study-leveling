// The one audio engine. Workspace's Audio tool and the Focus environment are both views of it, so there is only ever one sound playing. It loads
// the native player only when something first plays, and releases it on stop, so a person who never plays a sound pays nothing for it.
import { useSyncExternalStore } from "react";

export interface AudioState { trackId: string | null; title: string | null; url: string | null; playing: boolean; volume: number; failed: boolean }
type Player = { play(): void; pause(): void; remove(): void; loop: boolean; volume: number };

let state: AudioState = { trackId: null, title: null, url: null, playing: false, volume: 0.6, failed: false };
let player: Player | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<AudioState>) => { state = { ...state, ...next }; listeners.forEach((listener) => listener()); };

async function makePlayer(url: string): Promise<Player> {
  const audio = await import("expo-audio");
  // Playing on with the screen off is what ambient sound is for. Not mixing keeps it from stacking on other apps' sound.
  await audio.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => undefined);
  return audio.createAudioPlayer({ uri: url }) as unknown as Player;
}

export const audioEngine = {
  state: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  async play(track: { id: string; title: string; url: string }) {
    if (state.trackId === track.id && player) { player.play(); set({ playing: true }); return; }
    this.stop();
    try {
      player = await makePlayer(track.url);
      player.loop = true;
      player.volume = state.volume;
      player.play();
      set({ trackId: track.id, title: track.title, url: track.url, playing: true, failed: false });
    } catch {
      player = null;
      set({ trackId: track.id, title: track.title, url: track.url, playing: false, failed: true });
    }
  },
  pause() { player?.pause(); set({ playing: false }); },
  stop() { player?.pause(); player?.remove(); player = null; set({ playing: false, trackId: null, title: null, url: null }); },
  setVolume(volume: number) { const next = Math.max(0, Math.min(1, volume)); if (player) player.volume = next; set({ volume: next }); },
};

export const useAudio = () => useSyncExternalStore(audioEngine.subscribe, audioEngine.state, audioEngine.state);
