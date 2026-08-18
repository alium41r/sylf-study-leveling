export interface ShopItem {
  id: string;
  itemKey: string;
  name: string;
  description: string;
  price: number;
  icon: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "shop_reroll",
    itemKey: "EXTRA_REROLL",
    name: "Extra Quest Reroll",
    description: "Allows you to reroll one of your scheduled quests.",
    price: 150,
    icon: "🎲",
  },
  {
    id: "shop_change_quests",
    itemKey: "CHANGE_TODAY_QUESTS",
    name: "Change Today's Quests",
    description: "Completely changes all of your active scheduled quests.",
    price: 500,
    icon: "🔄",
  },
  {
    id: "shop_xp_boost",
    itemKey: "XP_BOOST_24H",
    name: "XP Multiplier Boost",
    description: "Grants a 1.5x EXP multiplier for the next 24 hours.",
    price: 800,
    icon: "⚡",
  },
  {
    id: "shop_elixir_insight",
    itemKey: "ELIXIR_OF_INSIGHT",
    name: "Elixir of Insight",
    description: "Grants 1.5x EXP multiplier for the next 24 hours.",
    price: 800,
    icon: "🧪",
  },
  {
    id: "shop_freeze_streak",
    itemKey: "STREAK_FREEZE",
    name: "Weekly Streak Freeze",
    description: "Protects your weekly streak if you fail to reach the 3-hour study milestone before the Sunday reset.",
    price: 1000,
    icon: "❄️",
  },
  {
    id: "shop_gate_key_red",
    itemKey: "GATE_KEY_RED",
    name: "Gate Key (Red)",
    description: "Instantly doubles the Sylph and EXP payout of a selected quest. Risk: Failure results in 3x HP damage.",
    price: 1200,
    icon: "🗝️",
  },
  {
    id: "shop_calendar_custom",
    itemKey: "CALENDAR_CUSTOM",
    name: "Calendar Customization",
    description: "Unlock advanced customization for your system calendar.",
    price: 1500,
    icon: "📅",
  },
  {
    id: "shop_nickname_change",
    itemKey: "NICKNAME_CHANGE",
    name: "Nickname Change",
    description: "Allows you to change your system username once.",
    price: 2000,
    icon: "🏷️",
  },
  {
    id: "shop_kamish_ward",
    itemKey: "KAMISH_WARD",
    name: "Kamish's Ward",
    description: "Equip before a Hardcore quest. Completely negates the HP penalty if you fail.",
    price: 2500,
    icon: "🛡️",
  },
  {
    id: "shop_shadow_extraction",
    itemKey: "SHADOW_EXTRACTION",
    name: "Shadow Extraction",
    description: "Resurrect a failed quest and restore the HP lost from it.",
    price: 3000,
    icon: "👥",
  },
];
