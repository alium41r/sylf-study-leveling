# Archived Modules & Features Index

This archive safely preserves the complete source code, configuration data, and UI logic for features temporarily put on standby:

---

## 1. Locker: Items & Loadout Protocol
- **Archived File:** [`ItemsTab.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/locker/ItemsTab.original.tsx)
- **Features Included:**
  - 5-slot interactive protocol deck (`catalyst`, `armour`, `stimulant`, `acoustics`, `artifact`).
  - Drag-and-drop & tap-to-equip mechanics.
  - Category filters (`ALL`, `CONSUMABLES`, `ARMOUR`, `ARTIFACTS`).
  - Item synthesizer engine for testing.
- **To Restore:** Copy [`ItemsTab.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/locker/ItemsTab.original.tsx) into [`app/locker/components/ItemsTab.tsx`](file:///Users/aliumair/Desktop/sylf/app/locker/components/ItemsTab.tsx).

---

## 2. Locker: 8-Class Skill Tree Constellations
- **Archived File:** [`SkillTreeTab.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/locker/SkillTreeTab.original.tsx)
- **Features Included:**
  - 8 unique class tree topology layouts (`Scholar`, `Analyst`, `Engineer`, `Scientist`, `Researcher`, `Psychologist`, `Strategist`, `Creative`).
  - Interactive SVG curved bezier node graph with dynamic glow filters.
  - Skill Point (SP) unlock hierarchy, parent node dependency validation, and local storage persistence.
  - Detailed node inspector with perk descriptions and branch names.
- **To Restore:** Copy [`SkillTreeTab.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/locker/SkillTreeTab.original.tsx) into [`app/locker/components/SkillTreeTab.tsx`](file:///Users/aliumair/Desktop/sylf/app/locker/components/SkillTreeTab.tsx).

---

## 3. System Shop & Store
- **Archived File:** [`ShopPage.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/shop/ShopPage.original.tsx)
- **Data Catalog:** [`lib/shop-items.ts`](file:///Users/aliumair/Desktop/sylf/lib/shop-items.ts)
- **Features Included:**
  - Real-time Sylph coin purchasing flow with `/api/shop` backend transaction integration.
  - Item catalog cards (`Extra Quest Rerolls`, `Change Quests`, `XP Boosts`, `Elixir of Insight`, `Streak Freeze`, `Red Gate Keys`, `Calendar Customizations`, `Kamish's Ward`).
- **To Restore:** Copy [`ShopPage.original.tsx`](file:///Users/aliumair/Desktop/sylf/archive/shop/ShopPage.original.tsx) into [`app/inventory/page.tsx`](file:///Users/aliumair/Desktop/sylf/app/inventory/page.tsx).
