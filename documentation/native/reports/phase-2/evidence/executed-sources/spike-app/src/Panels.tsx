// Workspace window-manager prototype: floating, draggable, resizable, focusable panels plus a split divider.
import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing, cancelAnimation } from "react-native-reanimated";

type PanelSpec = { id: string; title: string; color: string };
const PANELS: PanelSpec[] = [
  { id: "notes", title: "Notes", color: "#e8eefc" },
  { id: "pdf", title: "Past paper (PDF)", color: "#fdf1e3" },
  { id: "sylvie", title: "Sylvie", color: "#eaf7ee" },
];

function Panel({ spec, index, z, onFocus, stress }: { spec: PanelSpec; index: number; z: number; onFocus: () => void; stress: boolean }) {
  const x = useSharedValue(40 + index * 180), y = useSharedValue(60 + index * 90);
  const w = useSharedValue(360), h = useSharedValue(280);
  const sx = useSharedValue(0), sy = useSharedValue(0);
  if (stress) { x.value = withRepeat(withTiming(400 + index * 60, { duration: 1400 + index * 300, easing: Easing.inOut(Easing.quad) }), -1, true); w.value = withRepeat(withTiming(520, { duration: 1700 }), -1, true); }
  else { cancelAnimation(x); cancelAnimation(w); }
  const move = Gesture.Pan().onBegin(() => { "worklet"; console.log("PANEL_BEGIN"); sx.value = x.value; sy.value = y.value; }).onUpdate((e) => { "worklet"; x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; }).runOnJS(false);
  const resize = Gesture.Pan().onBegin(() => { "worklet"; console.log("RESIZE_BEGIN"); sx.value = w.value; sy.value = h.value; }).onUpdate((e) => { "worklet"; w.value = Math.max(220, sx.value + e.translationX); h.value = Math.max(160, sy.value + e.translationY); });
  const tap = Gesture.Tap().runOnJS(true).onEnd(onFocus);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }], width: w.value, height: h.value }));
  return (
    <Animated.View style={[styles.panel, { backgroundColor: spec.color, zIndex: z }, style]}>
      <GestureDetector gesture={Gesture.Simultaneous(move, tap)}>
        <View style={styles.header}><Text style={styles.title}>{spec.title}</Text></View>
      </GestureDetector>
      <View style={styles.body}>{Array.from({ length: 12 }, (_, i) => <Text key={i} style={styles.line}>Line {i + 1} — panel content placeholder</Text>)}</View>
      <GestureDetector gesture={resize}><View style={styles.grip} /></GestureDetector>
    </Animated.View>
  );
}

export function Panels({ stress }: { stress: boolean }) {
  const [order, setOrder] = useState(PANELS.map((p) => p.id));
  const { width } = useWindowDimensions();
  const split = useSharedValue(width * 0.5); const s0 = useSharedValue(0);
  const divider = Gesture.Pan().onBegin(() => { "worklet"; s0.value = split.value; }).onUpdate((e) => { "worklet"; split.value = Math.min(width - 160, Math.max(160, s0.value + e.translationX)); });
  const left = useAnimatedStyle(() => ({ width: split.value }));
  return (
    <View style={styles.fill}>
      <View style={styles.splitRow}>
        <Animated.View style={[styles.splitPane, { backgroundColor: "#f4f4f6" }, left]}><Text style={styles.title}>Split: canvas A</Text></Animated.View>
        <GestureDetector gesture={divider}><View style={styles.divider} /></GestureDetector>
        <View style={[styles.splitPane, { flex: 1, backgroundColor: "#f8f6f2" }]}><Text style={styles.title}>Split: canvas B</Text></View>
      </View>
      {PANELS.map((p, i) => <Panel key={p.id} spec={p} index={i} z={10 + order.indexOf(p.id)} stress={stress} onFocus={() => setOrder((o) => [...o.filter((id) => id !== p.id), p.id])} />)}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, splitRow: { ...StyleSheet.absoluteFillObject, flexDirection: "row" }, splitPane: { padding: 16 },
  divider: { width: 14, backgroundColor: "#d6d6dc" },
  panel: { position: "absolute", left: 0, top: 0, borderRadius: 14, overflow: "hidden", elevation: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12 },
  header: { height: 40, justifyContent: "center", paddingHorizontal: 12, backgroundColor: "rgba(0,0,0,0.06)" }, title: { fontWeight: "600", color: "#222" },
  body: { padding: 12, gap: 4 }, line: { fontSize: 12, color: "#444" },
  grip: { position: "absolute", right: 0, bottom: 0, width: 36, height: 36, backgroundColor: "rgba(0,0,0,0.12)", borderTopLeftRadius: 12 },
});
