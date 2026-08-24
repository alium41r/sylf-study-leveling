"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { useRouter } from "next/navigation";
import { CharacterRenderer } from "@/app/components/character/CharacterRenderer";
import { CharacterConfig } from "@/lib/character-traits";
import { fetchCachedJSON } from "@/lib/client-data-cache";
import {
  CATALOG_ITEMS,
  CatalogItemDefinition,
  isRankSufficient,
  calculateSetBundlePrice,
  ItemCategory,
  ItemRarity,
} from "@/lib/shop-items";
import {
  Store,
  Shield,
  Sparkles,
  Search,
  Check,
  Lock,
  Package,
  Layers,
  Sword,
  FlaskConical,
  RotateCcw,
  Tag,
  AlertCircle,
  Zap,
  Crown,
  Eye,
  User,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface ShopItem extends CatalogItemDefinition {
  id?: number;
}

type TabType = "FORMS" | "PEDESTALS" | "AURAS" | "WEAPONS_RELICS" | "CONSUMABLES" | "ALL";

// ─── Slot Key Normalization ─────────────────────────────────────
// Maps uppercase DB item slots to lowercase CharacterConfig properties
const SLOT_TO_CONFIG_KEY: Record<string, keyof CharacterConfig> = {
  HELMET: "helmet",
  CHESTPLATE: "chestplate",
  PANTS: "pants",
  BOOTS: "boots",
  WEAPON: "weapon",
  RELIC: "relic",
};

// ─── Rarity Visual Maps ─────────────────────────────────────────

const RARITY_CARD_GLOW: Record<ItemRarity, string> = {
  COMMON:
    "border-zinc-700/60 hover:border-zinc-600",
  RARE:
    "border-blue-500/40 hover:border-blue-400/70 shadow-[0_0_15px_rgba(59,130,246,0.15)] hover:shadow-[0_0_22px_rgba(59,130,246,0.3)]",
  EPIC:
    "border-purple-500/40 hover:border-purple-400/70 shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_22px_rgba(168,85,247,0.3)]",
  LEGENDARY:
    "border-amber-500/40 hover:border-amber-400/70 shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_28px_rgba(245,158,11,0.35)]",
  MYTHIC:
    "border-rose-500/50 hover:border-rose-400/80 shadow-[0_0_25px_rgba(244,63,94,0.25)] hover:shadow-[0_0_35px_rgba(244,63,94,0.45)]",
};

const RARITY_BADGE_STYLE: Record<ItemRarity, string> = {
  COMMON: "border-zinc-700 bg-zinc-800 text-zinc-300",
  RARE: "border-blue-500/50 bg-blue-500/20 text-blue-400",
  EPIC: "border-purple-500/50 bg-purple-500/20 text-purple-400",
  LEGENDARY: "border-amber-500/50 bg-amber-500/20 text-amber-400",
  MYTHIC: "border-rose-500/60 bg-rose-500/20 text-rose-400",
};

const RARITY_LOCK_BADGE: Record<ItemRarity, string> = {
  COMMON: "bg-zinc-900/80 border-zinc-700/60 text-zinc-400",
  RARE: "bg-blue-950/60 border-blue-500/30 text-blue-400",
  EPIC: "bg-purple-950/60 border-purple-500/30 text-purple-400",
  LEGENDARY: "bg-amber-950/60 border-amber-500/30 text-amber-400",
  MYTHIC: "bg-rose-950/60 border-rose-500/30 text-rose-400",
};

// ─── Tab Configuration ──────────────────────────────────────────

const TABS: { id: TabType; label: string; icon: typeof Store }[] = [
  { id: "FORMS", label: "Hunter Forms", icon: User },
  { id: "PEDESTALS", label: "Pedestal Cores", icon: Shield },
  { id: "AURAS", label: "Energy Auras", icon: Sparkles },
  { id: "WEAPONS_RELICS", label: "Arsenal & Relics", icon: Sword },
  { id: "CONSUMABLES", label: "Consumables", icon: FlaskConical },
  { id: "ALL", label: "All Items", icon: Layers },
];

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function ShopPage() {
  const { user, token, mutateUser } = useAuth();
  const router = useRouter();

  // ─── Core State ─────────────────────────────────────────────
  const [catalog, setCatalog] = useState<ShopItem[]>(CATALOG_ITEMS);
  const [ownedItemIds, setOwnedItemIds] = useState<Set<number>>(new Set());
  const [ownedQuantities, setOwnedQuantities] = useState<Record<number, number>>({});
  const [ownedSkus, setOwnedSkus] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // ─── Filter State ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>("FORMS");
  const [rarityFilter, setRarityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Preview State Machine ──────────────────────────────────
  // Invariant 1: hoveredPreview ?? pinnedPreview ?? baseEquippedConfig
  const [hoveredItem, setHoveredItem] = useState<ShopItem | null>(null);
  const [pinnedItem, setPinnedItem] = useState<ShopItem | null>(null);

  // ─── Derived Values ─────────────────────────────────────────
  const activeUserRank = user?.hunterRank || "RANK E";
  // Invariant 3: Null-safe balance
  const userSylphBalance = user?.sylph ?? 0;

  // ─── Base Character Configuration ───────────────────────────
  const baseConfig: CharacterConfig = useMemo(() => {
    return (
      user?.characterConfig || {
        outfit: "test_hunter_base",
        pedestal: "pedestal_cyber",
        pedestalKey: "pedestal_cyber",
        aura: user?.activeAura || "none",
      }
    );
  }, [user?.characterConfig, user?.activeAura]);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchShopData = useCallback(async () => {
    try {
      setLoading(true);
      // Stale-while-revalidate: the catalog is static and the inventory
      // changes only on purchase, so repeat visits paint instantly.
      const data = await fetchCachedJSON<{
        catalog: any[];
        inventory: any[];
      }>(
        "/api/shop",
        token ? { headers: { Authorization: `Bearer ${token}` } } : {},
        { ttlMs: 30_000, staleMs: 300_000, storageKey: `shop:data:${user?.id ?? 0}` }
      );

      if (data) {
        if (Array.isArray(data.catalog)) {
          setCatalog(data.catalog);
        }

        if (Array.isArray(data.inventory)) {
          const idSet = new Set<number>();
          const skuSet = new Set<string>();
          const quantities: Record<number, number> = {};

          data.inventory.forEach((inv: any) => {
            idSet.add(inv.itemId);
            quantities[inv.itemId] = inv.quantity || 1;
            if (inv.item?.sku) {
              skuSet.add(inv.item.sku);
            }
          });

          setOwnedItemIds(idSet);
          setOwnedSkus(skuSet);
          setOwnedQuantities(quantities);
        }
      }
    } catch (err) {
      console.error("Failed to fetch shop data:", err);
    } finally {
      setLoading(false);
    }
  }, [token, user?.id]);

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  // ─── Set Bundle Lookup ──────────────────────────────────────

  const getBundlePieces = useCallback(
    (setKey?: string) => {
      if (!setKey) return [];
      return catalog.filter(
        (i) => i.setKey === setKey && i.category === "EQUIPMENT"
      );
    },
    [catalog]
  );

  // ─── Preview Config Computation ─────────────────────────────
  const activePreviewConfig = useMemo(() => {
    const activeItem = hoveredItem ?? pinnedItem;
    if (!activeItem) return baseConfig;

    const preview = { ...baseConfig };

    if (
      activeItem.category === "HUNTER_FORM" ||
      (activeItem.spriteLayer && (activeItem.spriteLayer.startsWith("form_") || activeItem.spriteLayer === "default_hunter"))
    ) {
      preview.outfit = activeItem.spriteLayer || "default_hunter";
    } else if (
      activeItem.category === "PEDESTAL" ||
      (activeItem.spriteLayer && activeItem.spriteLayer.startsWith("pedestal_"))
    ) {
      preview.pedestal = activeItem.spriteLayer || "pedestal_cyber";
      preview.pedestalKey = activeItem.spriteLayer || "pedestal_cyber";
    } else if (
      activeItem.category === "AURA" ||
      (activeItem.spriteLayer && activeItem.spriteLayer.startsWith("aura_"))
    ) {
      preview.aura = activeItem.spriteLayer;
    } else if (
      activeItem.category === "RELIC" ||
      activeItem.category === "WEAPON" ||
      activeItem.slot === "RELIC" ||
      activeItem.slot === "WEAPON"
    ) {
      if (activeItem.spriteLayer) {
        preview.relic = activeItem.spriteLayer;
        preview.weapon = activeItem.spriteLayer;
      }
    } else if (activeItem.category === "SET_BUNDLE" && activeItem.setKey) {
      // Bundle decomposition: project all 4 constituent piece sprites
      const pieces = getBundlePieces(activeItem.setKey);
      pieces.forEach((piece) => {
        if (piece.spriteLayer && piece.slot) {
          const configKey = SLOT_TO_CONFIG_KEY[piece.slot];
          if (configKey) {
            (preview as any)[configKey] = piece.spriteLayer;
          }
        }
      });
    } else if (activeItem.spriteLayer && activeItem.slot) {
      // Individual item: map single sprite via normalized slot key
      const configKey = SLOT_TO_CONFIG_KEY[activeItem.slot];
      if (configKey) {
        (preview as any)[configKey] = activeItem.spriteLayer;
      }
    }

    return preview;
  }, [hoveredItem, pinnedItem, baseConfig, getBundlePieces]);

  // Currently previewed item label
  const activePreviewItem = hoveredItem ?? pinnedItem;

  // ─── Ownership Check ───────────────────────────────────────

  const isItemOwned = useCallback(
    (item: ShopItem) => {
      if (item.category === "CONSUMABLE") return false;
      if (item.category === "SET_BUNDLE" && item.setKey) {
        const pieces = getBundlePieces(item.setKey);
        if (pieces.length === 0) return false;
        return pieces.every(
          (p) => (p.id && ownedItemIds.has(p.id)) || ownedSkus.has(p.sku)
        );
      }
      return (
        (item.id !== undefined && ownedItemIds.has(item.id)) ||
        ownedSkus.has(item.sku)
      );
    },
    [ownedItemIds, ownedSkus, getBundlePieces]
  );

  // ─── Purchase Handler ──────────────────────────────────────

  const handlePurchase = async (item: ShopItem) => {
    if (!token) {
      router.push("/login");
      return;
    }

    if (!item.id) {
      const dbItem = catalog.find((i) => i.sku === item.sku);
      if (!dbItem?.id) {
        setFeedback({
          type: "error",
          message: "Item specification error. Please refresh.",
        });
        return;
      }
      item = dbItem;
    }

    // Client pre-flight: rank gate
    if (!isRankSufficient(activeUserRank, item.rankRequirement)) {
      setFeedback({
        type: "error",
        message: `Rank Restricted: Requires ${item.rankRequirement}. Current rank: ${activeUserRank}`,
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    // Client pre-flight: balance check (null-safe)
    if (userSylphBalance < item.costSylph) {
      const deficit = Math.max(0, item.costSylph - userSylphBalance);
      setFeedback({
        type: "error",
        message: `Insufficient Sylph. Need ${deficit.toLocaleString()} more. Available: ${userSylphBalance.toLocaleString()}`,
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    if (isItemOwned(item)) {
      setFeedback({
        type: "error",
        message: "Item or Armor Set is already owned.",
      });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    setPurchasingId(item.id ?? null);
    setFeedback(null);

    try {
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ itemId: item.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Purchase failed");
      }

      // Instant state sync: mutate global user balance
      if (user) {
        mutateUser({
          ...user,
          sylph: data.remainingCurrency,
        });
      }

      // Update local ownership state
      if (item.category === "SET_BUNDLE" && item.setKey) {
        const pieces = getBundlePieces(item.setKey);
        setOwnedItemIds((prev) => {
          const next = new Set(prev);
          pieces.forEach((p) => {
            if (p.id) next.add(p.id);
          });
          return next;
        });
        setOwnedSkus((prev) => {
          const next = new Set(prev);
          pieces.forEach((p) => next.add(p.sku));
          return next;
        });
      } else if (item.category === "CONSUMABLE") {
        setOwnedQuantities((prev) => ({
          ...prev,
          [item.id!]: (prev[item.id!] || 0) + 1,
        }));
      } else {
        setOwnedItemIds((prev) => new Set(prev).add(item.id!));
        setOwnedSkus((prev) => new Set(prev).add(item.sku));
      }

      setFeedback({
        type: "success",
        message: `System Confirmation: Acquired [${item.name}]! Balance: ${data.remainingCurrency.toLocaleString()} Sylph`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.message || "Purchase transaction failed",
      });
      setTimeout(() => setFeedback(null), 4500);
    } finally {
      setPurchasingId(null);
    }
  };

  // ─── Filter Logic ──────────────────────────────────────────

  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      // Tab filter
      if (
        activeTab === "FORMS" &&
        item.category !== "HUNTER_FORM"
      ) {
        return false;
      }
      if (
        activeTab === "PEDESTALS" &&
        item.category !== "PEDESTAL"
      ) {
        return false;
      }
      if (
        activeTab === "AURAS" &&
        item.category !== "AURA"
      ) {
        return false;
      }
      if (
        activeTab === "WEAPONS_RELICS" &&
        item.category !== "WEAPON" &&
        item.category !== "RELIC" &&
        item.slot !== "RELIC" &&
        item.slot !== "WEAPON"
      ) {
        return false;
      }
      if (activeTab === "CONSUMABLES" && item.category !== "CONSUMABLE") {
        return false;
      }
      if (
        activeTab === "ALL" &&
        !["HUNTER_FORM", "PEDESTAL", "AURA", "RELIC", "WEAPON", "CONSUMABLE"].includes(item.category)
      ) {
        return false;
      }

      // Rarity filter
      if (rarityFilter !== "ALL" && item.rarity !== rarityFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(query);
        const descMatch = item.description.toLowerCase().includes(query);
        const perkMatch = item.effectPayload
          ? JSON.stringify(item.effectPayload).toLowerCase().includes(query)
          : false;
        if (!nameMatch && !descMatch && !perkMatch) return false;
      }

      return true;
    });
  }, [catalog, activeTab, rarityFilter, searchQuery]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-bg-void text-text-primary font-sans px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 pb-24 w-full flex flex-col gap-5 animate-fade-in select-none">
      {/* ─── Header & Telemetry HUD ─────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border-subtle pb-4 mt-1">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-['Rajdhani'] uppercase tracking-widest bg-accent-primary/10 text-accent-primary border border-accent-primary/25">
              System Protocol V5
            </span>
            <span className="text-xs text-text-muted font-['Rajdhani']">
              ARCHITECTURAL CATALOG
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold font-['Rajdhani'] flex items-center gap-3 text-text-primary">
            <Store className="w-8 h-8 sm:w-10 sm:h-10 text-accent-primary animate-pulse" />
            <span>System Store</span>
          </h1>
        </div>

        {/* Hunter Telemetry Pill */}
        <div className="flex items-center gap-3 bg-bg-panel/80 border border-border-subtle rounded-2xl p-2.5 sm:p-3 shadow-xl backdrop-blur-md">
          {/* Rank Badge */}
          <div className="flex flex-col px-3 py-1 bg-bg-abyss rounded-xl border border-white/10">
            <span className="text-[9px] text-text-muted font-bold font-['Rajdhani'] uppercase">
              Rank
            </span>
            <span className="text-sm font-extrabold text-accent-primary font-['Rajdhani']">
              {activeUserRank}
            </span>
          </div>

          {/* Level Badge */}
          <div className="flex flex-col px-3 py-1 bg-bg-abyss rounded-xl border border-white/10">
            <span className="text-[9px] text-text-muted font-bold font-['Rajdhani'] uppercase">
              Level
            </span>
            <span className="text-sm font-extrabold text-text-primary font-['Rajdhani']">
              Lv. {user?.level ?? 1}
            </span>
          </div>

          {/* Sylph Balance */}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-accent-primary/15 border border-accent-primary/40 shadow-[0_0_15px_rgba(124,58,237,0.15)]">
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-accent-primary/50">
              <img
                src="/sylph-logo.jpg"
                alt="Sylph"
                className="w-full h-full object-cover scale-[1.35]"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-black text-text-primary font-['Rajdhani'] leading-none">
                {userSylphBalance.toLocaleString()}
              </span>
              <span className="text-[9px] text-accent-text-light font-bold font-['Rajdhani'] uppercase tracking-wider">
                Sylph Coins
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── System Armory Forge Banner ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/40 via-blue-950/30 to-bg-panel border border-accent-primary/30 p-4 sm:p-5 flex items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-accent-primary/20 border border-accent-primary/40 text-accent-primary shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-accent-text-light font-['Rajdhani'] tracking-wide">
              SYSTEM ARMORY FORGE
            </h4>
            <p className="text-xs text-text-secondary mt-0.5">
              Acquire unlocked Hunter Forms, Platform Pedestals, Energy Auras, and Forged Relics with Sylph Coins.
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-flex px-3 py-1 rounded-lg bg-accent-primary/20 text-accent-text-light border border-accent-primary/30 text-xs font-bold font-['Rajdhani'] uppercase tracking-wider">
          LIVE ARMORY
        </span>
      </div>

      {/* ─── System Toast Feedback ──────────────────────────────── */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 animate-fade-in-down shadow-xl ${
            feedback.type === "success"
              ? "bg-green-950/70 border-green-500/60 text-green-200"
              : "bg-red-950/70 border-red-500/60 text-red-200"
          }`}
        >
          {feedback.type === "success" ? (
            <Check className="w-5 h-5 text-green-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-semibold font-['Rajdhani'] flex-1">
            {feedback.message}
          </span>
        </div>
      )}

      {/* ─── Main Grid: Catalog + Preview Dock ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ═══ Left Column: Categories, Search, Cards (8 cols) ═══ */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
          {/* Category Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl border font-bold text-xs sm:text-sm font-['Rajdhani'] uppercase tracking-wider flex items-center gap-2 transition-all shrink-0 ${
                    isActive
                      ? "bg-accent-primary text-white border-accent-primary shadow-lg shadow-accent-primary/25"
                      : "bg-bg-panel/70 border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-primary/40"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search & Rarity Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-bg-panel/50 p-3 rounded-2xl border border-border-subtle">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search armory by name, description or perk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-abyss/80 border border-border-subtle rounded-xl pl-10 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] font-bold font-['Rajdhani'] text-text-muted uppercase shrink-0">
                Tier:
              </span>
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                className="bg-bg-abyss border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold font-['Rajdhani'] text-text-primary focus:outline-none focus:border-accent-primary uppercase"
              >
                <option value="ALL">All Tiers</option>
                <option value="COMMON">Common</option>
                <option value="RARE">Rare</option>
                <option value="EPIC">Epic</option>
                <option value="LEGENDARY">Legendary</option>
                <option value="MYTHIC">Mythic</option>
              </select>
            </div>
          </div>

          {/* ─── Item Catalog Grid ──────────────────────────────── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-3">
              <div className="w-8 h-8 border-3 border-accent-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-['Rajdhani'] tracking-wider">
                Accessing System Armory...
              </span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-text-muted bg-bg-panel/40 border border-border-subtle rounded-2xl flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10 opacity-40 text-accent-text-light" />
              <h3 className="font-['Rajdhani'] text-base font-bold text-text-secondary">
                No armory provisions currently in rotation for this sector.
              </h3>
              <p className="text-xs text-text-muted font-['Rajdhani'] max-w-md">
                All legacy provisions have been quarantined. Custom pixel art gear and provisions will be deployed directly to this sector in future updates.
              </p>
              <button
                onClick={() => {
                  setActiveTab("ALL");
                  setRarityFilter("ALL");
                  setSearchQuery("");
                }}
                className="px-4 py-1.5 rounded-xl bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-xs font-bold font-['Rajdhani'] uppercase hover:bg-accent-primary/20 transition-colors mt-2"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => {
                const isOwned = isItemOwned(item);
                const isRankLocked = !isRankSufficient(
                  activeUserRank,
                  item.rankRequirement
                );
                const isAffordable = userSylphBalance >= item.costSylph;
                const isBundle = item.category === "SET_BUNDLE";
                const isConsumable = item.category === "CONSUMABLE";
                const ownedQty = item.id
                  ? ownedQuantities[item.id] || 0
                  : 0;
                const bundlePieces = isBundle
                  ? getBundlePieces(item.setKey)
                  : [];
                const aggregateCost = isBundle
                  ? bundlePieces.reduce((sum, p) => sum + p.costSylph, 0)
                  : 0;

                // Invariant 3: Null-safe deficit
                const deficit = Math.max(
                  0,
                  item.costSylph - (user?.sylph ?? 0)
                );

                const isCurrentlyPreviewed =
                  (hoveredItem && hoveredItem.sku === item.sku) ||
                  (pinnedItem && pinnedItem.sku === item.sku);

                return (
                  <div
                    key={item.sku}
                    onMouseEnter={() => setHoveredItem(item)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onClick={() => setPinnedItem(item)}
                    className={`system-card relative rounded-2xl bg-bg-panel/75 border p-4 flex flex-col justify-between gap-3 transition-all duration-300 cursor-pointer overflow-hidden group
                      ${RARITY_CARD_GLOW[item.rarity]}
                      ${isCurrentlyPreviewed ? "ring-2 ring-accent-primary/70 shadow-xl" : ""}
                      ${isRankLocked ? "opacity-60 grayscale-[30%]" : ""}
                    `}
                  >
                    {/* ─── Card Top: Badges Row ─────────────────── */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        {/* Left: Rarity Badge */}
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold font-['Rajdhani'] uppercase tracking-wider border ${RARITY_BADGE_STYLE[item.rarity]}`}
                          >
                            {item.rarity}
                          </span>

                          {/* Rank Lock Badge (inline, not overlay) */}
                          {isRankLocked && (
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider border flex items-center gap-1 ${RARITY_LOCK_BADGE[item.rarity]}`}
                            >
                              <Lock className="w-3 h-3" />
                              <span>Requires {item.rankRequirement}</span>
                            </span>
                          )}
                        </div>

                        {/* Right: Slot / Bundle / Owned Badges */}
                        <div className="flex items-center gap-1.5">
                          {isBundle ? (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider">
                              4-PIECE SET
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-bg-abyss text-text-muted border border-border-subtle text-[10px] font-bold font-['Rajdhani'] uppercase">
                              {item.slot}
                            </span>
                          )}

                          {isConsumable && ownedQty > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-['Rajdhani']">
                              Owned: x{ownedQty}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Name & Description */}
                      <h3 className="text-base font-bold font-['Rajdhani'] text-text-primary group-hover:text-accent-primary transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-xs text-text-secondary leading-relaxed mt-1 line-clamp-2">
                        {item.description}
                      </p>

                      {/* Set Bundle Constituent Pieces */}
                      {isBundle && bundlePieces.length > 0 && (
                        <div className="mt-3 p-2.5 rounded-xl bg-bg-abyss/80 border border-border-subtle flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase">
                            Includes 4 Synchronized Pieces:
                          </span>
                          <div className="grid grid-cols-2 gap-1 text-[10px] text-text-secondary">
                            {bundlePieces.map((piece) => (
                              <div
                                key={piece.sku}
                                className="flex items-center gap-1 truncate"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="truncate">{piece.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Perk Metadata Tags */}
                      {item.effectPayload &&
                        Object.keys(item.effectPayload).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {Object.entries(item.effectPayload).map(
                              ([key, val]) => (
                                <span
                                  key={key}
                                  className="px-2 py-0.5 rounded-md bg-accent-primary/10 border border-accent-primary/20 text-accent-text-light text-[10px] font-medium font-['Rajdhani'] flex items-center gap-1"
                                >
                                  <Zap className="w-3 h-3 text-accent-primary" />
                                  <span>
                                    {key}: {String(val)}
                                  </span>
                                </span>
                              )
                            )}
                          </div>
                        )}
                    </div>

                    {/* ─── Card Bottom: Price & Purchase Button ── */}
                    <div className="mt-auto pt-3 border-t border-border-subtle/60 flex items-center justify-between gap-3">
                      {/* Price Tag */}
                      <div className="flex flex-col">
                        {isBundle && aggregateCost > item.costSylph && (
                          <span className="text-[11px] text-text-muted line-through font-['Rajdhani']">
                            {aggregateCost.toLocaleString()} Sylph
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                            <img
                              src="/sylph-logo.jpg"
                              alt="Sylph"
                              className="w-full h-full object-cover scale-[1.35]"
                            />
                          </div>
                          <span className="text-base font-black font-['Rajdhani'] text-text-primary">
                            {item.costSylph.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-text-muted uppercase font-['Rajdhani']">
                            Sylph
                          </span>
                          {isBundle && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold font-['Rajdhani'] uppercase">
                              -15%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ─── Action Button (state machine) ───── */}
                      {isOwned && !isConsumable ? (
                        /* OWNED state */
                        <button
                          disabled
                          className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          <span>Owned</span>
                        </button>
                      ) : isRankLocked ? (
                        /* RANK LOCKED state */
                        <button
                          disabled
                          className="px-4 py-2 rounded-xl bg-bg-abyss text-text-muted border border-border-subtle text-xs font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked ({item.rankRequirement})</span>
                        </button>
                      ) : !isAffordable ? (
                        /* INSUFFICIENT BALANCE state */
                        <button
                          disabled
                          className="px-4 py-2 rounded-xl bg-bg-abyss text-text-muted border border-border-subtle text-xs font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 cursor-not-allowed opacity-70"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>Need {deficit.toLocaleString()} more</span>
                        </button>
                      ) : (
                        /* PURCHASABLE state */
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePurchase(item);
                          }}
                          disabled={purchasingId === item.id}
                          className="px-4 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary-light text-white text-xs font-black font-['Rajdhani'] uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-accent-primary/25 hover:shadow-accent-primary/40 active:scale-95"
                        >
                          {purchasingId === item.id ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Tag className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {purchasingId === item.id
                              ? "Acquiring..."
                              : `${item.costSylph.toLocaleString()} Sylph`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ Right Column: Sticky Wardrobe Preview Dock (4 cols) ═══ */}
        <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-6 flex flex-col gap-3">
          <div className="system-card rounded-2xl bg-bg-panel/90 border border-border-subtle p-5 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center relative overflow-hidden">
            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-border-subtle pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent-primary" />
                <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
                  Live Wardrobe Preview
                </span>
              </div>

              {/* Reset Preview Button — clears pinned state */}
              {(hoveredItem || pinnedItem) && (
                <button
                  onClick={() => {
                    setHoveredItem(null);
                    setPinnedItem(null);
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-bg-abyss text-text-muted hover:text-text-primary transition-colors flex items-center gap-1 text-[10px] font-bold font-['Rajdhani'] uppercase border border-transparent hover:border-border-subtle"
                  title="Reset Preview to Current Gear"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Character Renderer 2D Stage */}
            <div className="relative w-56 h-64 bg-bg-abyss/80 rounded-2xl border border-border-subtle/80 flex items-center justify-center p-2 shadow-inner overflow-hidden">
              <CharacterRenderer
                config={activePreviewConfig}
                size={200}
                showPedestal={true}
              />
            </div>

            {/* Preview Status Pill */}
            <div className="w-full mt-4 p-3 rounded-xl bg-bg-abyss/80 border border-border-subtle flex flex-col gap-1 text-left">
              <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase">
                Active Wardrobe State:
              </span>
              {activePreviewItem ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold font-['Rajdhani'] text-accent-primary truncate">
                    {activePreviewItem.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {pinnedItem?.sku === activePreviewItem.sku && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/30 text-accent-text-light font-bold font-['Rajdhani'] uppercase">
                        Pinned
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-text-light font-bold flex items-center gap-0.5">
                      <Eye className="w-3 h-3" />
                      <span className="font-['Rajdhani']">Preview</span>
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-xs font-semibold text-text-secondary">
                  Equipped Attire (Default)
                </span>
              )}
            </div>

            {/* Pinned Item Detail */}
            {pinnedItem && (
              <div className="w-full mt-3 p-3 rounded-xl bg-bg-abyss/60 border border-border-subtle/60 flex flex-col gap-1.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase">
                    Pinned Selection:
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold font-['Rajdhani'] uppercase border ${RARITY_BADGE_STYLE[pinnedItem.rarity]}`}
                  >
                    {pinnedItem.rarity}
                  </span>
                </div>
                <span className="text-sm font-bold font-['Rajdhani'] text-text-primary">
                  {pinnedItem.name}
                </span>
                <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                  {pinnedItem.description}
                </p>
              </div>
            )}

            <p className="text-[11px] text-text-muted mt-3 text-center leading-relaxed">
              Hover over or click any Hunter form, pedestal, aura, or relic to preview its layer on your avatar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
