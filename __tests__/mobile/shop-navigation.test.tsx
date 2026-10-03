/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { NavigationProvider } from "@/mobile/src/adapters/navigation/NavigationContext";
import { MobileRouteOutlet } from "@/mobile/src/components/MobileRouteOutlet";
import {
  MOCK_STUDENT_USER,
  MOCK_SHOP_CATALOG,
  mockUserInventory,
  resetMockShopState,
  setupMockApiInterception,
  isMockApiInterceptionActive,
  resetMockApiInterception,
} from "@/mobile/src/adapters/api/mock-api";

// Use mobile navigation adapter for next/navigation
vi.mock("next/navigation", async () => import("@/mobile/src/adapters/navigation/next-navigation"));

// Mock AuthProvider so ShopScreen renders without full Next.js auth backend
vi.mock("@/app/components/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      name: "Sung Jin-Woo",
      email: "scholar@sylf.app",
      hunterRank: "S",
      sylph: 1250,
      characterConfig: {
        skinColor: "fair",
        hairStyle: "messy",
        hairColor: "black",
        eyeColor: "blue",
        expression: "calm",
        outfit: "uniform",
        outfitColor: "dark",
        aura: "aura_monarch",
        pedestal: "pedestal_obsidian",
        pedestalKey: "pedestal_obsidian",
        gender: "male",
      },
    },
    isLoading: false,
    mutateUser: vi.fn(),
  }),
}));

