// The global Spaces switcher. A quiet plate in the top-left corner holds the Spaces icon, and the plate itself grows into
// the bar, so the bar always reads as coming from the icon. The Marker leaves the icon and lands on the current Space.
import { useEffect, useRef, useState, type Ref } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { Corners, Icon, Press, Text, Tooltip, TravellingMarker, move, useDismiss, useTheme, useWindowClass, type IconName, type ViewHandle } from "@sylf/design-system";
import { SPACE_LABELS, fitSwitcher, spaceForDigit, tabForKey, type SpaceId } from "@sylf/spaces";
import { useShellMetrics, useSpaces, useSpacesStore } from "./context";
import { SPACES_SHORTCUT, useSpaceKeys } from "./shell-keys";
import { preloadSpaces } from "./SpaceStage";

const SPACE_ICONS: Record<SpaceId, IconName> = { home: "home", workspace: "workspace", world: "world" };
const CORNER_ICONS: Record<SpaceId, IconName> = { home: "spacesHome", workspace: "spaces", world: "spacesWorld" };

type TabLayouts = Partial<Record<SpaceId, { x: number; width: number }>>;

function moveFocus(node: ViewHandle | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as HTMLElement).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

function SwitcherTab({ id, index, count, progress, open, selected, labelled, height, onSelect, onLayout, tabRef }: { id: SpaceId; index: number; count: number; progress: SharedValue<number>; open: boolean; selected: boolean; labelled: boolean; height: number; onSelect: () => void; onLayout: (event: LayoutChangeEvent) => void; tabRef?: Ref<ViewHandle> }) {
  const { color, motion, shape, space } = useTheme();
  const travel = motion.enterTravel * motion.amount;
  // Roving focus is for desktop keyboards only: on Android a tabIndex of -1 also removes a tab from TalkBack.
  const start = 0.2 + (index / count) * 0.45;
  // Each tab arrives as the growing plate reaches it, which is what lets the bar skip clipping (and keep its shadows).
  const reveal = useAnimatedStyle(() => {
    const amount = Math.min(1, Math.max(0, (progress.value - start) / 0.35));
    return { opacity: amount, transform: [{ translateX: (amount - 1) * travel }] };
  });
  return (
    <Animated.View style={reveal} onLayout={onLayout}>
      <Press ref={tabRef} role="tab" selected={selected} label={SPACE_LABELS[id]} onPress={onSelect} height={height} radius={shape.radius.sm} {...(Platform.OS === "web" ? { tabIndex: open && selected ? 0 : -1 } : {})} bodyStyle={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: labelled ? space.md : 0, minWidth: height }}>
        <Icon name={SPACE_ICONS[id]} size={18} color={selected ? color.ink : color.inkSoft} />
        {labelled ? <Text variant="label" tone={selected ? "ink" : "soft"} numberOfLines={1}>{SPACE_LABELS[id]}</Text> : null}
      </Press>
    </Animated.View>
  );
}

