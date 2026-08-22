import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  CATALOG_ITEMS,
  ARCHIVED_CATALOG_ITEMS,
  isRankSufficient,
  calculateSetBundlePrice,
  RANK_WEIGHTS,
} from "@/lib/shop-items";
import { HpPenaltyService } from "@/lib/hp-penalty-service";

describe("Gamification Engine Phase 2 — Economy, Consumables & Wardrobe Engine", () => {
  describe("Catalog Integrity & Mathematical Utilities", () => {
    it("provides the complete 5-tier catalog with valid constraints", () => {
      expect(ARCHIVED_CATALOG_ITEMS.length).toBeGreaterThan(30);

      // Verify all 9 consumables exist across all 5 tiers
      const consumables = ARCHIVED_CATALOG_ITEMS.filter((i) => i.category === "CONSUMABLE");
      expect(consumables.length).toBe(9);
      expect(consumables.map((c) => c.sku)).toContain("common-hp-draught");
      expect(consumables.map((c) => c.sku)).toContain("common-focus-tonic");
      expect(consumables.map((c) => c.sku)).toContain("rare-vitality-brew");
      expect(consumables.map((c) => c.sku)).toContain("rare-time-token");
      expect(consumables.map((c) => c.sku)).toContain("epic-recovery-flask");
      expect(consumables.map((c) => c.sku)).toContain("epic-chrono-elixir");
      expect(consumables.map((c) => c.sku)).toContain("legendary-phoenix-tear");
      expect(consumables.map((c) => c.sku)).toContain("mythic-streak-shield");
      expect(consumables.map((c) => c.sku)).toContain("mythic-monarch-ambrosia");

      // Verify 4-piece sets and bundle discounts
      const setKeys = [
        "rookie-explorer",
        "trainee-chainmail",
        "vanguard-plate",
        "shadow-mail",
        "chrono-threads",
        "frost-armour",
        "dragon-scale",
        "asura-aegis",
        "monarchs-regalia",
        "eternity-suit",
      ];

      for (const setKey of setKeys) {
        const pieces = ARCHIVED_CATALOG_ITEMS.filter((i) => i.setKey === setKey && i.category === "EQUIPMENT");
        expect(pieces.length).toBe(4);
        expect(pieces.map((p) => p.slot)).toEqual(
          expect.arrayContaining(["HELMET", "CHESTPLATE", "PANTS", "BOOTS"])
        );

        const bundle = ARCHIVED_CATALOG_ITEMS.find((i) => i.setKey === setKey && i.category === "SET_BUNDLE");
        expect(bundle).toBeDefined();
        const piecePrices = pieces.map((p) => p.costSylph);
        expect(bundle!.costSylph).toBe(calculateSetBundlePrice(piecePrices, 15));
      }
    });

    it("evaluates rank sufficiency hierarchically", () => {
      // Rank E tests
      expect(isRankSufficient("RANK E", "RANK E")).toBe(true);
      expect(isRankSufficient("RANK E", "RANK D")).toBe(false);
      expect(isRankSufficient("RANK E", "RANK S")).toBe(false);
      expect(isRankSufficient("RANK E", "MONARCH")).toBe(false);

      // Rank D tests
      expect(isRankSufficient("RANK D", "RANK E")).toBe(true);
      expect(isRankSufficient("RANK D", "RANK D")).toBe(true);
      expect(isRankSufficient("RANK D", "RANK C")).toBe(false);

      // Rank S tests
      expect(isRankSufficient("RANK S", "RANK E")).toBe(true);
      expect(isRankSufficient("RANK S", "RANK A")).toBe(true);
      expect(isRankSufficient("RANK S", "RANK S")).toBe(true);
      expect(isRankSufficient("RANK S", "NATIONAL")).toBe(false);
      expect(isRankSufficient("RANK S", "MONARCH")).toBe(false);

      // Monarch tests
      expect(isRankSufficient("MONARCH", "RANK E")).toBe(true);
      expect(isRankSufficient("MONARCH", "RANK S")).toBe(true);
      expect(isRankSufficient("MONARCH", "NATIONAL")).toBe(true);
      expect(isRankSufficient("MONARCH", "MONARCH")).toBe(true);
    });

    it("calculates 15% discount accurately for set bundles", () => {
      const piecePrices = [100, 150, 120, 100]; // total 470
      const discounted = calculateSetBundlePrice(piecePrices, 15);
      expect(discounted).toBe(Math.floor(470 * 0.85)); // 399
    });
  });

  describe("Consumable Interceptors & Zero-Quantity Cleanup in HpPenaltyService", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("intercepts streak failures with Streak Shield and deletes record at zero quantity", async () => {
      const mockShield = {
        id: 42,
        userId: 1,
        quantity: 1,
        item: { sku: "mythic-streak-shield", name: "Streak Shield" },
      };

      const mockDelete = vi.fn().mockResolvedValue(mockShield);
      const mockSystemMessage = vi.fn().mockResolvedValue({});

      const mockTx = {
        userInventory: {
          findFirst: vi.fn().mockResolvedValue(mockShield),
          delete: mockDelete,
          update: vi.fn(),
        },
        systemMessage: {
          create: mockSystemMessage,
        },
      };

      const result = await HpPenaltyService.interceptStreakPenalty(1, mockTx);
      expect(result.shielded).toBe(true);
      expect(result.itemUsed).toBe("mythic-streak-shield");
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 42 } });
      expect(mockSystemMessage).toHaveBeenCalled();
    });

    it("decrements quantity instead of deleting when quantity > 1", async () => {
      const mockShield = {
        id: 42,
        userId: 1,
        quantity: 3,
        item: { sku: "mythic-streak-shield", name: "Streak Shield" },
      };

      const mockUpdate = vi.fn().mockResolvedValue({ ...mockShield, quantity: 2 });
      const mockDelete = vi.fn();
      const mockSystemMessage = vi.fn().mockResolvedValue({});

      const mockTx = {
        userInventory: {
          findFirst: vi.fn().mockResolvedValue(mockShield),
          delete: mockDelete,
          update: mockUpdate,
        },
        systemMessage: {
          create: mockSystemMessage,
        },
      };

      const result = await HpPenaltyService.interceptStreakPenalty(1, mockTx);
      expect(result.shielded).toBe(true);
      expect(result.itemUsed).toBe("mythic-streak-shield");
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { quantity: { decrement: 1 } },
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("intercepts HP penalties with Phoenix Tear, restores 100% HP, and deletes consumed item", async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: 1,
        hp: 40,
        maxHp: 100,
        timezone: "UTC",
        dailyGoalMinutes: 60,
        restDays: [],
        enableHpPenalty: true,
        lastDailyPenaltyEvaluatedDate: "",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      } as any);

      vi.spyOn(prisma.studySession, "findMany").mockResolvedValue([]);

      const mockPhoenixTear = {
        id: 99,
        quantity: 1,
        item: { sku: "legendary-phoenix-tear", name: "Phoenix Tear" },
      };

      const mockInventoryDelete = vi.fn().mockResolvedValue(mockPhoenixTear);
      const mockHpLedgerCreate = vi.fn().mockResolvedValue({});
      const mockUserUpdate = vi.fn().mockResolvedValue({});
      const mockSystemMessageCreate = vi.fn().mockResolvedValue({});

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback({
          userInventory: {
            findFirst: vi.fn().mockResolvedValue(mockPhoenixTear),
            delete: mockInventoryDelete,
            update: vi.fn(),
          },
          hpLedger: {
            create: mockHpLedgerCreate,
          },
          systemMessage: {
            create: mockSystemMessageCreate,
          },
          user: {
            update: mockUserUpdate,
          },
        });
      });

      const reconciliation = await HpPenaltyService.reconcileDailyHpPenalty(1);
      expect(reconciliation.mitigatedByItem).toBe("Phoenix Tear");
      expect(reconciliation.newHp).toBe(100);
      expect(mockInventoryDelete).toHaveBeenCalledWith({ where: { id: 99 } });
      expect(mockHpLedgerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "INTERCEPT_LEGENDARY-PHOENIX-TEAR",
          }),
        })
      );
    });
  });
});
