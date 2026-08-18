"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ItemLoadoutSlot {
  slotId: "catalyst" | "armour" | "stimulant" | "acoustics" | "artifact";
  item?: InventoryItem;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: "CONSUMABLE" | "ARMOUR" | "ARTIFACT";
  slotTarget: "catalyst" | "armour" | "stimulant" | "acoustics" | "artifact";
  rarity: "Common" | "Rare" | "Epic" | "Legendary";
  effect: string;
  duration: string;
  description: string;
}

const INITIAL_SLOTS: ItemLoadoutSlot[] = [
  { slotId: "catalyst" },
  { slotId: "armour" },
  { slotId: "stimulant" },
  { slotId: "acoustics" },
  { slotId: "artifact" },
];

const RARITY_COLORS = {
  Common: { text: "text-green-400", border: "border-green-500/30", bg: "bg-green-500/10" },
  Rare: { text: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/10" },
  Epic: { text: "text-accent-text-light", border: "border-accent-primary-mid", bg: "bg-accent-primary-dim" },
  Legendary: { text: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" },
};

export function ItemsTab() {
  const [slots, setSlots] = useState<ItemLoadoutSlot[]>(INITIAL_SLOTS);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [draggedItem, setDraggedItem] = useState<InventoryItem | null>(null);
  const [activeDropSlot, setActiveDropSlot] = useState<string | null>(null);
  const [selectedTapItem, setSelectedTapItem] = useState<InventoryItem | null>(null);

  // Equip an item into a slot
  const equipItem = (item: InventoryItem, targetSlotId?: string) => {
    const slotId = targetSlotId || item.slotTarget;
    setSlots(prev => prev.map(s => {
      if (s.slotId === slotId) {
        return { ...s, item };
      }
      return s;
    }));
    // Remove from unequipped inventory
    setInventory(prev => prev.filter(i => i.id !== item.id));
    setSelectedTapItem(null);
  };

  // Unequip an item back to inventory
  const unequipSlot = (slotId: string) => {
    const slot = slots.find(s => s.slotId === slotId);
    if (slot && slot.item) {
      setInventory(prev => [...prev, slot.item!]);
      setSlots(prev => prev.map(s => s.slotId === slotId ? { ...s, item: undefined } : s));
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, item: InventoryItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (activeDropSlot !== slotId) setActiveDropSlot(slotId);
  };

  const handleDragLeave = () => {
    setActiveDropSlot(null);
  };

  const handleDrop = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    setActiveDropSlot(null);
    if (draggedItem) {
      equipItem(draggedItem, slotId);
      setDraggedItem(null);
    }
  };

  // Helper to generate a sample item for testing drag-and-drop
  const handleAddSampleItem = () => {
    const samples: InventoryItem[] = [
      {
        id: `sample-catalyst-${Date.now()}`,
        name: "Hyperfocus Catalyst v1",
        category: "CONSUMABLE",
        slotTarget: "catalyst",
        rarity: "Epic",
        effect: "+15% EXP during 45m+ Deep Work",
        duration: "1 Session",
        description: "Accelerates neural reward synthesis during active study sessions.",
      },
      {
        id: `sample-armour-${Date.now()}`,
        name: "Distraction Aegis Plating",
        category: "ARMOUR",
        slotTarget: "armour",
        rarity: "Rare",
        effect: "+20% Focus Integrity Score",
        duration: "Permanent",
        description: "Hardened mental barrier shielding against ambient interruption.",
      },
      {
        id: `sample-stimulant-${Date.now()}`,
        name: "Sylph Nectar Extract",
        category: "CONSUMABLE",
        slotTarget: "stimulant",
        rarity: "Rare",
        effect: "+30% Sylph Coin Payout",
        duration: "2 Quests",
        description: "Distilled essence boosting financial rewards on completed goals.",
      },
      {
        id: `sample-artifact-${Date.now()}`,
        name: "Seal of the Chronos",
        category: "ARTIFACT",
        slotTarget: "artifact",
        rarity: "Legendary",
        effect: "1-Day Streak Protection",
        duration: "Consumable",
        description: "Cryptographic rune that prevents streak forfeiture on emergency downtime.",
      },
    ];

    const randomSample = samples[Math.floor(Math.random() * samples.length)];
    setInventory(prev => [...prev, randomSample]);
  };

  const filteredInventory = selectedCategory === "ALL"
    ? inventory
    : inventory.filter(item => item.category === selectedCategory);

  const equippedCount = slots.filter(s => !!s.item).length;

  return (
    <div className="flex flex-col gap-8">
      {/* ─── Equipped Loadout Slots Dock (Clean Minimal Slots) ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs tracking-widest text-accent-text-light font-['Rajdhani'] font-bold">
              ACTIVE PROTOCOL DECK
            </p>
            <h2 className="text-xl font-bold font-['Rajdhani'] text-text-primary">
              Equipped Loadout Slots
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted font-['Rajdhani']">
              {equippedCount} / 5 Slots Active
            </span>
          </div>
        </div>

        {/* 5 Drop Target Slots */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {slots.map((slot) => {
            const isEquipped = !!slot.item;
            const isDropHovered = activeDropSlot === slot.slotId;
            const isTargetOfSelectedTap = selectedTapItem !== null;
            const rarity = slot.item?.rarity || "Common";
            const rarityStyle = RARITY_COLORS[rarity];

            return (
              <div
                key={slot.slotId}
                onDragOver={(e) => handleDragOver(e, slot.slotId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, slot.slotId)}
                onClick={() => {
                  if (selectedTapItem) {
                    equipItem(selectedTapItem, slot.slotId);
                  }
                }}
                className={`system-card p-4 bg-bg-panel/80 border transition-all flex flex-col justify-center min-h-[140px] relative overflow-hidden ${
                  isDropHovered
                    ? "border-accent-primary bg-accent-primary-dim/30 shadow-[0_0_20px_var(--accent-primary-dim)] scale-102"
                    : isTargetOfSelectedTap
                    ? "border-accent-primary/60 border-dashed animate-pulse cursor-pointer hover:bg-accent-primary-dim/20"
                    : isEquipped
                    ? `${rarityStyle.border} shadow-md`
                    : "border-border-subtle/50 border-dashed bg-bg-void/40"
                }`}
              >
                {isEquipped ? (
                  <div className="flex flex-col justify-between h-full">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-['Rajdhani'] font-bold text-sm text-text-primary truncate">
                          {slot.item?.name}
                        </h4>
                        <p className="text-[11px] text-accent-text-light mt-0.5 line-clamp-2">
                          {slot.item?.effect}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          unequipSlot(slot.slotId);
                        }}
                        className="w-5 h-5 rounded bg-bg-abyss hover:bg-red-500/20 hover:text-red-400 text-text-muted text-xs flex items-center justify-center transition-colors shrink-0 ml-1"
                        title="Unequip item"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="pt-2 mt-2 border-t border-border-subtle/40 flex items-center justify-between text-[10px] font-['Rajdhani'] font-bold">
                      <span className={`uppercase ${rarityStyle.text}`}>{slot.item?.rarity}</span>
                      <span className="text-text-muted">{slot.item?.duration}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-text-muted text-center">
                    <span className="text-xs font-['Rajdhani'] font-semibold">
                      {isTargetOfSelectedTap ? "Tap to Equip" : "Drop Item Here"}
                    </span>
                    <span className="text-[10px] text-text-muted/60 mt-0.5">Drag or Tap from below</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Inventory Catalog Area (Full Width) ─────── */}
      <div className="flex flex-col gap-5">
        {/* Category Filters Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "ALL", label: "All Items" },
              { id: "CONSUMABLE", label: "Consumables" },
              { id: "ARMOUR", label: "Armour" },
              { id: "ARTIFACT", label: "Artifacts" },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-['Rajdhani'] font-bold tracking-wider uppercase transition-all shrink-0 ${
                  selectedCategory === tab.id
                    ? "bg-accent-primary text-white shadow-[0_0_10px_var(--accent-primary-dim)]"
                    : "bg-bg-panel/80 text-text-secondary border border-border-subtle hover:text-text-primary hover:border-border-active"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddSampleItem}
            className="px-3.5 py-1.5 bg-bg-abyss hover:bg-bg-shadow border border-border-subtle text-accent-text-light text-xs font-['Rajdhani'] font-bold uppercase tracking-wider rounded-xl transition-all self-start sm:self-auto"
          >
            Synthesize Test Item
          </button>
        </div>

        {/* Inventory Content or Clean Placeholder */}
        {filteredInventory.length === 0 ? (
          <div className="system-card p-12 bg-bg-panel/50 border border-border-subtle/70 border-dashed rounded-2xl flex flex-col items-center justify-center text-center max-w-2xl mx-auto my-6">
            <h3 className="text-lg font-bold font-['Rajdhani'] text-text-primary uppercase tracking-wider mb-2">
              Scholar Inventory is Empty
            </h3>
            <p className="text-xs text-text-secondary max-w-md leading-relaxed mb-6 font-['Rajdhani']">
              Focus consumables, study catalysts, armour protocols, and streak shields can be acquired from the System Shop or earned through daily Quest completions.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAddSampleItem}
                className="px-4 py-2 bg-accent-primary hover:opacity-90 active:scale-95 text-text-primary rounded-xl font-['Rajdhani'] font-bold text-xs uppercase tracking-wider transition-all shadow-md"
              >
                Synthesize Demo Item
              </button>
            </div>
          </div>
        ) : (
          /* Draggable Inventory Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredInventory.map((item) => {
                const rarityStyle = RARITY_COLORS[item.rarity];
                const isTapped = selectedTapItem?.id === item.id;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    draggable
                    onDragStart={(e: any) => handleDragStart(e, item)}
                    onClick={() => {
                      if (selectedTapItem?.id === item.id) {
                        setSelectedTapItem(null);
                      } else {
                        setSelectedTapItem(item);
                      }
                    }}
                    className={`system-card p-4 bg-bg-panel/90 border cursor-grab active:cursor-grabbing transition-all flex flex-col justify-between select-none ${
                      isTapped
                        ? "border-accent-primary bg-accent-primary-dim/20 shadow-[0_0_15px_var(--accent-primary-dim)]"
                        : "border-border-subtle hover:border-border-active hover:scale-[1.02]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-bold font-['Rajdhani'] uppercase px-2 py-0.5 rounded border ${rarityStyle.text} ${rarityStyle.border} ${rarityStyle.bg}`}>
                          {item.rarity}
                        </span>
                        <span className="text-[10px] text-text-muted font-['Rajdhani'] uppercase">
                          {item.category}
                        </span>
                      </div>

                      <div className="mb-3">
                        <h4 className="font-['Rajdhani'] font-bold text-sm text-text-primary truncate">
                          {item.name}
                        </h4>
                        <p className="text-xs text-accent-text-light font-medium line-clamp-1 mt-0.5">
                          {item.effect}
                        </p>
                      </div>

                      <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                        {item.description}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-border-subtle/50 flex items-center justify-between text-xs font-['Rajdhani']">
                      <span className="text-text-muted text-[11px]">
                        Target: <strong className="text-text-primary uppercase">{item.slotTarget}</strong>
                      </span>
                      <span className="text-accent-text-light text-[11px] font-bold">
                        {isTapped ? "Tap Slot Above" : "Drag to Equip"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
