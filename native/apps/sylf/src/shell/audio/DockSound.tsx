// Sound in the timer dock: choose a sound, play or pause it and set its volume, from anywhere in the app. It is a view of the one audio
// engine, as the Focus environment's sound button is, so there is only ever one sound. The catalog is the same live resource Workspace's
// Audio tool read, and it loads the first time the dock's panel opens.
import { ScrollView, View } from "react-native";
import { IconButton, Press, Slider, Text, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../backend";
import { useToolResult } from "../../spaces/workspace/data";
import type { WorkspaceDataAdapter } from "../../spaces/workspace/data/contracts";
import { audioEngine, useAudio } from "./engine";
import { SoundBars } from "./SoundBars";

const load = (adapter: WorkspaceDataAdapter) => adapter.sounds();

export function DockSound() {
  const { space, color, shape } = useTheme();
  const backend = useLiveBackend();
  const audio = useAudio();
  const result = useToolResult("sounds", load);
  const sounds = result?.data ?? [];
  const urlOf = (url: string | null | undefined) => (url && backend ? backend.client.assetUrl(url) : null);
  const current = sounds.find((sound) => sound.id === audio.trackId) ?? null;
  const play = (sound: (typeof sounds)[number]) => {
    if (audio.trackId === sound.id && audio.playing) { audioEngine.pause(); return; }
    const url = urlOf(sound.url);
    if (url) void audioEngine.play({ id: sound.id, title: sound.name, url });
  };
  const toggle = () => {
    if (audio.playing) audioEngine.pause();
    else if (audio.trackId && audio.url) void audioEngine.play({ id: audio.trackId, title: audio.title ?? "", url: audio.url });
    else if (sounds[0]) play(sounds[0]);
  };
  const canPlay = !!audio.url || sounds.some((sound) => !!urlOf(sound.url));
  const status = !result ? "Loading sounds" : !sounds.length ? (result.live?.failure ? "Sounds are unavailable right now" : "No sounds yet") : audio.failed ? "This sound couldn't play" : audio.title ? (audio.playing ? audio.title : `${audio.title}, paused`) : "Choose a sound";

  return (
    <View style={{ gap: space.sm }} testID="dock-sound">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <IconButton icon={audio.playing ? "pause" : "play"} size="small" label={audio.playing ? "Pause the sound" : "Play a sound"} testID="dock-sound-toggle" disabled={!canPlay} active={audio.playing} onPress={toggle} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" numberOfLines={1}>Sound</Text>
          <Text variant="caption" tone="soft" numberOfLines={1}>{status}</Text>
        </View>
        {audio.trackId ? <SoundBars playing={audio.playing} size={16} /> : null}
      </View>
      {sounds.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.xs }}>
          {sounds.map((sound) => {
            const chosen = sound.id === audio.trackId, url = urlOf(sound.url);
            return (
              <Press key={sound.id} label={`${sound.name}${chosen && audio.playing ? ", playing" : ""}`} selected={chosen} disabled={!url} onPress={() => play(sound)} testID={`dock-sound-${sound.id}`}
                bodyStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm, height: 32, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: chosen ? color.accent.fill : color.line, backgroundColor: chosen ? color.accent.wash : "transparent", opacity: url ? 1 : 0.5 }}>
                {chosen ? <SoundBars playing={audio.playing} size={11} /> : null}
                <Text variant="caption" tone={chosen ? "ink" : "soft"} numberOfLines={1}>{sound.name}</Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
      {current || audio.trackId ? <Slider label="Volume" value={audio.volume} onChange={(next) => audioEngine.setVolume(next)} format={(value) => `${Math.round(value * 100)}%`} /> : null}
    </View>
  );
}

/** Beside the resting timer while a sound is chosen: its bars move while it plays, and a press pauses or plays it. */
export function DockSoundGlance({ size }: { size: number }) {
  const { shape, surface, color } = useTheme();
  const audio = useAudio();
  if (!audio.trackId) return null;
  const toggle = () => { if (audio.playing) audioEngine.pause(); else if (audio.url) void audioEngine.play({ id: audio.trackId!, title: audio.title ?? "", url: audio.url }); };
  return (
    <View style={[surface("raised", "md"), { width: size, height: size, borderRadius: shape.radius.md }]}>
      <Press label={audio.playing ? `Pause ${audio.title ?? "the sound"}` : `Play ${audio.title ?? "the sound"}`} testID="dock-sound-glance" onPress={toggle} height={size} radius={shape.radius.md}
        bodyStyle={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <SoundBars playing={audio.playing} size={15} color={audio.playing ? color.accent.fill : color.inkSoft} />
      </Press>
    </View>
  );
}
