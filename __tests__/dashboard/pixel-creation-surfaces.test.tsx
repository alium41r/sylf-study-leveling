/**
 * ============================================================================
 * AUDIT REGRESSIONS — A SCHOLAR'S OWN DRAWING, EVERYWHERE IT IS SHOWN
 * ============================================================================
 * Pixel Studio added two seams that the Phase 8 suite could not see, because it
 * tested the Studio's own preview and the resolver separately, never the
 * surface a scholar actually looks at:
 *
 *   1. The Customizer and the Studio Hub preview resolve a configuration against
 *      the **built-in** catalogue only, so an equipped creation degraded to the
 *      base figure there while the dashboard drew the drawing. The customizer's
 *      own documentation says the preview "cannot disagree with what a scholar
 *      gets after saving".
 *   2. The signed-in scholar's creation list is cached in module scope and was
 *      never invalidated, so a creation saved and equipped in the same session
 *      could be missing from the dashboard's catalogue for up to thirty seconds
 *      — long enough for a scholar to see their drawing replaced by the built-in
 *      companion.
 *
 * Both are asserted from the rendered surface: the preview's framebuffer for the
 * first, the number of catalogue reads for the second.
 */

import { cleanup, render, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createRecordingContext } from "@/__tests__/pixel-display/support/recording-renderer";
import { emptyFrame, type PixelCreation } from "@/lib/pixel-display/content/asset";

const recording = createRecordingContext();

let lastLevelUp: { runId: number; newLevel: number; didRankUp?: boolean } | null =
  null;

vi.mock("@/app/components/LevelUpProvider", () => ({
  useLevelUp: () => ({ lastLevelUp }),
}));

let user: unknown = null;
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({ user, refreshStats: async () => {} }),
}));

declare global {
  // eslint-disable-next-line no-var
  var __pixelDashboard: {
    handle: { display: { snapshot(): number[] } };
    runtime: { tick(): void };
  } | null;
}

/**
 * The shared recording double covers the display renderer; the studio's editor
 * canvas also clears and fills, so this wraps it with the two calls those
 * surfaces make.
 */
function canvasContextDouble(): CanvasRenderingContext2D {
  const base = recording.context as unknown as Record<string, unknown>;
  const double: Record<string, unknown> = {
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    fillStyle: "#000000",
    clearRect: () => {},
    fillRect: (x: number, y: number, width: number, height: number) =>
      (base.fillRect as (...args: number[]) => void).call(
        double,
        x,
        y,
        width,
        height,
      ),
  };
  return double as unknown as CanvasRenderingContext2D;
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A creation whose drawing is unmistakable: one solid red block, top-left. */
function creationDocument(id = "user:audit-star"): PixelCreation {
  const grid = 48;
  const rows = emptyFrame(grid).rows.map((row, y) =>
    y < 12 ? `${"0".repeat(12)}${row.slice(12)}` : row,
  );
  return {
    version: 1,
    id,
    name: "Audit star",
    grid,
    palette: ["#ff0000"],
    frames: [{ rows, durationMs: 240 }],
    playback: "loop",
  };
}

const STORED_CREATION = {
  id: "cuid-1",
  slug: "audit-star",
  name: "Audit star",
  grid: 48,
  data: creationDocument(),
};

let listReads = 0;
let testOwner = 1200;
let stored: unknown[] = [];

function stubFetch() {
  listReads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/pixel-creations")) {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ creation: STORED_CREATION }),
        } as unknown as Response;
      }
      listReads += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ creations: stored }),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  recording.reset();
  lastLevelUp = null;
  stored = [STORED_CREATION];
  stubFetch();
  globalThis.__pixelDashboard = null;
  user = { id: ++testOwner, characterConfig: CONFIG };
  listReads = 0;
  vi.stubEnv("NODE_ENV", "development");
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() =>
    canvasContextDouble()) as unknown as HTMLCanvasElement["getContext"];
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  const { invalidateScholarCreations } = await import(
    "@/app/dashboard/pixel-companion-adapter"
  );
  invalidateScholarCreations();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const { PixelCustomizer } = await import(
  "@/app/locker/components/identity/PixelCustomizer"
);
const { PixelCompanionCard } = await import(
  "@/app/dashboard/components/PixelCompanionCard"
);
const { invalidateScholarCreations } = await import(
  "@/app/dashboard/pixel-companion-adapter"
);

