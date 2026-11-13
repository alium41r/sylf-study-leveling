// The Studio's supporting panels: the plan health strip, signals with pre-solved options (shortage negotiation), what-if controls that re-solve on the
// device before anything is saved, planning settings and the version history with undo.
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Chip, Disclosure, ListRow, Meter, Plane, Segmented, Sheet, Slider, Stack, Text, Toggle, useTheme } from "@sylf/design-system";
import type { planning } from "@sylf/shared";
import type { StudioState } from "@sylf/backend";
import { clockLabel, dayLabel, formatMinutes, RELATIVE } from "./format";
import type { LocalPreview, Studio } from "./useStudio";

export function HealthStrip({ state, onOpenSettings }: { state: StudioState; onOpenSettings: () => void }) {
  const { space } = useTheme();
  const health = state.plan.health;
  const risk = health.atRisk[0];
  const exam = health.nextExam;
  const over = health.plannedMinutes > health.sustainableMinutes * 1.05 && health.sustainableMinutes > 0;
  return (
    <Plane level="raised" radius="lg" pad="md" testID="studio-health">
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.lg }}>
        <View style={{ flexGrow: 1, flexBasis: 220, gap: 4 }}>
          <Text variant="label" tone="soft">Next 7 days</Text>
          <Text variant="subheading">{`${formatMinutes(health.plannedMinutes)} planned of ${formatMinutes(health.sustainableMinutes)} you usually sustain`}</Text>
          <Meter value={health.plannedMinutes} max={Math.max(health.sustainableMinutes, health.plannedMinutes, 1)} label="Planned against sustainable" tone={over ? "caution" : "accent"} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 200, gap: 6 }}>
          {risk ? <Badge tone="critical" label={`${risk.title} at risk · due ${dayLabel(risk.due)}${risk.short ? ` · ${formatMinutes(risk.short)} short` : ""}`} /> : <Badge tone="positive" label="Every deadline fits" />}
          {exam ? <Badge tone="accent" label={`${exam.title} · ${RELATIVE(exam.due, state.snapshot.today)}`} /> : null}
          <Text variant="caption" tone="soft">{`Plan quality ${state.plan.quality} · ${state.facts.commitments} commitments read${state.facts.calendarComplete ? "" : " · calendar partly read"}`}</Text>
        </View>
        <Button title="Settings" icon="sliders" size="small" variant="ghost" onPress={onOpenSettings} testID="studio-settings-open" />
      </View>
    </Plane>
  );
}

export function SignalCards({ state, studio }: { state: StudioState; studio: Studio }) {
  const { space } = useTheme();
  const signals = state.signals.filter((s) => s.kind !== "block_soon").slice(0, 3);
  if (!signals.length) return null;
  return (
    <View testID="studio-signals" style={{ gap: space.sm }}>
      {signals.map((signal, index) => (
        <Plane key={`${signal.kind}-${index}`} level="plane" radius="lg" pad="md" style={{ gap: space.sm }}>
          <Text variant="subheading" tone={signal.severity === 3 ? "critical" : signal.severity === 2 ? "caution" : "ink"}>{signal.title}</Text>
          <Text variant="small" tone="soft">{signal.detail}</Text>
          {signal.actions.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {signal.actions.map((action) => (
                <Chip key={action.label} label={action.label} icon={action.kind === "whatif" ? "eye" : action.kind === "start" ? "play" : "arrowRight"} onPress={() => {
                  if (action.kind === "whatif" && action.whatIf) studio.previewWhatIf(action.whatIf, action.label);
                  else if (action.kind === "command" && action.command === "repair") void studio.open();
                }} />
              ))}
            </View>
          ) : null}
        </Plane>
      ))}
    </View>
  );
}

/** What-if: controls re-solve on the device instantly; "Keep" turns them into a reviewed proposal. */
export function WhatIfPanel({ state, studio }: { state: StudioState; studio: Studio }) {
  const [cap, setCap] = useState(state.settings.dailyCap);
  const [earlier, setEarlier] = useState(false);
  const build = (nextCap: number, nextEarlier: boolean): planning.WhatIf => ({ ...(nextCap !== state.settings.dailyCap ? { weekdayCap: nextCap } : {}), ...(nextEarlier ? { startEarlier: 3 } : {}) });
  const run = (nextCap: number, nextEarlier: boolean) => {
    const whatIf = build(nextCap, nextEarlier);
    if (!Object.keys(whatIf).length) { studio.clearPreview(); return; }
    studio.previewWhatIf(whatIf, [nextCap !== state.settings.dailyCap ? `Weekdays up to ${formatMinutes(nextCap)}` : null, nextEarlier ? "Start earlier" : null].filter(Boolean).join(" · "));
  };
  return (
    <Disclosure title="What if…" detail="Try a change before keeping it" icon="sliders">
      <Stack gap="md" testID="studio-whatif">
        <Slider label="Weekday study limit" value={cap} min={30} max={480} step={15} format={(v) => formatMinutes(v)} onChange={setCap} onCommit={(v) => run(v, earlier)} />
        <Toggle label="Start revision earlier" hint="Lets work begin before its planned start." value={earlier} onChange={(on) => { setEarlier(on); run(cap, on); }} />
        <Text variant="small" tone="soft">Changes preview on the timeline at once. Nothing is saved until you keep them.</Text>
      </Stack>
    </Disclosure>
  );
}

