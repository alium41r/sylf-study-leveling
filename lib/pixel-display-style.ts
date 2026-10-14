/** Presentation only: never part of the authored grid or rasterizer. */
export const DEFAULT_DISPLAY_BORDER = '#5ac9d1';
export function normalizeDisplayBorder(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : 'none';
}
export function normalizeHexColor(value: string): string | null {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
export function normalizePixelGap(value: unknown, userDrawing = false): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 0.3 ? value : userDrawing ? 0 : 0.12;
}
