import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  CATALOG_ITEMS,
  ARCHIVED_CATALOG_ITEMS,
  isRankSufficient,
  calculateSetBundlePrice,
  RANK_WEIGHTS,
} from "@/lib/shop-items";
import { POST as purchaseRoute } from "@/app/api/shop/purchase/route";
import { GET as getShopRoute } from "@/app/api/shop/route";
import { NextRequest } from "next/server";
import * as auth from "@/lib/auth";

describe("Surface Overhaul Phase 1 — Interactive System Store (`/shop`)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rank Gating & Weight Calculations", () => {
    it("evaluates rank sufficiency accurately across all 8 tiers", () => {
      expect(isRankSufficient("RANK E", "RANK E")).toBe(true);
      expect(isRankSufficient("RANK E", "RANK D")).toBe(false);
      expect(isRankSufficient("RANK D", "RANK E")).toBe(true);
      expect(isRankSufficient("RANK S", "RANK A")).toBe(true);
      expect(isRankSufficient("RANK S", "MONARCH")).toBe(false);
      expect(isRankSufficient("MONARCH", "MONARCH")).toBe(true);
      expect(isRankSufficient("MONARCH", "RANK E")).toBe(true);
    });

    it("handles shorthand rank notations gracefully", () => {
      expect(isRankSufficient("S", "RANK A")).toBe(true);
      expect(isRankSufficient("E", "RANK D")).toBe(false);
      expect(isRankSufficient("A", "RANK A")).toBe(true);
    });
  });

  describe("Set Bundle 15% Discount Engine", () => {
    it("calculates 15% discount price with floor rounding", () => {
      // Rookie Explorer pieces: 100 + 150 + 120 + 100 = 470. 15% discount -> 470 * 0.85 = 399.5 -> 399
      const rookiePrices = [100, 150, 120, 100];
      expect(calculateSetBundlePrice(rookiePrices, 15)).toBe(399);

      // Vanguard Plate pieces: 250 + 350 + 280 + 250 = 1130. 15% discount -> 1130 * 0.85 = 960.5 -> 960
      const vanguardPrices = [250, 350, 280, 250];
      expect(calculateSetBundlePrice(vanguardPrices, 15)).toBe(960);
    });
  });

  describe("Catalog Integrity & Set Bundle Decomposition", () => {
    it("ensures every set bundle has 4 corresponding individual equipment pieces in catalog", () => {
      const bundles = ARCHIVED_CATALOG_ITEMS.filter((i) => i.category === "SET_BUNDLE");
      expect(bundles.length).toBeGreaterThanOrEqual(10);

      bundles.forEach((bundle) => {
        expect(bundle.setKey).toBeDefined();
        const pieces = ARCHIVED_CATALOG_ITEMS.filter(
          (i) => i.setKey === bundle.setKey && i.category === "EQUIPMENT"
        );
        expect(pieces.length).toBe(4);

        const slots = pieces.map((p) => p.slot).sort();
        expect(slots).toEqual(["BOOTS", "CHESTPLATE", "HELMET", "PANTS"]);
      });
    });
  });

  describe("Atomic Shop Purchase API Endpoint (`POST /api/shop/purchase`)", () => {
    it("rejects unauthenticated requests", async () => {
      const req = new NextRequest("http://localhost:3000/api/shop/purchase", {
        method: "POST",
        body: JSON.stringify({ itemId: 1 }),
      });

      const res = await purchaseRoute(req);
      expect(res.status).toBe(401);
    });

    it("executes purchase inside atomic transaction and returns remaining currency", async () => {
      vi.spyOn(auth, "verifyToken").mockResolvedValue({ userId: 101, username: "hunter_x" } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ username: "hunter_x" } as any);

      // Mock $transaction
      const mockRpcResult = [
        {
          success: true,
          remaining_currency: 850,
          inventory_id: 42,
          new_quantity: 1,
        },
      ];

      vi.spyOn(prisma, "$transaction").mockImplementation(async (cb: any) => {
        const fakeTx = {
          $executeRawUnsafe: vi.fn().mockResolvedValue(1),
          $queryRawUnsafe: vi.fn().mockResolvedValue(mockRpcResult),
        };
        return cb(fakeTx);
      });

      const req = new NextRequest("http://localhost:3000/api/shop/purchase", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: 5 }),
      });

      const res = await purchaseRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.remainingCurrency).toBe(850);
      expect(json.inventoryId).toBe(42);
      expect(json.newQuantity).toBe(1);
    });

    it("handles Insufficient Sylph exception with status 400", async () => {
      vi.spyOn(auth, "verifyToken").mockResolvedValue({ userId: 101, username: "hunter_x" } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({ username: "hunter_x" } as any);

      vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("Insufficient Sylph"));

      const req = new NextRequest("http://localhost:3000/api/shop/purchase", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: 99 }),
      });

      const res = await purchaseRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe("Insufficient Sylph");
    });
  });

  describe("Shop Catalog API Endpoint (`GET /api/shop`)", () => {
    it("returns catalog and default stats for unauthenticated visitors", async () => {
      vi.spyOn(prisma.item, "findMany").mockResolvedValue(ARCHIVED_CATALOG_ITEMS.map((item, idx) => ({ ...item, id: idx + 1 })) as any);

      const req = new NextRequest("http://localhost:3000/api/shop", {
        method: "GET",
      });

      const res = await getShopRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(Array.isArray(json.catalog)).toBe(true);
      expect(json.catalog.length).toBeGreaterThanOrEqual(0);
      expect(json.stats.rank).toBe("RANK E");
    });
  });
});
