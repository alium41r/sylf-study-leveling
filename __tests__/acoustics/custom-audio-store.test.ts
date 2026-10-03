/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── IndexedDB Mock ─────────────────────────────────────────────
// The production store wraps IDB events with Promises. We need the
// mock to fire onsuccess/oncomplete AFTER the production code has
// attached handlers. We achieve this with a setter-trap: when the
// production code assigns `req.onsuccess = fn`, the setter fires
// the callback immediately with the pre-computed result.

function autoFireTarget(result: any) {
  const target: any = { result, error: null };
  let _onsuccess: Function | null = null;
  Object.defineProperty(target, "onsuccess", {
    get: () => _onsuccess,
    set: (fn: Function) => {
      _onsuccess = fn;
      // Fire immediately when handler is attached
      if (fn) fn();
    },
  });
  let _onerror: Function | null = null;
  Object.defineProperty(target, "onerror", {
    get: () => _onerror,
    set: (fn: Function) => { _onerror = fn; },
  });
  return target;
}

let mockTxError: any = null;

function autoFireTx() {
  const target: any = { error: mockTxError };
  let _oncomplete: Function | null = null;
  let _onerror: Function | null = null;
  Object.defineProperty(target, "oncomplete", {
    get: () => _oncomplete,
    set: (fn: Function) => {
      _oncomplete = fn;
      if (!mockTxError && fn) fn();
    },
  });
  Object.defineProperty(target, "onerror", {
    get: () => _onerror,
    set: (fn: Function) => {
      _onerror = fn;
      if (mockTxError && fn) fn();
    },
  });
  Object.defineProperty(target, "onabort", {
    get: () => null,
    set: () => {},
  });
  return target;
}

function createFakeIDB() {
  const databases = new Map<string, Map<string, Map<string, any>>>();

  function getDB(name: string): Map<string, Map<string, any>> {
    if (!databases.has(name)) {
      const db = new Map<string, Map<string, any>>();
      db.set("meta", new Map());
      db.set("blobs", new Map());
      databases.set(name, db);
    }
    return databases.get(name)!;
  }

  function makeObjectStore(data: Map<string, any>, keyPath?: string) {
    return {
      put(value: any, key?: any) {
        const k = key ?? (keyPath ? value[keyPath] : undefined);
        data.set(k, JSON.parse(JSON.stringify(value)));
        return autoFireTarget(undefined);
      },
      get(key: any) {
        const val = data.has(key) ? JSON.parse(JSON.stringify(data.get(key))) : undefined;
        return autoFireTarget(val);
      },
      getAll() {
        const vals = Array.from(data.values()).map((v) => JSON.parse(JSON.stringify(v)));
        return autoFireTarget(vals);
      },
      delete(key: any) {
        data.delete(key);
        return autoFireTarget(undefined);
      },
      clear() {
        data.clear();
        return autoFireTarget(undefined);
      },
    };
  }

  const mockIDB = {
    open(name: string, _version?: number) {
      const db = getDB(name);

      const dbObj: any = {
        objectStoreNames: {
          contains: (s: string) => db.has(s),
        },
        createObjectStore: (s: string, opts?: any) => {
          db.set(s, new Map());
          return makeObjectStore(db.get(s)!, opts?.keyPath);
        },
        transaction: (_storeNames: string | string[], _mode?: string) => {
          const tx = autoFireTx();
          tx.objectStore = (name: string) => {
            const data = db.get(name);
            if (!data) throw new Error(`Object store "${name}" not found`);
            return makeObjectStore(data, name === "meta" ? "id" : undefined);
          };
          return tx;
        },
      };

      const req: any = { result: dbObj, error: null };

      // For the open request, we need onupgradeneeded + onsuccess.
      // onupgradeneeded fires first, then onsuccess.
      let _onupgrade: Function | null = null;
      let _onsuccess: Function | null = null;

      Object.defineProperty(req, "onupgradeneeded", {
        get: () => _onupgrade,
        set: (fn: Function) => {
          _onupgrade = fn;
          // Don't fire yet — wait for onsuccess to be set
        },
      });

      Object.defineProperty(req, "onsuccess", {
        get: () => _onsuccess,
        set: (fn: Function) => {
          _onsuccess = fn;
          // Fire both in order when onsuccess is set
          if (_onupgrade) _onupgrade();
          if (fn) fn();
        },
      });

      Object.defineProperty(req, "onerror", {
        get: () => null,
        set: () => {},
      });

      return req;
    },
  };

  return mockIDB;
}