/** `onReach` says how far along the line the open bar comes, so what shares that line can make way. */
export function SpacesSwitcher({ onReach }: { onReach: (right: number | null) => void }) {
  const theme = useTheme();
  const { color, motion, shape, space, surface } = theme;
  const store = useSpacesStore();
  const { state: { activeSpace } } = useSpaces();
  const { boxShadow, ...growingSurface } = surface("float", "md");
  const { control, edge, insets, left, top } = useShellMetrics();
  const { width: windowWidth } = useWindowClass();
  const spaces = store.available();

  const [open, setOpen] = useState(false);
  const [layouts, setLayouts] = useState<TabLayouts>({});
  const [labelledWidth, setLabelledWidth] = useState<number | null>(null);
  const progress = useSharedValue(0);
  const icon = useRef<ViewHandle>(null);
  const list = useRef<ViewHandle>(null);
  const activeTab = useRef<ViewHandle>(null);

  const trail = space.xs;
  const room = windowWidth - insets.left - insets.right - edge * 2;
  const fit = labelledWidth === null ? null : fitSwitcher({ labelled: control + labelledWidth + trail, iconOnly: control + spaces.length * control + trail, room });
  const labelled = fit?.labelled ?? true;
  const expanded = fit?.width ?? control;
  const activeLayout = layouts[activeSpace];
  const ready = fit !== null && activeLayout !== undefined;

  const show = () => { preloadSpaces(); setOpen(true); };
  const hide = (restoreFocus = true) => { setOpen(false); if (restoreFocus) moveFocus(icon.current); };
  const select = (id: SpaceId) => {
    const changed = id !== activeSpace;
    hide();
    if (store.select(id) && changed) AccessibilityInfo.announceForAccessibility(SPACE_LABELS[id]);
  };

  useDismiss(open, hide);
  useSpaceKeys((digit) => {
    const id = spaceForDigit(digit, spaces);
    if (id) select(id);
  });
  useEffect(() => {
    if (open && !ready) return;
    progress.value = move(open ? 1 : 0, motion, "lift");
    if (open) moveFocus(activeTab.current);
  }, [open, ready, motion, progress]);

  useEffect(() => { onReach(open && ready ? left + expanded : null); }, [open, ready, left, expanded, onReach]);

  const onKeyDown = (event: { key: string; shiftKey?: boolean; preventDefault(): void }) => {
    if (event.key === "Tab") { event.preventDefault(); hide(); return; }
    const nodes = Array.from((list.current as unknown as HTMLElement)?.querySelectorAll?.<HTMLElement>('[role="tab"]') ?? []);
    const next = tabForKey(event.key, nodes.indexOf(document.activeElement as HTMLElement), nodes.length);
    if (next !== null) { event.preventDefault(); nodes[next]?.focus(); }
  };

  const fading = motion.amount === 0;
  // Scaling costs no layout: a changing width commits a new shadow tree on every frame of the animation.
  const start = control / Math.max(expanded, control);
  const plate = useAnimatedStyle(() => ({
    transform: [{ scaleX: fading ? 1 : start + (1 - start) * progress.value }],
    opacity: fading ? progress.value : Math.min(1, progress.value * 5),
  }));
  // The small plate gives way as the bar arrives, or its corners would show through the bar's.
  const restingPlate = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, progress.value * 5) }));
  // A blurred shadow on a surface that changes size is drawn again at every size, and the GPU keeps each one (137 MB after 30
  // opens on the tablet). So the growing plate has none, and the shadow is one still layer that fades in once the plate is there.
  const barShadow = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (progress.value - 0.7) / 0.3)) }));
  const onTabLayout = (id: SpaceId) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => (current[id]?.x === x && current[id]?.width === width ? current : { ...current, [id]: { x, width } }));
  };
  const onListLayout = (event: LayoutChangeEvent) => { if (labelled) setLabelledWidth(event.nativeEvent.layout.width); };

  const markerInset = activeLayout && activeLayout.width > 40 ? space.md : 0;
  const markerX = open && ready && activeLayout ? control + activeLayout.x + markerInset : control / 2 - 8;
  const markerWidth = open && ready && activeLayout ? activeLayout.width - markerInset * 2 : 16;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      {open ? <Pressable aria-hidden testID="spaces-outside" tabIndex={-1} style={StyleSheet.absoluteFill} onPress={() => hide()} /> : null}
      <View pointerEvents="box-none" style={{ position: "absolute", top, left, right: insets.right + edge, height: control }}>
        <Animated.View pointerEvents="none" style={[surface("raised", "md"), { position: "absolute", top: 0, left: 0, width: control, height: control }, restingPlate]}><Corners behind={color.ground} /></Animated.View>
        {ready ? <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, height: control, width: expanded, borderRadius: growingSurface.borderRadius, boxShadow }, barShadow]} /> : null}
        {ready ? <Animated.View pointerEvents="none" style={[growingSurface, { position: "absolute", top: 0, left: 0, height: control, width: expanded, transformOrigin: "left center" }, plate]}><Corners behind={color.ground} /></Animated.View> : null}
        <View pointerEvents="box-none" style={{ flexDirection: "row", alignItems: "center", height: control }}>
          <Tooltip text="Spaces" shortcut={SPACES_SHORTCUT}>
            {(tooltip) => (
              <Press
                {...(open ? {} : tooltip)}
                ref={icon}
                testID="spaces-icon"
                label={`Spaces. Current Space: ${SPACE_LABELS[activeSpace]}`}
                hint="Shows Home, Workspace and World"
                expanded={open}
                onPress={() => { tooltip.onHover(false); if (open) hide(); else show(); }}
                height={control}
                radius={shape.radius.md}
                bodyStyle={{ width: control, height: control, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name={CORNER_ICONS[activeSpace]} size={20} active={!open} color={open ? color.ink : color.inkSoft} />
              </Press>
            )}
          </Tooltip>
          {/* The tabs stay mounted and hidden: mounting them on every open cost 0.7 MB of native memory each time on the tablet. */}
          <View ref={list} testID="spaces-tabs" role="tablist" aria-label={open ? "Spaces" : undefined} aria-hidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} pointerEvents={open ? "box-none" : "none"} onLayout={onListLayout} {...(Platform.OS === "web" ? { onKeyDown } as object : {})} style={{ flexDirection: "row", alignItems: "center" }}>
              {spaces.map((id, index) => <SwitcherTab key={id} id={id} index={index} count={spaces.length} progress={progress} open={open} selected={id === activeSpace} labelled={labelled} height={control} onSelect={() => select(id)} onLayout={onTabLayout(id)} tabRef={id === activeSpace ? activeTab : undefined} />)}
          </View>
        </View>
        <TravellingMarker x={markerX} width={markerWidth} baseline={theme.space.xs} visible={open && ready} />
      </View>
    </View>
  );
}
