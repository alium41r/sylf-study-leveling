// The Audio Dock: choose a sound and play it, through the one audio engine the Focus environment also uses, so there is only ever one sound. The
// catalog is public on the server and its addresses are relative to it, so they go through the client's asset address.
import { useEffect } from "react";
import { View } from "react-native";
import { Button, ListRow, Slider, Text, useTheme } from "@sylf/design-system";
import { useLiveBackend } from "../../../shell/backend";
import { audioEngine, useAudio } from "../../../shell/audio/engine";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolFailed, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.sounds();

export default function AudioTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const backend = useLiveBackend();
  const audio = useAudio();
  const result = useToolResult("sounds", load);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  if (!result) return <ToolLoading />;
  if (!result.data && result.live?.failure) return <ToolFailed icon="audio" live={result.live} />;
  const sounds = result.data ?? [];
  if (!sounds.length) return <ToolEmpty icon="audio" title="No sounds yet" message="Sounds from your library will appear here." />;
  const chosen = sounds.find((sound) => sound.id === window.state.sound) ?? sounds[0];
  const playingThis = audio.playing && audio.trackId === chosen.id;
  const url = chosen.url && backend ? backend.client.assetUrl(chosen.url) : null;
  const toggle = () => { if (playingThis) audioEngine.pause(); else if (url) void audioEngine.play({ id: chosen.id, title: chosen.name, url }); };
  return (
    <View style={{ flex: 1 }}>
      <ToolPage padded={false}>
        <View style={{ padding: space.sm }}>{sounds.map((sound) => <ListRow key={sound.id} title={sound.name} detail={audio.playing && audio.trackId === sound.id ? "Playing" : sound.detail} selected={sound.id === chosen.id} onPress={() => patch({ sound: sound.id })} />)}</View>
      </ToolPage>
      <View style={{ padding: space.md, gap: space.sm }}>
        <Slider label="Volume" value={audio.volume} onChange={(next) => audioEngine.setVolume(next)} format={(value) => `${Math.round(value * 100)}%`} />
        <Button title={playingThis ? "Pause" : "Play"} icon={playingThis ? "pause" : "play"} variant="emphasis" fill disabled={!url} testID="audio-play" onPress={toggle} />
        {audio.failed && audio.trackId === chosen.id ? <Text variant="caption" tone="soft" align="center">This sound couldn't play.</Text> : null}
      </View>
    </View>
  );
}
