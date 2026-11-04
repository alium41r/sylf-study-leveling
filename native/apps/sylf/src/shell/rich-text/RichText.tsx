// Draws Sylvie's replies. Everything is drawn as Text: nothing the model wrote is run, and a link opens only when it is http(s) and the person taps it.
// Maths shows as its source in a code face until a typesetter is wired in (Expo DOM, loaded only when `hasMath`), which is the one planned upgrade.
import { Linking, ScrollView, View } from "react-native";
import { Text, useTheme } from "@sylf/design-system";
import { parseRichText, type Block, type Span } from "./parse";

function Spans({ spans, variant = "small" }: { spans: Span[]; variant?: "small" | "body" }) {
  const { color } = useTheme();
  return (
    <Text variant={variant}>
      {spans.map((span, index) => {
        switch (span.kind) {
          case "bold": return <Text key={index} variant={variant} style={{ fontWeight: "700" }}>{span.text}</Text>;
          case "italic": return <Text key={index} variant={variant} style={{ fontStyle: "italic" }}>{span.text}</Text>;
          case "code": case "math": return <Text key={index} variant={variant} style={{ fontFamily: "monospace", backgroundColor: color.sunken }}>{span.text}</Text>;
          case "link": return <Text key={index} variant={variant} accessibilityRole="link" style={{ textDecorationLine: "underline", color: color.accent.ink }} onPress={() => void Linking.openURL(span.href)}>{span.text}</Text>;
          default: return span.text;
        }
      })}
    </Text>
  );
}

function BlockView({ block }: { block: Block }) {
  const { color, shape, space } = useTheme();
  switch (block.kind) {
    case "heading": return <Text variant={block.level === 1 ? "heading" : "subheading"} role="heading" aria-level={block.level + 1}>{block.spans.map((span) => span.text).join("")}</Text>;
    case "list": return <View style={{ gap: space.xs }}>{block.items.map((item, index) => <View key={index} style={{ flexDirection: "row", gap: space.sm }}><Text variant="small" tone="soft">{block.ordered ? `${index + 1}.` : "•"}</Text><View style={{ flex: 1 }}><Spans spans={item} /></View></View>)}</View>;
    case "code": case "math": return <ScrollView horizontal style={{ backgroundColor: color.sunken, borderRadius: shape.radius.sm }} contentContainerStyle={{ padding: space.sm }}><Text variant="small" style={{ fontFamily: "monospace" }}>{block.text}</Text></ScrollView>;
    case "quote": return <View style={{ borderLeftWidth: 2, borderLeftColor: color.line, paddingLeft: space.sm }}><Spans spans={block.spans} /></View>;
    case "table": return (
      <ScrollView horizontal><View style={{ borderWidth: 1, borderColor: color.line, borderRadius: shape.radius.sm }}>
        {[block.header, ...block.rows].map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: "row", borderTopWidth: rowIndex ? 1 : 0, borderTopColor: color.line }}>{row.map((cell, cellIndex) => <View key={cellIndex} style={{ minWidth: 88, padding: space.sm }}>{rowIndex === 0 ? <Text variant="small" style={{ fontWeight: "700" }}>{cell.map((span) => span.text).join("")}</Text> : <Spans spans={cell} />}</View>)}</View>)}
      </View></ScrollView>
    );
    default: return <Spans spans={block.spans} />;
  }
}

export function RichText({ text, testID }: { text: string; testID?: string }) {
  const { space } = useTheme();
  return <View style={{ gap: space.sm }} testID={testID}>{parseRichText(text).map((block, index) => <BlockView key={index} block={block} />)}</View>;
}
