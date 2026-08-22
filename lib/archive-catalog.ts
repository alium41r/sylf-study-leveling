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
      { type: "p", text: "The System measures your growth through Experience Points (XP). You earn XP naturally by studying — finishing focus sessions on the Timer, completing Quests, and unlocking Achievements." },
      { type: "p", text: "As your XP bar fills, you automatically Level Up. Each level-up raises your standing, unlocks new cosmetic rewards and shop items, and hands you a Sylph currency bonus as a gift." },
      { type: "h3", text: "How it Feels" },
      { type: "p", text: "Early levels come quickly so you feel the momentum of your new habit. Higher levels demand real consistency — the bar simply takes longer to fill the further you climb. There are no tricks: only study time and completed quests move it." },
      { type: "h3", text: "Ways to Earn XP" },
      { type: "list", items: [
        "Focus sessions: the longer you focus, the more XP you earn.",
        "Quests: every completed quest pays out its listed XP bounty.",
        "Achievements: milestone rewards from the Achievements codex.",
        "The weekly 3-hour milestone pays a large level-scaled XP reward."
      ]}
    ]
  },
  {
    id: "sys_ranks",
    categoryId: "The System",
    title: "Hunter Ranks & Progression",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "sys_classes"],
    content: [
      { type: "p", text: "While your Level measures raw progress, your Hunter Rank is your title — the badge everyone sees next to your name. Every scholar awakens as an E-Rank Hunter and climbs the ladder as their level rises." },
      { type: "h3", text: "The Rank Ladder" },
      { type: "list", items: [
        "E-Rank — Level 1+ (The Awakening. Everyone starts here.)",
        "D-Rank — Level 10+ (Habit is forming; the grind becomes routine.)",
        "C-Rank — Level 25+ (A seasoned scholar with real standing.)",
        "B-Rank — Level 50+ (Advanced discipline. High-tier status.)",
        "A-Rank — Level 75+ (Elite. Prestigious titles and cosmetics unlock.)",
        "S-Rank — Level 100+ (Master-level focus mastery.)",
        "National Hunter — Level 125+ (Among the best in the country.)",
        "Monarch — Level 150+ (The apex. The shadow monarch of scholars.)"
      ]},
      { type: "p", text: "Ranks aren't just for show — stronger shop gear, titles, and frames open up as you rise. Your rank badge appears on your profile, the leaderboards, and your friends' screens." }
    ]
  },
  {
    id: "sys_classes",
    categoryId: "The System",
    title: "Scholar Archetypes",
    requirement: { type: "NONE" },
    related: ["sys_ranks", "sys_skilltree", "sys_stats"],
    content: [
      { type: "p", text: "Every scholar has a study personality. The System models eight Archetypes — eight different ways of approaching learning — each with its own branch of the Skill Tree and its own bonuses." },
      { type: "h3", text: "The Eight Archetypes" },
      { type: "list", items: [
        "Scholar — The reader. Bonuses to revision, review loops, and deep reading.",
        "Analyst — The problem-solver. Earns extra Sylph on math and quantitative work.",
        "Engineer — The organizer. Bonus rewards for staying on schedule and batch tasks.",
        "Scientist — The rigor chaser. Extra XP for high-difficulty STEM work.",
        "Researcher — The deep-diver. Bonuses for long, unbroken focus sessions.",
        "Psychologist — The balanced one. Resists burnout and protects your mind.",
        "Strategist — The planner. Bonus rewards for forecasting milestones.",
        "Creative — The wildcard. Bonuses for cross-discipline and unusual study."
      ]},
      { type: "p", text: "You don't lock yourself in forever — the Skill Tree lets you invest points into any archetype you like, mixing perks to match your study style." }
    ]
  },
  {
    id: "sys_stats",
    categoryId: "The System",
    title: "Cognitive Attributes & Stats",
    requirement: { type: "NONE" },
    related: ["sys_leveling", "focus_timer"],
    content: [
      { type: "p", text: "The System tracks your growth across five core attributes, shown on your Scholar Profile:" },
      { type: "list", items: [
        "Endurance: Your ability to sustain long focus sessions without fatigue.",
        "Tenacity: How consistently you hold streaks and push through hard tasks.",
        "Velocity: How quickly you power through tasks and clear quests.",
        "Synthesis: How well you retain concepts across subjects.",
        "Discipline: How reliably you hit your daily targets and schedules."
      ]},
      { type: "p", text: "These attributes grow with real behaviour — long sessions build Endurance, consistent weeks build Tenacity. Think of them as your report card of habits, written by the System." }
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
      { type: "p", text: "The Focus Timer is where the work happens. Start a session from any subject or quest and it runs distraction-free — a big, clean timer with nothing else pulling your attention." },
      { type: "h3", text: "Modes" },
      { type: "list", items: [
        "Free Flow: a simple stopwatch — study for as long as you want.",
        "Pomodoro: classic focus/break cycles with session dots.",
        "Deep Work: one long, protected block in fullscreen.",
        "Sprint: short bursts with quick rests between them."
      ]},
      { type: "h3", text: "While You Study" },
      { type: "p", text: "You can pull up the Tools dock for a calculator, scratchpad, formula sheet, ambient audio, or the in-session tutor — without ever leaving the timer. In Light Mode, a one-tap Eye-Comfort dimmer softens the screen for night studying." }
    ]
  },
  {
    id: "focus_subjects",
    categoryId: "Focus & Study",
    title: "Subjects & Objectives",
    requirement: { type: "NONE" },
    related: ["focus_timer", "qst_overview"],
    content: [
      { type: "p", text: "Organize your study by creating Subjects — Mathematics, Physics, Chemistry, Literature, whatever you're tackling. Each subject tracks its own total hours and daily progress." },
      { type: "p", text: "The System can also compile a full 48-topic syllabus for a subject (mapped to your Skill Tree). Once it exists, every quest you finish on a topic pushes that topic toward mastery." }
    ]
  },
  {
    id: "focus_streak",
    categoryId: "Focus & Study",
    title: "Streaks & Weekly Milestones",
    requirement: { type: "NONE" },
    related: ["focus_timer", "qst_weekly", "inv_shop"],
    content: [
      { type: "p", text: "Consistency is the whole game. The System rewards it with a Weekly Streak: log 3 hours of focus between Monday and Sunday and your streak grows by one week." },
      { type: "h3", text: "Streak Rewards" },
      { type: "p", text: "Longer streaks mean richer payouts — every week your streak grows, your Sylph earnings are multiplied a little more, all the way up to a hefty 1.5× bonus." },
      { type: "p", text: "Life happens. If a brutal week breaks your rhythm, a Streak Freeze item from the shop absorbs the hit and keeps your streak alive." }
    ]
  },
  {
    id: "focus_rest",
    categoryId: "Focus & Study",
    title: "Rest Days & Recovery",
    requirement: { type: "NONE" },
    related: ["focus_timer", "focus_streak", "qst_ai_planner"],
    content: [
      { type: "p", text: "Rest is part of the build. You can mark days of the week as permanent Rest Days in your calendar, and the System will never schedule quests on them or penalize you for taking them off." },
      { type: "h3", text: "Floating Rest Days" },
      { type: "p", text: "For unplanned days — a family dinner, a sickness, an emergency — you get one Floating Rest Day per week. Tap any date on the calendar and designate it. Any quests on that day automatically slide to the next available day, and the day is fully protected: no HP loss, no broken streak." },
      { type: "p", text: "Rest days are walls the System refuses to cross — no quest, manual or automatic, will ever land on one." }
    ]
  },

  // ─── QUESTS & AI ──────────────────────────────────────────────
  {
    id: "qst_overview",
    categoryId: "Quests & AI",
    title: "Quests & Bounties",
    requirement: { type: "NONE" },
    related: ["qst_weekly", "qst_ai_planner", "eco_sylph"],
    content: [
      { type: "p", text: "Quests are your study tasks, broken into bite-sized missions. Each one has a target time, a difficulty rating, and an XP + Sylph bounty. Finish it, claim the rewards, watch the bars move." },
      { type: "h3", text: "Quest Types" },
      { type: "list", items: [
        "Scheduled Quests: planned tasks on specific dates with target durations.",
        "AI-Planned Quests: study plans generated from your syllabus and deadlines.",
        "Custom Quests: your own tasks — create one anytime from the Quest Log."
      ]},
      { type: "p", text: "Quests can be linked to a Goal (and inherit its color), to a subject topic for skill-tree progress, or stand alone. Difficulty (Easy → Expert) decides the bounty." }
    ]
  },
  {
    id: "qst_weekly",
    categoryId: "Quests & AI",
    title: "Weekly Focus Milestone",
    requirement: { type: "NONE" },
    related: ["focus_streak", "qst_overview"],
    content: [
      { type: "p", text: "Every week the System issues one big mission: 3 hours of focused study between Monday and Sunday midnight." },
      { type: "p", text: "Hit it and the payout is serious — a level-scaled XP bomb plus a Sylph bonus — and your Weekly Streak ticks up one, supercharging future earnings." }
    ]
  },
  {
    id: "qst_ai_planner",
    categoryId: "Quests & AI",
    title: "The System's Study Assistant",
    requirement: { type: "NONE" },
    related: ["qst_overview", "focus_subjects", "focus_rest"],
    content: [
      { type: "p", text: "A quiet AI assistant works behind the scenes of The System. You don't need to know how it works — just what it does for you:" },
      { type: "h3", text: "What It Does" },
      { type: "list", items: [
        "Plans your syllabus: give it an exam date and it splits the work into sensible daily quests.",
        "Respects your life: it never schedules on your rest days and shrinks the workload if you're burning out.",
        "Writes your morning briefing: each day starts with a short message summarizing yesterday and telling you what matters today.",
        "Tutors you mid-session: stuck on a problem in the Focus Room? The assistant explains it step by step, with clean math formatting."
      ]},
      { type: "p", text: "You can also just talk to it from the chat — ask about your stats, move quests, set goals, or ask study advice. It can only do what the game allows; it can never cheat your XP or wipe your data without asking you first." }
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
      { type: "p", text: "Sylph is the currency of The System — crystallized effort. You earn it from almost everything you do, and you spend it in the Shop on items, cosmetics, and protection." },
      { type: "h3", text: "Earning Sylph" },
      { type: "list", items: [
        "Focus Timer: every studied minute pays Sylph.",
        "Quests: each completed bounty includes a Sylph payout.",
        "Level Ups: every level grants a bonus gift of Sylph.",
        "Achievements: milestone rewards from the codex."
      ]},
      { type: "p", text: "Every single Sylph you earn or spend is written into your personal ledger — a full transaction history you can always check." }
    ]
  },
  {
    id: "inv_shop",
    categoryId: "Economy & Shop",
    title: "The Shop & Consumables",
    requirement: { type: "NONE" },
    related: ["eco_sylph", "inv_equipment"],
    content: [
      { type: "p", text: "The System Shop sells functional items with real in-game effects. Buy them with Sylph and activate them when you need them." },
      { type: "h3", text: "Popular Items" },
      { type: "list", items: [
        "Streak Freeze: protects your weekly streak if a week goes sideways.",
        "XP Boost (24h): multiplies all XP earned for a full day.",
        "Sylph Boost (24h): multiplies Sylph earnings for a full day.",
        "HP Potions: restore lost Health after missed goals.",
        "Kamish's Ward: a shield that absorbs quest-failure damage.",
        "Gate Key: doubles a quest's risk — and its reward.",
        "Elixir of Insight: instantly refreshes your focus state."
      ]},
      { type: "p", text: "Some items trigger automatically (like the Streak Freeze); others you activate from your inventory before a session." }
    ]
  },
  {
    id: "inv_equipment",
    categoryId: "Economy & Shop",
    title: "Armour & Equipment",
    requirement: { type: "NONE" },
    related: ["inv_character", "sys_ranks", "eco_sylph"],
    content: [
      { type: "p", text: "Beyond consumables, the Shop sells real equipment your character wears into battle — visually and mechanically." },
      { type: "h3", text: "Equipment Slots" },
      { type: "list", items: [
        "Helmet: headgear from scholar caps to hunter visors.",
        "Chestplate: the main armour piece that defines your silhouette.",
        "Pants: lower-body gear completing the set.",
        "Boots: footwear, from sneakers to shadow boots.",
        "Weapon: your tool of focus — grimoires, staves, blades.",
        "Relic: a powerful accessory slot for rare artifacts."
      ]},
      { type: "h3", text: "Rarity & Requirements" },
      { type: "p", text: "Gear comes in rarities — Common, Rare, Epic, Legendary, and Mythic — and stronger gear demands a higher Hunter Rank. Everything you equip appears live on your character in the Locker, on your profile, and in your friends' social cards." }
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
      { type: "p", text: "Make the System yours. Cosmetic unlocks personalize your whole experience without affecting gameplay balance:" },
      { type: "list", items: [
        "Interface Themes: recolor the entire app (Cyberpunk, Emerald, Sakura, Crimson, and more).",
        "Awakened Auras: animated glows that surround your scholar card.",
        "Avatar Frames: decorative borders for your profile picture.",
        "Titles: badges of honour shown next to your name (Novice → Shadow Monarch).",
        "Name Colors: customize the hue of your scholar ID."
      ]}
    ]
  },
  {
    id: "inv_character",
    categoryId: "Customization",
    title: "The Character Studio",
    requirement: { type: "NONE" },
    related: ["inv_equipment", "inv_cosmetics", "sys_classes"],
    content: [
      { type: "p", text: "The Character Studio is where your scholar avatar comes to life. Build your look piece by piece on a live stage, and it follows you everywhere — profile, social cards, leaderboards, friends' screens." },
      { type: "h3", text: "What You Can Customize" },
      { type: "list", items: [
        "Appearance: skin tones, hair styles and colors, eyewear and accessories.",
        "Attire & Armour: robes, techwear, stealth gear — plus every equipment slot you own.",
        "Auras: animated energy glows in different colors and shapes.",
        "Pedestals: the platform your character stands on.",
        "Everything updates live as you equip — including your Shop armour."
      ]}
    ]
  },
  {
    id: "sys_skilltree",
    categoryId: "Customization",
    title: "The Skill Tree",
    requirement: { type: "NONE" },
    related: ["sys_classes", "focus_subjects", "sys_stats"],
    content: [
      { type: "p", text: "The Skill Tree is your permanent power-up map. It's a constellation of 24 skills across the eight archetypes, drawn as a glowing node graph." },
      { type: "h3", text: "How Unlocking Works" },
      { type: "list", items: [
        "Master syllabus topics: finish a subject's compiled topics to earn Subject Points (SP).",
        "SP unlocks Skill Nodes — one at a time, in any branch you choose.",
        "Every unlocked node grants a real bonus: extra XP, extra Sylph, damage shields, and more.",
        "Three tiers per archetype — deeper nodes mean stronger perks."
      ]},
      { type: "h3", text: "The Apex Keystone" },
      { type: "p", text: "At the top of the constellation sits a final, unique node — the Apex Keystone. Forge it after mastering enough of your syllabus (115 SP), and the System crowns the achievement with a massive XP and Sylph reward." }
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
      { type: "p", text: "Study is better together. Add friends by username or Scholar ID, see their levels and study time, and keep each other accountable." },
      { type: "h3", text: "What Friends See" },
      { type: "list", items: [
        "Live study status: a glowing card with a ticking timer while they focus.",
        "Today's study time, total hours, streak, and rank.",
        "Their fully customized character — armour, aura, and all."
      ]}
    ]
  },
  {
    id: "soc_presence",
    categoryId: "Social & Network",
    title: "Live Study Presence",
    requirement: { type: "NONE" },
    related: ["soc_friends", "focus_timer"],
    content: [
      { type: "p", text: "When you're in a focus session, the network knows. Your card lights up cyan with a pulsing study badge and a live timer, so friends can join the grind." },
      { type: "p", text: "You can also invite friends into shared Study Rooms for synchronized focus sessions with shared ambient audio." }
    ]
  },
  {
    id: "soc_privacy",
    categoryId: "Social & Network",
    title: "Privacy & Visibility Controls",
    requirement: { type: "NONE" },
    related: ["soc_friends"],
    content: [
      { type: "p", text: "You control your exposure. Under Settings → Privacy you can tune:" },
      { type: "list", items: [
        "Profile visibility: Public, Friends Only, or Private.",
        "Stats visibility: hide your study hours and attributes if you prefer.",
        "Presence: turn off your live studying status.",
        "Messages & Requests: restrict who can message or invite you."
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
      { type: "p", text: "The Achievements codex is your trophy shelf — 24 milestones across six categories: Study, Streaks, Rank, Social, Quests, and Exploration." },
      { type: "h3", text: "Rarity Tiers" },
      { type: "list", items: [
        "Common (Green): early wins — small Sylph/XP gifts.",
        "Rare (Blue): intermediate milestones with meaningful payouts.",
        "Epic (Purple): serious challenges with rare rewards.",
        "Legendary (Orange): elite feats that grant special items.",
        "Mythic (Gold): master-level achievements awarding ultimate artifacts."
      ]},
      { type: "p", text: "Claim them from the codex whenever you qualify — the reward lands instantly in your balance or inventory." }
    ]
  }
];
