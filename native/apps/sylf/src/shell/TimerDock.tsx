// The Universal Timer Dock. It rests in the middle of the Spaces icon's line as a small plate with the time on it, and it grows downward
// into the session's controls, in the way the switcher grows sideways: the plate moves with a transform, nothing changes size, and the
// shadow is one still layer that arrives afterwards. It lives in the shell, above the Spaces, so a Space changing underneath does not
// move it, and it keeps the person's own theme in World as the switcher does. It holds no time: only the small part that shows the clock
// renders with the clock, and the panel's clock runs only while the panel is open.
import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Button, Corners, Divider, Icon, Marker, Press, Text, Tooltip, fade, move, useDismiss, useFocusTrap, useTheme, type ViewHandle } from "@sylf/design-system";
import { formatSessionClock, sessionLengthLabel, type SessionStatus, type ToolId } from "@sylf/spaces";
import { useDockMetrics, useHomeNavigation, useSessionReadout, useSessionState, useSpacesStore, useStudySession, useWorkspaceModel } from "./context";
import { SESSION_STATUS_LABELS, SessionActions, SessionClock, SessionLengths, SessionNote, SessionProgress, SessionSubject, speakReadout } from "./session/SessionParts";
import { EnterFocusButton } from "./focus/enter";
import { DOCK_SHORTCUT, useDockKeys } from "./shell-keys";
import { DockSound, DockSoundGlance } from "./audio/DockSound";

const hiddenOnWeb = Platform.select<ViewStyle>({ web: { visibility: "hidden" } as unknown as ViewStyle, default: {} });
const ANNOUNCED: Partial<Record<SessionStatus, string>> = { running: "Session in progress", paused: "Session paused", finished: "Session finished" };

/** The time at rest. This is the only part of the shell that renders once a second. */
const DockGlance = memo(function DockGlance({ open, onPress, pressRef }: { open: boolean; onPress: () => void; pressRef: React.Ref<ViewHandle> }) {
  const { color, space, shape } = useTheme();
  const { height, restWidth } = useDockMetrics();
  const readout = useSessionReadout();
  const { status } = readout;
  const quiet = status === "idle" || status === "paused";
  return (
    <Tooltip text="Timer" shortcut={DOCK_SHORTCUT}>
      {(tooltip) => (
        <Press {...(open ? {} : tooltip)} ref={pressRef} testID="dock" label={`Timer. ${speakReadout(readout)}`} hint="Shows the session's controls" expanded={open} onPress={() => { tooltip.onHover(false); onPress(); }} height={height} radius={shape.radius.md} style={{ width: restWidth }} bodyStyle={{ height, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.md }}>
          {status === "running" ? <View style={{ width: 16, alignItems: "center" }}><Marker /></View> : <Icon name={status === "paused" ? "pause" : status === "finished" ? "check" : "timer"} size={16} color={quiet ? color.inkSoft : color.ink} />}
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
    <View style={{ padding: space.lg, gap: space.md }}>
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
      <DockSound />
      <Divider />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Button title="Focus" size="small" variant="ghost" icon="focus" testID="dock-go-focus" onPress={focus} />
        <Button title="Timer" size="small" variant="ghost" icon="timer" testID="dock-go-timer" onPress={tool("timer")} />
      </View>
      <SessionNote />
    </View>
  );
}

export function TimerDock({ barReach }: { barReach: number | null }) {
  const { color, motion, space, surface } = useTheme();
  const session = useStudySession();
  const { active } = useSessionState();
  const status = session.status();
  const metrics = useDockMetrics();
  const { height, panelLeft, panelMaxHeight, panelOrigin, panelWidth, restLeft, restWidth, top } = metrics;
  const { boxShadow, ...plate } = surface("float", "lg");

  const [open, setOpen] = useState(false);
  // The panel mounts the first time it is needed and then stays mounted and hidden, because every mount costs native memory (R15).
  const [visited, setVisited] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const progress = useSharedValue(0);
  const glance = useRef<ViewHandle>(null);
  const panel = useRef<ViewHandle>(null);

  const show = () => { setVisited(true); setOpen(true); };
  const hide = () => setOpen(false);
  useDismiss(open, hide);
  useFocusTrap(panel, open);
  // After the trap has let go, whatever opened the panel: a key can open it from nowhere in particular, and focus must not end up there.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) moveFocus(glance.current);
    wasOpen.current = open;
  }, [open]);
  useDockKeys({ toggle: () => { if (open) hide(); else show(); }, pauseOrResume: () => { if (!session.pause()) session.resume(); } });
  useEffect(() => { progress.value = move(open ? 1 : 0, motion, "lift"); }, [open, motion, progress]);

  // Said once, when something happens, and never with the clock.
  const spoken = useRef(status);
  useEffect(() => {
    if (spoken.current === status) return;
    spoken.current = status;
    const words = ANNOUNCED[status];
    if (words) AccessibilityInfo.announceForAccessibility(words);
  }, [status]);

  // The Spaces bar is brief and belongs to that line, so where it reaches the dock, the dock steps aside until it closes.
  const covered = !open && barReach !== null && barReach + space.sm > restLeft;
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
      <Animated.View pointerEvents={open || covered ? "none" : "box-none"} aria-hidden={open || covered || undefined} importantForAccessibility={open || covered ? "no-hide-descendants" : "auto"} style={[surface("raised", "md"), { position: "absolute", top, left: restLeft, width: restWidth, height }, resting]}>
        <DockGlance open={open} onPress={show} pressRef={glance} />
        <Corners behind={color.ground} />
      </Animated.View>
      <Animated.View pointerEvents={open || covered ? "none" : "box-none"} aria-hidden={open || covered || undefined} style={[{ position: "absolute", top, left: restLeft + restWidth + space.sm }, resting]}>
        <DockSoundGlance size={height} />
      </Animated.View>
      {visited ? (
        <>
          {boxShadow && panelHeight ? <Animated.View pointerEvents="none" style={[{ position: "absolute", top, left: panelLeft, width: panelWidth, height: panelHeight, borderRadius: plate.borderRadius, boxShadow }, shadow]} /> : null}
          <Animated.View
            ref={panel as never}
            role="dialog"
            aria-label={active ? `Timer: ${active.title}` : "Timer"}
            testID="dock-panel"
            aria-hidden={!open || undefined}
            importantForAccessibility={open ? "auto" : "no-hide-descendants"}
            pointerEvents={open ? "auto" : "none"}
            onLayout={onPanelLayout}
            style={[plate, { position: "absolute", top, left: panelLeft, width: panelWidth, maxHeight: panelMaxHeight, overflow: "hidden", transformOrigin: `${Math.round(panelOrigin * 100)}% 0%` }, open ? null : hiddenOnWeb, grown]}
          >
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} overScrollMode="never" bounces={false} style={{ flexGrow: 0, flexShrink: 1 }}>
              <Animated.View style={content}><DockPanel open={open} onClose={hide} onGo={(go) => { hide(); go(); }} /></Animated.View>
            </ScrollView>
            <Corners behind={color.ground} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}
