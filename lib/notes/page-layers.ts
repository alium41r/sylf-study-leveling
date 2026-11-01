import type { DocumentDescriptor } from "./contracts";

/** Page-local text geometry is shared by the editor and readable PDF renderer. */
export function pageTextOrigin(page: DocumentDescriptor["pages"][number]) {
  const value = page.extensions.textOrigin;
  const origin =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const number = (input: unknown, fallback: number, maximum: number) =>
    typeof input === "number" && Number.isFinite(input)
      ? Math.max(20, Math.min(Math.max(20, maximum), input))
      : fallback;
  return {
    x: number(origin.x, 64, page.width - 220),
    y: number(origin.y, 56, page.height - 80),
  };
}
