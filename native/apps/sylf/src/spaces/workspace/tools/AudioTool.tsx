// Older saved layouts may still open this tool. It shares the dock's picker and playback controls.
import { SoundLibrary } from "../../../shell/audio/DockSound";

export default function AudioTool() {
  return <SoundLibrary />;
}
