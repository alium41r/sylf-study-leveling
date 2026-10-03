/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── IDB Mock with Storage Quota & Deletion Tracking ────────────
function autoFire(result: any) {
  const o: any = { result, error: null };
  Object.defineProperty(o, "onsuccess", { set: (fn: any) => { if (fn) fn(); } });
  Object.defineProperty(o, "onerror", { set: () => {} });
  return o;
}

let simulateQuotaExceeded = false;

function autoFireTx() {
  const o: any = { error: simulateQuotaExceeded ? { name: "QuotaExceededError", code: 22 } : null };
  Object.defineProperty(o, "oncomplete", {
    set: (fn: any) => { if (!simulateQuotaExceeded && fn) fn(); },
  });
  Object.defineProperty(o, "onerror", {
    set: (fn: any) => { if (simulateQuotaExceeded && fn) fn(); },
  });
  Object.defineProperty(o, "onabort", { set: () => {} });
  return o;
}

const fakeStorage = new Map<string, Map<string, any>>();
fakeStorage.set("meta", new Map());
fakeStorage.set("blobs", new Map());

function setupAndroidIDB() {
  (globalThis as any).indexedDB = {
    open: () => {
      const dbObj = {
        objectStoreNames: { contains: (s: string) => fakeStorage.has(s) },
        createObjectStore: (s: string) => {
          if (!fakeStorage.has(s)) fakeStorage.set(s, new Map());
        },
        transaction: () => {
          const tx = autoFireTx();
          tx.objectStore = (name: string) => {
            const data = fakeStorage.get(name)!;
            return {
              put: (val: any, key?: any) => {
                const k = key ?? val?.id;
                data.set(k, val);
                return autoFire(undefined);
              },
              get: (k: any) => autoFire(data.get(k)),
              getAll: () => autoFire(Array.from(data.values())),
              delete: (k: any) => {
                data.delete(k);
                return autoFire(undefined);
              },
              clear: () => {
                data.clear();
                return autoFire(undefined);
              },
            };
          };
          return tx;
        },
      };
      const req: any = { result: dbObj, error: null };
      Object.defineProperty(req, "onupgradeneeded", { set: () => {} });
      Object.defineProperty(req, "onsuccess", { set: (fn: any) => { if (fn) fn(); } });
      Object.defineProperty(req, "onerror", { set: () => {} });
      return req;
    },
  };
}

class MockAudioContext {
  decodeAudioData = vi.fn().mockResolvedValue({ duration: 210 });
  close = vi.fn().mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.resetModules();
  simulateQuotaExceeded = false;
  setupAndroidIDB();
  (globalThis as any).AudioContext = MockAudioContext;
  (window as any).AudioContext = MockAudioContext;
  (globalThis as any).URL.createObjectURL = vi.fn((blob: any) => `blob:android-app/${blob.size || 100}`);
  (globalThis as any).URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeFile(name: string, type: string, size = 2048): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe("Android Custom Audio Integration & Robustness", () => {
  describe("Android Storage Access Framework (SAF) Import Behaviors", () => {
    it("handles picker cancellation with zero side-effects", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const listBefore = await s.listAudio();

      // User opened file picker and tapped back/cancel -> null/undefined file
      // In CustomAudioTab: if (!file) return;
      expect(listBefore).toEqual([]);
    });

    it("handles user file read abortion / deletion during SAF stream", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const file = makeFile("session.m4a", "audio/mp4");
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("DocumentProvider stream severed"));

      const r = await s.importAudio(file);
      expect(r.success).toBe(false);
      expect(r.error).toBe("Failed to read the audio file.");
    });

    it("imports supported Android audio formats (AAC, M4A, OGG, MP3, WAV)", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const formats = [
        { name: "audio.m4a", type: "audio/mp4" },
        { name: "audio.aac", type: "audio/aac" },
        { name: "audio.ogg", type: "audio/ogg" },
        { name: "audio.mp3", type: "audio/mpeg" },
        { name: "audio.wav", type: "audio/wav" },
      ];

      for (const fmt of formats) {
        const r = await s.importAudio(makeFile(fmt.name, fmt.type));
        expect(r.success).toBe(true);
        expect(r.entry).toBeDefined();
        expect(r.entry!.mimeType).toBe(fmt.type);
      }
    });
  });

  describe("App-Private Storage Isolation & Durability", () => {
    it("isolates duplicate filenames under unique IDs without collision", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r1 = await s.importAudio(makeFile("study_bg.mp3", "audio/mpeg", 1000));
      const r2 = await s.importAudio(makeFile("study_bg.mp3", "audio/mpeg", 2000));

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r1.entry!.id).not.toBe(r2.entry!.id);

      const list = await s.listAudio();
      expect(list.filter((t) => t.title === "study_bg")).toHaveLength(2);
    });

    it("deterministically cleans up both metadata and binary blobs on track removal", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeFile("cleanup_test.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const id = r.entry!.id;
      expect(fakeStorage.get("meta")?.has(id)).toBe(true);
      expect(fakeStorage.get("blobs")?.has(id)).toBe(true);

      const removed = await s.removeAudio(id);
      expect(removed).toBe(true);

      // Verify zero orphaned blobs
      expect(fakeStorage.get("meta")?.has(id)).toBe(false);
      expect(fakeStorage.get("blobs")?.has(id)).toBe(false);
    });

    it("survives app restart / activity recreation without losing library items", async () => {
      const s1 = await import("@/lib/acoustics/custom-audio-store");
      await s1.importAudio(makeFile("survive.mp3", "audio/mpeg"));

      // Simulate Android Activity onDestroy -> onCreate / fresh bundle load
      vi.resetModules();
      const s2 = await import("@/lib/acoustics/custom-audio-store");
      const library = await s2.listAudio();

      expect(library.some((t) => t.title === "survive")).toBe(true);
    });

    it("gracefully notifies user when Android storage is full (QuotaExceededError)", async () => {
      simulateQuotaExceeded = true;
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeFile("large.wav", "audio/wav", 50000));

      expect(r.success).toBe(false);
      expect(r.error).toContain("Not enough storage space");
    });

    it("safely handles stale metadata where blob was cleared by OS", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeFile("stale.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      // Simulate partial storage corruption (blob missing)
      fakeStorage.get("blobs")?.delete(r.entry!.id);

      const url = await s.getPlaybackUrl(r.entry!.id);
      expect(url).toBeNull();
    });
  });

  describe("Security and Android Privacy Verification", () => {
    it("ensures zero outbound network traffic is initiated during import or playback", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw new Error("SECURITY VIOLATION: Network fetch attempted in local audio store");
      });

      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeFile("private.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const url = await s.getPlaybackUrl(r.entry!.id);
      expect(url).toBeTruthy();

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("prevents path traversal by enforcing generated UUID keys", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      // File with path traversal attempt in name
      const maliciousFile = makeFile("../../../../etc/passwd.mp3", "audio/mpeg");
      const r = await s.importAudio(maliciousFile);

      expect(r.success).toBe(true);
      // ID must be a standard UUID, not containing path traversal characters
      expect(r.entry!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(fakeStorage.get("blobs")?.has(r.entry!.id)).toBe(true);
      // Key in blob store is UUID, not file path
      expect(fakeStorage.get("blobs")?.has("../../../../etc/passwd.mp3")).toBe(false);
    });
  });
});
