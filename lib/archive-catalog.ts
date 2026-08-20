export type ArchiveCategory = 
  | "The System"
  | "Focus & Study"
  | "Quests & AI"
  | "Economy & Shop"
  | "Customization"
  | "Social & Network"
  | "Achievements";

export type UnlockRequirement = 
  | { type: "NONE" }
  | { type: "LEVEL"; value: number }
  | { type: "RANK"; value: string };

export type ContentBlock = 
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] };

export interface ArchiveEntry {
  id: string;
  categoryId: ArchiveCategory;
  title: string;
  requirement: UnlockRequirement;
  content: ContentBlock[];
  related: string[];
}

export const ARCHIVE_ENTRIES: ArchiveEntry[] = [
  // ─── THE SYSTEM ───────────────────────────────────────────────
  {
    id: "sys_leveling",
    categoryId: "The System",
    title: "Levels & Experience",
    requirement: { type: "NONE" },
    related: ["sys_ranks", "eco_sylph", "sys_stats"],
    content: [
      { type: "p", text: "The System quantifies your academic and focus growth through Experience Points (XP). XP is earned by completing study sessions on the Focus Timer, finishing daily and weekly Quests, and unlocking Achievements." },
      { type: "p", text: "As your XP fills the required threshold for your current level, you automatically Level Up. Each level up increases your maximum capacity, unlocks new cosmetic rewards, and awards a direct Sylph currency bonus." },
      { type: "h3", text: "XP Calculation & Curve" },
      { type: "p", text: "The required XP to advance from one level to the next follows a gentle exponential progression: XP = floor(200 × Level^1.2). Early levels feel swift and motivating, while higher tiers demand sustained academic consistency." },
      { type: "h3", text: "XP Boost Multipliers" },
      { type: "p", text: "You can temporarily amplify your XP acquisition rate by activating consumable boosts from the System Shop, such as the 24-hour XP Boost (1.5× multiplier)." }
    ]
  },
  {
    id: "sys_ranks",
    categoryId: "The System",
    title: "Hunter Ranks & Progression",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "sys_classes"],
    content: [
      { type: "p", text: "While Levels measure cumulative time and effort, your Hunter Rank represents your overall academic standing and tier within the System. Every user awakens as an E-Rank Hunter and ascends through higher tiers as their level increases." },
      { type: "h3", text: "Rank Tiers & Thresholds" },
      { type: "list", items: [
        "E-Rank: Level 1 – 5 (The Awakening tier; fundamental access to timers and quests).",
        "D-Rank: Level 6 – 12 (Established habit formation and routine focus).",
        "C-Rank: Level 13 – 20 (Seasoned scholar tier with expanded capabilities).",
        "B-Rank: Level 21 – 30 (Advanced focus discipline and high-tier status).",
        "A-Rank: Level 31 – 45 (Elite academic status granting access to prestigious titles and cosmetics).",
        "S-Rank: Level 46+ (The pinnacle of the System, reflecting master-level focus mastery)."
      ]}
    ]
  },
  {
    id: "sys_classes",
    categoryId: "The System",
    title: "Scholar Classes & Archetypes",
    requirement: { type: "NONE" },
    related: ["sys_ranks", "inv_character", "sys_stats"],
    content: [
      { type: "p", text: "During onboarding or via character customization, you can align with a Scholar Class that reflects your primary study discipline and personality." },
      { type: "h3", text: "Available Classes" },
      { type: "list", items: [
        "Scholar: Balanced intellectual with an affinity for deep reading and conceptual mastery.",
        "Alchemist: Experimental mindset focused on synthesis, research, and technical sciences.",
        "Shadow Scholar: Stealth focus master specializing in solitary, uninterrupted deep work.",
        "Monarch: High-stamina focus leader driven by ambitious milestones and large workloads."
      ]},
      { type: "p", text: "Your active class influences your default avatar sprite, profile badges, and initial stat allocations." }
    ]
  },
  {
    id: "sys_stats",
    categoryId: "The System",
    title: "Cognitive Attributes & Stats",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "focus_timer"],
    content: [
      { type: "p", text: "The System models your cognitive development across five core attributes visible on your Scholar Profile:" },
      { type: "list", items: [
        "Endurance: Reflects your ability to sustain long focus sessions without fatigue.",
        "Tenacity: Measures consistency in maintaining streaks and overcoming difficult tasks.",
        "Velocity: Tracks focus efficiency and task completion speed.",
        "Synthesis: Gauges conceptual retention and diverse subject mastery.",
        "Discipline: Demonstrates regular adherence to daily study targets and scheduled quests."
      ]}
    ]
  },

  // ─── FOCUS & STUDY ────────────────────────────────────────────
  {
    id: "focus_timer",
    categoryId: "Focus & Study",
    title: "Study Timer & Focus Engine",
    requirement: { type: "NONE" },
    related: ["focus_subjects", "focus_streak", "eco_sylph"],
    content: [
      { type: "p", text: "The Focus Timer is the core engine for logging focused study time. It features a distraction-free full-screen mode, real-time stopwatch and countdown modes, ambient audio alerts, and live pause/resume handling." },
      { type: "h3", text: "Live Session Tracking" },
      { type: "p", text: "When you start a focus session, the System records an active session timestamp. Friends and study partners can view your live study status in real time on the Social Hub." },
      { type: "h3", text: "Cumulative Daily Focus" },
      { type: "p", text: "The Study Timer page displays a unified Daily Focus clock that aggregates time spent across all active Quests and academic Subjects today." }
    ]
  },
  {
    id: "focus_subjects",
    categoryId: "Focus & Study",
    title: "Subjects & Objectives",
    requirement: { type: "NONE" },
    related: ["focus_timer", "qst_overview"],
    content: [
      { type: "p", text: "Organize your study goals by creating dedicated Subjects (e.g., Mathematics, Computer Science, Organic Chemistry, Literature). Each subject tracks its own cumulative study hours and daily progress." },
      { type: "p", text: "Starting a focus session directly from a subject card links the logged time to that discipline, allowing you to monitor where your effort is invested over time." }
    ]
  },
  {
    id: "focus_streak",
    categoryId: "Focus & Study",
    title: "Daily & Weekly Streaks",
    requirement: { type: "NONE" },
    related: ["focus_timer", "qst_weekly", "inv_items"],
    content: [
      { type: "p", text: "Consistency is rewarded through two parallel streak systems:" },
      { type: "list", items: [
        "Daily Streak: Increments each day you log at least one focus session. Missing a day resets the counter to 0.",
        "Weekly Streak: Increments each week you complete your 3-hour Weekly Focus target (Monday to Sunday)."
      ]},
      { type: "h3", text: "Streak Multipliers" },
      { type: "p", text: "Consecutive weekly streaks provide exponential Sylph bonuses: 1 week = 1.05×, 2 weeks = 1.15×, 4 weeks = 1.3×, and 8+ weeks = 1.5× Sylph multiplier on all earnings." },
      { type: "p", text: "Equipping a 'Streak Freeze' from your inventory protects your streak from resetting if life interruptions prevent studying." }
    ]
  },

  // ─── QUESTS & AI ──────────────────────────────────────────────
  {
    id: "qst_overview",
    categoryId: "Quests & AI",
    title: "System Quests & Bounties",
    requirement: { type: "NONE" },
    related: ["qst_weekly", "qst_ai_planner", "eco_sylph"],
    content: [
      { type: "p", text: "Quests are actionable study objectives designed to break down large workloads into achievable goals. Completing a quest grants XP, Sylph, and progress toward quest-based achievements." },
      { type: "h3", text: "Quest Types" },
      { type: "list", items: [
        "Daily Quests: Recurring micro-tasks generated based on your effort level (Relaxed, Normal, Intense, Extreme).",
        "Scheduled Quests: Tasks assigned to specific calendar dates with target focus durations.",
        "Custom Quests: User-created objectives tailored to specific exams, assignments, or reading chapters."
      ]}
    ]
  },
  {
    id: "qst_weekly",
    categoryId: "Quests & AI",
    title: "Weekly Focus Milestone",
    requirement: { type: "NONE" },
    related: ["focus_streak", "qst_overview"],
    content: [
      { type: "p", text: "Every Monday at 00:00 UTC, the System activates your Weekly Focus Quest: log at least 3 hours (180 minutes) of focus study before Sunday midnight." },
      { type: "p", text: "Meeting the milestone awards substantial level-scaled XP and Sylph currency, while advancing your Weekly Streak multiplier." }
    ]
  },
  {
    id: "qst_ai_planner",
    categoryId: "Quests & AI",
    title: "AI Study Intelligence & Agents",
    requirement: { type: "NONE" },
    related: ["qst_overview", "focus_subjects"],
    content: [
      { type: "p", text: "The System incorporates specialized AI agents powered by Gemini and Groq to assist your academic journey:" },
      { type: "list", items: [
        "Planner Agent: Automatically breaks complex subjects into structured daily study quests with realistic time budgets.",
        "Coach Agent: Analyzes study trends, highlights areas of improvement, and provides strategic motivation.",
        "Analyst Agent: Evaluates your focus velocity, subject balance, and stamina curves over time.",
        "Daily Briefing: Generates a concise daily overview of your scheduled tasks, current streak, and recommended priorities each morning."
      ]}
    ]
  },

  // ─── ECONOMY & SHOP ───────────────────────────────────────────
  {
    id: "eco_sylph",
    categoryId: "Economy & Shop",
    title: "Sylph Currency System",
    requirement: { type: "NONE" },
    related: ["inv_shop", "sys_leveling", "ach_system"],
    content: [
      { type: "p", text: "Sylph is the universal energy currency of the System, representing crystallized academic effort." },
      { type: "h3", text: "Earning Sylph" },
      { type: "list", items: [
        "Focus Timer: Earn Sylph proportional to your logged study minutes.",
        "Quests: Claim bounties upon successfully completing daily and weekly quests.",
        "Level Ups: Receive a bonus of (Level × 300) Sylph each time you ascend.",
        "Achievements: Claim milestone awards from the Achievements codex."
      ]},
      { type: "p", text: "All Sylph earnings and expenditures are tracked in your personal Sylph Ledger with complete transaction history." }
    ]
  },
  {
    id: "inv_shop",
    categoryId: "Economy & Shop",
    title: "The System Shop & Inventory",
    requirement: { type: "NONE" },
    related: ["eco_sylph", "inv_items"],
    content: [
      { type: "p", text: "The System Shop allows scholars to spend earned Sylph on consumable items and gameplay aids. Purchased items are added to your Inventory and can be activated at any time." },
      { type: "h3", text: "Catalog of Functional Items" },
      { type: "list", items: [
        "Weekly Streak Freeze: Shields your weekly streak if you are unable to fulfill the 3-hour requirement.",
        "XP Multiplier Boost (24h): Multiplies all XP gains by 1.5× for 24 hours.",
        "Sylph Multiplier Boost (24h): Multiplies all Sylph yield by 1.5× for 24 hours.",
        "Kamish's Ward: Emergency protection negating penalty damage.",
        "Elixir of Insight: Instantly restores focus vitality.",
        "Gate Key: High-risk dungeon item doubling rewards."
      ]}
    ]
  },

  // ─── CUSTOMIZATION ────────────────────────────────────────────
  {
    id: "inv_cosmetics",
    categoryId: "Customization",
    title: "Themes, Auras & Cosmetics",
    requirement: { type: "NONE" },
    related: ["inv_character", "sys_ranks"],
    content: [
      { type: "p", text: "Personalize your System interface with unlockable aesthetic cosmetics earned through leveling and milestone progression:" },
      { type: "list", items: [
        "Interface Themes: Cyber Shadow, Monochromatic Slate, Bioluminescent Monarch, and High-Contrast Light Mode.",
        "Awakened Auras: Ambient animated particle glows encircling your scholar card (e.g., Azure Flame, Shadow Monarch, Cyber Visor).",
        "Avatar Frames: High-tech bordered frames for your profile picture.",
        "Titles: Prestigious titles (e.g., Novice, Shadow Monarch, Grandmaster Scholar) displayed next to your username.",
        "Glowing Name Colors: Custom chromatic hues for your scholar ID."
      ]}
    ]
  },
  {
    id: "inv_character",
    categoryId: "Customization",
    title: "Avatar & Sprite Customizer",
    requirement: { type: "NONE" },
    related: ["inv_cosmetics", "sys_classes"],
    content: [
      { type: "p", text: "Craft your unique scholar avatar using the built-in 2D pixel/vector sprite customizer:" },
      { type: "list", items: [
        "Skin Tones: Fair, Pale, Olive, Caramel, Espresso, and Astral.",
        "Hair Styles & Colors: Crop, Undercut, Spiky, Flowing, and Wavy in Midnight Black, Platinum, Purple, and Crimson.",
        "Attire: Scholar Robes, Techwear Armor, Stealth Uniform, and Formal Academic Wear.",
        "Eyewear & Accessories: Cyber Visors, Reading Spectacles, Headbands, and Ear pieces."
      ]},
      { type: "p", text: "Your custom character is rendered dynamically on your Scholar Profile, Social cards, and top navigation bar." }
    ]
  },

  // ─── SOCIAL & NETWORK ─────────────────────────────────────────
  {
    id: "soc_friends",
    categoryId: "Social & Network",
    title: "Friends & Scholar Network",
    requirement: { type: "NONE" },
    related: ["soc_presence", "soc_privacy"],
    content: [
      { type: "p", text: "Connect with other scholars across the network to stay accountable, compare weekly study times, and exchange direct messages." },
      { type: "h3", text: "Social Management" },
      { type: "list", items: [
        "Friend Requests: Search scholars by username or unique Scholar ID (e.g., SCH-000101) and send requests.",
        "Public Scholar Dossiers: Inspect a user's Level, Hunter Rank, Today's Focus, Total Hours, and Active Character.",
        "Friend Controls: Remove friends or block scholars directly from their profile menu."
      ]}
    ]
  },
  {
    id: "soc_presence",
    categoryId: "Social & Network",
    title: "Live Study Presence & Rooms",
    requirement: { type: "NONE" },
    related: ["soc_friends", "focus_timer"],
    content: [
      { type: "p", text: "The Social Hub features real-time presence indicators that show when your friends are currently studying." },
      { type: "p", text: "Live cards display an active cyan glow, a pulsing study badge, and a real-time study timer ticking upward as your friends focus." },
      { type: "p", text: "Scholars can also gather in virtual Study Rooms for synchronized focus sessions with shared ambient sounds and chat." }
    ]
  },
  {
    id: "soc_privacy",
    categoryId: "Social & Network",
    title: "Privacy & Visibility Controls",
    requirement: { type: "NONE" },
    related: ["soc_friends"],
    content: [
      { type: "p", text: "The System provides granular privacy settings accessible under Settings → Privacy:" },
      { type: "list", items: [
        "Profile Visibility: Public, Friends Only, or Private.",
        "Study Hours & Stats: Control whether your total study time and cognitive attributes are visible to others.",
        "Online & Study Presence: Toggle whether your live studying status is broadcasted.",
        "Direct Messages & Requests: Restrict incoming messages and friend invitations."
      ]}
    ]
  },

  // ─── ACHIEVEMENTS ─────────────────────────────────────────────
  {
    id: "ach_system",
    categoryId: "Achievements",
    title: "Achievements & Milestones",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "eco_sylph"],
    content: [
      { type: "p", text: "The Achievements codex features 24 structured milestones across six categories: Study, Streaks, Rank, Social, Quests, and Exploration." },
      { type: "h3", text: "Rarity Tiers & Rewards" },
      { type: "list", items: [
        "Common (Green): Fundamental milestones rewarding +50 to +200 Sylph/XP.",
        "Rare (Blue): Intermediate milestones rewarding +300 to +800 Sylph.",
        "Epic (Purple): Advanced challenges rewarding +1,000 to +2,500 Sylph and rare items.",
        "Legendary (Orange): Elite achievements granting items like Gate Keys and Elixirs.",
        "Mythic (Gold): Master-level milestones awarding ultimate artifacts like Shadow Extractions."
      ]},
      { type: "p", text: "Claiming achievements instantly credits your balance, awards XP, or deposits items directly into your inventory." }
    ]
  }
];
