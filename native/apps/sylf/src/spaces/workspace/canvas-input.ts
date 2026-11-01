// Wheel and trackpad input exists only where there is a pointer with a wheel. See canvas-input.web.ts.
import type { RefObject } from "react";
import type { ViewHandle } from "@sylf/design-system";

export interface WheelHandlers { pan(dx: number, dy: number): void; zoom(factor: number, x: number, y: number): void; end(): void }
export const useCanvasWheel: (target: RefObject<ViewHandle | null>, handlers: WheelHandlers) => void = () => undefined;
