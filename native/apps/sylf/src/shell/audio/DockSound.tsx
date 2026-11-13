import { useState } from "react";
import { ScrollView } from "react-native";
import { Activity, Button, Icon, IconButton, ListRow, Press, Row, Slider, Stack, Text, Tooltip, useNotice, useTheme, type ViewHandle } from "@sylf/design-system";
import { currentBackend, useAuth } from "../backend";
import { pickAudioFile } from "../files/pick";
import { useSoundCatalog } from "./catalog";
import { audioEngine, useAudio, type AudioState } from "./engine";

function transport(status: AudioState["status"]) {
  if (status === "loading") return { icon: "close", label: "Cancel sound loading" } as const;
  if (status === "playing") return { icon: "pause", label: "Pause sound" } as const;
  if (status === "failed") return { icon: "reset", label: "Retry sound" } as const;
  return { icon: "play", label: "Play sound" } as const;
}

function statusText(status: AudioState["status"]) {
  if (status === "loading") return "Loading audio…";
  if (status === "failed") return "Couldn’t play this audio";
  if (status === "playing") return "Playing";
  if (status === "paused") return "Paused";
  return "Catalog or local file";
}

function OpenAudioFile() {
  const { userId } = useAuth();
  const notice = useNotice();
  const [picking, setPicking] = useState(false);
  const pick = async () => {
    setPicking(true);
    try {
      const file = await pickAudioFile();
      if (!file) return;
      const release = file.uri.startsWith("blob:") ? () => URL.revokeObjectURL(file.uri) : undefined;
      if (currentBackend()?.auth.getSnapshot().userId !== userId) { release?.(); return; }
      audioEngine.play({ id: `file:${file.uri}`, title: file.name, url: file.uri, release });
    } catch {
      notice("That audio file could not be opened.");
    } finally {
      setPicking(false);
    }
  };
  return <Button title="Open audio file" icon="fileImport" fill disabled={picking} testID="audio-open-file" onPress={() => void pick()} />;
}

function SoundRow() {
  const { track, status } = useAudio();
  return (
    <Row gap="sm" testID="dock-sound">
      {track ? <IconButton {...transport(status)} active={status === "playing"} size="small" testID="dock-sound-toggle" onPress={audioEngine.toggle} /> : null}
      <Stack flex={1} gap="hair" style={{ minWidth: 0 }} accessibilityLiveRegion="polite">
        <Text variant="label" numberOfLines={1} testID="audio-track-title">{track?.title ?? "Sound"}</Text>
        <Text variant="caption" tone={status === "failed" ? "critical" : "soft"} testID="audio-status">{statusText(status)}</Text>
      </Stack>
    </Row>
  );
}

export function SoundLibrary({ dock = false, compact = false }: { dock?: boolean; compact?: boolean }) {
  const { space } = useTheme();
  const { track, status, volume } = useAudio();
  const result = useSoundCatalog();
  return (
    <ScrollView testID="sound-library" keyboardShouldPersistTaps="handled" style={dock ? { flexShrink: 1, flexGrow: 0 } : { flex: 1 }}
      contentContainerStyle={{ width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: compact ? space.md : space.lg, paddingVertical: space.md, gap: space.md }}>
        {track ? <SoundRow /> : null}
        {track ? <Slider label="Volume" value={volume} onChange={audioEngine.setVolume} format={(value) => `${Math.round(value * 100)}%`} /> : null}
        <OpenAudioFile />
        <Text variant="subheading" role="heading">Soundscapes</Text>
        {!result ? <Activity label="Loading soundscapes" /> : !result.data ? (
          <Stack gap="sm">
            <Text variant="small" tone="soft">{result.live.failure ?? "Soundscapes are unavailable."}</Text>
            <Button title="Try again" size="small" onPress={result.live.retry} />
          </Stack>
        ) : !result.data.length ? <Text variant="small" tone="soft">The catalog has no sounds yet.</Text> : (
          <Stack gap="xs">
            {result.data.map((sound) => {
              const selected = sound.id === track?.id;
              return <ListRow key={sound.id} title={sound.title} detail={selected ? statusText(status) : sound.detail} icon={selected && status === "playing" ? "pause" : "play"} selected={selected}
                onPress={() => { if (selected) audioEngine.toggle(); else audioEngine.play(sound); }} />;
            })}
          </Stack>
        )}
    </ScrollView>
  );
}

/** Audio always opens the Sounds view of the island. A lit glyph shows when a track is playing. */
export function DockAudioEntry({ height, onPress, pressRef }: { height: number; onPress: () => void; pressRef: React.Ref<ViewHandle> }) {
  const { color, shape } = useTheme();
  const { status, track } = useAudio();
  const playing = status === "playing";
  const label = playing && track ? `Sounds. Playing ${track.title}` : "Sounds";
  return (
    <Tooltip text="Sounds">
      {(tip) => (
        <Press {...tip} ref={pressRef} label={label} expanded={false} testID="dock-sounds-open" height={height} radius={shape.radius.md}
          bodyStyle={{ width: height, height, alignItems: "center", justifyContent: "center" }} onPress={() => { tip.onHover(false); onPress(); }}>
          <Icon name="audio" size={18} active={playing} color={playing ? color.ink : color.inkSoft} />
        </Press>
      )}
    </Tooltip>
  );
}
