// The plan's timeline. Week and Day are time grids over the whole day: fixed commitments hatched, sessions in subject colours, proposals dashed,
// done sessions checked, missed ones with a repair chip, rest days shaded and a line at now. Any session not yet done can be dragged by its whole
// body to any day and any time (a mouse picks it up after a few pixels, a finger after a short press): the student's placement wins over the plan's
// rules, the target shows while it moves, and the rest of the plan reflows when it is dropped. The inspector offers the same move to keyboards and
// screen readers. Sessions sit in one layer over the day columns, so a session crossing days stays the same view and never stops mid-drag.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { Icon, Press, Text, useTheme, withAlpha, type ViewHandle } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import { addDays, blockMinutes, clockLabel, compactLabel, dayLabel, daySummary, formatMinutes, hourRange, itemOf, live, subjectColour, titleOf, weekdayOf } from "./format";
import { useDragMove, type AutoScroll } from "./drag";

type Block = planning.Block;
export type Zoom = "day" | "week" | "month" | "term";
const LABEL_W = 44;
const SNAP = 15;
type GridScroll = Animated.ScrollView;

interface TimelineProps {
  snapshot: planning.PlanningSnapshot;
  model: planning.WorkModel;
  blocks: Block[];
  committed: Block[];
  days: planning.SnapshotDay[];
  zoom: "day" | "week";
  dayOnly: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** A session dropped on a day and a minute; where it lands is the view's to decide (only the clock bounds it). */
  onDrop: (id: string, date: string, start: number) => void;
}

/** Whether a session can be picked up: anything not yet done that is the student's plan (not a proposal under review). */
export const movable = (block: Block, proposal: boolean) => !proposal && block.state !== "done";

function Hatch({ height, color }: { height: number; color: string }) {
  const lines = Math.ceil(height / 9) + 6;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
      {Array.from({ length: lines }, (_, i) => <View key={i} style={{ position: "absolute", left: -40, width: 400, height: 1, top: i * 9 - 40, backgroundColor: color, transform: [{ rotate: "-35deg" }] }} />)}
    </View>
  );
}

