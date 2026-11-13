import type { PlayerFactory } from "./engine";

export const createPlayer: PlayerFactory = async (url, report) => {
  const audio = await import("expo-audio");
  await audio.setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" });
  const player = audio.createAudioPlayer({ uri: url });
  player.loop = true;
  const updates = player.addListener("playbackStatusUpdate", (status) => {
    if (status.error) report("failed");
    else if (status.isBuffering) report("loading");
    else if (status.playing) report("playing");
    else if (status.isLoaded) report("paused");
  });
  return {
    play: () => player.play(),
    pause: () => player.pause(),
    setVolume: (value) => { player.volume = value; },
    dispose: () => { updates.remove(); player.remove(); },
  };
};
