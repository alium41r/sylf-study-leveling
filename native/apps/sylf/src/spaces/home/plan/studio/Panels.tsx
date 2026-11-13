// The Studio's supporting panels: the plan health strip, signals with pre-solved options (shortage negotiation), what-if controls that re-solve on the
// device before anything is saved, planning settings and the version history with undo.
import { useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Chip, Disclosure, ListRow, Plane, Segmented, Select, Sheet, Slider, Stack, Text, Toggle, useTheme } from "@sylf/design-system";
import { SheetScroll } from "./CommandBar";
import type { planning } from "@sylf/shared";
import type { StudioState } from "@sylf/backend";
import { clockLabel, dayLabel, formatMinutes } from "./format";
import type { LocalPreview, Studio } from "./useStudio";


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
  { value: "SMART", label: "Smart", detail: "Small shifts apply themselves." },
  { value: "AUTOPILOT", label: "Autopilot", detail: "Repairs apply themselves." },
];
const HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

export function SettingsSheet({ open, onClose, state, studio }: { open: boolean; onClose: () => void; state: StudioState; studio: Studio }) {
  const { space: gap } = useTheme();
  const [draft, setDraft] = useState<planning.StudioSettings>(state.settings);
  const hour = (m: number) => String(Math.round(m / 60));
  const clock = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <Sheet open={open} onClose={onClose} title="Planning settings" footer={<Button title={studio.busy === "settings" ? "Saving" : "Save"} variant="emphasis" disabled={studio.busy !== null} onPress={() => void studio.saveSettings({ autonomy: draft.autonomy, dayStart: draft.dayStart, dayEnd: draft.dayEnd, dailyCap: draft.dailyCap, dayOnly: draft.dayOnly, breakMinutes: draft.breakMinutes }).then(onClose)} testID="studio-settings-save" />}>
      <SheetScroll>
        <Stack gap="lg" testID="studio-settings">
          <Stack gap="xs">
            <Text variant="label" tone="soft">When the plan changes</Text>
            <Segmented<planning.Autonomy> label="Autonomy" fit value={draft.autonomy} options={AUTONOMY.map(({ value, label }) => ({ value, label }))} onChange={(autonomy) => setDraft({ ...draft, autonomy })} />
            <Text variant="small" tone="soft">{AUTONOMY.find((a) => a.value === draft.autonomy)?.detail}</Text>
          </Stack>
          <View style={{ flexDirection: "row", gap: gap.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}><Select label="Day starts" value={hour(draft.dayStart)} options={HOURS.filter((h) => h <= 12).map((h) => ({ value: String(h), label: clock(h) }))} onChange={(h) => setDraft({ ...draft, dayStart: Number(h) * 60 })} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><Select label="Day ends" value={hour(draft.dayEnd)} options={HOURS.filter((h) => h >= 16).map((h) => ({ value: String(h), label: clock(h) }))} onChange={(h) => setDraft({ ...draft, dayEnd: Number(h) * 60 })} /></View>
          </View>
          <Slider label="Most study a day" value={draft.dailyCap} min={60} max={600} step={15} format={formatMinutes} onChange={(dailyCap) => setDraft({ ...draft, dailyCap })} />
          <Slider label="Break between sessions" value={draft.breakMinutes} min={0} max={30} step={5} format={(v) => `${v} min`} onChange={(breakMinutes) => setDraft({ ...draft, breakMinutes })} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: gap.sm }}>
            <Text variant="small" style={{ flex: 1 }}>Days only, no times</Text>
            <Toggle label="Days only, no times" value={draft.dayOnly} onChange={(dayOnly) => setDraft({ ...draft, dayOnly })} />
          </View>
        </Stack>
      </SheetScroll>
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