describe("Phase 1D-F: Canonical Shop & Inventory Alias Parity", () => {
  beforeEach(() => {
    window.location.hash = "";
    resetMockShopState();
    resetMockApiInterception();
  });

  afterEach(() => {
    resetMockApiInterception();
    vi.restoreAllMocks();
  });

  it("renders canonical ShopScreen when navigating to /shop", async () => {
    window.location.hash = "#/shop";

    render(
      <NavigationProvider initialPath="/shop">
        <MobileRouteOutlet />
      </NavigationProvider>
    );

    // ShopScreen header contains "System Store" and category tabs
    await waitFor(
      () => {
        expect(screen.getByText("System Store")).toBeDefined();
        expect(screen.getByRole("button", { name: /hunter forms/i })).toBeDefined();
        expect(screen.getByRole("button", { name: /pedestal cores/i })).toBeDefined();
      },
      { timeout: 4000 }
    );
  });

  it("renders canonical ShopScreen when navigating to /inventory (canonical production alias)", async () => {
    window.location.hash = "#/inventory";

    render(
      <NavigationProvider initialPath="/inventory">
        <MobileRouteOutlet />
      </NavigationProvider>
    );

    // In production, /inventory is an alias for ShopPage, so it renders ShopScreen
    await waitFor(
      () => {
        expect(screen.getByText("System Store")).toBeDefined();
        expect(screen.getByRole("button", { name: /hunter forms/i })).toBeDefined();
      },
      { timeout: 4000 }
    );
  });

  it("intercepts deferred dynamic subroutes with clear 'not migrated' badge for /shop/item/1", async () => {
    window.location.hash = "#/shop/item/1";

    render(
      <NavigationProvider initialPath="/shop/item/1">
        <MobileRouteOutlet />
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Shop Sub-Route")).toBeDefined();
      expect(
        screen.getByText("Dynamic route not yet migrated — deferred to Phase 1D Deferred Dynamic Route")
      ).toBeDefined();
    });
  });

  it("intercepts deferred dynamic subroutes with clear 'not migrated' badge for /inventory/items/42", async () => {
    window.location.hash = "#/inventory/items/42";

    render(
      <NavigationProvider initialPath="/inventory/items/42">
        <MobileRouteOutlet />
      </NavigationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Inventory Sub-Route")).toBeDefined();
      expect(
        screen.getByText("Dynamic route not yet migrated — deferred to Phase 1D Deferred Dynamic Route")
      ).toBeDefined();
    });
  });

  it("serves mock /api/shop catalog and user inventory when mock API is enabled", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      const res = await fetch("/api/shop");
      expect(res.ok).toBe(true);
      const data = await res.json();

      expect(data.catalog).toBeDefined();
      expect(data.catalog.length).toBeGreaterThan(0);
      expect(data.inventory).toBeDefined();
      expect(data.stats).toBeDefined();
      expect(data.stats.currency).toBe(1250);
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("serves mock /api/inventory with user inventory and hunter stats", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      const res = await fetch("/api/inventory");
      expect(res.ok).toBe(true);
      const data = await res.json();

      expect(data.inventory).toBeDefined();
      expect(data.inventory.length).toBe(2);
      expect(data.inventory[0].item.sku).toBe("pedestal-cyber-matrix");
      expect(data.stats).toBeDefined();
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("performs mock purchase, deducts Sylph balance, and updates inventory", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      const initialSylph = MOCK_STUDENT_USER.sylph;
      // Item 102: Silver Sentinel Vestments (cost: 150 Sylph, Rank E requirement)
      const targetItem = MOCK_SHOP_CATALOG.find((i) => i.id === 102)!;
      expect(targetItem).toBeDefined();

      const purchaseRes = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: targetItem.id }),
      });

      expect(purchaseRes.status).toBe(200);
      const purchaseData = await purchaseRes.json();
      expect(purchaseData.success).toBe(true);
      expect(purchaseData.remainingCurrency).toBe(initialSylph - targetItem.costSylph);
      expect(MOCK_STUDENT_USER.sylph).toBe(initialSylph - targetItem.costSylph);

      // Verify item now exists in inventory
      const owned = mockUserInventory.find((i) => i.itemId === targetItem.id);
      expect(owned).toBeDefined();
      expect(owned?.quantity).toBe(1);

      // Attempting to buy same non-consumable item again returns 400
      const repeatRes = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: targetItem.id }),
      });
      expect(repeatRes.status).toBe(400);
      const repeatData = await repeatRes.json();
      expect(repeatData.error).toBe("Item already owned");
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("enforces rank requirement on purchases in mock mode", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      // Temporarily lower user rank to E
      const originalRank = MOCK_STUDENT_USER.hunterRank;
      MOCK_STUDENT_USER.hunterRank = "RANK E";

      // Item 108: Demon King's Shortsword requires RANK S
      const sRankItem = MOCK_SHOP_CATALOG.find((i) => i.id === 108)!;
      expect(sRankItem.rankRequirement).toBe("RANK S");

      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: sRankItem.id }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Insufficient rank");

      // Restore rank
      MOCK_STUDENT_USER.hunterRank = originalRank;
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("enforces insufficient Sylph balance on purchases in mock mode", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      // Temporarily set sylph balance to 10
      const originalSylph = MOCK_STUDENT_USER.sylph;
      MOCK_STUDENT_USER.sylph = 10;

      // Item 103 costs 250 Sylph
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: 103 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Insufficient Sylph");

      MOCK_STUDENT_USER.sylph = originalSylph;
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("handles equipping and unequipping items via /api/inventory/equip", async () => {
    const originalFetch = window.fetch;
    setupMockApiInterception(true);

    try {
      // Item 1 in mockUserInventory is initially equipped
      expect(mockUserInventory[0].isEquipped).toBe(true);

      const toggleRes = await fetch("/api/inventory/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryId: 1 }),
      });

      expect(toggleRes.status).toBe(200);
      const toggleData = await toggleRes.json();
      expect(toggleData.success).toBe(true);
      expect(toggleData.isEquipped).toBe(false);
      expect(mockUserInventory[0].isEquipped).toBe(false);
    } finally {
      window.fetch = originalFetch;
    }
  });

  it("fails closed when VITE_ENABLE_MOCK_API is not 'true'", () => {
    const originalFetch = window.fetch;
    const dummyFetch = vi.fn();
    window.fetch = dummyFetch as unknown as typeof fetch;

    setupMockApiInterception(false);
    expect(isMockApiInterceptionActive()).toBe(false);
    // Fetch should NOT be replaced by mock handler
    expect(window.fetch).toBe(dummyFetch);

    window.fetch = originalFetch;
  });
});
