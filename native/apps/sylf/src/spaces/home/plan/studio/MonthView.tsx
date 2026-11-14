// The plan as a month: every day's sessions at a glance, deadlines on their days, rest days shaded, and the weekly budgets that stand in for
// sessions beyond the detailed calendar. A session can be dragged to any other day, where it keeps its time (the student's placement wins over the
// plan's rules, as in Week); tapping a day's number opens that day. On a phone the sessions are colour marks and a tap opens the day.
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { Icon, IconButton, Marker, Press, Text, firstOfMonth, monthOf, monthTitle, shiftDays, shiftMonth, useInputFormat, useTheme, useWindowClass, weekIndex, weekdayNames, withAlpha, type MonthRef } from "@sylf/design-system";
import { planning } from "@sylf/shared";
import { blockMinutes, clockLabel, compactLabel, dayLabel, formatMinutes, itemOf, live, subjectColour, titleOf } from "./format";
import { useDragMove } from "./drag";
import { movable } from "./Timeline";

type Block = planning.Block;

interface MonthProps {
  snapshot: planning.PlanningSnapshot;
  model: planning.WorkModel;
  blocks: Block[];
  committed: Block[];
  budgets: planning.WeekBudget[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpenDay: (date: string) => void;
  onDrop: (id: string, date: string, start: number) => void;
}

const later = (a: MonthRef, b: MonthRef) => a.year > b.year || (a.year === b.year && a.month > b.month);

const Chip = memo(function Chip({ block, title, colour, proposal, selected, dots, onPress }: { block: Block; title: string; colour: string; proposal: boolean; selected: boolean; dots: boolean; onPress: () => void }) {
  const { color, shape } = useTheme();
  const done = block.state === "done";
  const missed = block.state === "missed";
  if (dots) return <View style={{ height: 5, borderRadius: 3, backgroundColor: missed ? color.caution.mark : withAlpha(colour, done ? 0.4 : 0.9) }} />;
  return (
    <Press testID={`studio-month-block-${block.id}`} label={`${title}, ${dayLabel(block.date)} ${clockLabel(block.start)}, ${done ? "done" : missed ? "missed" : proposal ? "proposed" : "planned"}`} hint="Drag to move it to another day" selected={selected} onPress={onPress} height={20} radius={shape.radius.xs} minHit={20}
      bodyStyle={{ height: 20, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, borderRadius: shape.radius.xs, backgroundColor: missed ? color.sunken : withAlpha(colour, done ? 0.1 : 0.18), borderWidth: selected ? 1.5 : proposal ? 1 : 0, borderStyle: proposal ? "dashed" : "solid", borderColor: selected ? color.focus : colour, opacity: done ? 0.6 : 1 }}>
      <View style={{ width: 3, alignSelf: "stretch", marginVertical: 3, borderRadius: 2, backgroundColor: missed ? color.caution.mark : colour }} />
      {done ? <Icon name="check" size={10} color={color.positive.ink} /> : null}
      <Text variant="micro" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
    </Press>
  );
});

function MonthChip({ block, index, cellWidth, rows, draggable, onLift, onSlot, onDrop, children }: { block: Block; index: number; cellWidth: number; rows: { top: number; height: number }[]; draggable: boolean; onLift: (id: string) => void; onSlot: (id: string, slot: number) => void; onDrop: (id: string, slot: number) => void; children: React.ReactNode }) {
  const theme = useTheme();
  // Rows differ in height (past weeks are short), so the row under the pointer is found from the rows' own tops.
  const tops = rows.map((r) => r.top);
  const heights = rows.map((r) => r.height);
  const slotOf = (dx: number, dy: number) => {
    "worklet";
    const column = (index % 7) + Math.round(dx / cellWidth);
    const own = Math.floor(index / 7);
    const y = tops[own] + heights[own] / 2 + dy;
    let row = 0;
    for (let r = 0; r < tops.length; r++) if (y >= tops[r]) row = r;
    return row * 7 + Math.max(0, Math.min(6, column));
  };
  const lift = useCallback(() => onLift(block.id), [onLift, block.id]);
  const slot = useCallback((s: number) => onSlot(block.id, s), [onSlot, block.id]);
  const drop = useCallback((s: number) => onDrop(block.id, s), [onDrop, block.id]);
  // The chip lives in its day's cell: its place is the day, so a drop to another day re-renders it there.
  const drag = useDragMove({ enabled: draggable, x: index, y: 0, slotOf, onLift: lift, onSlot: slot, onDrop: drop });
  const body = (
    <Animated.View style={drag.style}>
      <Animated.View pointerEvents="none" style={[theme.surface("float", "xs"), { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent" }, drag.shadow]} />
      {children}
    </Animated.View>
  );
  return draggable ? <GestureDetector gesture={drag.gesture}>{body}</GestureDetector> : body;
}

export function MonthView({ snapshot, model, blocks, committed, budgets, selected, onSelect, onOpenDay, onDrop }: MonthProps) {
  const { color, shape, space } = useTheme();
  const { size } = useWindowClass();
  const touch = useInputFormat() === "touch";
  const compact = size === "compact";
  const [shown, setShown] = useState<MonthRef>(() => monthOf(snapshot.today));
  const [width, setWidth] = useState(0);
  const [target, setTarget] = useState<{ id: string; from: string; date: string } | null>(null);
  const lastDrag = useRef(0);
  const names = useMemo(() => weekdayNames(compact ? "narrow" : "short"), [compact]);
  const cellWidth = width / 7;
  const cellHeight = compact ? 64 : 108;
  // Weeks already over keep their place but fold down to a row of day numbers and marks, so the weeks ahead are in view.
  const thisWeek = shiftDays(snapshot.today, -weekIndex(snapshot.today));
  const dots = compact || cellWidth < 72;
  const first = firstOfMonth(shown);
  const cells = useMemo(() => { const start = shiftDays(first, -weekIndex(first)); return Array.from({ length: 42 }, (_, i) => shiftDays(start, i)); }, [first]);
  const index = useMemo(() => new Map(cells.map((d, i) => [d, i])), [cells]);
  const rows = useMemo(() => { let top = 0; return Array.from({ length: 6 }, (_, r) => { const height = cells[r * 7 + 6] < thisWeek ? 40 : cellHeight; const row = { top, height }; top += height; return row; }); }, [cells, thisWeek, cellHeight]);
  const days = useMemo(() => new Map(snapshot.days.map((d) => [d.date, d])), [snapshot.days]);
  const committedIds = useMemo(() => new Set(committed.filter(live).map((b) => `${b.id}|${b.date}|${b.start}`)), [committed]);
  const byDate = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const block of blocks) if (index.has(block.date)) map.set(block.date, [...(map.get(block.date) ?? []), block]);
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [blocks, index]);
  // Beyond the detailed calendar the plan is weekly budgets: shown on each week's Monday.
  const budgetOf = useMemo(() => { const map = new Map<string, number>(); for (const b of budgets) map.set(b.week, (map.get(b.week) ?? 0) + b.minutes); return map; }, [budgets]);
  const furthest = [snapshot.days.at(-1)?.date ?? snapshot.today, ...blocks.map((b) => b.date), ...model.goals.filter((g) => g.status === "active" && g.due).map((g) => g.due!), ...budgets.map((b) => shiftDays(b.week, 6))].sort().at(-1)!;
  const canBack = later(shown, monthOf(snapshot.today));
  const canOn = later(monthOf(furthest), shown);
  const inMonth = (date: string) => monthOf(date).month === shown.month && monthOf(date).year === shown.year;
  const monthBlocks = blocks.filter((b) => inMonth(b.date) && b.state !== "skipped");
  const planned = monthBlocks.filter((b) => b.state !== "missed").reduce((s, b) => s + blockMinutes(b), 0);

  const onLift = useCallback((id: string) => { lastDrag.current = Date.now(); const b = blocks.find((x) => x.id === id); if (b) setTarget({ id, from: b.date, date: b.date }); }, [blocks]);
  const onSlot = useCallback((id: string, slot: number) => setTarget((t) => (t && t.id === id ? { ...t, date: cells[slot] } : t)), [cells]);
  const onDropSlot = useCallback((id: string, slot: number) => {
    lastDrag.current = Date.now();
    setTarget(null);
    const block = blocks.find((b) => b.id === id);
    if (block && cells[slot] && cells[slot] !== block.date) onDrop(id, cells[slot], block.start);
  }, [blocks, cells, onDrop]);
  const select = (id: string) => { if (Date.now() - lastDrag.current > 250) onSelect(id); };
  const landing = target ? (() => { const b = blocks.find((x) => x.id === target.id); return b ? planning.studentLanding(target.date, b.start, b.end - b.start, snapshot.today, snapshot.nowMinute) : null; })() : null;

  return (
    <View testID="studio-month" style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <IconButton icon="chevronLeft" size="small" label="Previous month" disabled={!canBack} onPress={() => setShown(shiftMonth(shown, -1))} testID="studio-month-previous" />
        <Text variant="subheading" role="heading" aria-level={3} testID="studio-month-title">{monthTitle(shown)}</Text>
        <IconButton icon="chevronRight" size="small" label="Next month" disabled={!canOn} onPress={() => setShown(shiftMonth(shown, 1))} testID="studio-month-next" />
        <View style={{ flex: 1 }} />
        <Text variant="micro" tone="soft" numberOfLines={1}>{monthBlocks.length ? `${monthBlocks.length} session${monthBlocks.length === 1 ? "" : "s"} · ${formatMinutes(planned)}` : "Nothing planned this month yet"}</Text>
      </View>
      <View aria-hidden style={{ flexDirection: "row" }}>
        {names.map((name, i) => <View key={i} style={{ flex: 1, alignItems: "center" }}><Text variant="micro" tone="soft">{name}</Text></View>)}
      </View>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: color.line, borderRadius: shape.radius.sm }}>
        {width > 0 ? Array.from({ length: 6 }, (_, row) => (
          <View key={row} style={{ flexDirection: "row", zIndex: target && Math.floor((index.get(target.from) ?? -1) / 7) === row ? 10 : undefined }}>
            {cells.slice(row * 7, row * 7 + 7).map((date) => {
              const folded = rows[row].height < cellHeight;
              const day = days.get(date);
              const own = byDate.get(date) ?? [];
              const today = date === snapshot.today;
              const past = date < snapshot.today;
              const outside = !inMonth(date);
              const due = model.goals.filter((g) => g.status === "active" && g.due === date);
              const budget = !day && weekIndex(date) === 0 ? budgetOf.get(date) ?? 0 : 0;
              const marks = dots || folded;
              const shownChips = folded ? [] : dots ? own.slice(0, 4) : own.slice(0, due.length ? 2 : 3);
              const hovered = target && target.date === date && target.from !== date;
              return (
                <View key={date} aria-label={`${dayLabel(date)}${own.length ? `, ${own.length} session${own.length === 1 ? "" : "s"}` : ""}${due.length ? `, due: ${due.map((g) => g.title).join(", ")}` : ""}`}
                  style={{ width: cellWidth, height: rows[row].height, padding: 3, gap: 2, borderRightWidth: 1, borderBottomWidth: 1, borderColor: color.line, zIndex: target?.from === date ? 10 : undefined,
                    backgroundColor: hovered ? color.accent.wash : day?.rest ? withAlpha(color.inkFaint, 0.08) : past ? withAlpha(color.inkFaint, 0.04) : undefined, opacity: outside ? 0.55 : 1 }}>
                  {hovered ? <View pointerEvents="none" style={{ position: "absolute", top: 1, left: 1, right: 1, bottom: 1, borderRadius: shape.radius.xs, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.accent.ink }} /> : null}
                  <Press label={`Open ${dayLabel(date)}`} onPress={() => onOpenDay(date)} height={20} radius={shape.radius.xs} minHit={touch ? 32 : 20} testID={`studio-month-day-${date}`} bodyStyle={{ height: 20, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 2 }}>
                    <Text variant="caption" tone={today ? "accent" : past || outside ? "faint" : "soft"} style={today ? { fontWeight: "700" } : undefined}>{String(Number(date.slice(8)))}</Text>
                    {today ? <Marker scale={0.5} /> : null}
                    {!dots && day?.rest ? <Text variant="micro" tone="faint" numberOfLines={1}>Rest</Text> : null}
                  </Press>
                  {folded ? (own.length ? <View style={{ flexDirection: "row", gap: 2, paddingHorizontal: 2 }}>{own.slice(0, 6).map((b) => <View key={b.id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: b.state === "done" ? color.positive.mark : b.state === "missed" ? color.caution.mark : withAlpha(subjectColour(snapshot, itemOf(model, b.item)?.subject), 0.8) }} />)}</View> : null) : due.slice(0, 1).map((g) => <View key={g.key} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 3, borderRadius: shape.radius.xs, backgroundColor: color.critical.wash }}><Icon name="bookmark" size={9} color={color.critical.ink} />{dots ? null : <Text variant="micro" tone="critical" numberOfLines={1} style={{ flexShrink: 1 }}>{g.title}</Text>}</View>)}
                  <View style={{ gap: dots ? 3 : 2 }}>
                    {shownChips.map((block) => {
                      const proposal = block.state === "proposed" || (live(block) && !committedIds.has(`${block.id}|${block.date}|${block.start}`));
                      const item = itemOf(model, block.item);
                      return (
                        <MonthChip key={block.id} block={block} index={index.get(date)!} cellWidth={cellWidth} rows={rows} draggable={!marks && movable(block, proposal)} onLift={onLift} onSlot={onSlot} onDrop={onDropSlot}>
                          <Chip block={block} title={dots ? titleOf(model, block.item) : compactLabel(item).title} colour={subjectColour(snapshot, item?.subject)} proposal={proposal} selected={selected === block.id} dots={dots} onPress={() => select(block.id)} />
                        </MonthChip>
                      );
                    })}
                  </View>
                  {!folded && own.length > shownChips.length ? <Text variant="micro" tone="soft">{`+${own.length - shownChips.length} more`}</Text> : null}
                  {budget ? <Text variant="micro" tone="faint" numberOfLines={1}>{`≈ ${formatMinutes(budget)} this week`}</Text> : null}
                </View>
              );
            })}
          </View>
        )) : null}
      </View>
      {target && landing && target.date !== target.from ? (
        <View testID="studio-month-drop-label" pointerEvents="none" style={{ alignSelf: "center", paddingHorizontal: space.md, paddingVertical: 4, borderRadius: shape.radius.full, backgroundColor: color.inverse.fill }}>
          <Text variant="caption" style={{ color: color.inverse.on }}>{`${dayLabel(landing.date)} · ${clockLabel(landing.start)}`}</Text>
        </View>
      ) : null}
    </View>
  );
}
