"use client";
import { OwnCompanionPreview } from "@/app/components/companion/OwnCompanionPreview";


import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { CharacterConfig } from "@/lib/character-traits";
import styles from "../Locker.module.css";
import {
  Package,
  Shield,
  Sword,
  Sparkles,
  Zap,
  FlaskConical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Search,
  Check,
  Eye,
} from "lucide-react";

// ─── Tactical Slot & Category Type Definitions ──────────────────

export type TacticalSlotId = "ARMOUR" | "WEAPON" | "RELIC_1" | "RELIC_2" | "QUICKSLOT";
export type VaultCategoryFilter = "ALL" | "ARMOUR" | "WEAPONS" | "RELICS" | "POTIONS";

export interface InventoryItemData {
  id: number;
  userId: number;
  itemId: number;
  quantity: number;
  isEquipped: boolean;
  acquiredAt: string;
  item: {
    id: number;
    sku: string;
    name: string;
    description: string;
    category: string;
    slot: string;
    rarity: string;
    costSylph?: number;
    priceSylph?: number;
    rankRequirement?: string;
    requiredRank?: string;
    effectPayload?: Record<string, any> | null;
    statRequirements?: Record<string, number> | null;
    statBonuses?: Record<string, number> | null;
    spriteLayer?: string | null;
    setKey?: string | null;
    isBundle?: boolean;
  };
}

interface DragPayload {
  inventoryId: number;
  category: string;
  slot: string;
  compatibleSlots: TacticalSlotId[];
}

// ─── Tactical 5-Slot Loadout Configuration ──────────────────────

export const TACTICAL_SLOTS: {
  id: TacticalSlotId;
  label: string;
  icon: typeof Shield;
  description: string;
  accentColor: string;
}[] = [
  {
    id: "ARMOUR",
    label: "Armour Set",
    icon: Shield,
    description: "Combat Gear & Protective Armor",
    accentColor: "border-purple-500/40 text-purple-400 bg-purple-950/20",
  },
  {
    id: "WEAPON",
    label: "Weapon",
    icon: Sword,
    description: "Mainhand Arsenal & Combat Weapon",
    accentColor: "border-blue-500/40 text-blue-400 bg-blue-950/20",
  },
  {
    id: "RELIC_1",
    label: "Primary Relic",
    icon: Sparkles,
    description: "Catalyst, Shield or Stat Artifact",
    accentColor: "border-amber-500/40 text-amber-400 bg-amber-950/20",
  },
  {
    id: "RELIC_2",
    label: "Secondary Relic",
    icon: Zap,
    description: "Secondary Catalyst or Artifact",
    accentColor: "border-cyan-500/40 text-cyan-400 bg-cyan-950/20",
  },
  {
    id: "QUICKSLOT",
    label: "Quickslot",
    icon: FlaskConical,
    description: "Active Potion, Elixir or Consumable",
    accentColor: "border-emerald-500/40 text-emerald-400 bg-emerald-950/20",
  },
];

// ─── Tactical Slot Classifier ───────────────────────────────────

export function getCompatibleSlotsForItem(item: {
  category?: string;
  slot?: string;
  sku?: string;
}): TacticalSlotId[] {
  const cat = (item.category || "").toUpperCase();
  const slot = (item.slot || "").toUpperCase();

  if (
    cat === "EQUIPMENT" ||
    cat === "SET_BUNDLE" ||
    cat === "ARMOUR" ||
    cat === "ARMOR" ||
    cat === "HUNTER_FORM" ||
    slot === "HELMET" ||
    slot === "CHESTPLATE" ||
    slot === "PANTS" ||
    slot === "BOOTS"
  ) {
    return ["ARMOUR"];
  }

  if (cat === "WEAPON" || slot === "WEAPON") {
    return ["WEAPON"];
  }

  if (cat === "RELIC" || slot === "RELIC") {
    return ["RELIC_1", "RELIC_2"];
  }

  if (cat === "CONSUMABLE") {
    return ["QUICKSLOT"];
  }

  return [];
}

// ─── Rarity Visual Styling Maps ─────────────────────────────────

const RARITY_STYLES: Record<
  string,
  { border: string; glow: string; text: string; bg: string; badge: string }
