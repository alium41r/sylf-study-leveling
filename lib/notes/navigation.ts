/** Document selection is local UI state. Next's History API integration updates
 * useSearchParams without an RSC request that can hang while offline or stale.
 * Hash-based native/mobile shells retain their existing navigation adapter. */
export function navigateNotes(
  href: string,
  router: { replace: (href: string, options?: { scroll?: boolean }) => void }
) {
  const base = "https://sylf-notes.invalid";
  const url = new URL(href, base);
  if (!href.startsWith("/") || url.origin !== base || url.pathname !== "/notes")
    throw new Error("Invalid Notes navigation destination.");
  if (
    window.location.pathname === "/notes" &&
    ["http:", "https:"].includes(window.location.protocol) &&
    !window.location.hash.startsWith("#/")
  )
    window.history.replaceState(null, "", url.pathname + url.search);
  else router.replace(href, { scroll: false });
}
