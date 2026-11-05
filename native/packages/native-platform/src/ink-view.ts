// The native writing surface, when this build has one (Android since Phase 14). Loaded lazily so web and tests never touch it.
import type { ComponentType, Ref } from "react";
import { requireNativeView, requireOptionalNativeModule } from "expo";

export interface NativeInkEvents {
  onStroke(event: { nativeEvent: { kind: "draw" | "lasso" | "move"; samples: number[]; pointer: "pen" | "touch" | "mouse"; live: number } }): void;
  onErase(event: { nativeEvent: { points: number[]; pointer: string } }): void;
  onPan(event: { nativeEvent: { dx: number; dy: number } }): void;
  onPinch(event: { nativeEvent: { factor: number; x: number; y: number } }): void;
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
