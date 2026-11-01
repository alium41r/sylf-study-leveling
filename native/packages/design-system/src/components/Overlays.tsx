// Everything that floats. All overlays render through one host so they sit above the app, keep the theme scope they
// were opened from, and share one Back/Escape stack.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../icons";
import { Press } from "../primitives/Press";
import { Text } from "../primitives/Text";
import type { ViewHandle } from "../primitives/Layout";
import { Corners } from "../primitives/Plane";
import { Marker } from "../primitives/Marker";
import { ThemeRelay, useTheme, useWindowClass } from "../theme/context";
import { useDismiss } from "../runtime/dismiss";
import { useFocusTrap } from "../runtime/focus-trap";
import { fade, move } from "../runtime/motion";
import { placeFloating, type Placement, type Rect, type Side } from "../logic/geometry";
import { Button, type ButtonVariant } from "./Button";

interface HostValue { mount(id: number, node: ReactNode): void; unmount(id: number): void }
const HostContext = createContext<HostValue | null>(null);
let nextOverlayId = 1;

export function OverlayHost({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Map<number, ReactNode>>(new Map());
  const value = useMemo<HostValue>(() => ({
    mount: (id, node) => setNodes((current) => new Map(current).set(id, node)),
    unmount: (id) => setNodes((current) => { const next = new Map(current); next.delete(id); return next; }),
  }), []);
  return (
    <HostContext.Provider value={value}>
      <View style={{ flex: 1 }}>{children}</View>
      {[...nodes.entries()].map(([id, node]) => <View key={id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>{node}</View>)}
    </HostContext.Provider>
  );
}

function Portal({ children }: { children: ReactNode }) {
  const host = useContext(HostContext);
  const theme = useTheme();
  const id = useRef(0);
  if (!id.current) id.current = nextOverlayId++;
  useEffect(() => { host?.mount(id.current, <ThemeRelay value={theme}>{children}</ThemeRelay>); });
  useEffect(() => { const current = id.current; return () => host?.unmount(current); }, [host]);
  return null;
}

/** Keeps an overlay mounted through its exit animation, then releases it. */
function usePresence(open: boolean, exitMs: number) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setPresent(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return present;
}

function Scrim({ open, onPress, label = "Dismiss" }: { open: boolean; onPress: () => void; label?: string }) {
  const { color, motion } = useTheme();
  const opacity = useSharedValue(0);
  useEffect(() => { opacity.value = fade(open ? 1 : 0, motion, "base"); }, [open, motion, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }, style]}><Pressable role="button" aria-label={label} style={StyleSheet.absoluteFill} onPress={onPress} tabIndex={-1} /></Animated.View>;
}

export interface PopoverProps { open: boolean; anchor: RefObject<ViewHandle | null>; onClose: () => void; side?: Side; children: ReactNode; label: string; width?: number; matchWidth?: boolean; point?: { x: number; y: number } }

export function Popover({ open, anchor, onClose, side = "bottom", children, label, width, matchWidth, point }: PopoverProps) {
  const present = usePresence(open, 180);
  return present ? <Portal><PopoverBody open={open} anchor={anchor} onClose={onClose} side={side} label={label} width={width} matchWidth={matchWidth} point={point}>{children}</PopoverBody></Portal> : null;
}

function PopoverBody({ open, anchor, onClose, side, children, label, width, matchWidth, point }: PopoverProps) {
  const theme = useTheme();
  const { shape, motion, surface } = theme;
  const insets = useSafeAreaInsets();
  const windowSize = useWindowDimensions();
  const [rect, setRect] = useState<Rect | null>(point ? { x: point.x, y: point.y, width: 0, height: 0 } : null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const body = useRef<ViewHandle>(null);
  const progress = useSharedValue(0);
  useDismiss(open, onClose);
  useFocusTrap(body, open);

  useEffect(() => {
    if (point) return;
    anchor.current?.measureInWindow((x, y, w, h) => setRect({ x, y, width: w, height: h }));
  }, [anchor, point, windowSize.width, windowSize.height]);

  const placement: Placement | null = rect && size ? placeFloating(rect, size, windowSize, insets, side) : null;
  useEffect(() => { if (placement) progress.value = move(open ? 1 : 0, motion, "lift"); }, [open, !!placement, motion, progress]);

  const enterTravel = motion.enterTravel * motion.amount;
  const enterScale = 1 - (1 - motion.enterScale) * motion.amount;
  const towardY = placement?.side === "top" ? 1 : placement?.side === "bottom" ? -1 : 0;
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.6), transform: [{ translateY: (1 - progress.value) * enterTravel * towardY }, { scale: enterScale + (1 - enterScale) * progress.value }] }));
  const tuckStyle = placement && shape.tuck ? { [`border${placement.tuck[0].toUpperCase()}${placement.tuck.slice(1)}Radius`]: 3 } : null;
  const onLayout = (event: LayoutChangeEvent) => { const { width: w, height: h } = event.nativeEvent.layout; setSize((current) => (current?.width === w && current?.height === h ? current : { width: w, height: h })); };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable aria-hidden style={StyleSheet.absoluteFill} onPress={onClose} tabIndex={-1} />
      <Animated.View
        ref={body as never}
        role="dialog"
        aria-label={label}
        onLayout={onLayout}
        style={[surface("float", "lg"), { position: "absolute", left: placement?.left ?? -9999, top: placement?.top ?? 0, width: matchWidth && rect ? Math.max(rect.width, 200) : width, maxHeight: windowSize.height - insets.top - insets.bottom - 24, maxWidth: windowSize.width - 24, overflow: "hidden" }, tuckStyle, animated]}
      >
        {children}
        <Corners behind={theme.color.ground} />
      </Animated.View>
    </View>
  );
}

