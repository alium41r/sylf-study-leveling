// A session's rhythm as one line: focus blocks and breaks in proportion, with the Marker at this moment. Before a session it previews a mode's
// pattern. During one it shows where the person is. Plain views, so it costs nothing to draw and never animates on its own.
import { memo } from "react";
import { View } from "react-native";
import { Marker, useTheme } from "@sylf/design-system";
import type { modes as Modes } from "@sylf/shared";

export interface PhaseSegment { phase: string; seconds: number | null }

export const PhaseLine = memo(function PhaseLine({ pattern, at, fraction, height = 6, label }: { pattern: PhaseSegment[]; at?: number; fraction?: number | null; height?: number; label: string }) {
  const { color, marker } = useTheme();
  const total = pattern.reduce((sum, segment) => sum + (segment.seconds ?? 0), 0) || 1;
  return (
    <View accessible aria-label={label} style={{ flexDirection: "row", alignItems: "center", gap: 3, height: Math.max(height, 14) }}>
      {pattern.map((segment, index) => {
        const breaking = segment.phase !== "focus";
        const grow = segment.seconds === null ? total : segment.seconds;
        return (
          <View key={index} style={{ flexGrow: grow, flexBasis: 0, height: breaking ? height / 2 : height, borderRadius: Math.min(marker.radius, height / 2), backgroundColor: index === at ? color.accent.ink : breaking ? color.lineStrong : color.inkFaint, opacity: at !== undefined && index < at ? 0.45 : 1 }}>
            {index === at && fraction !== undefined && fraction !== null ? <View style={{ position: "absolute", left: `${Math.round(fraction * 100)}%`, top: -4 }}><Marker scale={0.8} /></View> : null}
          </View>
        );
      })}
    </View>
  );
});

export type ModeId = Modes.StudyModeId;
