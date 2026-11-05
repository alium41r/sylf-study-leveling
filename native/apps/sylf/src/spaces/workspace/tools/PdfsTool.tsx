// PDFs: imported into the Notes library as PDF study documents (sylf-pdf/1), read and annotated with ink and highlighter.
import DocumentTool from "../notes/DocumentTool";
import type { ToolProps } from "./shared";

export default function PdfsTool(props: ToolProps) {
  return <DocumentTool {...props} kinds={["pdf"]} primary="pdf" />;
}
