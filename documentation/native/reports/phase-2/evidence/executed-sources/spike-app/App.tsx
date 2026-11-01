// Sylf Native Phase 2 feasibility spike. Disposable; not application code.
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, Platform, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Y from "yjs";
import { InkSkia } from "./src/InkSkia";
import { Panels } from "./src/Panels";
import { runEngineTests } from "./src/engineTests";
import { startWriter, verify, reset } from "./src/sqliteTest";
import { GEOMETRY_PDF_BASE64, PDFJS_PREDICTIONS } from "./src/geometryPdf";
import { U0_BASE64 } from "./src/richtextSeed";
import RichTextDom from "./src/RichTextDom";

const native = Platform.OS === "android" ? require("./modules/sylf-native-probe/src") : null;
const SCREENS = ["engine", "ink-js", "ink-native", "panels", "panels-stress", "richtext", "pdf", "sqlite"] as const;
type Screen = (typeof SCREENS)[number];
const appStart = Date.now();

function parse(url: string | null): { screen?: Screen; mode?: string } {
  if (!url) return {}; const m = /(?:sylfspike:\/\/screen\/|[#?&]screen=)([\w-]+)(?:[?&]mode=(\w+))?/.exec(url);
  return m ? { screen: m[1] as Screen, mode: m[2] } : {};
}
const b64dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export default function App() {
  const [screen, setScreen] = useState<Screen>("engine");
  const [mode, setMode] = useState<string | undefined>();
  const [log, setLog] = useState<string[]>([]);
  const dims = useWindowDimensions();
  const add = (s: string) => setLog((l) => [s, ...l].slice(0, 40));
  const hostDoc = useRef<Y.Doc | null>(null);
  const bridge = useRef({ updates: 0, bytes: 0, applyMs: 0 });

  useEffect(() => {
    console.log(`SPIKE_READY ${Date.now() - appStart}ms window=${dims.width}x${dims.height} scale=${dims.scale}`);
    Linking.getInitialURL().then((u) => { const p = parse(u); if (p.screen) { setScreen(p.screen); setMode(p.mode); } });
    const sub = Linking.addEventListener("url", ({ url }) => { const p = parse(url); if (p.screen) { setScreen(p.screen); setMode(p.mode); } });
    return () => sub.remove();
  }, []);
  // Report every window-size change (split screen, pop-up view, rotation, DeX) for multitasking tests.
  useEffect(() => { console.log(`WINDOW ${dims.width}x${dims.height} fontScale=${dims.fontScale}`); }, [dims.width, dims.height]);

  useEffect(() => {
    if (screen === "engine") {
      const r = runEngineTests(); console.log("ENGINE " + JSON.stringify(r));
      if (native) { try { console.log("DEVICE " + JSON.stringify(native.SylfNativeProbe.deviceInfo())); } catch (e) { console.log("DEVICE_ERROR " + String(e)); } }
      setLog(r.results.map((x) => `${x.ok ? "OK " : "ERR"} ${x.name}: ${JSON.stringify(x.ok ? x.value : x.error)} (${x.ms}ms)`));
    }
    if (screen === "pdf" && native) {
      native.SylfNativeProbe.pdfMarkers(GEOMETRY_PDF_BASE64).then((pages: any[]) => {
        const rows = pages.map((p, i) => { const pr = PDFJS_PREDICTIONS[i].pdfjs; const err = Math.hypot(p.marker[0] - pr.marker[0], p.marker[1] - pr.marker[1]); return { id: PDFJS_PREDICTIONS[i].id, android: [p.width, p.height], pdfjs: [pr.width, pr.height], androidMarker: p.marker.map((v: number) => +v.toFixed(2)), pdfjsMarker: pr.marker.map((v: number) => +v.toFixed(2)), errorPx: +err.toFixed(2) }; });
        console.log("PDF " + JSON.stringify(rows)); setLog(rows.map((r) => JSON.stringify(r)));
      }, (e: Error) => add("PDF error " + e.message));
    }
    if (screen === "sqlite") {
      if (mode === "verify") { const v = verify(); setLog([JSON.stringify(v)]); }
      else if (mode === "reset") { reset(); setLog(["reset"]); }
      else if (mode === "write") return startWriter(add);
    }
    if (screen === "richtext") { const d = new Y.Doc(); Y.applyUpdate(d, b64dec(U0_BASE64)); hostDoc.current = d; bridge.current = { updates: 0, bytes: 0, applyMs: 0 }; }
  }, [screen, mode]);

  const onUpdate = async (b64: string) => {
    const u = b64dec(b64); const t0 = performance.now(); if (hostDoc.current) Y.applyUpdate(hostDoc.current, u, "webview");
    const b = bridge.current; b.updates++; b.bytes += u.length; b.applyMs += performance.now() - t0;
    if (b.updates % 100 === 0) { const s = `RICHTEXT_BRIDGE updates=${b.updates} bytes=${b.bytes} hostApplyMsTotal=${b.applyMs.toFixed(2)} hostChars=${hostDoc.current?.getXmlFragment("body").toString().length}`; console.log(s); add(s); }
  };
  const onReport = async (json: string) => { console.log("RICHTEXT_DOM " + json + ` sinceAppStartMs=${Date.now() - appStart}`); add(json); };

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.tabs}>
        {SCREENS.map((s) => <Pressable key={s} onPress={() => { setScreen(s); setMode(undefined); }} style={[styles.tab, s === screen && styles.tabOn]}><Text style={styles.tabText}>{s}</Text></Pressable>)}
        {screen === "sqlite" && ["write", "verify", "reset"].map((m) => <Pressable key={m} onPress={() => setMode(m)} style={styles.tab}><Text style={styles.tabText}>{m}</Text></Pressable>)}
      </View>
      <View style={styles.fill}>
        {screen === "ink-js" && <InkSkia stylusOnly />}
        {screen === "ink-native" && native && <native.NativeInkView style={styles.fill} stylusOnly onStats={(e: any) => { const s = JSON.stringify(e.nativeEvent); console.log("INKNATIVE " + s); add(s); }} />}
        {(screen === "panels" || screen === "panels-stress") && <Panels stress={screen === "panels-stress"} />}
        {screen === "richtext" && <View style={styles.fill}><RichTextDom seed={U0_BASE64} onUpdate={onUpdate} onReport={onReport} dom={{ style: { flex: 1 } }} /></View>}
        {(screen === "engine" || screen === "pdf" || screen === "sqlite" || screen === "richtext") && (
          <ScrollView style={screen === "richtext" ? styles.logSmall : styles.fill} contentContainerStyle={{ padding: 12 }}>{log.map((l, i) => <Text key={i} style={styles.log}>{l}</Text>)}</ScrollView>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" }, fill: { flex: 1 },
  tabs: { flexDirection: "row", flexWrap: "wrap", paddingTop: 28, paddingHorizontal: 8, gap: 6, backgroundColor: "#f1f1f4" },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#e2e2e8", marginBottom: 6 }, tabOn: { backgroundColor: "#c9c3f5" }, tabText: { fontSize: 13 },
  log: { fontFamily: Platform.select({ android: "monospace", default: "Menlo" }), fontSize: 11, color: "#333", marginBottom: 4 }, logSmall: { maxHeight: 160 },
});