> = {
  COMMON: {
    border: "border-zinc-700/60 hover:border-zinc-500",
    glow: "shadow-[0_0_10px_rgba(113,113,122,0.15)]",
    text: "text-zinc-300",
    bg: "bg-zinc-900/50",
    badge: "border-zinc-700 bg-zinc-800 text-zinc-300",
  },
  UNCOMMON: {
    border: "border-emerald-500/40 hover:border-emerald-400/80",
    glow: "shadow-[0_0_15px_rgba(16,185,129,0.2)]",
    text: "text-emerald-400",
    bg: "bg-emerald-950/30",
    badge: "border-emerald-500/50 bg-emerald-950/40 text-emerald-400",
  },
  RARE: {
    border: "border-blue-500/40 hover:border-blue-400/80",
    glow: "shadow-[0_0_18px_rgba(59,130,246,0.25)]",
    text: "text-blue-400",
    bg: "bg-blue-950/30",
    badge: "border-blue-500/50 bg-blue-950/40 text-blue-400",
  },
  EPIC: {
    border: "border-purple-500/40 hover:border-purple-400/80",
    glow: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
    text: "text-purple-400",
    bg: "bg-purple-950/30",
    badge: "border-purple-500/50 bg-purple-950/40 text-purple-400",
  },
  LEGENDARY: {
    border: "border-amber-500/40 hover:border-amber-400/80",
    glow: "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    text: "text-amber-400",
    bg: "bg-amber-950/30",
    badge: "border-amber-500/50 bg-amber-950/40 text-amber-400",
  },
  MYTHIC: {
    border: "border-rose-500/50 hover:border-rose-400/90",
    glow: "shadow-[0_0_28px_rgba(244,63,94,0.45)]",
    text: "text-rose-400",
    bg: "bg-rose-950/30",
    badge: "border-rose-500/60 bg-rose-950/40 text-rose-400",
  },
};

// ═════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════

