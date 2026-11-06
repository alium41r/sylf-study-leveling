// What every ink surface receives. One page and one camera: a paged document gives each page a view of itself, and a whiteboard
// gives its one page a view that pans and zooms. The surface writes to the scene and keeps no strokes of its own.
import type { InkScene, InkTool, ShapeKind } from "@sylf/notes";

export interface InkCamera { x: number; y: number; zoom: number }
export interface InkToolState { tool: InkTool; color: string; width: number; shape: ShapeKind; eraser: "stroke" | "precise"; penOnly: boolean }
export const DEFAULT_TOOL: InkToolState = { tool: "pen", color: "#1f2a44", width: 2.6, shape: "rectangle", eraser: "stroke", penOnly: false };

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

/** Eraser radius in page units for a given pen width. */
export const eraserRadius = (tool: InkToolState) => Math.max(6, tool.width * 3);
