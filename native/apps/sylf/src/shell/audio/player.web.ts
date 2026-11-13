import type { PlayerFactory } from "./engine";

export const createPlayer: PlayerFactory = (url, report) => {
  const media = new Audio();
  media.loop = true;
  media.preload = "auto";
  media.onplaying = () => report("playing");
  media.onpause = () => report("paused");
  media.onwaiting = () => report("loading");
  media.onerror = () => report("failed");
  media.src = url;

  return {
    play: () => { void media.play().catch(() => { if (media.onerror) report("failed"); }); },
    pause: () => media.pause(),
    setVolume: (value) => { media.volume = value; },
    dispose: () => {
      media.onplaying = media.onpause = media.onwaiting = media.onerror = null;
      media.pause();
      media.removeAttribute("src");
      media.load();
    },
  };
};
