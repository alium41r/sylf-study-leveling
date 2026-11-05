// Holds the Command Center and the row of minimized windows. In Focus it steps out of the way (master plan §3.3): it slides below
// the edge, a small handle stays, and a hover, a press or keyboard focus brings it back. Pen strokes near the edge never reveal it,
// because only a press on the handle does.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { Icon, Press, Text, getInputMode, move, useTheme } from "@sylf/design-system";
import { setChromeRevealed } from "./chrome-reveal";
import { minimizedWindows, windowTitle, type WorkspaceModel, type WorkspaceState } from "@sylf/spaces";
import { TOOL_ICONS } from "./icons";

const LINGER_MS = 1800;

function MinimizedRow({ state, model }: { state: WorkspaceState; model: WorkspaceModel }) {
  const { color, shape, space, surface } = useTheme();
  const list = minimizedWindows(state);
  if (!list.length) return null;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} overScrollMode="never" testID="workspace-minimized" role="list" aria-label="Minimized windows" style={{ flexGrow: 0, maxWidth: "100%" }} contentContainerStyle={{ gap: space.xs, paddingVertical: 2, paddingHorizontal: 2 }}>
      {list.map((window) => {
        const title = windowTitle(state, window);
        return (
          <Press key={window.id} testID={`minimized-${window.id}`} label={`Restore ${title}`} radius={shape.radius.md} height={32} onPress={() => model.restore(window.id)} style={surface("raised", "md")} bodyStyle={{ height: 32, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, maxWidth: 200 }}>
            <Icon name={TOOL_ICONS[window.tool]} size={15} color={color.inkSoft} />
            <Text variant="caption" tone="soft" numberOfLines={1}>{title}</Text>
          </Press>
        );
      })}
    </ScrollView>
  );
}

export function DockShelf({ state, model, tuckable, bottom, sides, children }: { state: WorkspaceState; model: WorkspaceModel; tuckable: boolean; bottom: number; sides: { left: number; right: number }; children: ReactNode }) {
  const { color, motion, space, surface } = useTheme();
  const [revealed, setRevealed] = useState(false);
  const away = useSharedValue(tuckable ? 1 : 0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tucked = tuckable && !revealed;

  useEffect(() => { away.value = move(tucked ? 1 : 0, motion, "glide"); }, [tucked, away, motion]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setRevealed(false); }, [tuckable]);
  useEffect(() => { setChromeRevealed(tuckable && revealed); return () => setChromeRevealed(false); }, [tuckable, revealed]);

  const reveal = useCallback(() => { clearTimeout(timer.current); setRevealed(true); }, []);
  const linger = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => setRevealed(false), LINGER_MS); }, []);
  const animated = useAnimatedStyle(() => ({ opacity: 1 - away.value * 0.999, transform: [{ translateY: away.value * 160 }] }));
  // Focus only reveals for a keyboard: a closing menu hands focus back here, and that must not undo choosing Focus.
  const web = Platform.OS === "web" ? { onFocus: () => { if (getInputMode() === "keyboard") reveal(); }, onBlur: linger, onMouseEnter: reveal, onMouseLeave: linger } : {};

  return (
    <>
      {/* On a touch screen nothing "leaves" the dock, so a tap anywhere else tucks it and the chrome away again. */}
      {tuckable && revealed && Platform.OS !== "web" ? <Pressable aria-hidden accessible={false} onPress={() => setRevealed(false)} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
      {tucked ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44, alignItems: "center", justifyContent: "flex-end" }}>
          {/* A labelled pull-up, not a bare line: people looking for their tools could not find the old handle (owner, Phase 14). */}
          <Pressable testID="dock-reveal" role="button" aria-label="Show the Command Center" onPress={reveal} onHoverIn={reveal} style={{ height: 44, alignItems: "center", justifyContent: "flex-end", paddingBottom: Math.max(4, bottom - 8) }}>
            <View style={[surface("float", "full"), { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 30, opacity: 0.92 }]}>
              <Icon name="chevronUp" size={14} color={color.inkSoft} />
              <Text variant="caption" tone="soft">Tools</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
      {/* The band is as wide as the canvas and only its children are controls, so a window beside them stays pressable. */}
      <Animated.View {...web as object} pointerEvents="box-none" aria-hidden={tucked || undefined} importantForAccessibility={tucked ? "no-hide-descendants" : "auto"} style={[{ position: "absolute", left: sides.left, right: sides.right, bottom, alignItems: "center", gap: space.xs }, animated]}>
        <MinimizedRow state={state} model={model} />
        {children}
      </Animated.View>
    </>
  );
}
