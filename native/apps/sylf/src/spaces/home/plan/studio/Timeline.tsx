// The plan's timeline. Week and Day are time grids: fixed commitments hatched, blocks in subject colours, proposals dashed, done blocks checked, missed
// blocks with a repair chip, rest days shaded and a line at now. A block can be dragged by its grip: the rest of the plan reflows on the device solver
// while it moves, and dropping pins it. The same move is available from the inspector for keyboards and screen readers. Term shows weeks as budgets.
import { memo, useMemo, useRef, useState } from "react";
import { PanResponder, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { Icon, Press, Text, useTheme, withAlpha } from "@sylf/design-system";
import type { planning } from "@sylf/shared";
import { addDays, blockMinutes, clockLabel, dayLabel, daySummary, formatMinutes, hourRange, itemOf, live, snapMinute, subjectColour, titleOf, weekdayOf } from "./format";

type Block = planning.Block;
export type Zoom = "day" | "week" | "term";
const LABEL_W = 44;

interface TimelineProps {
  snapshot: planning.PlanningSnapshot;
  model: planning.WorkModel;
  blocks: Block[];
  committed: Block[];
  days: planning.SnapshotDay[];
  zoom: Exclude<Zoom, "term">;
  dayOnly: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDrag: (id: string, date: string, start: number) => void;
  onDrop: (id: string, date: string, start: number) => void;
  onDragCancel: () => void;
  dropLabel: string | null;
}

function Hatch({ height, color }: { height: number; color: string }) {
  const lines = Math.ceil(height / 9) + 6;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
      {Array.from({ length: lines }, (_, i) => <View key={i} style={{ position: "absolute", left: -40, width: 400, height: 1, top: i * 9 - 40, backgroundColor: color, transform: [{ rotate: "-35deg" }] }} />)}
    </View>
  );
}

const BlockBody = memo(function BlockBody({ block, title, colour, height, selected, proposal, onPress, grip }: { block: Block; title: string; colour: string; height: number; selected: boolean; proposal: boolean; onPress: () => void; grip: React.ReactNode }) {
  const { color, shape } = useTheme();
  const done = block.state === "done";
  const missed = block.state === "missed";
  const skipped = block.state === "skipped";
  const state = done ? "done" : missed ? "missed" : skipped ? "skipped" : proposal ? "proposed" : "planned";
  return (
    <Press testID={`studio-block-${block.id}`} label={`${title}, ${clockLabel(block.start)} to ${clockLabel(block.end)}, ${state}${block.pinned ? ", pinned" : ""}`} selected={selected} onPress={onPress} height={height} radius={shape.radius.sm} minHit={Math.min(44, height)}
      bodyStyle={{ height, flexDirection: "row", borderRadius: shape.radius.sm, overflow: "hidden", backgroundColor: missed || skipped ? color.sunken : withAlpha(colour, done ? 0.12 : 0.2), borderWidth: proposal || selected ? 1.5 : 1, borderStyle: proposal ? "dashed" : "solid", borderColor: selected ? color.focus : proposal ? colour : withAlpha(colour, 0.45), opacity: done || skipped ? 0.62 : 1 }}>
      <View style={{ width: 3, backgroundColor: missed ? color.caution.mark : colour }} />
      <View style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 2, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {done ? <Icon name="check" size={12} color={color.positive.ink} /> : null}
          {block.pinned ? <Icon name="pin" size={11} color={color.inkSoft} /> : null}
          <Text variant="caption" numberOfLines={height > 40 ? 2 : 1} style={{ flex: 1, textDecorationLine: skipped ? "line-through" : undefined }}>{title}</Text>
        </View>
        {height > 34 ? <Text variant="micro" tone="soft" numberOfLines={1}>{`${clockLabel(block.start)}–${clockLabel(block.end)}`}</Text> : null}
        {missed && height > 30 ? <Text variant="micro" tone="caution" numberOfLines={1}>Missed · find time</Text> : null}
      </View>
      {grip}
    </Press>
  );
});

