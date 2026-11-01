// The Audio Dock's list of sounds. Choosing one is remembered by the window. Playback is disabled and says why: sound needs a
// native audio engine (master plan §6.3). There is one engine, so there is one Audio window.
import { useEffect } from "react";
import { View } from "react-native";
import { Button, ListRow, Slider, Text, useTheme } from "@sylf/design-system";
import type { WorkspaceDataAdapter } from "../data/contracts";
import { useToolResult } from "../data";
import { ToolEmpty, ToolFailed, ToolLoading, ToolPage, type ToolProps } from "./shared";

const load = (adapter: WorkspaceDataAdapter) => adapter.sounds();

export default function AudioTool({ window, patch, onProvenance }: ToolProps) {
  const { space } = useTheme();
  const result = useToolResult("sounds", load);
  useEffect(() => { if (result) onProvenance(result.provenance === "sample"); }, [result, onProvenance]);
  if (!result) return <ToolLoading />;
  if (!result.data && result.live?.failure) return <ToolFailed icon="audio" live={result.live} />;
  const sounds = result.data ?? [];
  if (!sounds.length) return <ToolEmpty icon="audio" title="No sounds yet" message="Sounds from your library will appear here." />;
  const chosen = typeof window.state.sound === "string" ? window.state.sound : sounds[0].id;
  const volume = typeof window.state.volume === "number" ? window.state.volume : 0.6;
  return (
    <View style={{ flex: 1 }}>
      <ToolPage padded={false}>
        <View style={{ padding: space.sm }}>{sounds.map((sound) => <ListRow key={sound.id} title={sound.name} detail={sound.detail} selected={sound.id === chosen} onPress={() => patch({ sound: sound.id })} />)}</View>
      </ToolPage>
      <View style={{ padding: space.md, gap: space.sm }}>
        <Slider label="Volume" value={volume} onChange={(next) => patch({ volume: next })} format={(value) => `${Math.round(value * 100)}%`} />
        <Button title="Play" icon="play" fill disabled />
        <Text variant="caption" tone="soft" align="center">Playback needs the native audio engine.</Text>
      </View>
    </View>
  );
}