export interface MenuItem { key: string; label: string; detail?: string; icon?: IconName; shortcut?: string; selected?: boolean; destructive?: boolean; disabled?: boolean; fontFamily?: string; onSelect: () => void }

export function Menu({ open, anchor, onClose, items, label, side, matchWidth, point }: { open: boolean; anchor: RefObject<ViewHandle | null>; onClose: () => void; items: MenuItem[]; label: string; side?: Side; matchWidth?: boolean; point?: { x: number; y: number } }) {
  const { space, color, shape } = useTheme();
  const list = useRef<ViewHandle>(null);
  const onKeyDown = (event: { key: string; preventDefault(): void }) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nodes = Array.from((list.current as unknown as HTMLElement)?.querySelectorAll?.<HTMLElement>('[role="menuitem"]') ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
  };
  return (
    <Popover open={open} anchor={anchor} onClose={onClose} label={label} side={side} width={matchWidth ? undefined : 260} matchWidth={matchWidth} point={point}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }} contentContainerStyle={{ padding: space.xs }}>
        <View ref={list} role="menu" aria-label={label} {...(Platform.OS === "web" ? { onKeyDown } as object : {})}>
          {items.map((item) => (
            <Press key={item.key} role="menuitem" label={item.label} disabled={item.disabled} selected={item.selected} radius={shape.radius.sm} height={38} onPress={() => { item.onSelect(); onClose(); }} bodyStyle={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.xs }}>
              {item.icon ? <Icon name={item.icon} size={16} color={item.destructive ? color.critical.ink : color.inkSoft} /> : null}
              <View style={{ flex: 1 }}>
                <Text variant="small" tone={item.destructive ? "critical" : "ink"} numberOfLines={1} style={item.fontFamily ? { fontFamily: item.fontFamily } : undefined}>{item.label}</Text>
                {item.detail ? <Text variant="caption" tone="soft" numberOfLines={1}>{item.detail}</Text> : null}
              </View>
              {item.shortcut ? <Text variant="micro" tone="soft">{item.shortcut}</Text> : null}
              {item.selected ? <Marker /> : null}
            </Press>
          ))}
        </View>
      </ScrollView>
    </Popover>
  );
}

