// Reference-counted page scroll lock.
//
// Overlays (settings panel, mobile nav drawer) lock the document scroller
// while open. Locking must cover BOTH <html> and <body>: with body-only
// overflow:hidden the document scroller stays live and the page behind the
// overlay can still be scrolled (touches/wheel chain to it).
//
// A counter keeps overlapping lockers safe: e.g. the mobile drawer holds a
// lock while the settings panel opens on top; closing the drawer must not
// unlock the page while the settings panel is still open.

let lockCount = 0;

export function lockPageScroll(): () => void {
  if (typeof document === "undefined") return () => {};

  if (lockCount === 0) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  lockCount++;

  return () => {
    // Avoid double-release (e.g. React strict-mode effect re-runs).
    if (lockCount <= 0) return;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
  };
}
