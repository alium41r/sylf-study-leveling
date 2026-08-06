export type ArchiveCategory = 
  | "The System"
  | "Economy"
  | "Quests"
  | "Inventory & Collections"
  | "Social & Guilds"
  | "Lore"
  | "Updates";

export type UnlockRequirement = 
  | { type: "NONE" }
  | { type: "LEVEL"; value: number }
  | { type: "RANK"; value: string }; // E, D, C, B, A, S

export type ContentBlock = 
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "lore"; text: string }; // Stylized block for story

export interface ArchiveEntry {
  id: string;
  categoryId: ArchiveCategory;
  title: string;
  requirement: UnlockRequirement;
  content: ContentBlock[];
  related: string[]; // IDs of related entries
}

export const ARCHIVE_ENTRIES: ArchiveEntry[] = [
  // --- THE SYSTEM ---
  {
    id: "sys_leveling",
    categoryId: "The System",
    title: "Levels & Experience",
    requirement: { type: "NONE" },
    related: ["sys_ranks", "eco_sylph"],
    content: [
      { type: "p", text: "The System tracks your growth through Experience Points (XP). You gain XP primarily by completing Study Sessions, finishing Quests, and unlocking Achievements." },
      { type: "p", text: "As you accumulate XP, your Level increases. Higher levels unlock access to deeper parts of the System, including exclusive cosmetics and classified records." },
      { type: "h3", text: "XP Multipliers" },
      { type: "p", text: "You can temporarily boost your XP yield by purchasing an 'XP Multiplier Boost' from the Shop, which grants a 1.5x multiplier for 24 hours." }
    ]
  },
  {
    id: "sys_ranks",
    categoryId: "The System",
    title: "Hunter Ranks",
    requirement: { type: "NONE" },
    related: ["sys_leveling"],
    content: [
      { type: "p", text: "While Levels track continuous effort, your Hunter Rank is a reflection of your overall mastery and consistency. All users awaken as an E-Rank Hunter." },
      { type: "h3", text: "Rank Progression" },
      { type: "list", items: [
        "E-Rank: The awakening. Access to basic features.",
        "D-Rank: Achieved through consistent early effort.",
        "C-Rank: The mark of a seasoned user.",
        "B-Rank: High-tier mastery.",
        "A-Rank: Elite status, granting access to premium backgrounds.",
        "S-Rank: The absolute pinnacle of The System."
      ]},
      { type: "lore", text: "Those who reach S-Rank are no longer bound by the rules of the System. They rewrite them." }
    ]
  },
  
  // --- ECONOMY ---
  {
    id: "eco_sylph",
    categoryId: "Economy",
    title: "Sylph (Currency)",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "inv_shop"],
    content: [
      { type: "p", text: "Sylph is the universal energy currency of The System. It is crystallized effort, awarded whenever you successfully complete a focus session, finish a quest, or claim an achievement." },
      { type: "h3", text: "Acquisition" },
      { type: "list", items: [
        "Completing focus timer sessions (scaled by duration).",
        "Completing Daily and Weekly Quests.",
        "Unlocking System Achievements."
      ]},
      { type: "p", text: "Sylph can be spent in the Shop to acquire powerful consumable items, such as Streak Freezes or extra Quest Rerolls." }
    ]
  },

  // --- QUESTS ---
  {
    id: "qst_daily",
    categoryId: "Quests",
    title: "Daily Quests",
    requirement: { type: "NONE" },
    related: ["qst_penalties"],
    content: [
      { type: "p", text: "Every 24 hours, the System assigns you a set of Daily Quests. These are mandatory tasks designed to ensure consistent growth." },
      { type: "p", text: "Failing to complete your Daily Quests will result in an HP penalty, risking your streak." },
      { type: "h3", text: "Quest Rerolls" },
      { type: "p", text: "If a quest does not fit your schedule, you may use a 'Quest Reroll' item (purchasable with Sylph) to generate a new objective." }
    ]
  },
  {
    id: "qst_penalties",
    categoryId: "Quests",
    title: "The Penalty Zone",
    requirement: { type: "LEVEL", value: 3 },
    related: ["qst_daily", "inv_items"],
    content: [
      { type: "lore", text: "The System does not tolerate stagnation. Failure to meet the daily requirements transports the user to the Penalty Zone." },
      { type: "p", text: "If you fail a quest, your HP is drained. If your HP reaches 0, your streak is broken, and your progress takes a severe hit." },
      { type: "p", text: "You can mitigate this by purchasing a 'Streak Freeze' or equipping 'Kamish\\'s Ward' before taking on high-risk tasks." }
    ]
  },

  // --- INVENTORY & COLLECTIONS ---
  {
    id: "inv_shop",
    categoryId: "Inventory & Collections",
    title: "The System Shop",
    requirement: { type: "NONE" },
    related: ["eco_sylph", "inv_items"],
    content: [
      { type: "p", text: "The Shop is where you exchange Sylph for powerful consumable items. It is strictly for functional items that affect your progression, not cosmetics." }
    ]
  },
  {
    id: "inv_items",
    categoryId: "Inventory & Collections",
    title: "Consumable Items",
    requirement: { type: "NONE" },
    related: ["inv_shop", "eco_sylph"],
    content: [
      { type: "p", text: "Items grant temporary advantages or protections." },
      { type: "list", items: [
        "Streak Freeze: Protects your streak for one missed day.",
        "XP Boost: 1.5x multiplier to XP gains for 24 hours.",
        "Kamish's Ward: Negates HP penalty if you fail a quest.",
        "Gate Key: Doubles rewards but triples penalties."
      ]}
    ]
  },
  {
    id: "inv_cosmetics",
    categoryId: "Inventory & Collections",
    title: "Cosmetics & Themes",
    requirement: { type: "NONE" },
    related: ["sys_ranks"],
    content: [
      { type: "p", text: "Cosmetics allow you to customize your System Interface. Unlike items, Cosmetics cannot be bought with Sylph. They must be earned." },
      { type: "p", text: "As you level up and increase your Rank, you will naturally decrypt new Themes, Backgrounds, Avatars, and Titles in your Collection." }
    ]
  },

  // --- SOCIAL & GUILDS ---
  {
    id: "soc_friends",
    categoryId: "Social & Guilds",
    title: "Friends & Messaging",
    requirement: { type: "NONE" },
    related: [],
    content: [
      { type: "p", text: "The System allows you to connect with other Awakeners. Adding friends allows you to track their progress, compare ranks, and send direct messages." }
    ]
  },
  {
    id: "soc_guilds",
    categoryId: "Social & Guilds",
    title: "Guilds (Classified)",
    requirement: { type: "RANK", value: "C" },
    related: ["soc_friends"],
    content: [
      { type: "lore", text: "As Awakeners grow stronger, they naturally cluster together. The Guild system is currently under construction by the Architect." },
      { type: "p", text: "In the future, C-Rank and above hunters will be able to form Guilds to take on massive collaborative quests." }
    ]
  },

  // --- LORE ---
  {
    id: "lore_architect",
    categoryId: "Lore",
    title: "The Architect",
    requirement: { type: "RANK", value: "B" },
    related: ["lore_monarch"],
    content: [
      { type: "lore", text: "You were not chosen by chance. The System was designed to cultivate strength. The Architect watches your growth through the screen, analyzing your consistency and your failures." },
      { type: "p", text: "Very little is known about the Architect, other than their obsession with constant, unbroken progression." }
    ]
  },
  {
    id: "lore_monarch",
    categoryId: "Lore",
    title: "The Shadow Monarch",
    requirement: { type: "RANK", value: "S" },
    related: ["lore_architect"],
    content: [
      { type: "lore", text: "Arise. The ultimate rank is not merely a title; it is an inheritance. To reach S-Rank is to master the shadows of your own procrastination." },
      { type: "p", text: "You have unlocked the deepest secret of the System. The power is now yours to command." }
    ]
  },

  // --- UPDATES ---
  {
    id: "upd_v1",
    categoryId: "Updates",
    title: "Patch 1.0 - The Awakening",
    requirement: { type: "NONE" },
    related: [],
    content: [
      { type: "p", text: "The System has officially initialized. All users have been awakened as E-Rank hunters." },
      { type: "list", items: [
        "Core Timer and XP mechanics deployed.",
        "Quest System engaged.",
        "System Shop and Inventory online.",
        "Cosmetic encryption protocols active."
      ]}
    ]
  }
];