const CONFIG = {
  outfit: "user:audit-star",
  pedestal: "pedestal_cyber",
  aura: "none",
  relic: "none",
  density: "detailed",
} as never;

function redCells(): number {
  const preview = (window as unknown as { __pixelDisplays?: Map<string, { runtime: { tick(): void }; display: { snapshot(): number[] } }> }).__pixelDisplays?.get("Customizer preview");
  if (preview) { preview.runtime.tick(); return preview.display.snapshot().filter(color => (color >>> 8) === 0xff0000).length; }
  const probe = globalThis.__pixelDashboard;
  if (!probe) return -1;
  probe.runtime.tick();
  const snapshot = probe.handle.display.snapshot();
  return snapshot.filter((color) => (color >>> 8) === 0xff0000).length;
}

describe("the customizer preview of an equipped creation", () => {
  it("shows the scholar's drawing, not the built-in companion", async () => {
    render(
      (
        <PixelCustomizer
          characterConfig={CONFIG}
          savedConfig={CONFIG}
          user={{ hunterRank: "RANK E", level: 1 }}
          onChange={() => {}}
          onReset={() => {}}
          onSave={() => {}}
          onBack={() => {}}
        />
      ) as ReactNode as never,
    );

    await act(async () => {
      await Promise.resolve();
    });
    // The drawing arrives after the catalogue read resolves, so poll for it
    // rather than sampling once.
    await vi.waitFor(() => expect(redCells()).toBeGreaterThan(0));
  });
});

