// Notes: typed notes and handwriting from the one Notes library, local first. Each window shows its own document, so two Notes
// windows can be two notes, or the same note twice, kept in step.
import DocumentTool from "../notes/DocumentTool";
import type { ToolProps } from "./shared";

export default function NotesTool(props: ToolProps) {
  return <DocumentTool {...props} kinds={["note", "handwriting"]} primary="note" />;
}
