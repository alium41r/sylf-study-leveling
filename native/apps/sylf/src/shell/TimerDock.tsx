// The Universal Timer Dock. It rests in the middle of the Spaces icon's line as a small plate with the time on it, and it grows downward
// into the session's controls, in the way the switcher grows sideways: the plate moves with a transform, nothing changes size, and the
// shadow is one still layer that arrives afterwards. It lives in the shell, above the Spaces, so a Space changing underneath does not
// move it, and it keeps the person's own theme in World as the switcher does. It holds no time: only the small part that shows the clock
// renders with the clock, and the panel's clock runs only while the panel is open.
import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Button, Corners, Divider, Icon, IconButton, Marker, Press, Segmented, Text, Tooltip, fade, move, useDismiss, useFocusTrap, useTheme, type ViewHandle } from "@sylf/design-system";
import { formatSessionClock, sessionLengthLabel, type SessionStatus, type ToolId } from "@sylf/spaces";
import { useDockMetrics, useHomeNavigation, useSessionReadout, useSessionState, useSpacesStore, useStudySession, useWorkspaceModel } from "./context";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionLengths, SessionNote, SessionProgress, SessionSubject, speakReadout } from "./session/SessionParts";
import { EnterFocusButton } from "./focus/enter";
import { DOCK_SHORTCUT, useDockKeys } from "./shell-keys";
import { DockAudioEntry, SoundLibrary } from "./audio/DockSound";

type DockView = "timer" | "sounds";
const DOCK_VIEWS: { value: DockView; label: string; icon: "timer" | "audio" }[] = [
  { value: "timer", label: "Timer", icon: "timer" },
  { value: "sounds", label: "Sounds", icon: "audio" },
];
const COMPACT_DOCK_VIEWS = DOCK_VIEWS.map(({ value, label }) => ({ value, label }));
const SWIPE_DISTANCE = 34;
const SWIPE_SPEED = 520;

const hiddenOnWeb = Platform.select<ViewStyle>({ web: { visibility: "hidden" } as unknown as ViewStyle, default: {} });
const ANNOUNCED: Partial<Record<SessionStatus, string>> = { running: "Session in progress", paused: "Session paused", finished: "Session finished" };

/** The time at rest. This is the only part of the shell that renders once a second. */
const DockGlance = memo(function DockGlance({ open, onPress, pressRef }: { open: boolean; onPress: () => void; pressRef: React.Ref<ViewHandle> }) {
  const { color, space, shape } = useTheme();
  const { height, clockWidth, tight } = useDockMetrics();
  const readout = useSessionReadout();
  const { status } = readout;
  const quiet = status === "idle" || status === "paused";
  return (
    <Tooltip text="Timer" shortcut={DOCK_SHORTCUT}>
      {(tooltip) => (
        <Press {...(open ? {} : tooltip)} ref={pressRef} testID="dock" label={`Timer. ${speakReadout(readout)}`} hint="Shows the session's controls" expanded={open} onPress={() => { tooltip.onHover(false); onPress(); }} height={height} radius={shape.radius.md} style={{ width: clockWidth }} bodyStyle={{ height, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: tight ? space.xs : space.md }}>
          {tight ? null : status === "running" ? <View style={{ width: 16, alignItems: "center" }}><Marker /></View> : <Icon name={status === "paused" ? "pause" : status === "finished" ? "check" : "timer"} size={16} color={quiet ? color.inkSoft : color.ink} />}
          <Text testID="dock-clock" variant="value" tone={quiet ? "soft" : "ink"} numberOfLines={1}>{formatSessionClock(readout.clock)}</Text>
        </Press>
      )}
    </Tooltip>
  );
});

function moveFocus(node: ViewHandle | null) {
  if (!node) return;
  if (Platform.OS === "web") (node as unknown as HTMLElement).focus?.();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}

