// Whiteboard is a Notes drawing document, not a second kind of file: one large sylf-ink/1 page seen through a camera.
import DocumentTool from "../notes/DocumentTool";
import type { ToolProps } from "./shared";

export default function WhiteboardTool(props: ToolProps) {
  return <DocumentTool {...props} kinds={["board"]} primary="board" />;
}