const BlockBody = memo(function BlockBody({ block, title, compact, colour, height, selected, proposal, draggable, onPress }: { block: Block; title: string; compact: { title: string; sub: string | null } | null; colour: string; height: number; selected: boolean; proposal: boolean; draggable: boolean; onPress: () => void }) {
  const { color, shape } = useTheme();
  const done = block.state === "done";
  const missed = block.state === "missed";
  const skipped = block.state === "skipped";
  const state = done ? "done" : missed ? "missed" : skipped ? "skipped" : proposal ? "proposed" : "planned";
  return (
    <Press testID={`studio-block-${block.id}`} label={`${title}, ${clockLabel(block.start)} to ${clockLabel(block.end)}, ${state}${block.pinned ? ", pinned" : ""}`} hint={draggable ? "Drag to move it to another day or time" : undefined} selected={selected} onPress={onPress} height={height} radius={shape.radius.sm} minHit={Math.min(44, height)}
      style={draggable ? Platform.select({ web: { cursor: "grab" } as object, default: undefined }) : undefined}
      bodyStyle={{ height, flexDirection: "row", borderRadius: shape.radius.sm, overflow: "hidden", backgroundColor: missed || skipped ? color.sunken : withAlpha(colour, done ? 0.12 : 0.2), borderWidth: proposal || selected ? 1.5 : 1, borderStyle: proposal ? "dashed" : "solid", borderColor: selected ? color.focus : proposal ? colour : withAlpha(colour, 0.45), opacity: done || skipped ? 0.62 : 1 }}>
      <View style={{ width: 3, backgroundColor: missed ? color.caution.mark : colour }} />
      <View style={{ flex: 1, paddingHorizontal: 4, paddingVertical: 2, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {done ? <Icon name="check" size={12} color={color.positive.ink} /> : null}
          {block.pinned ? <Icon name="pin" size={11} color={color.inkSoft} /> : null}
          <Text variant="caption" numberOfLines={compact ? 1 : height > 40 ? 2 : 1} style={{ flex: 1, textDecorationLine: skipped ? "line-through" : undefined }}>{compact?.title ?? title}</Text>
        </View>
        {height > 34 ? <Text variant="micro" tone="soft" numberOfLines={1}>{compact ? compact.sub ?? clockLabel(block.start) : `${clockLabel(block.start)}–${clockLabel(block.end)}`}</Text> : null}
        {missed && height > 30 ? <Text variant="micro" tone="caution" numberOfLines={1}>Missed · drag to a new time</Text> : null}
      </View>
    </Press>
  );
});

/** One session on the grid, draggable when it can move. */
function GridBlock({ block, x, y, width, height, draggable, slotOf, onLift, onSlot, onDrop, scroll, children }: { block: Block; x: number; y: number; width: number; height: number; draggable: boolean; slotOf: (dx: number, dy: number) => number; onLift: (id: string) => void; onSlot: (id: string, slot: number) => void; onDrop: (id: string, slot: number) => void; scroll: AutoScroll; children: React.ReactNode }) {
  const theme = useTheme();
  const lift = useCallback(() => onLift(block.id), [onLift, block.id]);
  const slot = useCallback((s: number) => onSlot(block.id, s), [onSlot, block.id]);
  const drop = useCallback((s: number) => onDrop(block.id, s), [onDrop, block.id]);
  const drag = useDragMove({ enabled: draggable, x, y, slotOf, onLift: lift, onSlot: slot, onDrop: drop, scroll });
  const body = (
    <Animated.View style={[{ position: "absolute", left: x, top: y, width, height }, drag.style]}>
      <Animated.View pointerEvents="none" style={[theme.surface("float", "sm"), { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent" }, drag.shadow]} />
      {children}
    </Animated.View>
  );
  return draggable ? <GestureDetector gesture={drag.gesture}>{body}</GestureDetector> : body;
}

export function WeekGrid({ snapshot, model, blocks, committed, days, zoom, dayOnly, selected, onSelect, onDrop }: TimelineProps) {
  const { color, shape, space } = useTheme();
  const [width, setWidth] = useState(0);
  const [target, setTarget] = useState<{ id: string; date: string; start: number; length: number } | null>(null);
  const lastDrag = useRef(0);
  const HOUR = zoom === "day" ? 64 : 46;
  const pxPerMinute = HOUR / 60;
  const range = hourRange(snapshot, blocks, days);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const columnWidth = days.length ? Math.max(0, (width - LABEL_W) / days.length) : 0;
  // Beside the study guide a week's columns are narrow: blocks then show the topic and the kind of session rather than a broken title.
  const narrow = zoom === "week" && columnWidth > 0 && columnWidth < 130;
  const committedIds = new Set(committed.filter(live).map((b) => `${b.id}|${b.date}|${b.start}`));
  const deadlines = (date: string) => model.goals.filter((g) => g.status === "active" && g.due === date);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const top = (minute: number) => minute * pxPerMinute;
  const dayIndex = useMemo(() => new Map(days.map((d, i) => [d.date, i])), [days]);

  // The grid scrolls by itself while a session is dragged near its top or bottom.
  const scrollRef = useAnimatedRef<GridScroll>();
  const frame = useRef<ViewHandle>(null);
  const offset = useSharedValue(0);
  const viewTop = useSharedValue(0);
  const viewHeight = useSharedValue(0);
  const content = useSharedValue(HOUR * 24);
  useEffect(() => { content.value = HOUR * 24; }, [HOUR, content]);
  const onScroll = useAnimatedScrollHandler((event) => { offset.value = event.contentOffset.y; });
  const scroll: AutoScroll = { ref: scrollRef as never, offset, top: viewTop, height: viewHeight, content };
  const measure = () => frame.current?.measureInWindow((_x, y, _w, h) => { viewTop.value = y; viewHeight.value = h; });
  // The grid holds the whole day but opens at the start of the study day, a little before it; again when the days shown change.
  const firstMinute = Math.max(0, range[0] * 60 - 30);
  const opened = useRef<string | null>(null);
  const openedAt = `${zoom}|${days[0]?.date ?? ""}`;
  useEffect(() => {
    if (opened.current === openedAt) return;
    opened.current = openedAt;
    const y = firstMinute * pxPerMinute;
    const frameId = requestAnimationFrame(() => (scrollRef.current as unknown as { scrollTo?: (to: { x?: number; y: number; animated?: boolean }) => void } | null)?.scrollTo?.({ x: 0, y, animated: false }));
    return () => cancelAnimationFrame(frameId);
  }, [openedAt, firstMinute, pxPerMinute, scrollRef]);

  const landing = useCallback((id: string, slot: number) => {
    const block = blocks.find((b) => b.id === id);
    const day = days[Math.floor(slot / 1440)];
    if (!block || !day) return null;
    const length = block.end - block.start;
    return { ...planning.studentLanding(day.date, slot % 1440, length, snapshot.today, snapshot.nowMinute), length };
  }, [blocks, days, snapshot.today, snapshot.nowMinute]);
  const onLift = useCallback((id: string) => { lastDrag.current = Date.now(); measure(); const b = blocks.find((x) => x.id === id); if (b) setTarget({ id, date: b.date, start: b.start, length: b.end - b.start }); }, [blocks]);
  const onSlot = useCallback((id: string, slot: number) => { const to = landing(id, slot); if (to) setTarget({ id, ...to }); }, [landing]);
  const onDropSlot = useCallback((id: string, slot: number) => {
    lastDrag.current = Date.now();
    const to = landing(id, slot);
    setTarget(null);
    if (to) onDrop(id, to.date, to.start);
  }, [landing, onDrop]);
  // A press that ends a drag is not a tap.
  const select = (id: string) => { if (Date.now() - lastDrag.current > 250) onSelect(id); };

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

  const targetDay = target ? days.find((d) => d.date === target.date) ?? null : null;
  const targetNote = target && targetDay ? [targetDay.rest ? "rest day" : null, targetDay.busy.find((b) => target.start < b.end && target.start + target.length > b.start)?.title.replace(/^/, "over ") ?? null].filter(Boolean).join(", ") : "";

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
      <View ref={frame} collapsable={false}>
        <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" nestedScrollEnabled scrollEnabled={!target} style={{ maxHeight: zoom === "day" ? 620 : 560 }} showsVerticalScrollIndicator={false} contentOffset={{ x: 0, y: top(firstMinute) }}>
          <View style={{ flexDirection: "row", height: HOUR * hours.length }}>
            <View style={{ width: LABEL_W }}>{hours.map((h) => <View key={h} style={{ height: HOUR }}><Text variant="micro" tone="faint">{`${String(h).padStart(2, "0")}:00`}</Text></View>)}</View>
            {days.map((day) => (
              <View key={day.date} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: color.line, backgroundColor: day.rest ? withAlpha(color.inkFaint, 0.08) : undefined }}>
                {hours.map((h) => <Press key={h} feedback="none" radius={0} label={`${dayLabel(day.date)} ${String(h).padStart(2, "0")}:00`} onPress={() => onSelect(null)} height={HOUR} bodyStyle={{ height: HOUR, borderTopWidth: 1, borderTopColor: withAlpha(color.line, 0.6), backgroundColor: h * 60 < snapshot.settings.dayStart || h * 60 >= snapshot.settings.dayEnd ? withAlpha(color.inkFaint, 0.04) : undefined }}><View /></Press>)}
                {day.rest ? <View pointerEvents="none" style={{ position: "absolute", top: top(range[0] * 60) + 8, left: 0, right: 0, alignItems: "center" }}><Text variant="micro" tone="faint">Rest</Text></View> : null}
                {day.busy.map((busy, i) => {
                  const height = Math.max(14, (busy.end - busy.start) * pxPerMinute - 2);
                  return (
                    <View key={`${busy.ref ?? i}-${busy.start}`} pointerEvents="none" aria-label={`${busy.title}, ${clockLabel(busy.start)} to ${clockLabel(busy.end)}, fixed`} style={{ position: "absolute", top: top(busy.start) + 1, left: 2, right: 2, height, borderRadius: shape.radius.sm, borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.sunken, overflow: "hidden", paddingHorizontal: 4, paddingTop: 2 }}>
                      <Hatch height={height} color={withAlpha(color.inkFaint, 0.25)} />
                      <Text variant="micro" tone="soft" numberOfLines={height > 30 ? 2 : 1}>{busy.title}</Text>
                    </View>
                  );
                })}
                {day.date === snapshot.today ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: top(snapshot.nowMinute), height: 2, backgroundColor: color.accent.fill }} /> : null}
              </View>
            ))}
            {/* Sessions, in one layer over the columns. */}
            <View pointerEvents="box-none" style={{ position: "absolute", top: 0, bottom: 0, left: LABEL_W, right: 0 }}>
              {target && targetDay ? <View pointerEvents="none" style={{ position: "absolute", left: (dayIndex.get(target.date) ?? 0) * columnWidth + 2, width: Math.max(0, columnWidth - 4), top: top(target.start) + 1, height: Math.max(16, target.length * pxPerMinute - 2), borderRadius: shape.radius.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.accent.ink, backgroundColor: color.accent.wash }} /> : null}
              {columnWidth > 0 ? blocks.filter((b) => dayIndex.has(b.date)).map((block) => {
                const height = Math.max(16, blockMinutes(block) * pxPerMinute - 2);
                const colour = subjectColour(snapshot, itemOf(model, block.item)?.subject);
                const proposal = block.state === "proposed" || (live(block) && !committedIds.has(`${block.id}|${block.date}|${block.start}`));
                const draggable = movable(block, proposal);
                const index = dayIndex.get(block.date)!;
                const length = block.end - block.start;
                const count = days.length;
                const from = block.start;
                const slotOf = (dx: number, dy: number) => {
                  "worklet";
                  const shift = Math.round(dx / columnWidth);
                  const day = Math.max(0, Math.min(count - 1, index + shift));
                  const minute = Math.max(0, Math.min(1440 - length, Math.round((from + dy / pxPerMinute) / SNAP) * SNAP));
                  return day * 1440 + minute;
                };
                return (
                  <GridBlock key={block.id} block={block} x={index * columnWidth + 2} y={top(block.start) + 1} width={Math.max(0, columnWidth - 4)} height={height} draggable={draggable} slotOf={slotOf} onLift={onLift} onSlot={onSlot} onDrop={onDropSlot} scroll={scroll}>
                    <BlockBody block={block} title={titleOf(model, block.item)} compact={narrow ? compactLabel(itemOf(model, block.item)) : null} colour={colour} height={height} selected={selected === block.id} proposal={proposal} draggable={draggable} onPress={() => select(block.id)} />
                  </GridBlock>
                );
              }) : null}
            </View>
          </View>
        </Animated.ScrollView>
      </View>
      {target ? (
        <View testID="studio-drop-label" pointerEvents="none" style={{ alignSelf: "center", flexDirection: "row", gap: space.xs, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: shape.radius.full, backgroundColor: color.inverse.fill }}>
          <Text variant="caption" style={{ color: color.inverse.on }}>{`${dayLabel(target.date)} · ${clockLabel(target.start)}`}</Text>
          {targetNote ? <Text variant="caption" style={{ color: color.inverse.on, opacity: 0.75 }}>{targetNote}</Text> : null}
        </View>
      ) : null}
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
