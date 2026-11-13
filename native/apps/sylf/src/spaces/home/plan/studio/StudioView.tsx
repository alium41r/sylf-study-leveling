// The Planning Studio. The plan is the interface: a health strip, the command bar with its activity line, the proposal under review, signals with
// pre-solved options, then the timeline beside the goal map or the inspector. On a phone it opens on Today with the next session, and the rest follows.
// Every number on screen comes from the solver; the model's words appear only as short decision notes.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Callout, EmptyState, IconButton, Placeholder, Plane, Segmented, Sheet, Stack, Text, useTheme, useWindowClass } from "@sylf/design-system";
import type { planning } from "@sylf/shared";
import { useLiveBackend } from "../studioShell";
import { CommandBar, AddGoalSheet, GoalComposer, SheetScroll } from "./CommandBar";
import { GoalMap } from "./GoalMap";
import { Inspector } from "./Inspector";
import { HistoryPanel, PreviewBar, SettingsSheet, SignalCards, WhatIfPanel } from "./Panels";
import { ProposalReview } from "./Review";
import { TermView, WeekGrid, type Zoom } from "./Timeline";
import { TodayAgenda } from "./TodayAgenda";
import { useStudio } from "./useStudio";
import { onPlanPrefill, takePlanPrefill } from "../prefill";
import { dayLabel } from "./format";