/** Long press on touch and right-click on desktop open the same menu at the same point. */
export function ContextArea({ items, label, children }: { items: MenuItem[]; label: string; children: ReactNode }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<ViewHandle>(null);
  const web = Platform.OS === "web" ? { onContextMenu: (event: { preventDefault(): void; clientX: number; clientY: number }) => { event.preventDefault(); setPoint({ x: event.clientX, y: event.clientY }); } } : {};
  return (
    <View ref={anchor} collapsable={false} {...web as object}>
      <Press label={label} feedback="none" hint="Long press for options" delayLongPress={380} onLongPress={(event) => setPoint({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY })}>{children}</Press>
      <Menu open={point !== null} anchor={anchor} onClose={() => setPoint(null)} items={items} label={label} point={point ?? undefined} />
    </View>
  );
}

/** Hover or keyboard focus shows it; touch shows it on long press. Touch users never depend on it for essentials. */
export function Tooltip({ text, shortcut, children }: { text: string; shortcut?: string; children: (handlers: { onHover: (hovering: boolean) => void; onFocusChange: (focused: boolean) => void; onLongPress: () => void }) => ReactNode }) {
  const { space, color, shape } = useTheme();
  const anchor = useRef<ViewHandle>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((visible: boolean) => {
    clearTimeout(timer.current);
    if (visible) timer.current = setTimeout(() => setOpen(true), 420); else setOpen(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <View ref={anchor} collapsable={false} style={{ alignSelf: "flex-start" }}>
      {children({ onHover: show, onFocusChange: show, onLongPress: () => { setOpen(true); setTimeout(() => setOpen(false), 1600); } })}
      {open ? <Portal><TooltipBody anchor={anchor} text={text} shortcut={shortcut} colors={color} radius={shape.radius.sm} gap={space.sm} /></Portal> : null}
    </View>
  );
}

function TooltipBody({ anchor, text, shortcut, colors, radius, gap }: { anchor: RefObject<ViewHandle | null>; text: string; shortcut?: string; colors: ReturnType<typeof useTheme>["color"]; radius: number; gap: number }) {
  const windowSize = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { motion } = useTheme();
  const [rect, setRect] = useState<Rect | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const opacity = useSharedValue(0);
  useEffect(() => { anchor.current?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height })); opacity.value = fade(1, motion); }, [anchor, motion, opacity]);
  const placement = rect && size ? placeFloating(rect, size, windowSize, insets, "top", 6) : null;
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" role="tooltip" onLayout={(e) => setSize(e.nativeEvent.layout)} style={[{ position: "absolute", left: placement?.left ?? -9999, top: placement?.top ?? 0, flexDirection: "row", gap, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius, backgroundColor: colors.inverse.fill }, animated]}>
      <Text variant="caption" style={{ color: colors.inverse.on }}>{text}</Text>
      {shortcut ? <Text variant="micro" style={{ color: colors.inverse.on, opacity: 0.75 }}>{shortcut}</Text> : null}
    </Animated.View>
  );
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

export interface SheetProps { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number; modal?: boolean; headerAccessory?: ReactNode }

/** A bottom sheet in compact windows, an edge panel otherwise. Same content and same gesture, either way. */
export function Sheet(props: SheetProps) {
  const present = usePresence(props.open, 320);
  return present ? <Portal><SheetBody {...props} /></Portal> : null;
}

