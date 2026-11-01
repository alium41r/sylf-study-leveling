// The lobby's interface, over the scene: the name, four sections and the way in. The sections run down the left, in the voice of a
// title screen, with the Marker on a rail beside them. A panel grows beside the menu and leaves the gate in view when the window
// has room. In a compact window the sections run along the bottom, and World asks for a larger window before anyone can enter.
import { useEffect, useRef, useState, type ComponentType } from "react";
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Badge, Button, Callout, IconButton, Plane, Press, Stack, Text, TravellingMarker, fade, move, useControlHeight, useDismiss, useTheme, useWindowClass, type ViewHandle } from "@sylf/design-system";
import { DEFAULT_SESSION_TITLE, LOBBY_LABELS, LOBBY_SECTIONS, railTargetForKey, worldEntryBlock, type LobbySection, type WorldFault, type WorldSky } from "@sylf/spaces";
import { useSessionState, useShellMetrics, useStudySession } from "../../shell/context";
import { useWorldResult } from "./data";
import type { WorldDataAdapter } from "./data/contracts";
import { CollectionPanel } from "./panels/CollectionPanel";
import { PreparationsPanel } from "./panels/PreparationsPanel";
import { TravellerPanel } from "./panels/TravellerPanel";
import { SampleNotice } from "./panels/shared";

const offScreen = Platform.select<ViewStyle>({ web: { visibility: "hidden" } as unknown as ViewStyle, default: {} });
const COLUMN = 320;
const PANEL = 440;
/** The narrowest window where the glance and the way in can share the bottom edge. */
const GLANCE_WIDTH = 720;

const loadTraveller = (adapter: WorldDataAdapter) => adapter.traveller();

