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
import {
  computeMediaVersionHash,
  parseSafeImageDataUrl,
  toCompactConversationAvatarUrl,
  toCompactUserMediaUrl,
} from "@/lib/user-media";
import * as authServer from "@/lib/auth-server";
import * as blockService from "@/lib/block-service";
import * as privacyLib from "@/lib/privacy";
import { Relationship } from "@/lib/privacy-types";
import { GET as getUserMedia } from "@/app/api/media/user/[id]/[kind]/route";
import { GET as getConversationAvatar } from "@/app/api/media/conversation/[id]/avatar/route";
import {
  getUserTimezone,
  invalidateUserTimezoneCache,
  primeUserTimezoneCache,
} from "@/lib/timezone-server";

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

  it("invalidates custom storageKey entries when invalidateClientCache is called with the underlying URL fragment", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response(JSON.stringify({ seq: calls }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const first = await fetchCachedJSON<{ seq: number }>(
      "/api/system-messages?sessionId=42",
      undefined,
      { storageKey: "sys-msgs:42", ttlMs: 60_000, staleMs: 120_000 },
    );
    expect(first).toEqual({ seq: 1 });

    // URL-based invalidation must clear the entry even though its cacheKey is "sys-msgs:42"
    invalidateClientCache("/api/system-messages");

    const second = await fetchCachedJSON<{ seq: number }>(
      "/api/system-messages?sessionId=42",
      undefined,
      { storageKey: "sys-msgs:42", ttlMs: 60_000, staleMs: 120_000 },
    );
    expect(second).toEqual({ seq: 2 });
    expect(calls).toBe(2);
  });

  it("replaces oversized base64 data:image URLs with compact versioned media references while preserving small synthetic strings", () => {
    const smallDataUrl = "data:image/webp;base64,mockAvatarData";
    expect(toCompactUserMediaUrl(7, "avatar", smallDataUrl)).toBe(smallDataUrl);
    expect(toCompactUserMediaUrl(7, "banner", "https://cdn.example.com/banner.webp")).toBe(
      "https://cdn.example.com/banner.webp",
    );

    const largeBase64 = "A".repeat(24_000);
    const largeDataUrl = `data:image/png;base64,${largeBase64}`;
    const compactAvatar = toCompactUserMediaUrl(7, "avatar", largeDataUrl);
    const compactConv = toCompactConversationAvatarUrl(19, largeDataUrl);

    expect(compactAvatar).toMatch(/^\/api\/media\/user\/7\/avatar\?v=[0-9a-f]{12}$/);
    expect(compactConv).toMatch(/^\/api\/media\/conversation\/19\/avatar\?v=[0-9a-f]{12}$/);
    expect(compactAvatar!.length).toBeLessThan(60);

    const parsed = parseSafeImageDataUrl(largeDataUrl);
    expect(parsed).not.toBeNull();
    expect(parsed?.contentType).toBe("image/png");
    expect(parsed?.buffer.byteLength).toBeGreaterThan(10_000);
    expect(parseSafeImageDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
  });

  it("deduplicates nested AcousticsProvider mounts so /api/acoustics is fetched only once", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tracks: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AcousticsProvider>
        <AcousticsProvider>
          <div data-testid="nested-child" />
        </AcousticsProvider>
      </AcousticsProvider>,
    );

    await act(flush);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces session revocation, block checks, private banner visibility, and no-cache ETag revalidation on user media endpoints", async () => {
    const validPng = `data:image/png;base64,${Buffer.from("png-binary-payload-for-test").toString("base64")}`;
    const expectedEtag = `"${computeMediaVersionHash(validPng)}"`;

    // 1. Revoked / missing session must return 401 even when If-None-Match matches ETag
    vi.spyOn(authServer, "getSession").mockResolvedValueOnce(null);
    const unauthRes = await getUserMedia(
      new Request("http://localhost/api/media/user/55/avatar", {
        headers: { "if-none-match": expectedEtag },
      }),
      { params: Promise.resolve({ id: "55", kind: "avatar" }) }
    );
    expect(unauthRes.status).toBe(401);

    // 2. Blocked user must receive 404
    vi.spyOn(authServer, "getSession").mockResolvedValue({
      userId: 10,
      email: "viewer@sylf.dev",
    });
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      avatarUrl: validPng,
      bannerUrl: validPng,
      privacy: { profileVisibility: "PRIVATE" },
    } as unknown as never);
    vi.spyOn(blockService, "areUsersBlocked").mockResolvedValueOnce(true);

    const blockedRes = await getUserMedia(
      new Request("http://localhost/api/media/user/55/avatar"),
      { params: Promise.resolve({ id: "55", kind: "avatar" }) }
    );
    expect(blockedRes.status).toBe(404);

    // 3. Private profile banner must return 404 to non-friend / non-shared-conversation viewer
    vi.spyOn(blockService, "areUsersBlocked").mockResolvedValue(false);
    vi.spyOn(privacyLib, "getRelationship").mockResolvedValueOnce(Relationship.PUBLIC);
    if (prisma.conversationParticipant) {
      vi.spyOn(prisma.conversationParticipant, "findFirst").mockResolvedValueOnce(null);
    }

    const privateBannerRes = await getUserMedia(
      new Request("http://localhost/api/media/user/55/banner"),
      { params: Promise.resolve({ id: "55", kind: "banner" }) }
    );
    expect(privateBannerRes.status).toBe(404);

    // 4. Authorized viewer receives 200 with private, no-cache, must-revalidate + Vary: Cookie + ETag, and 304 on If-None-Match
    const avatarRes = await getUserMedia(
      new Request("http://localhost/api/media/user/55/avatar"),
      { params: Promise.resolve({ id: "55", kind: "avatar" }) }
    );
    expect(avatarRes.status).toBe(200);
    expect(avatarRes.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
    expect(avatarRes.headers.get("Vary")).toBe("Cookie");
    expect(avatarRes.headers.get("ETag")).toBe(expectedEtag);

    const notModifiedRes = await getUserMedia(
      new Request("http://localhost/api/media/user/55/avatar", {
        headers: { "if-none-match": expectedEtag },
      }),
      { params: Promise.resolve({ id: "55", kind: "avatar" }) }
    );
    expect(notModifiedRes.status).toBe(304);
    expect(notModifiedRes.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
  });

  it("enforces conversation participant membership before ETag revalidation on group avatar media endpoint", async () => {
    const validWebp = `data:image/webp;base64,${Buffer.from("webp-group-avatar-bytes").toString("base64")}`;
    const expectedEtag = `"${computeMediaVersionHash(validWebp)}"`;

    vi.spyOn(authServer, "getSession").mockResolvedValue({
      userId: 10,
      email: "viewer@sylf.dev",
    });
    vi.spyOn(prisma.conversation, "findUnique").mockResolvedValue({
      avatarUrl: validWebp,
    } as unknown as never);

    // Non-participant must get 403 even with matching If-None-Match
    vi.spyOn(prisma.conversationParticipant, "findFirst").mockResolvedValueOnce(null);
    const forbiddenRes = await getConversationAvatar(
      new Request("http://localhost/api/media/conversation/99/avatar", {
        headers: { "if-none-match": expectedEtag },
      }),
      { params: Promise.resolve({ id: "99" }) }
    );
    expect(forbiddenRes.status).toBe(403);

    // Participant gets 200 and then 304 on ETag match
    vi.spyOn(prisma.conversationParticipant, "findFirst").mockResolvedValue({
      id: 1,
    } as unknown as never);
    const okRes = await getConversationAvatar(
      new Request("http://localhost/api/media/conversation/99/avatar"),
      { params: Promise.resolve({ id: "99" }) }
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
    expect(okRes.headers.get("ETag")).toBe(expectedEtag);

    const cachedRes = await getConversationAvatar(
      new Request("http://localhost/api/media/conversation/99/avatar", {
        headers: { "if-none-match": expectedEtag },
      }),
      { params: Promise.resolve({ id: "99" }) }
    );
    expect(cachedRes.status).toBe(304);
  });

  it("serves primed user timezone without an extra database query and re-queries after invalidation", async () => {
    const findUniqueSpy = vi
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue({ timezone: "America/New_York" } as unknown as never);

    primeUserTimezoneCache(777, "Asia/Karachi");
    const primedTz = await getUserTimezone(777);
    expect(primedTz).toBe("Asia/Karachi");
    expect(findUniqueSpy).not.toHaveBeenCalled();

    invalidateUserTimezoneCache(777);
    const queriedTz = await getUserTimezone(777);
    expect(queriedTz).toBe("America/New_York");
    expect(findUniqueSpy).toHaveBeenCalledTimes(1);
    invalidateUserTimezoneCache(777);
  });
});
