import {
  ACHIEVEMENTS_CATALOG,
  ACHIEVEMENT_CATEGORIES,
  rankTitle,
} from "./achievements-catalog";
import { RANK_LADDER } from "./game-engine";
import {
  COGNITIVE_STAT_KEYS,
  COGNITIVE_STATS,
  ABILITY_TIERS,
  INVEST_STEP,
} from "./cognitive-stats";
import { FLOATING_REST_DAY_QUOTA } from "./study-schedule-types";

export type ArchiveCategory =
  | "Progression"
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
const p = (text: string): ContentBlock => ({ type: "p", text });
const heading = (text: string): ContentBlock => ({ type: "h3", text });
const list = (...items: string[]): ContentBlock => ({ type: "list", items });
function entry(
  id: string,
  categoryId: ArchiveCategory,
  title: string,
  related: string[],
  ...content: ContentBlock[]
): ArchiveEntry {
  return {
    id,
    categoryId,
    title,
    related,
    content,
    requirement: { type: "NONE" },
  };
}

// A guide to the working app. Numerical ladders and catalog totals are derived
// from their canonical registries; unpublished inventory is never promised here.
export const ARCHIVE_ENTRIES: ArchiveEntry[] = [
  entry(
    "sys_leveling",
    "Progression",
    "Levels & Experience",
    ["sys_ranks", "sys_stats", "eco_sylph"],
    p(
      "Your progress begins with focused study. Recorded sessions, completed quests, and claimed achievement rewards contribute Experience Points (XP). The dashboard shows your level and progress toward the next one."
    ),
    p(
      "When your XP reaches the next threshold, your level rises automatically. Higher levels take more XP, and your Hunter Rank follows the level ladder. Level-up rewards are recorded in your Sylph ledger."
    ),
    heading("Ways to Grow"),
    list(
      "Study: finish a focus session to receive its recorded rewards. Break time is tracked separately and earns no focus rewards.",
      "Quests: complete a task to receive its listed bounty. Studying and completing a quest are related but distinct records.",
      "Weekly milestone: reach your weekly focus target for the displayed XP and Sylph payout.",
      "Achievements: claim qualified milestones in System Hub → Achievements."
    ),
    p(
      "Use the actual reward shown in the app. Session length, streaks, and cognitive abilities can affect payouts; progress does not rely on a fixed reward per click."
    )
  ),
  entry(
    "sys_ranks",
    "Progression",
    "Hunter Ranks & Progression",
    ["sys_leveling", "inv_character"],
    p(
      "Hunter Rank reflects your level. You begin at E-Rank and progress through eight tiers. Your current rank appears on your dashboard and profile."
    ),
    heading("The Rank Ladder"),
    list(
      ...[...RANK_LADDER]
        .reverse()
        .map((rank) => `${rankTitle(rank.display)} — Level ${rank.level}+`)
    ),
    p(
      "Rank requirements can apply to a listed item or character style. Check the current listing; a higher rank does not imply an unpublished reward or a guaranteed shop catalog."
    )
  ),
  entry(
    "sys_stats",
    "Progression",
    "Cognitive Attributes & Investment",
    ["sys_leveling", "focus_streak", "eco_sylph"],
    p(
      "Five cognitive attributes represent your study abilities: Endurance, Tenacity, Velocity, Discipline, and Synthesis. The profile’s attribute controls let you invest Skill Points (SP) or Sylph in these abilities."
    ),
    p(
      `Each investment adds ${INVEST_STEP} points. The cost grows with the attribute’s current band, and your level limits how high you can invest. The controls show the current cost and cap before you spend.`
    ),
    heading("Ability Effects"),
    list(
      ...COGNITIVE_STAT_KEYS.map(
        (key) =>
          `${COGNITIVE_STATS[key].label}: ${COGNITIVE_STATS[key].perkLadder}`
      )
    ),
    p(
      `Ability tiers activate at ${ABILITY_TIERS.join(", ")}. These are investments with defined effects, not automatic personality scores or a character class.`
    )
  ),
  entry(
    "focus_timer",
    "Focus & Study",
    "Study Timer & Focus Engine",
    ["focus_modes", "focus_tools", "focus_subjects"],
    p(
      "Open Timer to choose a subject and begin studying. A quest can also open a linked focus session. The Focus screen records active study, pauses, and breaks separately."
    ),
    p(
      "Use the session controls to pause, take a break, or finish. Finishing records the session and its rewards; live updates keep study totals current without awarding the same time twice."
    ),
    heading("A Space for Focus"),
    list(
      "Your chosen study protocol controls timed blocks and breaks.",
      "The Tools dock keeps study aids within the Focus screen.",
      "Backgrounds and timer layouts personalize the study environment.",
      "Study history and statistics are available from System Hub."
    )
  ),
  entry(
    "focus_modes",
    "Focus & Study",
    "Study Protocols & Modes",
    ["focus_timer", "focus_rest"],
    p(
      "Configure a study protocol in System Hub → Study Modes. Your selected protocol is used when you start an ordinary focus session; a linked quest carries its own target time."
    ),
    heading("Seven Study Rhythms"),
    list(
      "Free Flow: an open stopwatch with on-demand breaks.",
      "Pomodoro: focus rounds with short breaks and longer recovery breaks.",
      "52/17 Rhythm: longer work blocks separated by recovery breaks.",
      "Animedoro: a focus marathon followed by a reward break.",
      "Deep Work: a protected block with optional automatic fullscreen.",
      "Sprint Mode: repeated short sprints and micro-rests.",
      "Flowtime: an open focus rhythm with check-in reminders and proportional breaks."
    ),
    p(
      "Durations, automatic transitions, and completion chimes depend on the settings for that protocol. A break is recovery time, not additional study time."
    )
  ),
  entry(
    "focus_tools",
    "Focus & Study",
    "The Focus Tools Dock",
    ["focus_timer", "inv_audio", "qst_ai_planner"],
    p(
      "The Tools dock brings useful study aids into your session. Tool windows can be moved, minimized, and reopened while the timer continues."
    ),
    heading("At Your Desk"),
    list(
      "Calculator: scientific and STEM calculations.",
      "Sylvie: ask study questions and receive formatted explanations.",
      "Audio Mixer: manage soundscapes, ambient layers, and your imported tracks.",
      "Scratchpad: keep notes during focus.",
      "Formulas: reference study sheets without leaving the session."
    ),
    p(
      "Dock controls also offer Eye Comfort in light mode and Keep Awake on supported devices. These affect the display, not recorded study time. Tool availability and AI quotas follow the current account and device."
    )
  ),
  entry(
    "focus_subjects",
    "Focus & Study",
    "Subjects & Study History",
    ["focus_timer", "qst_quick_plan"],
    p(
      "Subjects organize what you study. Create one in Timer with a name, syllabus code, exam board, level, color, and optional syllabus notes. Focus sessions linked to it contribute to its recorded study time."
    ),
    p(
      "You can edit subject details. Removing a subject archives it safely rather than erasing its study history. Linked quests and plans follow the app’s subject handling, so review affected work when you change a subject."
    ),
    heading("Subjects and Planning"),
    list(
      "Subject study time measures recorded focus, not exam readiness.",
      "A Planner scope can use subject details and supplied syllabus material.",
      "Preparedness and mastery checks belong to the relevant Planner workflow; they are separate from lifetime hours."
    )
  ),
  entry(
    "focus_streak",
    "Focus & Study",
    "Weekly Streaks & Milestones",
    ["qst_weekly", "sys_stats", "focus_rest"],
    p(
      "Sylf’s streak is weekly. Reach the focus milestone between Monday and Sunday in your configured timezone to extend your run of consecutive weeks. The WKS indicator shows this weekly count."
    ),
    p(
      "The baseline target is three hours. Tenacity ability tiers can reduce that target, so follow the requirement displayed in the dashboard’s Streak Quest."
    ),
    heading("Consistency Rewards"),
    list(
      "The current weekly quest shows its target, progress, time remaining, and reward.",
      "Weekly streak bonuses increase Sylph earnings at 1, 2, 4, and 8 weeks, up to 1.5×.",
      "Streak achievements measure consecutive weeks, not consecutive study days."
    ),
    p(
      "Scheduled rest days protect the daily schedule. They do not complete the weekly focus requirement for you."
    )
  ),
  entry(
    "focus_rest",
    "Focus & Study",
    "Calendar, Rest Days & Recovery",
    ["qst_overview", "qst_planner_modes", "focus_streak"],
    p(
      "The Calendar brings scheduled quests, objective deadlines, and your study records together. Inspect a date to review the day’s work and adjust the schedule."
    ),
    p(
      "Fixed rest days repeat on your chosen weekdays. The schedule respects them when placing study work, and protected rest days avoid daily-goal penalties."
    ),
    heading("Floating Rest Days"),
    p(
      `You have ${FLOATING_REST_DAY_QUOTA} floating rest day per ISO week for unplanned recovery. Mark an eligible date in the Calendar. Affected quests move to available study days, and the quota is shown before you confirm.`
    ),
    p(
      "Use the calendar’s current availability and validation messages when rescheduling. A rest day changes the schedule, not your completed study record or the weekly streak target."
    )
  ),
  entry(
    "qst_overview",
    "Quests & AI",
    "Objectives, Quests & Bounties",
    ["qst_planner_modes", "qst_weekly", "eco_sylph"],
    p(
      "Objectives hold your longer-term goals. Their quests turn that direction into individual study tasks, with a date, subject or topic when applicable, target duration, and displayed rewards."
    ),
    p(
      "Open Objectives for goals and quests. The dedicated Quest route opens the quest view. You can create tasks manually or confirm a Planner proposal to create scheduled quests."
    ),
    heading("Follow the Current Task"),
    list(
      "Read the target and listed bounty before starting.",
      "Start linked focus from the quest, or manage the task from the quest view.",
      "Only completed quests count toward completion milestones.",
      "Completed work stays part of your history when a plan is revised."
    ),
    p(
      "Creating or generating a draft does not award XP. Rewards belong to recorded focus and completed tasks."
    )
  ),
  entry(
    "qst_weekly",
    "Quests & AI",
    "The Weekly Focus Quest",
    ["focus_streak", "focus_timer", "sys_stats"],
    p(
      "The dashboard’s Streak Quest is a cumulative weekly focus milestone. You can make progress through multiple sessions; it does not require one uninterrupted three-hour block."
    ),
    heading("A Weekly Rhythm"),
    list(
      "The week runs Monday through Sunday in your timezone.",
      "The displayed target accounts for applicable Tenacity effects.",
      "Completing the target grants the current level-scaled XP and Sylph reward.",
      "A completed week extends the weekly streak; the next week has a new target window."
    )
  ),
  entry(
    "qst_ai_planner",
    "Quests & AI",
    "Sylvie & Classic Planner",
    ["qst_planner_modes", "qst_quick_plan", "focus_tools"],
    p(
      "Sylvie is Sylf’s AI companion. Her chat can explain progress, help with study questions, and act on supported goals, quests, and calendar tasks. Quick access also appears in relevant dashboard, objectives, quest, and calendar contexts."
    ),
    p(
      "The Planner tab opens the Classic Planner by default. Planner Modes is a separate choice in the same workspace, so you can use the familiar planner or a more focused Exam, Roadmap, or Mastery workflow."
    ),
    heading("Keep Control of Your Plan"),
    list(
      "Review proposed work and workload before committing it.",
      "AI generation and messages follow the quota displayed for your account.",
      "Sylvie helps with study questions while you focus.",
      "A proposal is planning advice; it does not certify knowledge or earn study rewards on its own."
    )
  ),
  entry(
    "qst_planner_modes",
    "Quests & AI",
    "Exam, Roadmap & Mastery Planning",
    ["qst_quick_plan", "qst_overview", "focus_rest"],
    p(
      "Planner Modes offers three workflows for different kinds of study. Open Sylvie → Planner → Planner Modes and choose the purpose that matches your work."
    ),
    heading("Choose Your Direction"),
    list(
      "Exam Planner: deadline-driven preparation for one exam, arranged day by day.",
      "Course / Syllabus Roadmap: a longer course broken into periods and milestones. Expand a milestone into detailed study work when needed.",
      "Chapter / Unit Mastery: take one unit through understanding, recall, practice, review, and a check."
    ),
    heading("From Draft to Real Work"),
    p(
      "Review and edit the draft, then confirm it to create quests. Availability, deadlines, constraints, and workload shape the proposal. Rebalancing adapts remaining work while respecting completed tasks and the plan’s existing commitments."
    ),
    p(
      "Mastery check results and the Exam preparedness view describe the evidence you have recorded. They are distinct from a timer total or a character rank."
    )
  ),
  entry(
    "qst_quick_plan",
    "Quests & AI",
    "Quick Plan, Scope & Copilot",
    ["qst_planner_modes", "focus_subjects"],
    p(
      "Quick Plan is the default creation flow inside Planner Modes. Build a brief around what you need to study, your deadline, and the time available across the week."
    ),
    p(
      "Use subject details, uploaded material, or supported curriculum research to assemble the scope. Review the sources, topic coverage, and overlaps before generating your plan; imported or researched material is evidence to inspect, not automatic mastery."
    ),
    heading("Refine Your Direction"),
    list(
      "Review and edit the scope before creating work.",
      "Use the plan’s coverage and preparedness views to inspect what is included.",
      "The Plan Designer offers more direct control over plan structure.",
      "Planner Copilot explains the current plan and proposes supported changes for review.",
      "Core tasks and optional stretch work have distinct roles; accept changes deliberately."
    ),
    p(
      "Confirmation creates actual quests. A draft, comparison, research result, or Copilot suggestion stays a proposal until its supported confirmation step is completed."
    )
  ),
  entry(
    "eco_sylph",
    "Economy & Shop",
    "Sylph Currency & Your Ledger",
    ["sys_stats", "inv_shop", "ach_system"],
    p(
      "Sylph is the System’s currency: crystallized effort earned through focus, completed quests, weekly milestones, level-up rewards, and qualifying achievement claims."
    ),
    p(
      "Your current balance is shown in the app. Collection’s Currency Ledger separates that spendable balance from total recorded earnings and spending."
    ),
    heading("Where Sylph Goes"),
    list(
      "Buy a currently listed item in the Shop when available.",
      "Invest in cognitive attributes through the profile’s investment controls.",
      "Review total spending in Collection; it includes all recorded negative ledger entries, not only shop purchases."
    ),
    p(
      "App appearance colors, light/dark mode, and the basic appearance presets are free settings. Changing your interface color does not purchase a collectible."
    )
  ),
  entry(
    "inv_shop",
    "Economy & Shop",
    "The Current Shop",
    ["inv_equipment", "eco_sylph", "inv_character"],
    p(
      "The Shop uses the current published catalog. It can be empty while new assets are being prepared. Only a live listing establishes an item’s name, price, rarity, requirements, and effects."
    ),
    p(
      "New listings may appear as the catalog grows. Follow the current Shop rather than assuming that every item in a saved inventory is available to purchase again."
    ),
    heading("Before a Purchase"),
    list(
      "Check the listing’s actual Sylph price and Hunter Rank requirement.",
      "Review the item description and any supported effect.",
      "An acquired item belongs to your Locker inventory; a free character style remains a Studio choice."
    )
  ),
  entry(
    "inv_equipment",
    "Economy & Shop",
    "Locker Items & Equipment",
    ["inv_collection", "inv_shop", "inv_character"],
    p(
      "Locker → Items shows your actual inventory and equipped loadout. An inventory record includes the item’s current name, description, rarity, quantity, and equipped state."
    ),
    p(
      "Collection → Items & equipment presents the same ownership data as a ledger. It includes items you still own even when they are no longer offered in the current Shop."
    ),
    heading("Manage Your Loadout"),
    list(
      "Use the Locker to equip or unequip a supported item.",
      "The current loadout groups armour, weapon, relic, and quickslot entries.",
      "Compatibility follows the item’s actual category and slot.",
      "A stored item is not automatically a usable consumable or a guaranteed visual overlay; follow the supported controls and listing."
    )
  ),
  entry(
    "inv_collection",
    "Economy & Shop",
    "Reading Your Collection",
    ["inv_equipment", "inv_character", "inv_focus_backgrounds", "inv_audio"],
    p(
      "System Hub → Collection gathers inventory, character styles, personal focus backgrounds, imported audio, profile keepsakes, and currency totals."
    ),
    heading("What the Counts Mean"),
    list(
      "Owned items: total positive inventory quantities. The item shelf also shows distinct entries and equipped entries.",
      "Available styles: Companion Customizer options you currently meet the requirements for, separate from purchases.",
      "Personal images: backgrounds saved to your account’s personal gallery.",
      "Local tracks: imported audio present on this device.",
      "Recorded profile keepsakes: saved frame, title, and name-color acquisitions, excluding baseline defaults."
    ),
    p(
      "The official focus gallery is shared availability, not a set of owned collectibles. Free appearance preferences are separate from acquisition counts."
    )
  ),
  entry(
    "inv_cosmetics",
    "Customization",
    "App Appearance & Colors",
    ["inv_focus_backgrounds", "inv_character"],
    p(
      "System Hub → Appearance controls your app’s accent color, canvas color, and light/dark mode. Presets and custom colors are free preferences, not items to buy or level-gated theme unlocks."
    ),
    p(
      "Use Save & Apply to commit the appearance you choose. The app’s surfaces, readable text, accent controls, and System pages adapt to these settings."
    ),
    heading("Two Kinds of Background"),
    list(
      "App canvas: the background color used across the interface.",
      "Focus background: an official image or personal artwork used in a study session, with a suitable timer layout."
    ),
    p(
      "Your appearance choice does not change study rewards, Hunter Rank, or inventory ownership."
    )
  ),
  entry(
    "inv_character",
    "Customization",
    "The Companion Customizer",
    ["inv_profile", "inv_equipment", "sys_ranks"],
    p(
      "Open Locker → Identity to enter Companion Customizer or Profile Studio. Companion Customizer selects the visual form, pedestal, and available aura for your study identity."
    ),
    p(
      "Choose your own saved artwork. Pixel Studio creates and animates your artwork; the Customizer applies your artwork and Pixel Size. Profile Studio owns your photo, banner and bio."
    ),
    heading("Make a Selection"),
    list(
      "Choose a listed form, pedestal, or aura you meet the requirements for.",
      "Preview the result and save through the Studio’s controls.",
      "Collection shows which style is selected and which styles are available.",
      "No Aura and unequipped defaults are settings, not additional acquisitions."
    ),
    p(
      "Your character style is a visual choice. Its access requirements and selected state are shown in Companion Customizer and Collection."
    )
  ),
  entry(
    "inv_profile",
    "Customization",
    "Profile Studio & Identity",
    ["inv_character", "soc_privacy"],
    p(
      "Profile Studio manages your profile picture, banner, biography, and supported account links. You can choose an image, adjust its framing, preview the profile, and save your changes."
    ),
    heading("A Profile of Your Own"),
    list(
      "Profile images and a biography are personal settings, not purchased equipment.",
      "Collection summarizes your saved identity and recorded profile cosmetic acquisitions.",
      "Baseline frame, title, and name-color defaults do not inflate the acquired keepsake count.",
      "Profile visibility and shared data follow your privacy controls."
    )
  ),
  entry(
    "inv_focus_backgrounds",
    "Customization",
    "Focus Backgrounds & Personal Gallery",
    ["focus_timer", "inv_audio", "inv_cosmetics"],
    p(
      "Focus Backgrounds offers the official gallery, Classic Sylf, and your personal images. Your selected environment is used by the Focus screen, independently of your interface accent and canvas color."
    ),
    p(
      "Upload an image to your personal gallery and choose its presentation. The gallery shows your storage quota and supports managing your saved images. Personal images belong to your account; official images are shared choices."
    ),
    heading("Layouts for Your Artwork"),
    list(
      "Classic Sylf: the original focus presentation.",
      "Anime Framing: a layout suited to artwork with space beside its subject.",
      "Cinematic Landscape: a restrained presentation for wide scenes.",
      "Fantasy & Sanctum: a presentation for atmospheric environments."
    ),
    p(
      "Use supported layout and timer positioning controls to keep your artwork and timer legible. Changing a background preserves the study session’s timer and recorded progress."
    )
  ),
  entry(
    "inv_audio",
    "Customization",
    "Acoustics & Imported Audio",
    ["focus_tools", "inv_focus_backgrounds"],
    p(
      "Locker → Acoustics brings soundscapes, ambient layers, and your own audio into your study environment. The Focus Audio Mixer gives you access during a session."
    ),
    p(
      "You can import supported audio files, rename them, play or pause, seek, loop, and adjust volume. Collection lists the imported tracks present on this device."
    ),
    heading("A Local Listening Library"),
    list(
      "Imported audio is stored locally on the device, not uploaded or synchronized to your account.",
      "Built-in soundscapes are shared listening choices and do not count as acquired tracks.",
      "Rain, café, keyboard, and white-noise layers can be mixed separately.",
      "Keep copies of your source files if you plan to move to another device or clear local storage."
    )
  ),
  entry(
    "soc_friends",
    "Social & Network",
    "Friends & Your Study Circle",
    ["soc_presence", "soc_parties", "soc_privacy"],
    p(
      "Social gathers your study circle and conversations. Add friends with the supported username or Scholar ID search, respond to requests, and open their profiles."
    ),
    heading("Stay Connected"),
    list(
      "See shared rank, level, study progress, and presence where privacy permits.",
      "Send direct messages in the Social chat interface.",
      "Invite friends to shared focus using the supported study-session invitations.",
      "Friend milestones count distinct accepted friends, not pending requests or duplicate friendship rows."
    )
  ),
  entry(
    "soc_presence",
    "Social & Network",
    "Live Study Presence",
    ["soc_friends", "soc_parties", "soc_privacy"],
    p(
      "When you study, supported social surfaces can show your current focus status and a live timer. Presence is separate from your saved session history and respects your privacy settings."
    ),
    heading("Share Your Rhythm"),
    list(
      "Friends can see the study status you choose to share.",
      "Session invitations connect you to shared focus.",
      "Your own session controls remain responsible for recording your focus time."
    )
  ),
  entry(
    "soc_parties",
    "Social & Network",
    "Focus Parties",
    ["soc_friends", "focus_timer", "inv_audio"],
    p(
      "Focus Parties are shared study spaces reached through Social and supported session invitations. Join a party to see its members and participate in a shared focus session."
    ),
    p(
      "Each member has a personal timer state and accumulated focus time. Joining a room alone is not completed study; your own recorded effort contributes to your progress."
    ),
    heading("Together, with Your Own Pace"),
    list(
      "Use the party’s supported invitations and membership controls.",
      "Start, pause, and finish your personal focus through the shared session controls.",
      "Leaving a session ends your participation; room membership and recorded study are distinct.",
      "The Focus Party achievement requires a finished participation with at least one minute of personal focus."
    )
  ),
  entry(
    "soc_privacy",
    "Social & Network",
    "Privacy & Visibility",
    ["soc_friends", "inv_profile"],
    p(
      "Privacy controls live under System Hub → Account. Set who can see your profile, online status, current session, study hours, rank, and achievements."
    ),
    heading("Choose What You Share"),
    list(
      "Profile and data visibility can be public, friends-only, or private according to the current control.",
      "Friend-request and direct-message permissions control who may contact you.",
      "Visible social information follows both the feature and your saved privacy settings."
    )
  ),
  entry(
    "ach_system",
    "Achievements",
    "Achievements & Milestones",
    ["sys_leveling", "focus_streak", "inv_collection"],
    p(
      `The current register contains ${ACHIEVEMENTS_CATALOG.length} milestones across ${ACHIEVEMENT_CATEGORIES.length} categories: ${ACHIEVEMENT_CATEGORIES.join(", ")}. Open it from System Hub → Achievements.`
    ),
    p(
      "Study records, weekly streaks, Hunter Rank, distinct friends, completed quests, subjects, confirmed plans, Focus Party participation, personal backgrounds, inventory, and recorded spending provide the actual progress."
    ),
    heading("Rarity Tiers"),
    list(
      "Common, Rare, Epic, Legendary, and Mythic describe milestone tiers.",
      "Each milestone displays its exact XP or Sylph reward.",
      "Ready milestones have a Claim reward control. A reward is redeemed once.",
      "Claimed honors stay claimed when their description or reward is refreshed."
    ),
    p(
      "Earlier claim history is retained when the register is updated. Earned rewards stay yours, and an existing claimed milestone cannot be claimed again."
    )
  ),
];
