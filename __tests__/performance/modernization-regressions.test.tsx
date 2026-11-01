import React, { memo, Profiler } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcousticsProvider, useAcoustics } from "@/app/components/AcousticsContext";
import {
  clearClientCache,
  fetchCachedJSON,
  invalidateClientCache,
  readCachedJSON,
} from "@/lib/client-data-cache";
import { lockPageScroll } from "@/lib/scroll-lock";
import { areAnyUsersBlocked } from "@/lib/block-service";
import { prisma } from "@/lib/prisma";

const audioMocks = vi.hoisted(() => ({
  freqByteValue: 80,
}));

vi.mock("@/lib/acoustics/audio-engine", () => ({
  audioEngine: {
    playTrack: vi.fn(),
    getFrequencyData: () => new Uint8Array(150).fill(audioMocks.freqByteValue),
    resumeContext: vi.fn().mockResolvedValue(undefined),
  },
}));

const flush = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};

describe("Performance Modernization Regressions", () => {
  beforeEach(() => {
    audioMocks.freqByteValue = 80;
    clearClientCache();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("isolates 60fps frequency analyser updates from control-only useAcoustics() consumers", async () => {
    let controls: ReturnType<typeof useAcoustics> | undefined;
    let volumeOnlyRenders = 0;
    let visualizerRenders = 0;
    let commits = 0;

    const raf = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      raf.set(++id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (key: number) => raf.delete(key));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ tracks: [] }) })),
    );
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();

    const VolumeOnly = memo(function VolumeOnly() {
      const ctx = useAcoustics();
      controls = ctx;
      volumeOnlyRenders++;
      return <span>{ctx.masterVolume}</span>;
    });

    const VisualizerConsumer = memo(function VisualizerConsumer() {
      const ctx = useAcoustics({ subscribeFrequency: true });
      visualizerRenders++;
      return <span>{ctx.frequencyData[0]}</span>;
    });

    render(
      <Profiler id="audio" onRender={() => commits++}>
        <AcousticsProvider>
          <VolumeOnly />
          <VisualizerConsumer />
        </AcousticsProvider>
      </Profiler>,
    );

    await act(flush);

    act(() =>
      controls!.playTrack({
        id: 1,
        title: "synthetic",
        category: "test",
        frequency: null,
        audioUrl: "/synthetic.wav",
        duration: 1,
        defaultVolume: 1,
        description: null,
        tags: [],
        isPreset: false,
        orderIndex: 0,
      }),
    );

    const beforeVolumeRenders = volumeOnlyRenders;
    const beforeVisualizerRenders = visualizerRenders;

    for (let i = 0; i < 60; i++) {
      audioMocks.freqByteValue = 40 + (i % 50);
      act(() => {
        const callbacks = [...raf.values()];
        raf.clear();
        callbacks.forEach((cb) => cb(i * 16.67));
      });
    }

    // Control-only consumer must experience 0 re-renders across 60 analyser frames
    expect(volumeOnlyRenders - beforeVolumeRenders).toBe(0);
    // Opt-in visualizer consumer receives frequency updates
    expect(visualizerRenders - beforeVisualizerRenders).toBeGreaterThan(0);
    expect(commits).toBeGreaterThan(0);
  });

  it("delivers stale-while-revalidate background updates via onUpdate only when payload changes", async () => {
    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCount++;
        const version = fetchCount === 1 ? "v1" : fetchCount === 2 ? "v1" : "v2";
        return new Response(JSON.stringify({ version }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const updates: Array<{ version: string }> = [];

    // 1. Cold load populates cache (TTL = 0 forces immediate stale on next read)
    const first = await fetchCachedJSON<{ version: string }>("/api/test-swr", undefined, {
      ttlMs: 0,
      storageKey: "test-swr",
      onUpdate: (data) => updates.push(data),
    });
    expect(first).toEqual({ version: "v1" });
    expect(updates).toHaveLength(0);

    // 2. Warm stale read returns v1 immediately; background revalidation returns identical v1 -> no onUpdate
    const second = await fetchCachedJSON<{ version: string }>("/api/test-swr", undefined, {
      ttlMs: 0,
      storageKey: "test-swr",
      onUpdate: (data) => updates.push(data),
    });
    expect(second).toEqual({ version: "v1" });
    await flush();
    expect(updates).toHaveLength(0);

    // 3. Next warm stale read triggers background revalidation returning v2 -> onUpdate fires once
    const third = await fetchCachedJSON<{ version: string }>("/api/test-swr", undefined, {
      ttlMs: 0,
      storageKey: "test-swr",
      onUpdate: (data) => updates.push(data),
    });
    expect(third).toEqual({ version: "v1" });
    await flush();
    expect(updates).toEqual([{ version: "v2" }]);
    expect(readCachedJSON<{ version: string }>("/api/test-swr", { storageKey: "test-swr" })).toEqual({
      version: "v2",
    });
  });

  it("blocks private AI chat transcripts (sys-msgs / system-messages) from localStorage persistence and cleans up weekly quest cache on clearClientCache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ messages: [{ id: 1, content: "secret" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    window.localStorage.setItem("sylf_cached_weekly_quest", JSON.stringify({ id: 99 }));

    await fetchCachedJSON("/api/system/chat/messages?conversationId=1", undefined, {
      storageKey: "sys-msgs-1",
      ttlMs: 30_000,
    });
    await fetchCachedJSON("/api/system-messages?type=DAILY_BRIEFING", undefined, {
      storageKey: "system-messages-daily",
      ttlMs: 30_000,
    });

    const storedKeys = Object.keys(window.localStorage);
    expect(storedKeys.some((k) => k.includes("sys-msgs"))).toBe(false);
    expect(storedKeys.some((k) => k.includes("system-messages"))).toBe(false);

    clearClientCache();
    expect(window.localStorage.getItem("sylf_cached_weekly_quest")).toBeNull();
    invalidateClientCache("sys-msgs");
  });

  it("makes lockPageScroll unlock closures per-instance idempotent and restores prior overflow styles", () => {
    document.documentElement.style.overflow = "clip";
    document.body.style.overflow = "auto";

    const unlockA = lockPageScroll();
    const unlockB = lockPageScroll();

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    // Calling unlockA twice must not release lockB
    unlockA();
    unlockA();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    // Releasing lockB restores original inline overflow values
    unlockB();
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("auto");
  });

  it("batches multi-participant block checks into a single database query via areAnyUsersBlocked", async () => {
    const queryRawSpy = vi
      .spyOn(prisma, "$queryRaw")
      .mockResolvedValue([{ exists: true }] as unknown as never);

    const blocked = await areAnyUsersBlocked(10, [20, 30, 40, 20, 10]);
    expect(blocked).toBe(true);
    expect(queryRawSpy).toHaveBeenCalledTimes(1);
  });
});