function DraggableBlock({ block, days, columnWidth, pxPerMinute, range, onStart, onMove, onEnd, children }: { block: Block; days: planning.SnapshotDay[]; columnWidth: number; pxPerMinute: number; range: [number, number]; onStart: () => void; onMove: (date: string, start: number) => void; onEnd: (date: string, start: number, moved: boolean) => void; children: (grip: React.ReactNode, offset: { x: number; y: number }) => React.ReactNode }) {
  const { color } = useTheme();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const target = useRef({ date: block.date, start: block.start });
  const index = days.findIndex((d) => d.date === block.date);
  const length = block.end - block.start;
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { target.current = { date: block.date, start: block.start }; onStart(); },
    onPanResponderMove: (_e, g) => {
      const dayShift = columnWidth > 0 ? Math.round(g.dx / columnWidth) : 0;
      const nextIndex = Math.max(0, Math.min(days.length - 1, index + dayShift));
      const start = snapMinute(block.start + g.dy / pxPerMinute, length, range);
      setOffset({ x: (nextIndex - index) * columnWidth, y: (start - block.start) * pxPerMinute });
      if (target.current.date !== days[nextIndex].date || target.current.start !== start) { target.current = { date: days[nextIndex].date, start }; onMove(days[nextIndex].date, start); }
    },
    onPanResponderRelease: () => { const t = target.current; setOffset({ x: 0, y: 0 }); onEnd(t.date, t.start, t.date !== block.date || t.start !== block.start); },
    onPanResponderTerminate: () => { setOffset({ x: 0, y: 0 }); onEnd(block.date, block.start, false); },
  }), [block, days, columnWidth, pxPerMinute, range, index, length, onStart, onMove, onEnd]);
  const grip = <View {...responder.panHandlers} aria-label="Drag to move" style={{ width: 18, alignItems: "center", justifyContent: "center", cursor: "grab" } as object}><Icon name="grip" size={12} color={color.inkFaint} /></View>;
  return <>{children(grip, offset)}</>;
}

