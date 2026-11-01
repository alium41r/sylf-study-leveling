/**
 * Reads an optional `limit`. Absent means the caller wants the route's original, unbounded behavior, which only the web app's existing
 * screens rely on. Anything present must be a positive integer, and it is capped rather than refused, so a client cannot widen a page.
 */
export function pageLimit(searchParams: URLSearchParams, max: number): number | null | "invalid" {
  const raw = searchParams.get("limit");
  if (raw === null) return null;
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1) return "invalid";
  return Math.min(Number(raw), max);
}

/** Splits a query that fetched one row past the page, and names where the next page starts. */
export function nextPage<T extends { id: number | string }>(rows: T[], limit: number): { page: T[]; nextCursor: T["id"] | null } {
  const page = rows.slice(0, limit);
  return { page, nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}
