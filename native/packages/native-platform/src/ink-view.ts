// The native writing surface, when this build has one (Android since Phase 14). Loaded lazily so web and tests never touch it.
import type { ComponentType, Ref } from "react";
import { requireNativeView, requireOptionalNativeModule } from "expo";

export interface NativeInkEvents {
  onStroke(event: { nativeEvent: { kind: "draw" | "lasso" | "move"; samples: number[]; pointer: "pen" | "touch" | "mouse"; live: number } }): void;
  onErase(event: { nativeEvent: { points: number[]; pointer: string; phase?: "start" | "move" | "end" } }): void;
  onPan(event: { nativeEvent: { dx: number; dy: number } }): void;
  /** Boards: `factor` since the last event, at a point in the view. Pages: `phase` and `scale` since the fingers landed, at a point on the screen. */
  onPinch(event: { nativeEvent: { factor: number; x: number; y: number; phase?: "start" | "move" | "end"; scale?: number } }): void;
  onPenSeen(event: { nativeEvent: object }): void;
}
export interface NativeInkHandle {
  upsertStrokes(json: string): Promise<void>;
  removeStrokes(ids: string[]): Promise<void>;
  clearStrokes(): Promise<void>;
  dropLive(id: number): Promise<void>;
}
export interface NativeInkProps extends NativeInkEvents {
  ref?: Ref<NativeInkHandle>;
  style?: object;
  tool: string;
  penOnly: boolean;
  fingerGestures: boolean;
  /** Pages: two fingers zoom while one scrolls. */
  pinchZoom?: boolean;
  /** The brush's thinning, so the live width follows pressure as the finished outline does. */
  inkThinning?: number;
  /** "line", "rectangle" or "ellipse" while the shape tool is chosen: the live stroke shows the shape. */
  inkShape?: string;
  /** The brush's smoothing (0.65 unless set), so the live outline is the finished one. */
  inkSmoothing?: number;
  /** A brush nib eases pen pressure, as the web outline does. */
  inkBrushCurve?: boolean;
  editable: boolean;
  inkColor: string;
  inkWidth: number;
  inkOpacity: number;
  eraserRadius: number;
  camera: number[];
  selectionBox: number[] | null;
  paper: string | null;
}

let view: ComponentType<NativeInkProps> | null | undefined;
/** Null when the module is missing or predates the ink view: the caller shows its read-only fallback. */
export function nativeInkView(): ComponentType<NativeInkProps> | null {
  if (view !== undefined) return view;
  try {
    const module = requireOptionalNativeModule<{ pdfRender?: unknown }>("SylfNativePlatform");
    view = module?.pdfRender ? requireNativeView<NativeInkProps>("SylfNativePlatform") : null;
  } catch { view = null; }
  return view ?? null;
}