export function WeekGrid({ snapshot, model, blocks, committed, days, zoom, dayOnly, selected, onSelect, onDrag, onDrop, onDragCancel, dropLabel }: TimelineProps) {
  const { color, shape, space } = useTheme();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const HOUR = zoom === "day" ? 64 : 46;
  const pxPerMinute = HOUR / 60;
  const range = hourRange(snapshot, blocks, days);
  const hours = Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
  const columnWidth = days.length ? Math.max(0, (width - LABEL_W) / days.length) : 0;
  const committedIds = new Set(committed.filter(live).map((b) => `${b.id}|${b.date}|${b.start}`));
  const deadlines = (date: string) => model.goals.filter((g) => g.status === "active" && g.due === date);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const top = (minute: number) => (minute - range[0] * 60) * pxPerMinute;

  if (dayOnly) {
    return (
      <View testID="studio-week-dayonly" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {days.map((day) => {
          const own = blocks.filter((b) => b.date === day.date).sort((a, b) => a.start - b.start);
          return (
            <View key={day.date} aria-label={daySummary(day, blocks, model)} style={{ flexBasis: 150, flexGrow: 1, gap: 4, padding: space.sm, borderRadius: shape.radius.md, backgroundColor: day.rest ? color.sunken : color.plane, borderWidth: 1, borderColor: color.line }}>
              <Text variant="label" tone={day.date === snapshot.today ? "accent" : "soft"}>{dayLabel(day.date)}</Text>
              {day.rest ? <Text variant="caption" tone="soft">Rest day</Text> : null}
              {own.map((block) => <Press key={block.id} label={titleOf(model, block.item)} onPress={() => onSelect(block.id)} bodyStyle={{ flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 2 }}><View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: subjectColour(snapshot, itemOf(model, block.item)?.subject) }} /><Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{titleOf(model, block.item)}</Text><Text variant="micro" tone="soft">{formatMinutes(blockMinutes(block))}</Text></Press>)}
              {!own.length && !day.rest ? <Text variant="caption" tone="faint">Free</Text> : null}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View testID={zoom === "day" ? "studio-day" : "studio-week"} onLayout={onLayout} style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", paddingLeft: LABEL_W }}>
        {days.map((day) => (
          <View key={day.date} style={{ flex: 1, alignItems: "center", paddingVertical: 4, gap: 2 }} aria-label={daySummary(day, blocks, model)}>
            <Text variant="label" tone={day.date === snapshot.today ? "accent" : day.rest ? "faint" : "soft"} numberOfLines={1}>{zoom === "day" ? dayLabel(day.date) : `${dayLabel(day.date).slice(0, 3)} ${Number(day.date.slice(8))}`}</Text>
            {deadlines(day.date).map((g) => <View key={g.key} style={{ flexDirection: "row", alignItems: "center", gap: 3, maxWidth: "100%", paddingHorizontal: 4, borderRadius: shape.radius.full, backgroundColor: color.critical.wash }}><Icon name="bookmark" size={10} color={color.critical.ink} /><Text variant="micro" tone="critical" numberOfLines={1} style={{ flexShrink: 1 }}>{g.title}</Text></View>)}
            {day.allDay.slice(0, 1).map((a, i) => <Text key={i} variant="micro" tone="soft" numberOfLines={1}>{a.title}</Text>)}
          </View>
        ))}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled scrollEnabled={!dragging} style={{ maxHeight: zoom === "day" ? 620 : 560 }} showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: Math.max(0, top(Math.max(range[0] * 60, snapshot.nowMinute - 60)) - 0) * (days.some((d) => d.date === snapshot.today) ? 1 : 0) }}>
        <View style={{ flexDirection: "row", height: HOUR * hours.length }}>
          <View style={{ width: LABEL_W }}>{hours.map((h) => <View key={h} style={{ height: HOUR }}><Text variant="micro" tone="faint">{`${String(h).padStart(2, "0")}:00`}</Text></View>)}</View>
          {days.map((day) => (
            <View key={day.date} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: color.line, backgroundColor: day.rest ? withAlpha(color.inkFaint, 0.08) : undefined }}>
              {hours.map((h) => <Press key={h} feedback="none" radius={0} label={`${dayLabel(day.date)} ${String(h).padStart(2, "0")}:00`} onPress={() => onSelect(null)} height={HOUR} bodyStyle={{ height: HOUR, borderTopWidth: 1, borderTopColor: withAlpha(color.line, 0.6) }}><View /></Press>)}
              {day.rest ? <View pointerEvents="none" style={{ position: "absolute", top: 8, left: 0, right: 0, alignItems: "center" }}><Text variant="micro" tone="faint">Rest</Text></View> : null}
              {day.busy.map((busy, i) => {
                const height = Math.max(14, (busy.end - busy.start) * pxPerMinute - 2);
                return (
                  <View key={`${busy.ref ?? i}-${busy.start}`} aria-label={`${busy.title}, ${clockLabel(busy.start)} to ${clockLabel(busy.end)}, fixed`} style={{ position: "absolute", top: top(busy.start) + 1, left: 2, right: 2, height, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.sunken, overflow: "hidden", paddingHorizontal: 4, paddingTop: 2 }}>
                    <Hatch height={height} color={withAlpha(color.inkFaint, 0.25)} />
                    <Text variant="micro" tone="soft" numberOfLines={height > 30 ? 2 : 1}>{busy.title}</Text>
                  </View>
                );
              })}
              {blocks.filter((b) => b.date === day.date && b.id !== dragging).map((block) => {
                const height = Math.max(16, blockMinutes(block) * pxPerMinute - 2);
                const colour = subjectColour(snapshot, itemOf(model, block.item)?.subject);
                const proposal = block.state === "proposed" || (live(block) && !committedIds.has(`${block.id}|${block.date}|${block.start}`));
                const draggable = block.state === "committed" && !proposal && (block.date > snapshot.today || block.start > snapshot.nowMinute);
                const body = (grip: React.ReactNode) => <BlockBody block={block} title={titleOf(model, block.item)} colour={colour} height={height} selected={selected === block.id} proposal={proposal} onPress={() => onSelect(block.id)} grip={grip} />;
                if (!draggable) return <View key={block.id} style={{ position: "absolute", top: top(block.start) + 1, left: 2, right: 2 }}>{body(null)}</View>;
                return (
                  <DraggableBlock key={block.id} block={block} days={days} columnWidth={columnWidth} pxPerMinute={pxPerMinute} range={range}
                    onStart={() => { setDragging(null); onSelect(block.id); }}
                    onMove={(date, start) => { setDragging(block.id); onDrag(block.id, date, start); }}
                    onEnd={(date, start, moved) => { setDragging(null); if (moved) onDrop(block.id, date, start); else onDragCancel(); }}>
                    {(grip, offset) => <View style={{ position: "absolute", top: top(block.start) + 1 + offset.y, left: 2 + offset.x, right: 2 - offset.x, zIndex: offset.x || offset.y ? 10 : 1, opacity: 1 }}>{body(grip)}</View>}
                  </DraggableBlock>
                );
              })}
              {dragging ? blocks.filter((b) => b.id === dragging && b.date === day.date).map((block) => (
                <View key={`ghost-${block.id}`} pointerEvents="none" style={{ position: "absolute", top: top(block.start) + 1, left: 2, right: 2, height: Math.max(16, blockMinutes(block) * pxPerMinute - 2), borderRadius: shape.radius.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.focus, backgroundColor: withAlpha(color.focus, 0.08) }} />
              )) : null}
              {day.date === snapshot.today && snapshot.nowMinute >= range[0] * 60 && snapshot.nowMinute <= range[1] * 60 ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: top(snapshot.nowMinute), height: 2, backgroundColor: color.accent.fill }} /> : null}
            </View>
          ))}
        </View>
      </ScrollView>
      {dragging && dropLabel ? <View style={{ alignSelf: "center", paddingHorizontal: space.md, paddingVertical: 4, borderRadius: shape.radius.full, backgroundColor: color.inverse.fill }}><Text variant="caption" style={{ color: color.inverse.on }}>{dropLabel}</Text></View> : null}
    </View>
  );
}

