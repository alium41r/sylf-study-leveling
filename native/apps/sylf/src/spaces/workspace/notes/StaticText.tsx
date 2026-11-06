// A page's typed text, drawn natively from its blocknote/0.56.0 Yjs fragment, for every page that is not being typed on. It reads
// the fragment and never writes it: only BlockNote writes BlockNote (Phase 2 §5.2). Metrics match the editor's (TEXT_LOOK), so a page
// does not jump when its editor takes over.
import { memo, useEffect, useState, type ReactNode } from "react";
import { Image, Text as RNText, View } from "react-native";
import * as Y from "yjs";

export interface TextLook { size: number; line: number; ink: string; soft: string; font?: string }
export const BODY = 16;
export const lineFor = (spacing: number | null) => spacing ?? Math.round(BODY * 1.6);
const HEADING = { 1: 1.7, 2: 1.32, 3: 1.12 } as Record<number, number>;

type Mark = Record<string, unknown>;
interface Run { text: string; marks: Mark }
interface Block { id: string; type: string; props: Record<string, unknown>; runs: Run[]; children: Block[] }

function runsOf(element: Y.XmlElement): Run[] {
  const runs: Run[] = [];
  for (const child of element.toArray()) {
    if (child instanceof Y.XmlText) for (const op of child.toDelta() as { insert: unknown; attributes?: Mark }[]) { if (typeof op.insert === "string") runs.push({ text: op.insert, marks: op.attributes ?? {} }); }
    else if (child instanceof Y.XmlElement) runs.push(...runsOf(child));
  }
  return runs;
}

/** blockGroup > blockContainer > (content element, blockGroup?) */
export function readBlocks(fragment: Y.XmlFragment | Y.XmlElement): Block[] {
  const blocks: Block[] = [];
  for (const node of fragment.toArray()) {
    if (!(node instanceof Y.XmlElement)) continue;
    if (node.nodeName === "blockGroup") { blocks.push(...readBlocks(node)); continue; }
    if (node.nodeName !== "blockContainer") continue;
    const [content, group] = node.toArray().filter((n): n is Y.XmlElement => n instanceof Y.XmlElement);
    if (!content) continue;
    blocks.push({ id: String(node.getAttribute("id") ?? blocks.length), type: content.nodeName, props: content.getAttributes() as Record<string, unknown>, runs: runsOf(content), children: group ? readBlocks(group) : [] });
  }
  return blocks;
}

/** Whether a page has any typed text or picture on it. */
export function hasText(doc: Y.Doc) {
  const walk = (blocks: Block[]): boolean => blocks.some((b) => b.runs.some((r) => r.text.trim()) || b.type === "image" || walk(b.children));
  return walk(readBlocks(doc.getXmlFragment("body")));
}

const HIGHLIGHT: Record<string, string> = { yellow: "#fbf3db", red: "#fbe4e4", green: "#ddedea", blue: "#ddebf1", purple: "#eae4f2", pink: "#f4dfeb", orange: "#f6e9d9", gray: "#ebeced", brown: "#e9e5e3" };

function Runs({ runs }: { runs: Run[] }) {
  return <>{runs.map((run, i) => {
    const m = run.marks;
    return <RNText key={i} style={{ fontWeight: m.bold ? "700" : undefined, fontStyle: m.italic ? "italic" : undefined, textDecorationLine: m.underline && m.strike ? "underline line-through" : m.underline ? "underline" : m.strike ? "line-through" : undefined, fontFamily: m.code ? "monospace" : undefined, backgroundColor: typeof m.backgroundColor === "object" ? HIGHLIGHT[String((m.backgroundColor as { stringValue?: string }).stringValue ?? "yellow")] ?? HIGHLIGHT.yellow : m.backgroundColor ? HIGHLIGHT[String(m.backgroundColor)] ?? HIGHLIGHT.yellow : undefined }}>{run.text}</RNText>;
  })}</>;
}