function lastVisit(leftAt: number | undefined) {
  return leftAt ? `Last here at ${new Date(leftAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null;
}

function SectionMenu({ section, axis, onSelect }: { section: LobbySection; axis: "vertical" | "horizontal"; onSelect: (id: LobbySection) => void }) {
  const { shape, space } = useTheme();
  const control = useControlHeight();
  const { width } = useWindowClass();
  const { insets } = useShellMetrics();
  const list = useRef<ViewHandle>(null);
  const vertical = axis === "vertical";
  const extent = Math.max(44, control);
  const gap = vertical ? space.xs : 0;
  const itemWidth = vertical ? undefined : (width - insets.left - insets.right) / LOBBY_SECTIONS.length;
  const index = LOBBY_SECTIONS.indexOf(section);

  const onKeyDown = (event: { key: string; preventDefault(): void }) => {
    const nodes = Array.from((list.current as unknown as HTMLElement)?.querySelectorAll?.<HTMLElement>('[role="tab"]') ?? []);
    const next = railTargetForKey(event.key, nodes.indexOf(document.activeElement as HTMLElement), nodes.length, axis);
    if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
  };

  return (
    <View ref={list} testID="world-sections" role="tablist" aria-label="World" aria-orientation={axis} {...(Platform.OS === "web" ? { onKeyDown } as object : {})} style={vertical ? { gap } : { flexDirection: "row" }}>
      {LOBBY_SECTIONS.map((id) => (
        <Press
          key={id}
          testID={`world-section-${id}`}
          role="tab"
          selected={id === section}
          label={LOBBY_LABELS[id]}
          onPress={() => onSelect(id)}
          height={extent}
          radius={shape.radius.sm}
          {...(Platform.OS === "web" ? { tabIndex: id === section ? 0 : -1 } : {})}
          bodyStyle={{ height: extent, width: itemWidth, justifyContent: "center", alignItems: vertical ? "flex-start" : "center", paddingLeft: vertical ? space.lg : 0 }}
        >
          <Text variant={vertical ? "subheading" : "caption"} tone={id === section ? "ink" : "soft"} numberOfLines={1}>{LOBBY_LABELS[id]}</Text>
        </Press>
      ))}
      {vertical
        ? <TravellingMarker axis="y" x={index * (extent + gap) + space.md} width={extent - space.md * 2} baseline={space.xs} />
        : <TravellingMarker x={index * (itemWidth ?? 0) + (itemWidth ?? 0) * 0.3} width={(itemWidth ?? 0) * 0.4} baseline={space.xs} />}
    </View>
  );
}

function PanelLayer({ id, active, sky, onClose }: { id: Exclude<LobbySection, "gate">; active: boolean; sky: WorldSky; onClose: () => void }) {
  const { motion, space } = useTheme();
  const shown = useSharedValue(0);
  useEffect(() => { shown.value = active ? move(1, motion, "lift") : 0; }, [active, motion, shown]);
  const travel = -motion.enterTravel * motion.amount;
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value * 1.4), transform: [{ translateX: travel * (1 - shown.value) }] }));
  const Screen: ComponentType<{ sky: WorldSky }> = id === "traveller" ? TravellerPanel : id === "collection" ? CollectionPanel : PreparationsPanel;
  return (
    <Animated.View testID={`world-panel-${id}`} role="tabpanel" aria-label={LOBBY_LABELS[id]} aria-hidden={!active || undefined} importantForAccessibility={active ? "auto" : "no-hide-descendants"} pointerEvents={active ? "auto" : "none"} style={[{ position: "absolute", top: 0, left: 0, right: 0, maxHeight: "100%" }, active ? null : offScreen, animated]}>
      <Plane level="float" radius="xl" style={{ flexShrink: 1, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.lg, paddingRight: space.sm, paddingTop: space.sm }}>
          <Text variant="title" role="heading" aria-level={2} style={{ flex: 1 }}>{LOBBY_LABELS[id]}</Text>
          <IconButton icon="close" label="Back to the gate" testID="world-panel-close" onPress={onClose} style={{ alignSelf: "center" }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm }} showsVerticalScrollIndicator={false} overScrollMode="never" bounces={false}>
          <Screen sky={sky} />
        </ScrollView>
      </Plane>
    </Animated.View>
  );
}

/** Who is entering, at a glance, in the corner away from the menu. It goes while a panel shows the same thing in full. */
function TravellerGlance() {
  const { space } = useTheme();
  const result = useWorldResult("traveller", loadTraveller);
  const traveller = result?.data;
  if (!traveller) return null;
  return (
    <Plane level="raised" radius="md" testID="world-glance" style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm }}>
      <Text variant="small">{`Level ${traveller.level}`}</Text>
      <Text variant="small" tone="soft">{traveller.rank}</Text>
      <Text variant="small" tone="soft">{`${traveller.sylph.toLocaleString()} Sylph`}</Text>
      <SampleNotice provenance={result.provenance} />
    </Plane>
  );
}

export function Lobby({ section, sky, leftAt, fault, aim, open, onSection, onEnter, onFocusStudy }: { section: LobbySection; sky: WorldSky; leftAt?: number; fault: WorldFault | null; aim: SharedValue<number>; open: SharedValue<number>; onSection: (id: LobbySection) => void; onEnter: () => void; onFocusStudy: () => void }) {
  const { motion, space } = useTheme();
  const { size, width, height } = useWindowClass();
  const { contentTop, insets } = useShellMetrics();
  const compact = size === "compact";
  // A wide, short window cannot stack all of this, so the way in takes the far corner and the tagline steps aside.
  const short = !compact && height < 560;
  // The one study session decides this, so the dock, Focus and this plate can never disagree. It is a pause or an end, chosen in the open:
  // nothing here stops a session behind anyone's back.
  const session = useStudySession();
  const { active } = useSessionState();
  const status = session.status();
  const block = worldEntryBlock({ width, height }, status === "running" && active ? { title: active.title } : null);
  const panel = section === "gate" ? null : section;
  const [visited, setVisited] = useState<Exclude<LobbySection, "gate">[]>(panel ? [panel] : []);
  if (panel && !visited.includes(panel)) setVisited([...visited, panel]);

  useEffect(() => { open.value = move(panel ? 1 : 0, motion, "glide"); }, [panel, motion, open]);
  useDismiss(panel !== null, () => onSection("gate"));

  const select = (id: LobbySection) => { onSection(id); AccessibilityInfo.announceForAccessibility(LOBBY_LABELS[id]); };
  const aimAt = (active: boolean) => { aim.value = fade(active ? 1 : 0, motion, "base"); };

  const left = insets.left + space.xl;
  const columnWidth = Math.min(COLUMN, width - left - insets.right - space.lg);
  const panelLeft = compact ? insets.left + space.md : left + columnWidth + space.md;
  const panelWidth = compact ? width - insets.left - insets.right - space.md * 2 : Math.min(PANEL, width - panelLeft - insets.right - space.md);

  // On a plate of its own, because this sits on drifting clouds: the plate's colors are solved, and what is behind it is not.
  const entry = (
    <Plane level="raised" radius="lg" testID="world-entry" style={{ padding: space.md, gap: space.sm }}>
      {fault?.during === "load" ? <View testID="world-fault"><Callout tone="critical" title="The gate would not open" message={fault.message} /></View> : null}
      {block?.kind === "session" ? <View testID="world-block-session"><Callout title="Your study session comes first" message={`${block.title === DEFAULT_SESSION_TITLE ? "Your session" : block.title} is running. Time in World never counts as study, so pause or end it before you enter.`} /></View> : null}
      {block?.kind === "window" ? <View testID="world-block-window"><Callout title="World needs a larger window" message="Everything else here still works." /></View> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        {block?.kind === "session"
          ? <><Button title="Pause session" variant="emphasis" icon="pause" testID="world-pause-session" onPress={() => session.pause()} /><Button title="Go to Focus" size="small" variant="ghost" testID="world-go-focus" onPress={onFocusStudy} /></>
          : <Button title="Enter the world" variant="emphasis" icon="play" testID="world-enter" disabled={block !== null} onPress={onEnter} onHover={aimAt} onFocusChange={aimAt} />}
        {block?.kind === "session" ? null : <View><Badge label="Preview" /></View>}
      </View>
      <Text variant="caption" tone="soft">{status === "paused" ? "Your session stays paused while you are in the world." : block?.kind === "session" ? "Pausing stops the clock. You can resume it from the timer." : lastVisit(leftAt) ?? "The world itself arrives in a later phase. This walks the way in and out."}</Text>
    </Plane>
  );

  return (
    <View testID="world-lobby" pointerEvents="box-none" style={[StyleSheet.absoluteFill, { flexDirection: compact ? "column-reverse" : "row" }]}>
      {compact ? <View style={{ paddingBottom: insets.bottom }}><SectionMenu section={section} axis="horizontal" onSelect={select} /></View> : null}
      {/* The width is on a wrapper because a ScrollView grows to fill a row on the web, whatever width it is given. */}
      <View pointerEvents="box-none" style={compact ? { flex: 1 } : { width: left + columnWidth }}>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingLeft: compact ? insets.left + space.lg : left, paddingRight: compact ? insets.right + space.lg : 0, paddingTop: contentTop, paddingBottom: compact ? space.md : space.lg + insets.bottom, justifyContent: "space-between", gap: space.lg }} showsVerticalScrollIndicator={false} overScrollMode="never" bounces={false}>
          <Stack gap="xs">
            <Text variant={short ? "display" : "hero"} role="heading" aria-level={1} testID="world-title">Sylf World</Text>
            {short ? null : <Text variant="quote">A place you earn by studying.</Text>}
          </Stack>
          {compact ? null : <SectionMenu section={section} axis="vertical" onSelect={select} />}
          {short || (compact && panel) ? null : entry}
        </ScrollView>
      </View>
      <View pointerEvents={panel ? "box-none" : "none"} style={{ position: "absolute", left: panelLeft, width: panelWidth, top: contentTop, bottom: compact ? insets.bottom + 56 : insets.bottom + space.lg }}>
        {visited.map((id) => <PanelLayer key={id} id={id} active={id === panel} sky={sky} onClose={() => select("gate")} />)}
      </View>
      {short && !panel ? <View pointerEvents="box-none" style={{ position: "absolute", right: insets.right + space.lg, bottom: insets.bottom + space.md, maxWidth: columnWidth }}>{entry}</View> : null}
      {!compact && !short && !panel && width >= GLANCE_WIDTH ? <View pointerEvents="none" style={{ position: "absolute", right: insets.right + space.lg, bottom: insets.bottom + space.lg }}><TravellerGlance /></View> : null}
    </View>
  );
}
