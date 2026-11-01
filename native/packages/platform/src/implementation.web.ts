// Desktop (Electron) and browser runtime. Desktop reuses Sylf's existing web owners for storage, ink and PDF
// (ADR 0001); Phase 3 wires only crypto and capability detection.
import type { OperatingSystem, PlatformCapabilities } from "./capabilities";
import { PlatformNotImplementedError, type PlatformAdapters } from "./adapters/types";
import { toHex } from "./hex";

interface DesktopBridge { platform: string; versions: Record<string, string> }
const bridge = (): DesktopBridge | undefined => (globalThis as { sylfDesktop?: DesktopBridge }).sylfDesktop;

function osFromBridgeOrAgent(): OperatingSystem {
  const p = bridge()?.platform ?? (typeof navigator === "undefined" ? "" : navigator.userAgent.toLowerCase());
  if (p.includes("darwin") || p.includes("mac")) return "macos";
  if (p.includes("win")) return "windows";
  if (p.includes("linux") && !p.includes("android")) return "linux";
  return "unknown";
}

const media = (query: string): boolean | "unknown" => (typeof matchMedia === "function" ? matchMedia(query).matches : "unknown");

export function detectCapabilities(): PlatformCapabilities {
  const desktop = bridge();
  return {
    runtime: desktop ? "desktop" : "web",
    os: osFromBridgeOrAgent(),
    osVersion: desktop?.versions.os ?? "",
    formFactor: "desktop",
    // Pen availability on desktop is only known once a pen event arrives (PointerEvent.pointerType === "pen").
    input: { stylus: "unknown", hover: media("(hover: hover)"), finePointer: media("(pointer: fine)") },
    display: { refreshRates: [], scale: typeof devicePixelRatio === "number" ? devicePixelRatio : 1 },
    model: desktop ? `Electron ${desktop.versions.electron ?? "?"} / Chromium ${desktop.versions.chrome ?? "?"}` : (typeof navigator === "undefined" ? "unknown" : navigator.userAgent),
  };
}

export function createAdapters(): PlatformAdapters {
  return {
    crypto: {
      randomUUID: () => globalThis.crypto.randomUUID(),
      getRandomValues: (array) => globalThis.crypto.getRandomValues(array),
      sha256Hex: async (bytes) => toHex(await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource)),
    },
    preferences: {
      getItem: (key) => { try { return globalThis.localStorage.getItem(key); } catch { return null; } },
      setItem: (key, value) => { try { globalThis.localStorage.setItem(key, value); } catch { /* Private mode: applies for this session only. */ } },
    },
    // Nothing here can hold a token: on Electron the main process does, and a browser has no native session.
    secureSession: {
      holder: bridge() ? "host" : "none",
      read: async () => null,
      write: async () => { throw new PlatformNotImplementedError("Secure session storage", "this runtime never holds tokens"); },
      clear: async () => undefined,
    },
    storage: { backend: typeof indexedDB === "undefined" ? "unavailable" : "indexeddb" },
    pen: { sampleFormat: "sylf-ink/1" },
    pdf: { renderer: "pdfjs" },
    audio: { backgroundPlayback: bridge() !== undefined },
    session: { backgroundSession: bridge() ? "desktop" : "unavailable" },
    files: { picker: true },
  };
}