export function ItemsTab() {
  const { user } = useAuth();

  // ─── State ───────────────────────────────────────────────────
  const [inventory, setInventory] = useState<InventoryItemData[]>([]);
  const [activeCategory, setActiveCategory] = useState<VaultCategoryFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Drag & Drop State
  const [draggingItem, setDraggingItem] = useState<InventoryItemData | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<TacticalSlotId | null>(null);
  const [hoveredPreviewItem, setHoveredPreviewItem] = useState<InventoryItemData | null>(null);

  const showFeedback = (text: string, type: "success" | "error" = "success") => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // ─── Fetch Inventory ─────────────────────────────────────────
  const fetchInventory = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/inventory");
      if (res.ok) {
        const data = await res.json();
        setInventory(data.inventory || []);
      }
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // ─── Equipped Slots Map ──────────────────────────────────────
  const equippedSlots = useMemo(() => {
    const map: Partial<Record<TacticalSlotId, InventoryItemData>> = {};
    const equippedRelics: InventoryItemData[] = [];

    for (const item of inventory) {
      if (item.isEquipped) {
        const compat = getCompatibleSlotsForItem(item.item);
        if (compat.includes("ARMOUR") && !map.ARMOUR) {
          map.ARMOUR = item;
        } else if (compat.includes("WEAPON") && !map.WEAPON) {
          map.WEAPON = item;
        } else if (compat.includes("RELIC_1") || compat.includes("RELIC_2")) {
          equippedRelics.push(item);
        } else if (compat.includes("QUICKSLOT") && !map.QUICKSLOT) {
          map.QUICKSLOT = item;
        }
      }
    }

    if (equippedRelics.length > 0) map.RELIC_1 = equippedRelics[0];
    if (equippedRelics.length > 1) map.RELIC_2 = equippedRelics[1];

    return map;
  }, [inventory]);

  // ─── Live Dynamic Character Configuration ────────────────────
  const activeCharacterConfig: CharacterConfig = useMemo(() => {
    const previewItem = hoveredPreviewItem || draggingItem;
    const previewCompat = previewItem ? getCompatibleSlotsForItem(previewItem.item) : [];

    const baseForm = user?.characterConfig?.outfit || "default_hunter";
    const basePedestal = user?.characterConfig?.pedestal || "pedestal_cyber";
    const baseAura = user?.characterConfig?.aura || "none";
    const baseWeapon = equippedSlots.WEAPON?.item.sku || equippedSlots.WEAPON?.item.spriteLayer || "none";
    const baseRelic = equippedSlots.RELIC_1?.item.sku || equippedSlots.RELIC_1?.item.spriteLayer || "none";

    return {
      ...user?.characterConfig,
      outfit:
        previewCompat.includes("ARMOUR") && previewItem
          ? previewItem.item.sku || previewItem.item.spriteLayer || baseForm
          : baseForm,
      pedestal: basePedestal,
      aura: baseAura,
      relic:
        (previewCompat.includes("RELIC_1") || previewCompat.includes("RELIC_2")) && previewItem
          ? previewItem.item.sku || previewItem.item.spriteLayer || baseRelic
          : baseRelic,
      weapon:
        previewCompat.includes("WEAPON") && previewItem
          ? previewItem.item.sku || previewItem.item.spriteLayer || baseWeapon
          : baseWeapon,
    };
  }, [equippedSlots, user, hoveredPreviewItem, draggingItem]);

  // ─── Atomic Equip / Unequip Action ───────────────────────────
  const handleToggleEquip = async (itemEntry: InventoryItemData) => {
    if (actionLoadingId !== null) return;
    const targetId = itemEntry.id;
    setActionLoadingId(targetId);

    const compat = getCompatibleSlotsForItem(itemEntry.item);
    const willEquip = !itemEntry.isEquipped;
    const previousInventory = [...inventory];

    // Optimistic state update
    setInventory((prev) =>
      prev.map((entry) => {
        if (entry.id === targetId) {
          return { ...entry, isEquipped: willEquip };
        }
        // If equipping, displace existing item sharing the primary category
        if (willEquip) {
          const entryCompat = getCompatibleSlotsForItem(entry.item);
          if (compat.includes("ARMOUR") && entryCompat.includes("ARMOUR")) {
            return { ...entry, isEquipped: false };
          }
          if (compat.includes("WEAPON") && entryCompat.includes("WEAPON")) {
            return { ...entry, isEquipped: false };
          }
          if (compat.includes("QUICKSLOT") && entryCompat.includes("QUICKSLOT")) {
            return { ...entry, isEquipped: false };
          }
        }
        return entry;
      })
    );

    try {
      const res = await fetch("/api/inventory/equip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inventoryId: targetId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Equip action failed");
      }

      const data = await res.json();
      showFeedback(
        data.isEquipped
          ? `Equipped ${itemEntry.item.name}`
          : `Unequipped ${itemEntry.item.name}`
      );
    } catch (err: any) {
      // Rollback on failure
      setInventory(previousInventory);
      showFeedback(err.message || "Failed to modify loadout state", "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Drag & Drop Event Handlers ──────────────────────────────
  const handleDragStart = (e: React.DragEvent, itemEntry: InventoryItemData) => {
    const compatibleSlots = getCompatibleSlotsForItem(itemEntry.item);
    if (compatibleSlots.length === 0) return;

    const payload: DragPayload = {
      inventoryId: itemEntry.id,
      category: itemEntry.item.category,
      slot: itemEntry.item.slot,
      compatibleSlots,
    };

    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDraggingItem(itemEntry);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverSlot(null);
  };

  const handleSlotDragOver = (e: React.DragEvent, slotId: TacticalSlotId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverSlot !== slotId) {
      setDragOverSlot(slotId);
    }
  };

  const handleSlotDragLeave = (slotId: TacticalSlotId) => {
    if (dragOverSlot === slotId) {
      setDragOverSlot(null);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlot: TacticalSlotId) => {
    e.preventDefault();
    setDragOverSlot(null);

    try {
      const dataStr = e.dataTransfer.getData("application/json");
      if (!dataStr) return;
      const data: DragPayload = JSON.parse(dataStr);

      if (data.compatibleSlots.includes(targetSlot)) {
        const targetEntry = inventory.find((i) => i.id === data.inventoryId);
        if (targetEntry) {
          if (!targetEntry.isEquipped) {
            handleToggleEquip(targetEntry);
          } else {
            showFeedback(`${targetEntry.item.name} is already active`, "success");
          }
        }
      } else {
        showFeedback(
          `Cannot place ${data.category || "this"} item into ${targetSlot} slot`,
          "error"
        );
      }
    } catch (err) {
      console.error("Drop handling error:", err);
    }
  };

  // ─── Filtered Inventory Vault ────────────────────────────────
  const filteredItems = useMemo(() => {
    return inventory.filter((entry) => {
      const compat = getCompatibleSlotsForItem(entry.item);

      // Category filter
      if (activeCategory === "ARMOUR") {
        if (!compat.includes("ARMOUR")) return false;
      } else if (activeCategory === "WEAPONS") {
        if (!compat.includes("WEAPON")) return false;
      } else if (activeCategory === "RELICS") {
        if (!compat.includes("RELIC_1") && !compat.includes("RELIC_2")) return false;
      } else if (activeCategory === "POTIONS") {
        if (!compat.includes("QUICKSLOT")) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = entry.item.name.toLowerCase().includes(query);
        const descMatch = entry.item.description.toLowerCase().includes(query);
        const slotMatch = entry.item.slot.toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !slotMatch) return false;
      }

      return true;
    });
  }, [inventory, activeCategory, searchQuery]);

  // ─── Vault Category Tabs Configuration ───────────────────────
  const VAULT_TABS: { key: VaultCategoryFilter; label: string; icon: any }[] = [
    { key: "ALL", label: "All Vault Items", icon: Package },
    { key: "ARMOUR", label: "Armour Sets", icon: Shield },
    { key: "WEAPONS", label: "Weapons", icon: Sword },
    { key: "RELICS", label: "Relics & Shields", icon: Sparkles },
    { key: "POTIONS", label: "Potions & Elixirs", icon: FlaskConical },
  ];

  return (
    <div className="w-full flex flex-col gap-6 select-none animate-fade-in">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm font-bold font-['Rajdhani'] flex items-center gap-2.5 animate-fade-in shadow-xl ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
              : "bg-rose-950/80 border-rose-500/50 text-rose-300"
          }`}
        >
          {feedbackMsg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════ */}
      {/* 2-COLUMN TACTICAL LOADOUT MATRIX LAYOUT                   */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── LEFT COLUMN: CHARACTER CARD STAGE (4 Cols) ────────── */}
        <div className={`${styles.stageCard} lg:col-span-4 xl:col-span-4 p-6 flex flex-col items-center text-center relative overflow-hidden gap-5 lg:sticky lg:top-6`}>
          {/* Top Specular Highlight */}
          <div className={styles.topHighlight} aria-hidden="true" />

          {/* Ambient Glow Background Accent */}
          <div className="absolute -top-16 -left-16 w-48 h-48 bg-accent-primary/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header Telemetry */}
          <div className="w-full flex items-center justify-between border-b border-white/10 pb-3 relative z-10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-text-light animate-pulse" />
              <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-text-primary">
                Tactical Stage
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-text-light border border-accent-primary/40 text-[10px] font-black font-['Rajdhani'] uppercase">
                {user?.hunterRank || "RANK E"}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-bg-abyss text-text-secondary border border-white/10 text-[10px] font-bold font-['Rajdhani']">
                Lv. {user?.level ?? 1}
              </span>
            </div>
          </div>

          {/* 2D Character Renderer Stage */}
          <div className="relative w-60 h-64 bg-bg-abyss/80 rounded-2xl border border-white/10 flex items-center justify-center p-3 shadow-inner overflow-hidden z-10">
            <OwnCompanionPreview config={activeCharacterConfig} size={190} label="Items companion preview" showCompatibility />

            {/* Drag / Hover Live Overlay Indicator */}
            {(hoveredPreviewItem || draggingItem) && (
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-accent-primary/80 backdrop-blur-md text-white text-[9px] font-bold font-['Rajdhani'] uppercase flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span>Live Preview</span>
              </div>
            )}
          </div>

          {/* Hunter Identity Meta */}
          <div className="w-full flex flex-col items-center gap-1 relative z-10">
            <h3 className="text-base font-extrabold font-['Rajdhani'] text-text-primary tracking-wide">
              {user?.name || "Hunter Recruit"}
            </h3>
            <p className="text-[11px] font-mono text-text-muted">
              {equippedSlots.ARMOUR?.item.name || "Default Hunter Attire"}
            </p>
          </div>

          {/* Equipped Tactical Loadout Summary Chips */}
          <div className="w-full grid grid-cols-5 gap-1.5 pt-3 border-t border-white/10 relative z-10">
            {TACTICAL_SLOTS.map((slot) => {
              const equipped = equippedSlots[slot.id];
              const Icon = slot.icon;
              return (
                <div
                  key={slot.id}
                  className={`p-2 rounded-xl border flex flex-col items-center text-center gap-1 transition-all ${
                    equipped
                      ? "bg-bg-panel/90 border-accent-primary/40 shadow-sm"
                      : "bg-bg-abyss/60 border-white/5 opacity-60"
                  }`}
                  title={equipped ? `${slot.label}: ${equipped.item.name}` : `${slot.label}: Empty`}
                >
                  <Icon className="w-3.5 h-3.5 text-accent-text-light" />
                  <span className="text-[8px] font-bold font-['Rajdhani'] uppercase truncate w-full text-text-secondary">
                    {slot.label.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── RIGHT COLUMN: LOADOUT MATRIX & INVENTORY VAULT (8 Cols) ── */}
        <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-6">
          {/* ─── 1. TOP LOADOUT BAR (5 TACTICAL DROP SLOTS) ────────────── */}
          <div className={`${styles.card} p-5 sm:p-6 flex flex-col gap-4 relative overflow-hidden`}>
            {/* Top Specular Highlight */}
            <div className={styles.topHighlight} aria-hidden="true" />

            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-text-light" />
                <h4 className="text-sm font-extrabold font-['Rajdhani'] uppercase tracking-widest text-text-primary">
                  Tactical Loadout Slots
                </h4>
              </div>
              <span className="text-[11px] text-text-muted font-['Rajdhani'] hidden sm:inline">
                Drag and drop armor, weapons, relics, and quickslot potions
              </span>
            </div>

            {/* 5 Horizontal Tactical Drop Target Slots */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {TACTICAL_SLOTS.map((slot) => {
                const equipped = equippedSlots[slot.id];
                const isOver = dragOverSlot === slot.id;
                const isCompatibleDrag =
                  draggingItem && getCompatibleSlotsForItem(draggingItem.item).includes(slot.id);
                const SlotIcon = slot.icon;
                const rarity = equipped ? RARITY_STYLES[equipped.item.rarity] || RARITY_STYLES.COMMON : null;

                return (
                  <div
                    key={slot.id}
                    onDragOver={(e) => handleSlotDragOver(e, slot.id)}
                    onDragLeave={() => handleSlotDragLeave(slot.id)}
                    onDrop={(e) => handleSlotDrop(e, slot.id)}
                    className={`relative rounded-xl border p-3 flex flex-col justify-between items-center text-center min-h-[135px] transition-all duration-200 ${
                      isOver
                        ? "bg-accent-primary/25 border-accent-primary shadow-[0_0_22px_rgba(124,58,237,0.45)] scale-[1.03]"
                        : isCompatibleDrag
                        ? "border-cyan-500/50 bg-cyan-950/20 animate-pulse"
                        : equipped
                        ? `${rarity?.border || "border-white/20"} bg-bg-abyss/80 shadow-md`
                        : "border-dashed border-white/15 bg-bg-abyss/40 hover:border-white/30"
                    }`}
                  >
                    {/* Slot Header Tag */}
                    <div className="w-full flex items-center justify-between gap-1">
                      <span className="text-[9px] font-black font-['Rajdhani'] uppercase tracking-wider text-text-muted truncate">
                        {slot.label}
                      </span>
                      {equipped && (
                        <button
                          type="button"
                          onClick={() => handleToggleEquip(equipped)}
                          className="p-0.5 rounded-full hover:bg-rose-500/20 text-text-muted hover:text-rose-400 transition-colors"
                          title={`Unequip ${equipped.item.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Slot Content */}
                    {equipped ? (
                      <div className="flex flex-col items-center gap-1.5 my-1 w-full">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-inner ${rarity?.bg || "bg-bg-panel"} ${rarity?.border || "border-white/20"}`}
                        >
                          <SlotIcon className={`w-4 h-4 ${rarity?.text || "text-text-primary"}`} />
                        </div>
                        <span className="text-xs font-bold font-['Rajdhani'] text-text-primary leading-tight truncate w-full px-1">
                          {equipped.item.name}
                        </span>
                        <span
                          className={`text-[8px] font-bold font-['Rajdhani'] uppercase px-1.5 py-0.2 rounded border ${rarity?.badge || "border-white/10 text-text-muted"}`}
                        >
                          {equipped.item.rarity}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5 my-auto opacity-50">
                        <SlotIcon className="w-5 h-5 text-text-muted" />
                        <span className="text-[10px] font-bold font-['Rajdhani'] text-text-muted uppercase">
                          Empty
                        </span>
                      </div>
                    )}

                    {/* Footer helper */}
                    <span className="text-[8px] font-mono text-text-muted uppercase tracking-tighter">
                      {isOver ? "Release to Equip" : slot.description.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 2. BOTTOM INVENTORY VAULT GRID ──────────────────────── */}
          <div className={`${styles.card} p-5 sm:p-6 flex flex-col gap-5 relative overflow-hidden`}>
            {/* Top Specular Highlight */}
            <div className={styles.topHighlight} aria-hidden="true" />

            {/* Category Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border-subtle pb-4">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {VAULT_TABS.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setActiveCategory(cat.key)}
                      type="button"
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold font-['Rajdhani'] text-xs uppercase tracking-wider transition-all shrink-0 border ${
                        isActive
                          ? "bg-accent-primary text-white border-accent-primary shadow-[0_0_14px_var(--accent-primary-dim)]"
                          : "bg-surface border-border-subtle text-text-secondary hover:text-text-primary hover:border-accent-primary/40"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[180px] sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search vault..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary shadow-sm"
                />
              </div>
            </div>

            {/* Inventory Grid Content */}
            {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="w-7 h-7 text-accent-primary animate-spin" />
                <p className="text-xs text-text-secondary font-mono uppercase tracking-widest">
                  Accessing System Vault...
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-14 rounded-xl border border-dashed border-white/10 bg-bg-abyss/30 flex flex-col items-center justify-center gap-3 text-center">
                <Package className="w-10 h-10 text-text-muted opacity-40" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wide">
                    No Items In This Sector
                  </h4>
                  <p className="text-xs text-text-secondary font-['Rajdhani'] max-w-sm">
                    Your inventory in this category is currently empty. Visit the System Store to acquire equipment and supplies.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredItems.map((entry) => {
                  const rarity = RARITY_STYLES[entry.item.rarity] || RARITY_STYLES.COMMON;
                  const isEquipped = entry.isEquipped;
                  const compatSlots = getCompatibleSlotsForItem(entry.item);
                  const isCurrentlyDragging = draggingItem?.id === entry.id;

                  return (
                    <div
                      key={entry.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, entry)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={() => setHoveredPreviewItem(entry)}
                      onMouseLeave={() => setHoveredPreviewItem(null)}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all relative overflow-hidden group cursor-grab active:cursor-grabbing ${
                        rarity.border
                      } ${rarity.glow} ${
                        isEquipped
                          ? "bg-accent-primary/10 ring-1 ring-accent-primary"
                          : "bg-bg-abyss/70 hover:bg-bg-abyss"
                      } ${isCurrentlyDragging ? "opacity-40 scale-95" : ""}`}
                    >
                      {/* Card Top Pill Bar */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-black font-['Rajdhani'] uppercase tracking-wider border ${rarity.badge}`}
                        >
                          {entry.item.rarity}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {compatSlots.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-bg-panel text-text-muted border border-white/10 text-[9px] font-bold font-['Rajdhani'] uppercase">
                              {compatSlots[0].replace("_1", "")}
                            </span>
                          )}
                          {entry.quantity > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-text-light font-bold font-mono text-[10px]">
                              x{entry.quantity}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Item Details */}
                      <div>
                        <h5 className="text-sm font-bold font-['Rajdhani'] text-text-primary group-hover:text-accent-text-light transition-colors">
                          {entry.item.name}
                        </h5>
                        <p className="text-xs text-text-secondary leading-relaxed mt-1 line-clamp-2">
                          {entry.item.description}
                        </p>
                      </div>

                      {/* Action Button & Equipped Status */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleToggleEquip(entry)}
                          disabled={actionLoadingId === entry.id}
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold font-['Rajdhani'] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                            isEquipped
                              ? "bg-accent-primary text-white shadow-md shadow-accent-primary/30"
                              : "bg-bg-panel hover:bg-white/10 text-text-primary border border-white/10"
                          }`}
                        >
                          {actionLoadingId === entry.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isEquipped ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Equipped</span>
                            </>
                          ) : (
                            <span>Equip</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