function SheetBody({ open, onClose, title, children, footer, width = 420, modal = true, headerAccessory }: SheetProps) {
  const theme = useTheme();
  const { space, motion, surface, color } = theme;
  const { size, width: windowWidth, height: windowHeight } = useWindowClass();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const compact = size === "compact";
  const body = useRef<ViewHandle>(null);
  const distance = compact ? windowHeight : Math.min(width, windowWidth) + 24;
  const offset = useSharedValue(distance);
  const dragging = useSharedValue(0);
  useDismiss(open, onClose);
  useFocusTrap(body, open && modal);
  useEffect(() => {
    offset.value = motion.amount === 0 ? (open ? 0 : distance) : move(open ? 0 : distance, motion, "glide");
    if (open) AccessibilityInfo.announceForAccessibility(title);
  }, [open, distance, motion, offset, title]);

  const close = () => onClose();
  const drag = usePanGesture({
    activeOffsetX: compact ? [-400, 400] : [-10, 10],
    activeOffsetY: compact ? [-10, 10] : [-400, 400],
    onUpdate: (event) => { "worklet"; dragging.value = Math.max(0, compact ? event.translationY : event.translationX); },
    onDeactivate: (event) => {
      "worklet";
      const shouldClose = dragging.value > distance * 0.3 || (compact ? event.velocityY : event.velocityX) > 900;
      offset.value = dragging.value + offset.value;
      dragging.value = 0;
      if (shouldClose) scheduleOnRN(close); else offset.value = move(0, motion, "lift");
    },
  });

  const animated = useAnimatedStyle(() => {
    const value = offset.value + dragging.value;
    return { opacity: motion.amount === 0 ? 1 - Math.min(1, value / distance) : 1, transform: [motion.amount === 0 ? { translateY: 0 } : compact ? { translateY: value } : { translateX: value }] };
  });
  const placement = compact
    ? { left: 0, right: 0, bottom: 0, maxHeight: windowHeight * 0.92 - keyboard, paddingBottom: insets.bottom }
    : { right: space.sm + insets.right, top: space.sm + insets.top, bottom: space.sm + insets.bottom, width: Math.min(width, windowWidth - 2 * space.sm) };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {modal ? <Scrim open={open} onPress={onClose} /> : null}
      <Animated.View ref={body as never} role="dialog" aria-modal={modal || undefined} aria-label={title} accessibilityViewIsModal={modal} style={[surface("float", "xl"), { position: "absolute", overflow: "hidden" }, placement, animated]}>
        <GestureDetector gesture={drag}>
          <View>
            {compact ? <View style={{ alignSelf: "center", width: 32, height: 3, borderRadius: 2, marginTop: space.sm, backgroundColor: color.lineStrong }} /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm }}>
              <Text variant="heading" style={{ flex: 1 }} numberOfLines={1} role="heading">{title}</Text>
              {headerAccessory}
              <Press label="Close" onPress={onClose} height={32} radius={theme.shape.radius.sm} hitSlop={8} bodyStyle={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={color.inkSoft} /></Press>
            </View>
          </View>
        </GestureDetector>
        <View style={{ flexShrink: 1, flexGrow: compact ? 0 : 1 }}>{children}</View>
        {footer ? <View style={{ padding: space.lg, borderTopWidth: 1, borderTopColor: color.line }}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

export interface DialogAction { label: string; variant?: ButtonVariant; onPress: () => void }

export function Dialog({ open, onClose, title, message, actions, children }: { open: boolean; onClose: () => void; title: string; message?: string; actions: DialogAction[]; children?: ReactNode }) {
  const present = usePresence(open, 220);
  return present ? <Portal><DialogBody open={open} onClose={onClose} title={title} message={message} actions={actions}>{children}</DialogBody></Portal> : null;
}

function DialogBody({ open, onClose, title, message, actions, children }: { open: boolean; onClose: () => void; title: string; message?: string; actions: DialogAction[]; children?: ReactNode }) {
  const theme = useTheme();
  const { motion, space, surface } = theme;
  const body = useRef<ViewHandle>(null);
  const progress = useSharedValue(0);
  useDismiss(open, onClose);
  useFocusTrap(body, open);
  useEffect(() => { progress.value = move(open ? 1 : 0, motion, "lift"); }, [open, motion, progress]);
  const enterTravel = motion.enterTravel * motion.amount;
  const enterScale = 1 - (1 - motion.enterScale) * motion.amount;
  const animated = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.value * 1.5), transform: [{ translateY: (1 - progress.value) * enterTravel }, { scale: enterScale + (1 - enterScale) * progress.value }] }));
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: space.xl }]}>
      <Scrim open={open} onPress={onClose} />
      <Animated.View ref={body as never} role="alertdialog" aria-modal aria-label={title} accessibilityViewIsModal style={[surface("float", "xl"), { width: "100%", maxWidth: 420, padding: space.xl, gap: space.md }, animated]}>
        <Text variant="title" role="heading">{title}</Text>
        {message ? <Text tone="soft">{message}</Text> : null}
        {children}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm, flexWrap: "wrap" }}>
          {actions.map((action) => <Button key={action.label} title={action.label} variant={action.variant ?? "ghost"} onPress={action.onPress} />)}
        </View>
        <Corners behind={theme.color.scrim} />
      </Animated.View>
    </View>
  );
}