function createMockAudioContext() {
  return class MockAudioContext {
    decodeAudioData = vi.fn().mockResolvedValue({ duration: 180 });
    close = vi.fn().mockResolvedValue(undefined);
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  mockTxError = null;

  const MockAC = createMockAudioContext();
  (globalThis as any).indexedDB = createFakeIDB();
  (globalThis as any).AudioContext = MockAC;
  if (typeof window !== "undefined") {
    (window as any).AudioContext = MockAC;
  }

  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        ...globalThis.crypto,
        randomUUID: () =>
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          }),
      },
    });
  }

  (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock-url");
  (globalThis as any).URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ─────────────────────────────────────────────────────

function makeTestFile(name = "test.mp3", type = "audio/mpeg", size = 1024): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

// ─── Tests ──────────────────────────────────────────────────────

describe("CustomAudioStore", () => {
  describe("validateAudioFile", () => {
    it("accepts valid MP3", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.mp3", "audio/mpeg"))).toBeNull();
    });

    it("accepts valid WAV", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.wav", "audio/wav"))).toBeNull();
    });

    it("accepts valid OGG", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.ogg", "audio/ogg"))).toBeNull();
    });

    it("accepts valid M4A", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.m4a", "audio/mp4"))).toBeNull();
    });

    it("accepts by extension when MIME is empty", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.mp3", ""))).toBeNull();
    });

    it("rejects unsupported format", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.mid", "audio/midi"))).toContain("Unsupported");
    });

    it("rejects empty file", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.mp3", "audio/mpeg", 0))).toContain("empty");
    });

    it("rejects file over 100MB", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(s.validateAudioFile(makeTestFile("a.mp3", "audio/mpeg", 101 * 1024 * 1024))).toContain("too large");
    });
  });

  describe("importAudio", () => {
    it("imports a valid file and returns metadata", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("My Study Mix.mp3", "audio/mpeg"));

      expect(r.success).toBe(true);
      expect(r.entry).toBeDefined();
      expect(r.entry!.title).toBe("My Study Mix");
      expect(r.entry!.originalFilename).toBe("My Study Mix.mp3");
      expect(r.entry!.mimeType).toBe("audio/mpeg");
      expect(r.entry!.duration).toBe(180);
      expect(r.entry!.id).toBeTruthy();
      expect(r.entry!.dateAdded).toBeTruthy();
    });

    it("rejects unsupported file", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("v.exe", "application/octet-stream"));
      expect(r.success).toBe(false);
      expect(r.error).toBeTruthy();
    });

    it("rejects corrupt file that fails decode", async () => {
      class FailingAudioContext {
        decodeAudioData = vi.fn().mockRejectedValue(new Error("decode failed"));
        close = vi.fn().mockResolvedValue(undefined);
      }
      (globalThis as any).AudioContext = FailingAudioContext;
      (window as any).AudioContext = FailingAudioContext;

      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("corrupt.mp3", "audio/mpeg"));
      expect(r.success).toBe(false);
      expect(r.error).toContain("could not be decoded");
    });

    it("handles cancelled or aborted file read gracefully", async () => {
      const file = makeTestFile("cancel.mp3", "audio/mpeg");
      vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("File read aborted by user"));
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(file);
      expect(r.success).toBe(false);
      expect(r.error).toContain("Failed to read");
    });
  });

  describe("listAudio", () => {
    it("returns empty array initially", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(await s.listAudio()).toEqual([]);
    });

    it("returns imported entries", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("first.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const list = await s.listAudio();
      expect(list.length).toBe(1);
      expect(list[0].title).toBe("first");
    });
  });

  describe("renameAudio", () => {
    it("renames an existing entry", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("original.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const ok = await s.renameAudio(r.entry!.id, "Renamed Track");
      expect(ok).toBe(true);

      const meta = await s.getAudioMeta(r.entry!.id);
      expect(meta?.title).toBe("Renamed Track");
    });

    it("rejects empty title", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("t.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const ok = await s.renameAudio(r.entry!.id, "  ");
      expect(ok).toBe(false);
    });

    it("returns false for non-existent ID", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const ok = await s.renameAudio("nonexistent", "New Name");
      expect(ok).toBe(false);
    });
  });

  describe("removeAudio", () => {
    it("removes an entry", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("rm.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const ok = await s.removeAudio(r.entry!.id);
      expect(ok).toBe(true);
      expect(await s.listAudio()).toHaveLength(0);
      expect(await s.getAudioMeta(r.entry!.id)).toBeNull();
    });
  });

  describe("getPlaybackUrl", () => {
    it("returns an object URL", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("play.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      const url = await s.getPlaybackUrl(r.entry!.id);
      expect(url).toBe("blob:mock-url");
    });

    it("returns null for non-existent ID", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      expect(await s.getPlaybackUrl("nope")).toBeNull();
    });
  });

  describe("object URL cleanup", () => {
    it("revokes previous URL on second getPlaybackUrl", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("t.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      await s.getPlaybackUrl(r.entry!.id);
      await s.getPlaybackUrl(r.entry!.id);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("revokes URL on remove", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("t.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      await s.getPlaybackUrl(r.entry!.id);
      await s.removeAudio(r.entry!.id);
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it("revokeAllPlaybackUrls cleans all", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r1 = await s.importAudio(makeTestFile("a.mp3", "audio/mpeg"));
      const r2 = await s.importAudio(makeTestFile("b.mp3", "audio/mpeg"));
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      await s.getPlaybackUrl(r1.entry!.id);
      await s.getPlaybackUrl(r2.entry!.id);
      s.revokeAllPlaybackUrls();
      expect((URL.revokeObjectURL as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("clearAllAudio", () => {
    it("removes all entries", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      await s.importAudio(makeTestFile("a.mp3", "audio/mpeg"));
      await s.importAudio(makeTestFile("b.mp3", "audio/mpeg"));

      expect(await s.clearAllAudio()).toBe(true);
      expect(await s.listAudio()).toHaveLength(0);
    });
  });

  describe("getStoreStatus", () => {
    it("reports correct status", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("t.mp3", "audio/mpeg", 2048));
      expect(r.success).toBe(true);

      const status = await s.getStoreStatus();
      expect(status.ready).toBe(true);
      expect(status.entryCount).toBe(1);
      expect(status.estimatedBytes).toBe(2048);
    });
  });

  describe("no server upload", () => {
    it("does NOT call fetch during import", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
        throw new Error("Fetch must not be called");
      });
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("local.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("supported formats", () => {
    it("MIME types include all required", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      for (const m of ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm", "audio/aac"]) {
        expect(s.SUPPORTED_AUDIO_MIME_TYPES.has(m)).toBe(true);
      }
    });

    it("extensions include all required", async () => {
      const s = await import("@/lib/acoustics/custom-audio-store");
      for (const e of [".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac"]) {
        expect(s.SUPPORTED_EXTENSIONS.has(e)).toBe(true);
      }
    });
  });

  describe("persisted library reload", () => {
    it("persists audio library across module reloads and re-initialization", async () => {
      const s1 = await import("@/lib/acoustics/custom-audio-store");
      const r = await s1.importAudio(makeTestFile("persisted.mp3", "audio/mpeg"));
      expect(r.success).toBe(true);

      // Simulate a page reload / fresh module import with same underlying IDB
      vi.resetModules();
      const s2 = await import("@/lib/acoustics/custom-audio-store");
      const entries = await s2.listAudio();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.some((e) => e.title === "persisted")).toBe(true);
    });
  });

  describe("storage failure", () => {
    it("handles QuotaExceededError gracefully", async () => {
      mockTxError = { name: "QuotaExceededError", message: "Quota exceeded" };
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("large.mp3", "audio/mpeg"));
      expect(r.success).toBe(false);
      expect(r.error).toContain("storage space");
    });

    it("handles general storage transaction error", async () => {
      mockTxError = new Error("Disk IO Error");
      const s = await import("@/lib/acoustics/custom-audio-store");
      const r = await s.importAudio(makeTestFile("io.mp3", "audio/mpeg"));
      expect(r.success).toBe(false);
      expect(r.error).toContain("Storage error");
    });
  });
});

