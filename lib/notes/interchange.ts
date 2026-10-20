import * as Y from "yjs";
import type { DocumentDescriptor } from "./contracts";
import { NotesError } from "./errors";

/** Sylf's editor-independent readable tree. Native updates remain the authoritative merge history. */
export function projectStream(
  doc: Y.Doc,
  stream: DocumentDescriptor["streams"][number]
): unknown {
  const spec =
    stream.projection ??
    (stream.adapter === "blocknote/0.56.0"
      ? { root: "body", type: "xml" as const }
      : undefined);
  if (!spec)
    return {
      format: "sylf-interchange",
      version: 1,
      kind: "opaque",
      codec: stream.codec,
      adapter: stream.adapter,
    };
  let nodes = 0;
  const xml = (node: Y.XmlElement | Y.XmlText, depth = 0): unknown => {
    if (++nodes > 100000 || depth > 48)
      throw new NotesError(
        "LIMIT",
        "Readable projection exceeds its bounds; use native-only recovery export."
      );
    return node instanceof Y.XmlText
      ? { kind: "text", spans: node.toDelta() }
      : {
          kind: "element",
          name: node.nodeName,
          attributes: node.getAttributes(),
          children: node
            .toArray()
            .map((child) => xml(child as Y.XmlElement | Y.XmlText, depth + 1)),
        };
  };
  const content =
    spec.type === "xml"
      ? doc
          .getXmlFragment(spec.root)
          .toArray()
          .map((node) => xml(node as Y.XmlElement | Y.XmlText))
      : spec.type === "text"
        ? doc.getText(spec.root).toDelta()
        : spec.type === "map"
          ? doc.getMap(spec.root).toJSON()
          : doc.getArray(spec.root).toJSON();
  // Yjs XML marks can retain an `undefined` attribute after formatting is removed.
  // Apply JSON's absent-property convention to this derived readable projection
  // only. The archive separately preserves every original native byte/history.
  const readable = JSON.parse(JSON.stringify(content));
  return {
    format: "sylf-interchange",
    version: 1,
    kind: spec.type,
    content: readable,
  };
}