/** Term: one row a week, its planned minutes per goal (blocks in the detailed horizon, weekly budgets beyond) and the deadlines inside it. */
export function TermView({ snapshot, model, blocks, budgets }: { snapshot: planning.PlanningSnapshot; model: planning.WorkModel; blocks: Block[]; budgets: planning.WeekBudget[] }) {
  const { color, shape, space } = useTheme();
  const weekOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));
  const rows = new Map<string, Map<string, number>>();
  const add = (week: string, goal: string, minutes: number) => { const row = rows.get(week) ?? new Map<string, number>(); row.set(goal, (row.get(goal) ?? 0) + minutes); rows.set(week, row); };
  for (const block of blocks.filter((b) => b.state !== "skipped" && b.state !== "missed")) add(weekOf(block.date), itemOf(model, block.item)?.goal ?? "other", blockMinutes(block));
  for (const budget of budgets) add(budget.week, itemOf(model, budget.item)?.goal ?? "other", budget.minutes);
  for (const goal of model.goals) if (goal.status === "active" && goal.due) { const w = weekOf(goal.due); if (!rows.has(w)) rows.set(w, new Map()); }
  const weeks = [...rows.keys()].filter((w) => w >= weekOf(snapshot.today)).sort();
  const max = Math.max(60, ...weeks.map((w) => [...(rows.get(w)?.values() ?? [])].reduce((s, m) => s + m, 0)));
  const goalColour = (key: string) => subjectColour(snapshot, model.goals.find((g) => g.key === key)?.subject);
  if (!weeks.length) return <Text tone="soft">Nothing planned beyond this week yet.</Text>;
  return (
    <View testID="studio-term" style={{ gap: space.sm }}>
      {weeks.map((week) => {
        const row = rows.get(week)!;
        const total = [...row.values()].reduce((s, m) => s + m, 0);
        const due = model.goals.filter((g) => g.status === "active" && g.due && weekOf(g.due) === week);
        const detailed = week <= weekOf(snapshot.days[snapshot.days.length - 1]?.date ?? snapshot.today);
        return (
          <View key={week} aria-label={`Week of ${dayLabel(week)}: ${formatMinutes(total)} planned${due.length ? `, due: ${due.map((g) => g.title).join(", ")}` : ""}.`} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <Text variant="label" tone="soft">{`Week of ${dayLabel(week)}${detailed ? "" : " · budget"}`}</Text>
              <Text variant="micro" tone="soft">{formatMinutes(total)}</Text>
            </View>
            <View style={{ flexDirection: "row", height: 10, borderRadius: shape.radius.full, overflow: "hidden", backgroundColor: color.sunken }}>
              {[...row.entries()].sort().map(([goal, minutes]) => <View key={goal} style={{ width: `${(minutes / max) * 100}%`, backgroundColor: detailed ? goalColour(goal) : withAlpha(goalColour(goal), 0.5) }} />)}
            </View>
            {due.map((g) => <Text key={g.key} variant="caption" tone="critical">{`${g.type === "exam" ? "Exam" : "Due"}: ${g.title} · ${dayLabel(g.due!)}`}</Text>)}
          </View>
        );
      })}
    </View>
  );
}