/** A local preview (a drag or a what-if) with its consequences, ready to keep or drop. */
export function PreviewBar({ preview, studio }: { preview: LocalPreview; studio: Studio }) {
  const { space } = useTheme();
  const short = preview.result.shortages.reduce((s, x) => s + x.short, 0);
  return (
    <Plane level="raised" radius="lg" pad="md" testID="studio-preview" style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <Badge tone="accent" label="Preview" />
        <Text variant="subheading" style={{ flexShrink: 1 }}>{preview.label}</Text>
        <Text variant="micro" tone="faint">{`re-solved in ${preview.ms} ms on this device`}</Text>
      </View>
      <Text tone="soft">{preview.diff.summary}{short ? ` · still ${formatMinutes(short)} short` : preview.result.shortages.length === 0 ? " · everything fits" : ""}</Text>
      {!preview.pass ? <Callout tone="caution" title="This can't be kept" message="It breaks one of the plan's rules, such as overlapping a commitment." /> : null}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        {preview.kind === "whatif" && preview.whatIf ? <Button title="Keep this" variant="emphasis" icon="check" disabled={!preview.pass} onPress={() => void studio.keepWhatIf(preview.whatIf!)} testID="studio-preview-keep" /> : null}
        {preview.kind === "move" && preview.move ? <Button title="Move it here" variant="emphasis" icon="check" disabled={!preview.pass} onPress={() => void studio.commitMove(preview.move!.block, preview.move!.date, preview.move!.start)} testID="studio-preview-move" /> : null}
        <Button title="Never mind" variant="quiet" onPress={studio.clearPreview} testID="studio-preview-clear" />
      </View>
    </Plane>
  );
}

const AUTONOMY: { value: planning.Autonomy; label: string; detail: string }[] = [
  { value: "ASK", label: "Ask me", detail: "Every change waits for you." },
  { value: "SMART", label: "Smart", detail: "Small same-day shifts happen by themselves; the rest waits for you." },
  { value: "AUTOPILOT", label: "Autopilot", detail: "Repairs that remove nothing happen by themselves, and are logged." },
];
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

export function SettingsSheet({ open, onClose, state, studio }: { open: boolean; onClose: () => void; state: StudioState; studio: Studio }) {
  const { space: gap } = useTheme();
  const [draft, setDraft] = useState<planning.StudioSettings>(state.settings);
  const hour = (m: number) => Math.round(m / 60);
  return (
    <Sheet open={open} onClose={onClose} title="Planning settings" footer={<Button title={studio.busy === "settings" ? "Saving" : "Save"} variant="emphasis" disabled={studio.busy !== null} onPress={() => void studio.saveSettings({ autonomy: draft.autonomy, dayStart: draft.dayStart, dayEnd: draft.dayEnd, dailyCap: draft.dailyCap, dayOnly: draft.dayOnly, breakMinutes: draft.breakMinutes }).then(onClose)} testID="studio-settings-save" />}>
      <Stack gap="lg" testID="studio-settings">
        <Stack gap="xs">
          <Text variant="subheading">When the plan changes</Text>
          <Segmented<planning.Autonomy> label="Autonomy" value={draft.autonomy} options={AUTONOMY.map(({ value, label }) => ({ value, label }))} onChange={(autonomy) => setDraft({ ...draft, autonomy })} />
          <Text variant="small" tone="soft">{AUTONOMY.find((a) => a.value === draft.autonomy)?.detail}</Text>
        </Stack>
        <Stack gap="xs">
          <Text variant="subheading">Study day</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: gap.xs }}>
            {HOURS.filter((h) => h <= 12).map((h) => <Chip key={`s${h}`} label={`From ${String(h).padStart(2, "0")}:00`} selected={hour(draft.dayStart) === h} radio onPress={() => setDraft({ ...draft, dayStart: h * 60 })} />)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: gap.xs }}>
            {HOURS.filter((h) => h >= 16).map((h) => <Chip key={`e${h}`} label={`Until ${String(h).padStart(2, "0")}:00`} selected={hour(draft.dayEnd) === h} radio onPress={() => setDraft({ ...draft, dayEnd: h * 60 })} />)}
          </View>
        </Stack>
        <Slider label="Most study a day" value={draft.dailyCap} min={60} max={600} step={15} format={formatMinutes} onChange={(dailyCap) => setDraft({ ...draft, dailyCap })} />
        <Slider label="Break between sessions" value={draft.breakMinutes} min={0} max={30} step={5} format={(v) => `${v} min`} onChange={(breakMinutes) => setDraft({ ...draft, breakMinutes })} />
        <Toggle label="Plan by day only" hint="Hide times and show each day's work as a list." value={draft.dayOnly} onChange={(dayOnly) => setDraft({ ...draft, dayOnly })} />
        <Text variant="small" tone="soft">{`You usually sustain about ${formatMinutes(state.snapshot.calibration.capacity)} a day${state.snapshot.calibration.samples ? `, from ${state.snapshot.calibration.samples} recent sessions` : ""}.`}</Text>
      </Stack>
    </Sheet>
  );
}

export function HistoryPanel({ state, studio }: { state: StudioState; studio: Studio }) {
  if (!state.history.length) return null;
  return (
    <Disclosure title="How this plan changed" detail={`${state.history.length} version${state.history.length === 1 ? "" : "s"}`} icon="layers">
      <Stack gap="xs" testID="studio-history">
        {state.history.slice(0, 8).map((h, i) => <ListRow key={h.id} title={h.summary || "Plan updated"} detail={`${h.source === "REPAIR" ? "Repair" : h.source === "UNDO" ? "Undo" : h.source === "MODEL" ? "Planner" : "You"}${h.at ? ` · ${dayLabel(h.at.slice(0, 10))} ${clockLabel(new Date(h.at).getHours() * 60 + new Date(h.at).getMinutes())}` : ""}`} trailing={i === 0 ? <Button title="Undo" size="small" variant="ghost" icon="undo" disabled={studio.busy !== null} onPress={() => void studio.undo()} testID="studio-undo" /> : undefined} />)}
      </Stack>
    </Disclosure>
  );
}
