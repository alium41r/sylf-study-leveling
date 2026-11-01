// A bare reproduction for risk R15: native memory that grows with every mount. It uses React Native and nothing of Sylf's, with
// no design system, Reanimated or gesture handler in the tree, and mounts and unmounts plain elements on a steady beat. If native
// heap climbs here, the cause is in the stack. If it does not, the cause is in how Sylf uses it. It reaches the device two ways:
// EXPO_PUBLIC_SYLF_R15=1 at build time replaces the app's entry, which is the bare case, and the development link ?r15=views
// runs the same probe inside the full app for comparison. tooling/checks/android-r15-check.mjs drives and samples it.
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

export type R15Scenario = "views" | "text" | "pressable" | "idle";
const SCENARIOS: R15Scenario[] = ["views", "text", "pressable", "idle"];
const COUNT = 300;
const BEAT_MS = 250;

const Block = ({ index }: { index: number }) => <View style={[styles.block, { opacity: 0.4 + (index % 6) / 10 }]} />;
const Label = ({ index }: { index: number }) => <Text style={styles.label}>Item {index}</Text>;
const Tap = ({ index }: { index: number }) => <Pressable accessibilityLabel={`Item ${index}`} style={styles.block} />;
const ELEMENTS = { views: Block, text: Label, pressable: Tap, idle: () => null };

export function readScenario(url: string | null | undefined): R15Scenario {
  const value = url ? /[?&]r15=([a-z]+)/.exec(url)?.[1] : null;
  return SCENARIOS.includes(value as R15Scenario) ? (value as R15Scenario) : "views";
}

/** `cycles` is how many mount and unmount pairs have run. Each pair is logged, so a check can wait for a count. */
export default function R15Probe({ initial }: { initial?: R15Scenario }) {
  const [scenario, setScenario] = useState<R15Scenario>(initial ?? "views");
  const [mounted, setMounted] = useState(false);
  const [cycles, setCycles] = useState(0);
  const Element = ELEMENTS[scenario];

  useEffect(() => {
    void Linking.getInitialURL().then((url) => { if (url) setScenario(readScenario(url)); });
    const link = Linking.addEventListener("url", (event) => { setCycles(0); setScenario(readScenario(event.url)); });
    return () => link.remove();
  }, []);
  useEffect(() => {
    const beat = setInterval(() => setMounted((value) => !value), BEAT_MS);
    return () => clearInterval(beat);
  }, []);
  useEffect(() => {
    if (mounted) return;
    setCycles((value) => value + 1);
  }, [mounted]);
  useEffect(() => { if (cycles % 50 === 0) console.log("SYLF_R15 " + JSON.stringify({ scenario, cycles, count: COUNT })); }, [cycles, scenario]);

  return (
    <View testID="r15-probe" style={styles.page}>
      <Text testID="r15-status" style={styles.status}>{scenario} {cycles}</Text>
      <View style={styles.grid}>{mounted ? Array.from({ length: COUNT }, (_, index) => <Element key={index} index={index} />) : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, backgroundColor: "#101018" },
  status: { color: "#e8e8f0", fontSize: 16, marginBottom: 12 },
  grid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 2 },
  block: { width: 18, height: 18, backgroundColor: "#6e5be6" },
  label: { color: "#e8e8f0", fontSize: 10 },
});
