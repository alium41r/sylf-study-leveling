// Choosing how a session is shaped. Each rhythm is drawn rather than described, so the seven modes can be told apart at a glance, and the few
// numbers each one has are tuned in a sheet. Settings stay on this device, as web keeps them.
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Chip, Sheet, Slider, Stack, Text, Toggle, useTheme } from "@sylf/design-system";
import { modes } from "@sylf/shared";
import { SESSION_LENGTHS, sessionLengthLabel, sessionModeSettings, type SessionMode } from "@sylf/spaces";
import { useSessionState, useStudySession } from "../context";
import { PhaseLine } from "./PhaseLine";

export const MODE_NAMES: Record<SessionMode, string> = { countdown: "Timer", ...Object.fromEntries(modes.STUDY_MODES.map((mode) => [mode.id, mode.name])) } as Record<SessionMode, string>;

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

/** A short sentence of the rhythm, from the same pattern the line draws. */
export function rhythmWords(mode: SessionMode, settings: modes.ModeSettings, length: number | null) {
  if (mode === "countdown") return length === null ? "One open block, as long as you like" : `One ${length} min block`;
  const pattern = modes.modePattern(mode, settings);
  if (pattern[0].seconds === null) return modes.takesBreaksOnDemand(mode) ? "Open focus, with a break when you want one" : "Open focus";
  const focus = pattern.find((segment) => segment.phase === "focus")!;
  const rest = pattern.find((segment) => segment.phase !== "focus");
  const rounds = pattern.filter((segment) => segment.phase === "focus").length;
  return [`${minutes(focus.seconds!)} focus`, rest ? `${minutes(rest.seconds!)} break` : null, rounds > 1 ? `${rounds} rounds` : null].filter(Boolean).join(", ");
}

function ModeSettingsSheet({ mode, open, onClose }: { mode: modes.StudyModeId; open: boolean; onClose: () => void }) {
  const { space } = useTheme();
  const session = useStudySession();
  const state = useSessionState();
  const settings = sessionModeSettings(state, mode);
  const definition = modes.studyMode(mode);
  return (
    <Sheet open={open} onClose={onClose} title={definition.name}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Text variant="small" tone="soft">{definition.description}</Text>
        {definition.settings.filter((setting) => setting.type !== "select").map((setting) => setting.type === "toggle"
          ? <Toggle key={setting.key} label={setting.label} value={settings[setting.key] === true} onChange={(value) => session.setModeSetting(mode, setting.key, value)} />
          : <Slider key={setting.key} label={setting.label} value={Number(settings[setting.key])} min={setting.min} max={setting.max} step={1} onChange={(value) => session.setModeSetting(mode, setting.key, Math.round(value))} format={(value) => `${Math.round(value)}${setting.unit ?? ""}`} />)}
        {definition.settings.length ? null : <Text variant="small" tone="soft">Nothing to set. Start when you're ready, stop when you're done.</Text>}
      </ScrollView>
    </Sheet>
  );
}

export function ModeChooser({ compact = false }: { compact?: boolean }) {
  const { space } = useTheme();
  const session = useStudySession();
  const state = useSessionState();
  const mode = state.mode ?? "countdown";
  const [tuning, setTuning] = useState(false);
  const settings = mode === "countdown" ? {} : sessionModeSettings(state, mode);
  const pattern = useMemo(() => (mode === "countdown" ? [{ phase: "focus", seconds: state.length === null ? null : state.length * 60 }] : modes.modePattern(mode, settings)), [mode, settings, state.length]);
  const words = rhythmWords(mode, settings, state.length);
  return (
    <Stack gap="md">
      <View role="radiogroup" aria-label="Rhythm" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {(["countdown", ...modes.STUDY_MODES.map((item) => item.id)] as SessionMode[]).map((id) => <Chip key={id} radio label={MODE_NAMES[id]} selected={id === mode} onPress={() => session.setMode(id)} />)}
      </View>
      <PhaseLine pattern={pattern} label={`${MODE_NAMES[mode]}. ${words}`} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text variant="caption" tone="soft" style={{ flex: 1 }} testID="focus-rhythm-words">{words}</Text>
        {mode === "countdown" || compact ? null : <Button title="Adjust" size="small" variant="ghost" testID="focus-mode-adjust" onPress={() => setTuning(true)} />}
      </View>
      {mode === "countdown" ? (
        <View role="radiogroup" aria-label="Session length" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {SESSION_LENGTHS.map((value) => <Chip key={String(value)} radio label={sessionLengthLabel(value)} selected={value === state.length} onPress={() => session.setLength(value)} />)}
        </View>
      ) : null}
      {mode !== "countdown" ? <ModeSettingsSheet mode={mode} open={tuning} onClose={() => setTuning(false)} /> : null}
    </Stack>
  );
}