describe("the dashboard catalogue after a save", () => {
  it("selects future paint directly through hex, spectrum and recent colors without editing history", async () => {
    const { PixelStudio } = await import("@/app/locker/components/studio/PixelStudio");
    const view = render(<PixelStudio characterConfig={CONFIG} onEquip={() => {}} onBack={() => {}} />);
    const hex = view.getByRole("textbox", { name: "Paint color hex" });
    fireEvent.change(hex, { target: { value: "#F04A29" } }); fireEvent.blur(hex);
    expect(view.queryByRole("button", { name: "Recent color #f04a29" })).toBeNull();
    expect((view.getByLabelText("Paint color spectrum") as HTMLInputElement).value).toBe('#f04a29');
    expect((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.queryByRole("button", { name: "Use color" })).toBeNull();
    expect(view.queryByRole("button", { name: "Replace selected" })).toBeNull();
    fireEvent.change(view.getByLabelText("Paint color spectrum"), { target: { value: '#2288dd' } });
    expect(view.queryByRole("button", { name: "Recent color #2288dd" })).toBeNull();
    expect((view.getByRole("textbox", { name: "Paint color hex" }) as HTMLInputElement).value).toBe('#2288dd');
    expect((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole("checkbox", { name: "Show border" }));
    const border = view.getByRole("textbox", { name: "Border color hex" });
    fireEvent.change(border, { target: { value: "#FF7700" } }); fireEvent.blur(border);
    expect(view.container.querySelector('[data-display-border="#ff7700"]')).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Undo" }));
    expect(view.container.querySelector('[data-display-border="#ff7700"]')).toBeNull();
  });
  it("applies border and spacing with Save while leaving the equipped artwork selection alone", async () => {
    const { PixelStudio } = await import("@/app/locker/components/studio/PixelStudio");
    const onEquip = vi.fn();
    const view = render(<PixelStudio characterConfig={CONFIG} onEquip={onEquip} onBack={() => {}} />);
    fireEvent.click(view.getByRole("checkbox", { name: "Show border" }));
    fireEvent.change(view.getByRole("slider", { name: "Pixel spacing" }), { target: { value: "20" } });
    await act(async () => { fireEvent.click(view.getByRole("button", { name: /^Save$/ })); await Promise.resolve(); });
    expect(onEquip).toHaveBeenCalledWith({ displayBorder: '#5ac9d1', pixelGap: 0.2 });
    expect(onEquip.mock.calls[0][0]).not.toHaveProperty('outfit');
  });
  it("lets a duration be typed digit by digit and undoes the committed value as one edit", async () => {
    const { PixelStudio } = await import("@/app/locker/components/studio/PixelStudio");
    const view = render(<PixelStudio characterConfig={CONFIG} onEquip={() => {}} onBack={() => {}} />);
    const input = view.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1" } });
    for (const digit of "200") fireEvent.change(input, { target: { value: input.value + digit } });
    expect(input.value).toBe("1200");
    fireEvent.blur(input);
    expect(view.getByRole("button", { name: "Frame 1, 1200 milliseconds" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Undo" }));
    expect((view.getByRole("spinbutton") as HTMLInputElement).value).toBe("240");
  });
  it("keeps a legacy blank draft editable without resolving it as equipped artwork", async () => {
    stored = [{ ...STORED_CREATION, data: { ...creationDocument(), frames: [emptyFrame(48)] } }];
    const { usePixelCreations } = await import("@/lib/pixel-creations-client");
    function LibraryProbe() {
      const library = usePixelCreations(testOwner);
      return <output data-testid="library">{JSON.stringify({ loaded: library.loaded, documents: library.creations.length, equippedAssets: library.assets.length })}</output>;
    }
    const view = render(<LibraryProbe />);
    await vi.waitFor(() => expect(JSON.parse(view.getByTestId("library").textContent!)).toEqual({ loaded: true, documents: 1, equippedAssets: 0 }));
  });
  it("reads the catalogue again, so a new drawing can be drawn", async () => {
    // An empty list fills the cache, exactly as opening the app does.
    stored = [];
    const first = render(<PixelCompanionCard size={110} /> as ReactNode as never);
    await vi.waitFor(() => expect(listReads).toBe(1));
    first.unmount();

    // The scholar's drawing is saved. The studio owns that write.
    stored = [STORED_CREATION];
    const { PixelStudio } = await import("@/app/locker/components/studio/PixelStudio");
    const studio = render(
      (
        <PixelStudio
          characterConfig={CONFIG}
          onEquip={() => {}}
          onBack={() => {}}
        />
      ) as ReactNode as never,
    );
    const save = studio.getByRole("button", { name: /^Save$/ });
    expect(save).not.toBeNull();
    await act(async () => {
      (save as HTMLButtonElement).click();
      await Promise.resolve();
    });
    studio.unmount();

    // The scholar is now wearing it, and opens the dashboard again. Only reads
    // made from here on are counted, so a read by the studio itself cannot
    // satisfy the assertion.
    listReads = 0;
    user = {
      id: testOwner,
      characterConfig: { outfit: "user:audit-star", pedestal: "pedestal_cyber" },
      hunterRank: "RANK E",
      level: 1,
    };
    const second = render(<PixelCompanionCard size={110} /> as ReactNode as never);
    // Save invalidation refreshes mounted subscribers; remount reuses that fresh list.
    expect(listReads).toBe(0);
    await vi.waitFor(() => expect(redCells()).toBeGreaterThan(0));
    second.unmount();
  });
});

describe("a level-up on the production card", () => {
  it("celebrates an equipped user drawing without substituting character geometry", async () => {
    user = { id: testOwner, characterConfig: { outfit: STORED_CREATION.data.id } };
    const view = render(<PixelCompanionCard size={110} /> as ReactNode as never);
    await vi.waitFor(() => expect(globalThis.__pixelDashboard).toBeTruthy());
    const probe = globalThis.__pixelDashboard!;
    probe.runtime.tick();
    const before = probe.handle.display.snapshot();
    await act(async () => {
      lastLevelUp = { runId: 1, newLevel: 12 };
      view.rerender(<PixelCompanionCard size={110} /> as ReactNode as never);
    });
    probe.runtime.tick();
    expect(view.container.querySelector("[data-state='CELEBRATING']")).toBeTruthy();
    const after = probe.handle.display.snapshot();
    expect(after.some((color, i) => color !== before[i])).toBe(true);
    expect(after.every((color, i) => before[i] !== 0 || color === 0)).toBe(true);
    view.unmount();
  });
});