export function StudioView() {
  const { space } = useTheme();
  const { size } = useWindowClass();
  const backend = useLiveBackend();
  const studio = useStudio();
  const compact = size === "compact";
  const [zoom, setZoom] = useState<Zoom>(compact ? "day" : "week");
  const [page, setPage] = useState(0);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [addGoal, setAddGoal] = useState(false);
  const [commandSheet, setCommandSheet] = useState(false);
  const { state, view, preview } = studio;
  // A request handed over from Sylvie runs here as a command; what comes back is a proposal to review, never an applied change.
  const ready = Boolean(state?.readiness.enabled);
  const command = studio.command;
  useEffect(() => {
    if (!ready) return undefined;
    const take = () => { const carried = takePlanPrefill(); if (carried) void command(carried); };
    take();
    return onPlanPrefill(take);
  }, [ready, command]);

  if (!backend) return <EmptyState icon="planner" title="Your plan lives in your account" message="Sign in to plan your study around your calendar." />;
  if (!state) {
    return studio.failure
      ? <View testID="studio-failure"><Callout tone="caution" title={studio.offline ? "You're offline" : "The planner didn't open"} message={studio.failure} /><Button title="Try again" onPress={() => void studio.open()} /></View>
      : <Stack gap="sm" testID="studio-loading"><Placeholder height={64} /><Placeholder height={36} /><Placeholder height={320} /></Stack>;
  }
  if (!state.readiness.enabled) return <Callout title="The Planning Studio isn't switched on here yet" message={state.readiness.reason ?? "Plans you've confirmed appear as quests in Today and Calendar."} />;

  const proposal = state.proposal;
  const shownModel = proposal?.model ?? state.model;
  const blocks = view?.blocks ?? state.plan.blocks;
  const pages = Math.max(1, Math.ceil(state.snapshot.days.length / 7));
  const days = zoom === "day" ? state.snapshot.days.slice(dayIndex, dayIndex + 1) : state.snapshot.days.slice(page * 7, page * 7 + 7);
  const timeline = (
    <Stack gap="sm" testID="studio-timeline">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <Segmented<Zoom> label="Timeline zoom" value={zoom} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "term", label: "Term" }]} onChange={setZoom} />
        {zoom === "week" ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}><Button title="" icon="chevronLeft" size="small" variant="ghost" disabled={page === 0} onPress={() => setPage(page - 1)} aria-label="Previous week" /><Text variant="label" tone="soft">{page === 0 ? "This week" : `From ${dayLabel(days[0]?.date ?? state.snapshot.today)}`}</Text><Button title="" icon="chevronRight" size="small" variant="ghost" disabled={page >= pages - 1} onPress={() => setPage(page + 1)} aria-label="Next week" /></View> : null}
        {zoom === "day" ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}><Button title="" icon="chevronLeft" size="small" variant="ghost" disabled={dayIndex === 0} onPress={() => setDayIndex(dayIndex - 1)} aria-label="Previous day" /><Text variant="label" tone="soft">{dayLabel(days[0]?.date ?? state.snapshot.today)}</Text><Button title="" icon="chevronRight" size="small" variant="ghost" disabled={dayIndex >= state.snapshot.days.length - 1} onPress={() => setDayIndex(dayIndex + 1)} aria-label="Next day" /></View> : null}
        {view && view.source !== "plan" ? <Text variant="micro" tone="accent">{view.source === "proposal" ? "Showing the proposal" : view.source === "stream" ? "Fitting as the planner writes" : "Preview"}</Text> : null}
      </View>
      {zoom === "term"
        ? <TermView snapshot={state.snapshot} model={shownModel} blocks={blocks} budgets={(proposal?.result.weekBudgets ?? state.plan.weekBudgets) as never} />
        : <WeekGrid snapshot={state.snapshot} model={shownModel} blocks={blocks} committed={state.blocks} days={days} zoom={zoom} dayOnly={state.settings.dayOnly} selected={selected} onSelect={setSelected}
            onDrag={(id, date, start) => studio.previewMove(id, date, start)} onDrop={(id, date, start) => { const p = studio.previewMove(id, date, start); if (p?.pass) void studio.commitMove(id, date, start); }} onDragCancel={studio.clearPreview} dropLabel={preview?.kind === "move" ? preview.label : null} />}
    </Stack>
  );
  // Selecting a session from the guide opens it in the inspector and turns the timeline to its day.
  const focusBlock = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    setSelected(b.id);
    if (zoom !== "term") { const at = state.snapshot.days.findIndex((d) => d.date === b.date); if (at >= 0) { setPage(Math.floor(at / 7)); setDayIndex(at); } }
  };
  const focusItem = (item: string) => { const b = blocks.find((x) => x.item === item && (x.state === "committed" || x.state === "proposed")); if (b) focusBlock(b.id); };
  const budgets = ((preview?.result.weekBudgets ?? (proposal && view?.source !== "plan" ? proposal.result.weekBudgets : state.plan.weekBudgets)) ?? []) as planning.WeekBudget[];
  const goalMap = <GoalMap state={state} studio={studio} model={shownModel} blocks={blocks} budgets={budgets} onSelectItem={focusItem} onSelectBlock={focusBlock} />;
  const side = selected ? <Inspector state={state} studio={studio} blockId={selected} onClose={() => { setSelected(null); studio.clearPreview(); }} /> : goalMap;
  // With nothing planned yet, the composer is the page, as on the web planner.
  const empty = !shownModel.goals.some((g) => g.status === "active") && !proposal && !studio.activity;
  const guideWide = shownModel.goals.some((g) => g.status === "active" && g.syllabus);

  return (
    <Stack gap="lg" testID="studio-view">
      {compact ? <TodayAgenda state={state} studio={studio} onSelect={setSelected} /> : null}
      {empty ? (
        <Plane level="raised" radius="lg" pad="lg" testID="studio-hero" style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text variant="title" role="heading" aria-level={2} style={{ flex: 1 }}>New plan</Text>
            <IconButton icon="sliders" label="Planning settings" onPress={() => setSettings(true)} testID="studio-settings-open" />
          </View>
          <GoalComposer state={state} studio={studio} inline />
        </Plane>
      ) : compact
        ? <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}><View style={{ flex: 1 }}><Button title="Tell the planner" icon="sylvie" variant="solid" onPress={() => setCommandSheet(true)} testID="studio-command-open" /></View><IconButton icon="sliders" label="Planning settings" onPress={() => setSettings(true)} testID="studio-settings-open" /></View>
        : <CommandBar state={state} studio={studio} onAddGoal={() => setAddGoal(true)} onOpenSettings={() => setSettings(true)} />}
      {compact && studio.activity ? <Text variant="small" tone="soft">{studio.activity.stages.at(-1)?.text ?? (studio.activity.running ? "Planning" : "")}</Text> : null}
      {preview ? <PreviewBar preview={preview} studio={studio} /> : null}
      {proposal && !preview ? <ProposalReview proposal={proposal} state={state} studio={studio} /> : null}
      <SignalCards state={state} studio={studio} />
      {compact ? (
        <Stack gap="lg">{selected ? side : goalMap}{timeline}</Stack>
      ) : (
        <View style={{ flexDirection: "row", gap: space.lg, alignItems: "flex-start", flexWrap: size === "medium" ? "wrap" : "nowrap" }}>
          <View style={{ flexGrow: 1, flexBasis: 520, minWidth: 0 }}>{timeline}</View>
          <View style={{ flexGrow: size === "medium" ? 1 : 0, flexBasis: guideWide ? 380 : 320, width: size === "medium" ? undefined : guideWide ? 400 : 340, minWidth: 0 }}>{side}</View>
        </View>
      )}
      <WhatIfPanel state={state} studio={studio} />
      <HistoryPanel state={state} studio={studio} />
      {compact ? <Button title="New plan" icon="plus" variant="ghost" onPress={() => setAddGoal(true)} /> : null}
      <Sheet open={commandSheet} onClose={() => setCommandSheet(false)} title="Tell the planner"><SheetScroll><CommandBar state={state} studio={studio} onAddGoal={() => { setCommandSheet(false); setAddGoal(true); }} compact /></SheetScroll></Sheet>
      <AddGoalSheet open={addGoal} onClose={() => setAddGoal(false)} state={state} studio={studio} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} state={state} studio={studio} />
    </Stack>
  );
}
