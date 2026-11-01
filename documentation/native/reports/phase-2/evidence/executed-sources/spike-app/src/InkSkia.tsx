// JS-path ink: Gesture Handler stylus events -> UI-thread Skia live path -> perfect-freehand outline on finish.
import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { Gesture, GestureDetector, PointerType } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { getStroke } from "perfect-freehand";

type Sample = [number, number, number, number, number, number, number, number];
function outlinePath(points: Sample[]): SkPath {
  const o = getStroke(points.map((p) => [p[0], p[1], p[2]]), { size: 6, thinning: 0.45, smoothing: 0.65, streamline: 0.221, simulatePressure: false, last: true });
  const b = Skia.PathBuilder.Make();
  if (o.length) { b.moveTo(o[0][0], o[0][1]); for (let i = 1; i < o.length; i++) b.lineTo(o[i][0], o[i][1]); b.close(); }
  return b.detach();
}

export function InkSkia({ stylusOnly }: { stylusOnly: boolean }) {
  const live = useSharedValue<number[]>([]);
  const t0 = useSharedValue(0);
  const [strokes, setStrokes] = useState<SkPath[]>([]);
  const [stats, setStats] = useState("Write with the S Pen");
  const window = useRef({ start: Date.now(), events: 0, pMin: 1, pMax: 0, tiltMax: 0, ignored: 0, types: {} as Record<string, number>, lastStroke: 0, finishMs: 0 });

  const record = useCallback((kind: number, pressure: number, tilt: number, ignored: boolean) => {
    const w = window.current; w.events++; w.types[String(kind)] = (w.types[String(kind)] || 0) + 1;
    if (ignored) w.ignored++; else { w.pMin = Math.min(w.pMin, pressure); w.pMax = Math.max(w.pMax, pressure); w.tiltMax = Math.max(w.tiltMax, tilt); }
    const secs = (Date.now() - w.start) / 1000;
    if (secs >= 1) {
      const s = { engine: "rngh+skia", eventsPerSecond: +(w.events / secs).toFixed(1), pressureMin: +w.pMin.toFixed(3), pressureMax: +w.pMax.toFixed(3), tiltMaxDeg: +w.tiltMax.toFixed(1), ignoredNonStylus: w.ignored, pointerTypes: w.types, lastStrokeSamples: w.lastStroke, finishMs: w.finishMs };
      console.log("INKJS " + JSON.stringify(s)); setStats(JSON.stringify(s));
      Object.assign(w, { start: Date.now(), events: 0, pMin: 1, pMax: 0, tiltMax: 0, ignored: 0, types: {} });
    }
  }, []);
  const finish = useCallback((flat: number[]) => {
    const pts: Sample[] = []; for (let i = 0; i < flat.length; i += 8) pts.push(flat.slice(i, i + 8) as Sample);
    const s = Date.now(); const path = outlinePath(pts); window.current.finishMs = Date.now() - s; window.current.lastStroke = pts.length;
    setStrokes((prev) => [...prev, path]); console.log(`INKFINISH samples=${pts.length} outlineMs=${window.current.finishMs}`);
  }, []);

  const pan = Gesture.Pan().minDistance(0).maxPointers(1)
    .onBegin((e) => { "worklet"; t0.value = Date.now(); live.value = []; })
    .onUpdate((e) => {
      "worklet";
      const stylus = e.pointerType === PointerType.STYLUS;
      const ignored = stylusOnly && !stylus;
      const pressure = e.stylusData?.pressure ?? 0.5; const tx = e.stylusData?.tiltX ?? 0; const ty = e.stylusData?.tiltY ?? 0;
      scheduleOnRN(record, e.pointerType, pressure, Math.max(Math.abs(tx), Math.abs(ty)), ignored);
      if (ignored) return;
      live.value = [...live.value, e.x, e.y, pressure, Date.now() - t0.value, tx, ty, 0, 0];
    })
    .onEnd(() => { "worklet"; console.log("INK_END " + live.value.length); })
    .onFinalize(() => { "worklet"; console.log("INK_FINALIZE " + live.value.length); if (live.value.length) scheduleOnRN(finish, live.value); live.value = []; });

  const livePath = useDerivedValue(() => {
    const b = Skia.PathBuilder.Make(); const v = live.value;
    if (v.length >= 8) { b.moveTo(v[0], v[1]); for (let i = 8; i < v.length; i += 8) b.lineTo(v[i], v[i + 1]); }
    return b.detach();
  });

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={pan}>
        <Canvas style={styles.fill}>
          {strokes.map((p, i) => <Path key={i} path={p} color="#222" />)}
          <Path path={livePath} color="#222" style="stroke" strokeWidth={4} strokeCap="round" strokeJoin="round" />
        </Canvas>
      </GestureDetector>
      <Text style={styles.stats}>{stats}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: "#fffdf7" }, stats: { position: "absolute", bottom: 8, left: 8, right: 8, fontSize: 11, color: "#555" } });