function BlockView({ block, look, index, depth }: { block: Block; look: TextLook; index: number; depth: number }): ReactNode {
  const level = Number(block.props.level ?? 1);
  const size = block.type === "heading" ? look.size * (HEADING[level] ?? 1) : look.size;
  const lineHeight = block.type === "heading" ? Math.max(look.line, size * 1.3) : look.line;
  // Grows beside a list marker, but never from a zero basis: `flex: 1` collapses a paragraph to no height on Android (the web forgives it).
  const text = <RNText style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", color: block.type === "quote" ? look.soft : look.ink, fontSize: size, lineHeight, fontWeight: block.type === "heading" ? "700" : "400", fontFamily: look.font }}><Runs runs={block.runs} />{block.runs.length ? null : " "}</RNText>;
  const marker = block.type === "bulletListItem" ? "•" : block.type === "numberedListItem" ? `${index + 1}.` : null;
  let body: ReactNode = text;
  if (marker) body = <View style={{ flexDirection: "row" }}><RNText style={{ width: 24, textAlign: "center", color: look.ink, fontSize: look.size, lineHeight }}>{marker}</RNText>{text}</View>;
  else if (block.type === "checkListItem") body = <View style={{ flexDirection: "row", alignItems: "flex-start" }}><View style={{ width: 12, height: 12, marginTop: (lineHeight - 12) / 2, marginLeft: 4, marginRight: 8, borderWidth: 1.5, borderColor: look.soft, borderRadius: 2, backgroundColor: block.props.checked ? look.soft : "transparent" }} /><View style={{ flex: 1, opacity: block.props.checked ? 0.6 : 1 }}>{text}</View></View>;
  else if (block.type === "quote") body = <View style={{ borderLeftWidth: 2, borderLeftColor: look.soft, paddingLeft: 16 }}>{text}</View>;
  else if (block.type === "codeBlock") body = <View style={{ backgroundColor: "#161616", borderRadius: 8, padding: 24 }}><RNText style={{ color: "#ffffff", fontFamily: "monospace", fontSize: look.size * 0.9 }}><Runs runs={block.runs} /></RNText></View>;
  else if (block.type === "image" && typeof block.props.url === "string" && block.props.url) {
    const width = Number(block.props.previewWidth) || 360;
    body = <Image source={{ uri: block.props.url }} style={{ width: Math.min(width, 640), height: Math.min(width, 640) * 0.66, borderRadius: 4 }} resizeMode="contain" />;
  } else if (block.type === "divider") body = <View style={{ height: 1, backgroundColor: look.soft, marginVertical: look.line / 2 - 1 }} />;
  return (
    <View style={{ paddingTop: block.type === "heading" ? 14 : 0 }}>
      {body}
      {block.children.length ? <View style={{ marginLeft: 24 }}>{block.children.map((child, i) => <BlockView key={child.id} block={child} look={look} index={i} depth={depth + 1} />)}</View> : null}
    </View>
  );
}

/** Lists number from the start of each run of numbered items, as BlockNote does. */
function numbered(blocks: Block[]) {
  let run = 0;
  return blocks.map((block) => { run = block.type === "numberedListItem" ? run + 1 : 0; return run - 1; });
}

export const StaticText = memo(function StaticText({ doc, look, width }: { doc: Y.Doc; look: TextLook; width: number }) {
  const [blocks, setBlocks] = useState(() => readBlocks(doc.getXmlFragment("body")));
  useEffect(() => {
    const fragment = doc.getXmlFragment("body");
    const update = () => setBlocks(readBlocks(fragment));
    update();
    fragment.observeDeep(update);
    return () => fragment.unobserveDeep(update);
  }, [doc]);
  const order = numbered(blocks);
  return <View style={{ width }} pointerEvents="none">{blocks.map((block, i) => <BlockView key={block.id} block={block} look={look} index={order[i]} depth={0} />)}</View>;
});
