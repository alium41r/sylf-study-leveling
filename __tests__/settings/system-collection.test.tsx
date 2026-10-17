import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { CollectionSettingsScreen } from "@/app/settings/collection/components/CollectionSettingsScreen";
import {
  characterStyles,
  ownedInventory,
  storedProfileCosmetics,
  type CollectionItem,
} from "@/lib/system-collection";

vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      name: "Scholar",
      level: 4,
      hunterRank: "E",
      characterConfig: { outfit: "form_deadpool", pedestal: "pedestal_cyber" },
    },
  }),
}));
vi.mock("@/app/components/BackToSettings", () => ({
  default: () => <button>Back to System Hub</button>,
}));
vi.mock("@/app/components/CustomAudioContext", async () => ({
  CustomAudioContext: (await import("react")).createContext({
    library: [
      {
        id: "track",
        title: "Rain study",
        originalFilename: "rain.mp3",
        sizeBytes: 1000000,
        duration: 60,
      },
    ],
    activeTrackId: "track",
  }),
}));

const item = (
  id: number,
  quantity: number,
  equipped = false
): CollectionItem => ({
  id,
  quantity,
  isEquipped: equipped,
  acquiredAt: "2026-10-01",
  item: {
    id,
    sku: `item-${id}`,
    name: `Item ${id}`,
    description: "From the live inventory",
    category: "WEAPON",
    slot: "WEAPON",
    rarity: "RARE",
    rankRequirement: "RANK E",
  },
});
const responses: Record<string, unknown> = {
  "/api/inventory": { inventory: [item(1, 2, true), item(2, 0)], stats: {} },
  "/api/cosmetics": {
    cosmetics: [
      { category: "AVATAR", itemKey: "class_scholar" },
      { category: "THEME", itemKey: "theme_emerald" },
      { category: "FRAME", itemKey: "frame_default" },
      { category: "FRAME", itemKey: "frame_gold" },
    ],
    active: { activeFrame: "frame_gold" },
  },
  "/api/user/focus-backgrounds": {
    backgrounds: [{ id: 9, name: "My study space", layoutKey: "landscape" }],
    quota: { used: 1, max: 10 },
  },
  "/api/focus-backgrounds": {
    categories: [
      {
        name: "Official",
        layoutKey: "fantasy",
        backgrounds: [{ id: 2, name: "Sanctum" }],
      },
    ],
  },
  "/api/currency/stats": {
    currentBalance: 50,
    totalEarned: 300,
    totalSpent: 250,
    totalHpLost: 20,
  },
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(responses[url]), { status: 200 })
    )
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Current System collection", () => {
  it("reads current inventory quantities and equipped state without treating zero as one", async () => {
    render(<CollectionSettingsScreen />);
    await screen.findByRole("heading", { name: "Item 1" });
    expect(
      screen.queryByRole("heading", { name: "Item 2" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Qty 2")).toBeVisible();
    expect(screen.getByText(/1 distinct · 2 total · 1 equipped/)).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "System library" })
    ).not.toBeInTheDocument();
  });
  it("distinguishes available styles, saved personal images, official availability and local audio", async () => {
    render(<CollectionSettingsScreen />);
    await screen.findByRole("heading", { name: "Item 1" });
    const index = screen.getByRole("complementary", {
      name: "Collection index",
    });
    const pane = screen.getByRole("region", { name: "Items & equipment" });
    expect(pane).toHaveAttribute("tabindex", "0");
    pane.scrollTop = 250;
    fireEvent.click(
      within(index).getByRole("button", { name: /Character styles/ })
    );
    expect(pane.scrollTop).toBe(0);
    expect(screen.getByRole("heading", { name: "Deadpool" })).toBeVisible();
    expect(screen.getAllByText("Selected").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Scholar" })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(index).getByRole("button", { name: /Backdrops/ })
    );
    expect(
      screen.getByRole("heading", { name: "My study space" })
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sanctum" })).toBeVisible();
    expect(screen.getByText("Shared gallery")).toBeVisible();
    fireEvent.click(
      within(index).getByRole("button", { name: /Audio library/ })
    );
    expect(screen.getByRole("heading", { name: "Rain study" })).toBeVisible();
    expect(screen.getAllByText(/Mix soundscapes/).length).toBeGreaterThan(0);
  });
  it("surfaces failed sources without reporting them as empty owned collections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(responses[url]), {
            status: url === "/api/inventory" ? 500 : 200,
          })
      )
    );
    render(<CollectionSettingsScreen />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load items"
      )
    );
    await screen.findByRole("heading", { name: "Inventory unavailable" });
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });
  it("excludes appearance preferences, old portraits, duplicates and baseline defaults from acquisitions", () => {
    expect(
      storedProfileCosmetics([
        { category: "CLASS", itemKey: "class_scholar" },
        { category: "AVATAR", itemKey: "class_scholar" },
        { category: "THEME", itemKey: "emerald" },
        { category: "BACKGROUND", itemKey: "void" },
        { category: "FRAME", itemKey: "none" },
        { category: "TITLE", itemKey: "title_novice" },
        { category: "NAME_COLOR", itemKey: "default" },
        { category: "FRAME", itemKey: "frame_gold" },
        { category: "FRAME", itemKey: "frame_gold" },
      ])
    ).toEqual([{ category: "FRAME", itemKey: "frame_gold" }]);
    expect(ownedInventory([item(1, 0), item(2, 3)])).toHaveLength(1);
    expect(
      characterStyles(1, "E").some(
        (style) => style.id === "none" || style.id.startsWith("class_")
      )
    ).toBe(false);
  });
});
