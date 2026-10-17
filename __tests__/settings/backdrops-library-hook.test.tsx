import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFocusBackground } from "@/app/focus/hooks/useFocusBackground";
import { SYNTHETIC_CLASSIC_CATEGORY } from "@/lib/focus-background-client";
const user = vi.hoisted(() => ({ id: 1 }));
vi.mock("@/app/components/AuthProvider", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/lib/focus-background-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/focus-background-client")>()),
  fetchFocusBackgroundCatalog: vi.fn(async () => ({
    categories: [SYNTHETIC_CLASSIC_CATEGORY],
  })),
}));
vi.mock("@/lib/focus-background-preference", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/focus-background-preference")
  >()),
  fetchServerPreference: vi.fn(async () => ({
    initialized: true,
    version: 1,
    source: "classic",
    categorySlug: "classic-sylf",
    backgroundId: null,
    isClassic: true,
  })),
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
describe("Canonical personal backdrop library metadata", () => {
  it("exposes API quota, retains the last library on failure, and recovers through its existing refresh", async () => {
    let failed = false;
    const backgrounds = [{ id: 7, name: "Coast", signedUrl: "/coast.webp" }];
    global.fetch = vi.fn(async () => ({
      ok: !failed,
      json: async () => ({ backgrounds, quota: { used: 1, max: 5 } }),
    })) as unknown as typeof fetch;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useFocusBackground());
    await waitFor(() =>
      expect(result.current.customBackgroundQuota).toEqual({ used: 1, max: 5 })
    );
    expect(result.current.customBackgrounds).toEqual(backgrounds);
    failed = true;
    await act(() => result.current.refreshCustomBackgrounds());
    expect(result.current.customBackgroundsError).toMatch(/couldn’t be loaded/);
    expect(result.current.customBackgrounds).toEqual(backgrounds);
    expect(result.current.isLoadingCustomBackgrounds).toBe(false);
    failed = false;
    await act(() => result.current.refreshCustomBackgrounds());
    expect(result.current.customBackgroundsError).toBeNull();
    expect(result.current.customBackgroundQuota).toEqual({ used: 1, max: 5 });
    vi.restoreAllMocks();
  });
});