type NoticeTone = "neutral" | "positive" | "caution" | "critical";
interface NoticeRecord { id: number; message: string; tone: NoticeTone; action?: { label: string; onPress: () => void } }
const NoticeContext = createContext<(message: string, options?: { tone?: NoticeTone; action?: NoticeRecord["action"]; duration?: number }) => void>(() => undefined);
export const useNotice = () => useContext(NoticeContext);
const NoticeClearance = createContext<(bottom: number) => void>(() => undefined);

/** A Space with something along its bottom edge asks notices to rest above it, for as long as it is mounted. */
export function useNoticeClearance(bottom: number) {
  const set = useContext(NoticeClearance);
  useEffect(() => { set(bottom); return () => set(0); }, [set, bottom]);
}

export function NoticeHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NoticeRecord[]>([]);
  const [clearance, setClearance] = useState(0);
  const insets = useSafeAreaInsets();
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const push = useCallback<React.ContextType<typeof NoticeContext>>((message, options) => {
    const id = nextOverlayId++;
    setItems((current) => [...current.slice(-2), { id, message, tone: options?.tone ?? "neutral", action: options?.action }]);
    AccessibilityInfo.announceForAccessibility(message);
    setTimeout(() => dismiss(id), options?.duration ?? 4000);
  }, [dismiss]);
  return (
    <NoticeContext.Provider value={push}>
      <NoticeClearance.Provider value={setClearance}>{children}</NoticeClearance.Provider>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(insets.bottom + 20, clearance), alignItems: "center", gap: 8 }}>
        {items.map((item) => <NoticeCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />)}
      </View>
    </NoticeContext.Provider>
  );
}

function NoticeCard({ item, onDismiss }: { item: NoticeRecord; onDismiss: () => void }) {
  const theme = useTheme();
  const { motion, space, surface, color } = theme;
  const progress = useSharedValue(0);
  const swipe = useSharedValue(0);
  useEffect(() => { progress.value = move(1, motion, "lift"); }, [motion, progress]);
  const gone = () => onDismiss();
  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    onUpdate: (event) => { "worklet"; swipe.value = event.translationX; },
    onFinalize: () => { "worklet"; if (Math.abs(swipe.value) > 90) scheduleOnRN(gone); else swipe.value = move(0, motion); },
  });
  const animated = useAnimatedStyle(() => ({ opacity: progress.value * (1 - Math.min(1, Math.abs(swipe.value) / 180)), transform: [{ translateY: (1 - progress.value) * 12 }, { translateX: swipe.value }] }));
  const mark = { neutral: color.accent.mote, positive: color.positive.mark, caution: color.caution.mark, critical: color.critical.mark }[item.tone];
  return (
    <GestureDetector gesture={pan}>
      <Animated.View role="alert" style={[surface("float", "md"), { flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, minHeight: 44, maxWidth: 520 }, animated]}>
        <Marker color={mark} />
        <Text variant="small" style={{ flexShrink: 1, paddingVertical: space.sm }}>{item.message}</Text>
        {item.action ? <Button size="small" variant="ghost" title={item.action.label} onPress={() => { item.action?.onPress(); onDismiss(); }} /> : <View style={{ width: space.sm }} />}
      </Animated.View>
    </GestureDetector>
  );
}
