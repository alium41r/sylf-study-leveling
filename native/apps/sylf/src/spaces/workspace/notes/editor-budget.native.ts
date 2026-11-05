// How many typed-note editors may run at once. On Android each is a WebView (Phase 2 measured 163 MB for one screen), so only the
// most recently used two run there; the rest show their text until touched. Desktop editors are ordinary DOM and cheap.
export const LIVE_EDITORS = 2;
