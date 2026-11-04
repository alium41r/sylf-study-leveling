// Home's own navigation: five destinations in a column under the Spaces icon, or along the bottom of a compact window. It is
// one element in both shapes, so crossing that width moves it without remounting it. Labels stay visible, because touch has no
// hover to reveal them, and they go only when the window is too short for them.
import { useRef, useState } from "react";
import { AccessibilityInfo, Platform, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Avatar, Icon, Press, Text, Tooltip, TravellingMarker, useTheme, type IconName, type ViewHandle } from "@sylf/design-system";
import { HOME_DESTINATIONS, HOME_LABELS, railTargetForKey, type HomeDestination } from "@sylf/spaces";
import { useAccountEntry, useHomeNavigation, useShellMetrics } from "../../shell/context";
import { useStats } from "../../shell/live";

const ICON = 22;
const RAIL_ICONS: Record<HomeDestination, IconName> = { today: "today", plan: "calendar", focus: "focus", circle: "circle", progress: "progress" };

function RailItem({ id, selected, labelled, width, height, onSelect }: { id: HomeDestination; selected: boolean; labelled: boolean; width: number; height: number; onSelect: () => void }) {
  const { color, shape, space } = useTheme();
  return (
    <Tooltip text={HOME_LABELS[id]}>
      {(tooltip) => (
        <Press
          {...(labelled ? {} : tooltip)}
          testID={`home-rail-${id}`}
          role="tab"
          selected={selected}
          label={HOME_LABELS[id]}
          onPress={onSelect}
          height={height}
          radius={shape.radius.md}
          {...(Platform.OS === "web" ? { tabIndex: selected ? 0 : -1 } : {})}
          bodyStyle={{ width, height, alignItems: "center", justifyContent: "center", gap: space.hair }}
        >
          <Icon name={RAIL_ICONS[id]} size={ICON} active={selected} color={selected ? color.ink : color.inkSoft} />
          {labelled ? <Text variant="caption" tone={selected ? "ink" : "soft"} numberOfLines={1}>{HOME_LABELS[id]}</Text> : null}
        </Press>
      )}
    </Tooltip>
  );
}

/** The way to the account, under the rail or at the end of the bar. It exists only in a build with a backend. */
function AccountControl({ extent }: { extent: number }) {
  const { shape } = useTheme();
  const entry = useAccountEntry();
  const stats = useStats();
  if (!entry) return null;
  const name = stats?.name || stats?.username || "Account";
  return <Press testID="home-account" label={`Account. ${name}`} onPress={entry.open} height={extent} radius={shape.radius.md} bodyStyle={{ width: extent, height: extent, alignItems: "center", justifyContent: "center" }}><Avatar name={name} size={28} /></Press>;
}

export function HomeRail({ destination, axis }: { destination: HomeDestination; axis: "vertical" | "horizontal" }) {
  const { space, type } = useTheme();
  const { control, edge, insets, rail, top } = useShellMetrics();
  const { fontScale } = useWindowDimensions();
  const navigation = useHomeNavigation();
  const list = useRef<ViewHandle>(null);
  const [room, setRoom] = useState<number | null>(null);
  const vertical = axis === "vertical";

  // The label's real height at this font scale, so the Marker can be placed without measuring every item.
  const labelHeight = (type.caption.lineHeight ?? 16) * Math.min(fontScale, type.caption.maxScale);
  const labelledExtent = Math.max(control, Math.ceil(ICON + space.hair + labelHeight + space.sm * 2));
  const gap = vertical ? space.xs : 0;
  const count = HOME_DESTINATIONS.length;
  const labelled = !vertical || room === null || labelledExtent * count + gap * (count - 1) <= room;
  const extent = labelled ? labelledExtent : Math.max(44, control);
  const index = HOME_DESTINATIONS.indexOf(destination);

  const select = (id: HomeDestination) => { if (navigation.select(id)) AccessibilityInfo.announceForAccessibility(HOME_LABELS[id]); };
  const onKeyDown = (event: { key: string; preventDefault(): void }) => {
    const nodes = Array.from((list.current as unknown as HTMLElement)?.querySelectorAll?.<HTMLElement>('[role="tab"]') ?? []);
    const next = railTargetForKey(event.key, nodes.indexOf(document.activeElement as HTMLElement), nodes.length, axis);
    if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
  };
  const onLayout = (event: LayoutChangeEvent) => { const { width, height } = event.nativeEvent.layout; setRoom(vertical ? height : width); };

  const account = useAccountEntry() !== null;
  const itemWidth = vertical ? rail : ((room ?? 0) - (account ? extent : 0)) / count;
  const items = room === null && !vertical ? null : (
    <View ref={list} role="tablist" aria-label="Home" aria-orientation={axis} {...(Platform.OS === "web" ? { onKeyDown } as object : {})} style={vertical ? { gap } : { flexDirection: "row" }}>
      {HOME_DESTINATIONS.map((id) => <RailItem key={id} id={id} selected={id === destination} labelled={labelled} width={itemWidth} height={extent} onSelect={() => select(id)} />)}
      {vertical
        ? <TravellingMarker axis="y" x={index * (extent + gap) + space.md} width={extent - space.md * 2} baseline={space.xs} />
        : <TravellingMarker x={index * itemWidth + itemWidth * 0.3} width={itemWidth * 0.4} baseline={extent - space.xs} />}
    </View>
  );

  if (vertical) {
    return (
      <View style={{ width: rail + insets.left, paddingLeft: insets.left, paddingTop: top + control + edge, paddingBottom: insets.bottom + edge }}>
        <ScrollView keyboardShouldPersistTaps="handled" onLayout={onLayout} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} showsVerticalScrollIndicator={false} overScrollMode="never" bounces={false}>{items}</ScrollView>
        {account ? <View style={{ alignItems: "center" }}><AccountControl extent={Math.max(44, control)} /></View> : null}
      </View>
    );
  }
  return (
    <View onLayout={onLayout} style={{ minHeight: extent, marginBottom: insets.bottom, marginLeft: insets.left, marginRight: insets.right, flexDirection: "row", alignItems: "center" }}>
      <View style={{ flex: 1, minWidth: 0 }}>{items}</View>
      <AccountControl extent={extent} />
    </View>
  );
}
