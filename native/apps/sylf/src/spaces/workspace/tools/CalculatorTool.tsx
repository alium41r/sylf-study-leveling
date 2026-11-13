// The real Calculator: Sylf's own math engine, used in place through @sylf/shared, so results match the web app's. Each window
// keeps its own expression, angle mode and recent answers. This tool has no sample data and needs no backend.
import { useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { FocusRing, Press, Segmented, Text, useControlHeight, useInputFormat, useInputMode, useTheme } from "@sylf/design-system";
import { calculator } from "@sylf/shared";
import type { ToolProps } from "./shared";

type AngleMode = "DEG" | "RAD";
const KEYS = [["sin(", "cos(", "tan(", "√("], ["(", ")", "^", "÷"], ["7", "8", "9", "×"], ["4", "5", "6", "−"], ["1", "2", "3", "+"], ["0", ".", "π", "="]];
const INSERT: Record<string, string> = { "√(": "sqrt(", "÷": "/", "×": "*", "−": "-", "π": "pi" };
const NAMES: Record<string, string> = { "÷": "Divide", "×": "Multiply", "−": "Minus", "+": "Plus", "=": "Equals", "√(": "Square root", "^": "Power", "(": "Open bracket", ")": "Close bracket", ".": "Point", "π": "Pi" };
const HISTORY = 4;

export default function CalculatorTool({ window, patch }: ToolProps) {
  const { color, shape, space } = useTheme();
  const inputMode = useInputMode();
  const format = useInputFormat();
  const control = useControlHeight();
  const keyHeight = format === "touch" ? Math.max(control, 44) : Math.round(control * 0.82);
  const [focused, setFocused] = useState(false);
  const expression = typeof window.state.expression === "string" ? window.state.expression : "";
  const angle: AngleMode = window.state.angle === "RAD" ? "RAD" : "DEG";
  const ans = typeof window.state.ans === "number" ? window.state.ans : 0;
  const history = Array.isArray(window.state.history) ? window.state.history.map(String) : [];
  const preview = useMemo(() => (expression ? calculator.evaluateMath(expression, angle, ans) : null), [expression, angle, ans]);

  const equals = () => {
    if (!expression || !preview?.success) return;
    patch({ expression: preview.result, ans: preview.numericValue ?? 0, history: [`${expression} = ${preview.result}`, ...history].slice(0, HISTORY) });
  };
  const press = (key: string) => (key === "=" ? equals() : patch({ expression: expression + (INSERT[key] ?? key) }));
  const onKeyDown = (event: { key: string; preventDefault(): void; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Enter" || event.key === "=") { event.preventDefault(); equals(); }
    else if (event.key === "Backspace") { event.preventDefault(); patch({ expression: expression.slice(0, -1) }); }
    else if (event.key === "Delete") { event.preventDefault(); patch({ expression: "" }); }
    else if (/^[0-9.+\-*/^()]$/.test(event.key)) { event.preventDefault(); patch({ expression: expression + event.key }); }
  };

  return (
    <View testID={`calculator-${window.id}`} {...(Platform.OS === "web" ? { onKeyDown, tabIndex: 0, onFocus: () => setFocused(true), onBlur: () => setFocused(false) } as object : {})} style={[{ flex: 1 }, Platform.select({ web: { outlineStyle: "none" } as object, default: {} })]}>
      {focused && inputMode === "keyboard" ? <FocusRing radius={shape.radius.sm} inset={4} /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 560, alignSelf: "center", justifyContent: "center", padding: space.sm, gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Segmented label="Angle unit" value={angle} onChange={(next) => patch({ angle: next })} options={[{ value: "DEG", label: "Deg" }, { value: "RAD", label: "Rad" }]} />
        <Press label="Clear" radius={shape.radius.sm} height={32} onPress={() => patch({ expression: "" })} bodyStyle={{ paddingHorizontal: space.md, height: 32, justifyContent: "center" }}><Text variant="small" tone="soft">Clear</Text></Press>
      </View>
      {history.length ? <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, maxHeight: 56 }} showsVerticalScrollIndicator={false}>
        {history.slice().reverse().map((line, index) => <Text key={`${line}${index}`} variant="micro" tone="soft" align="right" numberOfLines={1}>{line}</Text>)}
      </ScrollView> : null}
      <View accessible aria-label={`Expression ${expression || "empty"}. Result ${preview?.result ?? "none"}`} style={{ minHeight: space.xxl, justifyContent: "flex-end", alignItems: "flex-end", gap: space.hair }}>
        <Text variant="readout" numberOfLines={1} ellipsizeMode="head" testID={`calculator-expression-${window.id}`}>{expression || "0"}</Text>
        <Text variant="small" tone={preview && !preview.success ? "critical" : "soft"} numberOfLines={1} testID={`calculator-result-${window.id}`}>{preview ? preview.result : " "}</Text>
      </View>
      <View style={{ flexGrow: 1, minHeight: KEYS.length * keyHeight + (KEYS.length - 1) * space.xs, maxHeight: 440, gap: space.xs }}>
        {KEYS.map((row) => (
          <View key={row[0]} style={{ flex: 1, flexDirection: "row", gap: space.xs }}>
            {row.map((key) => (
              <Press key={key} testID={`calc-key-${key}`} label={NAMES[key] ?? key.replace("(", "")} radius={shape.radius.sm} onPress={() => press(key)} style={{ flex: 1 }} bodyStyle={{ flex: 1, minHeight: keyHeight, alignItems: "center", justifyContent: "center", backgroundColor: key === "=" ? color.emphasis.fill : color.selected }}>
                <Text variant="small" numberOfLines={1} style={key === "=" ? { color: color.emphasis.on } : undefined}>{key.replace("(", key.length > 2 ? "" : "(")}</Text>
              </Press>
            ))}
          </View>
        ))}
      </View>
      </ScrollView>
    </View>
  );
}