function DockPanel({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (go: () => void) => void }) {
  const { space } = useTheme();
  const session = useStudySession();
  const home = useHomeNavigation();
  const store = useSpacesStore();
  const workspace = useWorkspaceModel();
  const { active, length, plan } = useSessionState();
  const status = session.status();
  const focus = () => onGo(() => { home.select("focus"); store.select("home"); });
  const tool = (id: ToolId) => () => onGo(() => { workspace.summon(id); store.select("workspace"); });
  return (
    <View style={{ padding: space.lg, paddingTop: space.sm, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
        <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>{active?.title ?? plan?.title ?? plan?.subject ?? "Next session"}</Text>
        <Text variant="caption" tone="soft" numberOfLines={1}>{status === "idle" ? sessionLengthLabel(length) : SESSION_STATUS_LABELS[status]}</Text>
      </View>
      <SessionClock variant="readoutXL" live={open} testID="dock-panel-clock" />
      {status === "idle" ? <SessionLengths /> : <SessionProgress live={open} />}
      <SessionSubject />
      <SessionActions surface="dock" onEnded={onClose} />
      <EnterFocusButton surface="dock" onEnter={onClose} />
      <Divider />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Button title="Focus" size="small" variant="ghost" icon="focus" testID="dock-go-focus" onPress={focus} />
        <Button title="Timer" size="small" variant="ghost" icon="timer" testID="dock-go-timer" onPress={tool("timer")} />
      </View>
      <SessionNote />
    </View>
  );
}

export function TimerDock({ barReach, audioOnly = false, onCloseAudio }: { barReach: number | null; audioOnly?: boolean; onCloseAudio?: () => void }) {
  const { color, motion, space, surface } = useTheme();
  const session = useStudySession();
  const { active } = useSessionState();
  const status = session.status();
  const { height, panelLeft, panelMaxHeight, panelOrigin, panelWidth, restLeft, restWidth, top } = useDockMetrics();
  const { boxShadow, ...plate } = surface("float", "lg");
  const compact = panelWidth < 360;

  const [open, setOpen] = useState(audioOnly);
  const [view, setView] = useState<DockView>(audioOnly ? "sounds" : "timer");
  const [visited, setVisited] = useState({ timer: false, sounds: audioOnly });
  const [panelHeight, setPanelHeight] = useState(0);
  const progress = useSharedValue(0);
  const swipeStart = useSharedValue(0);
  const glance = useRef<ViewHandle>(null);
  const audio = useRef<ViewHandle>(null);
  const panel = useRef<ViewHandle>(null);
  const openedFrom = useRef<DockView>(view);
  const swiping = useRef(false);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showView = (next: DockView) => {
    setView(next);
    setVisited((current) => current[next] ? current : { ...current, [next]: true });
  };
  const show = (next: DockView) => {
    openedFrom.current = next;
    showView(next);
    setOpen(true);
  };
  const hide = () => { if (audioOnly) onCloseAudio?.(); else setOpen(false); };
  const activate = (next: DockView) => { if (!swiping.current) show(next); };
  useDismiss(open, hide);
  useFocusTrap(panel, open);
  useEffect(() => () => clearTimeout(swipeTimer.current), []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) moveFocus(openedFrom.current === "sounds" ? audio.current : glance.current);
    wasOpen.current = open;
  }, [open]);
  useDockKeys({ toggle: () => { if (open) hide(); else show("timer"); }, pauseOrResume: () => { if (!session.pause()) session.resume(); } });
  useEffect(() => { progress.value = move(open ? 1 : 0, motion, "lift"); }, [open, motion, progress]);

  const spoken = useRef(status);
  useEffect(() => {
    if (spoken.current === status) return;
    spoken.current = status;
    const words = ANNOUNCED[status];
    if (words) AccessibilityInfo.announceForAccessibility(words);
  }, [status]);

  const covered = !open && barReach !== null && barReach + space.sm > restLeft;
  const beginSwipe = () => { clearTimeout(swipeTimer.current); swiping.current = true; };
  const finishSwipe = (expand: boolean) => {
    if (expand) show("sounds");
    // A gesture can also release the underlying Pressable. Its click belongs to this same gesture.
    swipeTimer.current = setTimeout(() => { swiping.current = false; }, 120);
  };
  // The web handler resets translation on activation; measure from touch-down on every platform.
  const rememberSwipe = (event: { absoluteY: number }) => {
    "worklet";
    swipeStart.value = event.absoluteY;
  };
  const pull = usePanGesture({
    enabled: !audioOnly && !open && !covered,
    activeOffsetY: 14,
    failOffsetX: [-18, 18],
    onBegin: rememberSwipe,
    onActivate: () => { "worklet"; scheduleOnRN(beginSwipe); },
    onDeactivate: (event) => {
      "worklet";
      scheduleOnRN(finishSwipe, !event.canceled && (event.absoluteY - swipeStart.value >= SWIPE_DISTANCE || event.velocityY >= SWIPE_SPEED));
    },
  });
  const push = usePanGesture({
    enabled: open,
    activeOffsetY: -14,
    failOffsetX: [-18, 18],
    onBegin: rememberSwipe,
    onDeactivate: (event) => {
      "worklet";
      if (!event.canceled && (swipeStart.value - event.absoluteY >= SWIPE_DISTANCE || event.velocityY <= -SWIPE_SPEED)) scheduleOnRN(hide);
    },
  });
  const away = useSharedValue(0);
  useEffect(() => { away.value = fade(covered ? 1 : 0, motion); }, [covered, motion, away]);

  const fading = motion.amount === 0;
  const start = restWidth / Math.max(panelWidth, restWidth);
  const grown = useAnimatedStyle(() => ({
    opacity: fading ? progress.value : Math.min(1, progress.value * 5),
    transform: fading ? [] : [{ scale: start + (1 - start) * progress.value }],
  }));
  const content = useAnimatedStyle(() => ({ opacity: fading ? 1 : Math.min(1, Math.max(0, (progress.value - 0.35) / 0.4)) }));
  const resting = useAnimatedStyle(() => ({ opacity: (1 - Math.min(1, progress.value * 5)) * (1 - away.value) }));
  const shadow = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (progress.value - 0.7) / 0.3)) }));
  const onPanelLayout = (event: LayoutChangeEvent) => setPanelHeight(event.nativeEvent.layout.height);

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: open ? 30 : 15 }]}>
      {open ? <Pressable aria-hidden testID="dock-outside" tabIndex={-1} style={StyleSheet.absoluteFill} onPress={hide} /> : null}
      {audioOnly ? null : (
        <GestureDetector gesture={pull} touchAction="pan-x">
          <Animated.View testID="dock-rest" collapsable={false} pointerEvents={open || covered ? "none" : "box-none"} aria-hidden={open || covered || undefined}
            importantForAccessibility={open || covered ? "no-hide-descendants" : "auto"}
            style={[surface("raised", "md"), { position: "absolute", top, left: restLeft, width: restWidth, height, flexDirection: "row", alignItems: "center", gap: space.xs }, resting]}>
            <DockGlance open={open} onPress={() => activate("timer")} pressRef={glance} />
            <Divider vertical style={{ height: height / 2, alignSelf: "center" }} />
            <DockAudioEntry height={height} pressRef={audio} onPress={() => activate("sounds")} />
            <Corners behind={color.ground} />
          </Animated.View>
        </GestureDetector>
      )}
      {visited.timer || visited.sounds ? (
        <>
          {boxShadow && panelHeight ? <Animated.View pointerEvents="none" style={[{ position: "absolute", top, left: panelLeft, width: panelWidth, height: panelHeight, borderRadius: plate.borderRadius, boxShadow }, shadow]} /> : null}
          <Animated.View
            ref={panel as never}
            role="dialog"
            aria-label={view === "sounds" ? "Sounds" : active ? `Timer: ${active.title}` : "Timer"}
            testID="dock-panel"
            aria-hidden={!open || undefined}
            importantForAccessibility={open ? "auto" : "no-hide-descendants"}
            pointerEvents={open ? "auto" : "none"}
            onLayout={onPanelLayout}
            style={[plate, { position: "absolute", top, left: panelLeft, width: panelWidth, maxHeight: panelMaxHeight, overflow: "hidden", transformOrigin: `${Math.round(panelOrigin * 100)}% 0%` }, open ? null : hiddenOnWeb, grown]}
          >
            <Animated.View style={[{ flexShrink: 1, minHeight: 0 }, content]}>
              <GestureDetector gesture={push} touchAction="pan-x">
                <View testID="dock-panel-header" collapsable={false} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingTop: space.sm, gap: space.sm }}>
                  {audioOnly ? <Text variant="subheading" style={{ paddingLeft: space.sm }}>Sounds</Text> : (
                    <View style={{ flex: 1 }}><Segmented<DockView> fit label="Dynamic Island" value={view} options={compact ? COMPACT_DOCK_VIEWS : DOCK_VIEWS} onChange={showView} /></View>
                  )}
                  <IconButton icon="close" label="Close dock" size="small" bare onPress={hide} />
                </View>
              </GestureDetector>
              {visited.timer ? (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} overScrollMode="never" bounces={false}
                  aria-hidden={view !== "timer" || undefined} importantForAccessibility={view === "timer" ? "auto" : "no-hide-descendants"}
                  style={[{ flexGrow: 0, flexShrink: 1 }, view !== "timer" ? [{ height: 0, overflow: "hidden" }, hiddenOnWeb] : null]}>
                  <DockPanel open={open && view === "timer"} onClose={hide} onGo={(go) => { hide(); go(); }} />
                </ScrollView>
              ) : null}
              {visited.sounds ? (
                <View testID="dock-audio-panel" aria-hidden={view !== "sounds" || undefined} importantForAccessibility={view === "sounds" ? "auto" : "no-hide-descendants"}
                  style={[{ flexShrink: 1, minHeight: 0 }, view !== "sounds" ? [{ height: 0, overflow: "hidden" }, hiddenOnWeb] : null]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: compact ? space.md : space.lg, gap: space.sm }}>
                    <Text variant="caption" tone="soft">Session timer</Text>
                    <SessionClock variant="value" live={open && view === "sounds"} testID="dock-audio-clock" />
                  </View>
                  <SoundLibrary dock compact={compact} />
                </View>
              ) : null}
            </Animated.View>
            <Corners behind={color.ground} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
