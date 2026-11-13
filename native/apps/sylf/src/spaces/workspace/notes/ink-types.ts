// What every ink surface receives. One page and one camera: a paged document gives each page a view of itself, and a whiteboard
// gives its one page a view that pans and zooms. The surface writes to the scene and keeps no strokes of its own.
import { brushFor, type InkScene, type InkTool, type LineStyle, type ShapeKind } from "@sylf/notes";
import type { InkBrush } from "@sylf/shared";

export type Nib = NonNullable<InkBrush["nib"]>;
export interface InkCamera { x: number; y: number; zoom: number }
export interface InkToolState {
  tool: InkTool; color: string; width: number; shape: ShapeKind; eraser: "stroke" | "precise"; penOnly: boolean;
  /** The pen's kind, as sylf-ink/1 names it. */
  nib: Nib;
  /** Off: every stroke is the same width whatever the pen presses. */
  pressure: boolean;
  lineStyle: LineStyle;
  /** A nearly straight stroke becomes a straight line. */
  straighten: boolean;
  /** Holding the pen's side button erases. Off for a hand that presses it by accident. */
  buttonErases: boolean;
  /** The eraser's radius in page units, its own and not the pen's. */
  eraserSize: number;
}
export const DEFAULT_TOOL: InkToolState = { tool: "pen", color: "#1f2a44", width: 2.6, shape: "rectangle", eraser: "stroke", penOnly: false, nib: "ballpoint", pressure: true, lineStyle: "solid", straighten: false, buttonErases: true, eraserSize: 8 };
export const WIDTH_RANGE = { min: 0.6, max: 8, step: 0.2 } as const;
export const ERASER_RANGE = { min: 4, max: 40, step: 1 } as const;
/** Three sizes kept on the toolbar: a fine line, the everyday one and a bold one. */
export const QUICK_WIDTHS = [1.4, 2.6, 4.6] as const;
export const QUICK_ERASERS = [8, 16, 28] as const;

/** The brush a stroke is written with: one rule for the live stroke and the finished one, on every surface. */
export function brushOf(tool: InkToolState, input: InkBrush["input"]): InkBrush {
  const kind = tool.tool === "highlighter" ? "highlighter" : tool.tool === "shape" ? "shape" : "pen";
  return brushFor(kind, { color: tool.color, width: kind === "highlighter" ? Math.max(8, tool.width * 4) : tool.width, input, shape: tool.shape, nib: kind === "pen" ? tool.nib : undefined, pressure: tool.pressure, lineStyle: tool.lineStyle, straighten: tool.straighten });
}

export interface InkViewProps {
  scene: InkScene;
  pageWidth: number;
  pageHeight: number;
  /** The page point at the view's top-left corner, and pixels per page unit. */
  camera: InkCamera;
  width: number;
  height: number;
  tool: InkToolState;
  /** False over a PDF page, whose image is the paper. */
  drawPaper: boolean;
  /** Only the paper, under a page's text and pictures; the strokes are drawn by another view above them. */
  paperOnly?: boolean;
  editable: boolean;
  selection: string[];
  onSelection(ids: string[]): void;
  /** A finger on a pen-only page, or two fingers anywhere: the surface's owner moves the view. */
  onPan?(dx: number, dy: number): void;
  onPinch?(factor: number, x: number, y: number): void;
  /** Pages on a tablet: a pinch as it happens (scale since the fingers landed, at a point on the screen), previewed and then laid out once. */
  onPagePinch?(phase: "start" | "move" | "end", scale: number, x: number, y: number): void;
  /** On desktop: "all" when the wheel pans this surface (a whiteboard), "zoom" when only Control and the wheel zoom it. */
  wheel?: "all" | "zoom";
  /** A whiteboard: fingers move and zoom the view rather than scroll a page around it. */
  fingersMove?: boolean;
  /** A pen was seen: the owner may switch to pen-only, as tablets expect. */
  onPenSeen?(): void;
}

/** The eraser's radius in page units. */
export const eraserRadius = (tool: InkToolState) => Math.max(ERASER_RANGE.min, Math.min(ERASER_RANGE.max, tool.eraserSize));
