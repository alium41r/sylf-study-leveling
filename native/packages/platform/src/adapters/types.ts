// Adapter interfaces. Each is deliberately small; the owning phase grows it with the real feature.
// Implementations live in ../implementation.web.ts (desktop/web: existing Sylf web owners) and
// ../implementation.native.ts (Expo modules).
import type { InkSample } from "@sylf/shared";

/** Phase 3: real. Covers what lib/notes/vault.ts and bytes.ts need (SHA-256 now; AES-GCM in Phase 14). */
export interface CryptoAdapter {
  randomUUID(): string;
  getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
  sha256Hex(bytes: Uint8Array): Promise<string>;
}

/** Phase 4: real. Small synchronous key-value store for device preferences; read before the first frame. */
export interface PreferencesAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Phase 12/14: durable local storage. Notes uses the existing NotesRepository type seam (lib/notes/repository.ts). */
export interface StorageAdapter {
  readonly backend: "indexeddb" | "sqlite" | "unavailable";
}

/** Phase 14: pen capture produces sylf-ink/1 samples from a native view (ADR 0001, Phase 2 report §5.4). */
export interface PenInputAdapter {
  readonly sampleFormat: "sylf-ink/1";
  /** Type witness tying captured samples to the shared Notes ink contract. */
  readonly sampleType?: InkSample;
}

/** Phase 14: rasterizes PDF pages; page units are always computed by Sylf (CropBox, Rotate, UserUnit). */
export interface PdfAdapter {
  readonly renderer: "pdfjs" | "pdfkit" | "pdfrenderer" | "unavailable";
}

/** Phase 13/14: background-capable playback for focus audio. */
export interface AudioAdapter {
  readonly backgroundPlayback: boolean;
}

/** Phase 13: persistent study-session surface (Live Activity, Android foreground service, desktop tray). */
export interface SessionAdapter {
  readonly backgroundSession: "live-activity" | "foreground-service" | "desktop" | "unavailable";
}

/** Phase 14: user-initiated file access and sharing. */
export interface FileAdapter {
  readonly picker: boolean;
}

/**
 * Phase 12, ADR 0009: where a device keeps its session. Screens and the typed client never see what is inside. `host` means Electron's main
 * process holds it and the renderer has nothing, and `none` is a plain browser. Both of those read as empty and refuse to write.
 */
export interface SecureSessionAdapter {
  readonly holder: "secure-store" | "host" | "none";
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PlatformAdapters {
  crypto: CryptoAdapter;
  preferences: PreferencesAdapter;
  secureSession: SecureSessionAdapter;
  storage: StorageAdapter;
  pen: PenInputAdapter;
  pdf: PdfAdapter;
  audio: AudioAdapter;
  session: SessionAdapter;
  files: FileAdapter;
}

export class PlatformNotImplementedError extends Error {
  constructor(adapter: string, phase: string) {
    super(`${adapter} is not implemented yet (scheduled for ${phase}).`);
    this.name = "PlatformNotImplementedError";
  }
}
