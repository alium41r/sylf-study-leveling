/**
 * Platform globals the Pixel Display engine is allowed to use.
 *
 * `config/tsconfig.pixel-engine.json` typechecks `engine/**` against `lib: ["esnext"]`
 * with no DOM lib, so a DOM type becomes a compile error. That is the boundary
 * the roadmap asks for (B2: the engine must stay DOM-free) made mechanical.
 *
 * The cost of removing the DOM lib is that genuinely platform-neutral globals
 * disappear too. Rather than pull `@types/node` back in — which would smuggle in
 * a host runtime the engine must not depend on — the allowed surface is declared
 * here explicitly. Anything added to this file is a deliberate widening of what
 * the engine may touch, and should be justified in review.
 *
 * Deliberately NOT declared:
 *   window, document, HTMLElement, HTMLCanvasElement, ImageData,
 *   CanvasRenderingContext2D, ResizeObserver, IntersectionObserver,
 *   MediaQueryList, devicePixelRatio — all DOM, all forbidden in the engine.
 */

declare const performance: {
  now(): number;
};

declare function setTimeout(
  handler: (...args: unknown[]) => void,
  timeout?: number,
): unknown;

declare function clearTimeout(handle: unknown): void;

declare function requestAnimationFrame(
  callback: (time: number) => void,
): number;

declare function cancelAnimationFrame(handle: number): void;
