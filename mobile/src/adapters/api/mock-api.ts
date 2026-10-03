/**
 * ============================================================================
 * Mobile Development & Compatibility Proof Mock API Adapter
 * ============================================================================
 * Provides isolated mock data for standalone mobile client validation
 * so representative UI screens (Dashboard, Focus, Social, Locker, System)
 * can compile and paint rich visuals without live credentials.
 * ============================================================================
 */

import { UserStats } from "@/app/components/AuthProvider";
import { CatalogItemDefinition, isRankSufficient } from "@/lib/shop-items";
import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationPreferences } from "@/lib/notification-preferences";
import { ACHIEVEMENTS_CATALOG } from "@/lib/achievements-catalog";
import {
  COGNITIVE_STAT_KEYS,
  CognitiveStatKey,
  InvestCurrency,
  INVEST_STEP,
  canInvest,
  getInvestCost,
  getStatCap,
  getCognitiveEffects,
  getAbilitySummary,
  normalizeCognitiveStats,
} from "@/lib/cognitive-stats";

export const MOCK_STUDENT_USER: UserStats = {
  id: 1,
  email: "scholar@sylf.app",
  username: "hunter_jinwoo",
  name: "Sung Jin-Woo",
  scholarId: "SYLF-7782",
  verificationStatus: "VERIFIED",
  hunterRank: "S",
  level: 42,
  currentXP: 4500,
  xpToNextLevel: 6000,
  hp: 95,
  maxHp: 100,
  effectiveMaxHp: 100,
  streakDays: 14,
  totalStudyMinutes: 2840,
  totalStudySeconds: 170400,
  todayStudyMinutes: 75,
  todayStudySeconds: 4500,
  sylph: 1250,
  hasCompletedOnboarding: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  avatarUrl: null,
  bannerUrl: null,
  bio: "S-Rank Hunter & Shadow Monarch. Ascending the ranks of knowledge.",
  activeAvatar: "class_scholar",
  activeFrame: "none",
  activeAura: "aura_monarch",
  activeNameColor: "default",
  activeTitle: "Shadow Monarch",
  activeTheme: "cyberpunk",
  activeBackground: "void",
  characterConfig: {
    skinColor: "fair",
    hairStyle: "messy",
    hairColor: "black",
    eyeColor: "blue",
    expression: "calm",
    outfit: "uniform",
    outfitColor: "dark",
    aura: "aura_monarch",
    pedestal: "pedestal_obsidian",
    gender: "male",
  },
};

export interface MockGoalSubQuest {
  id: number;
  title: string;
  status: string;
  xpReward?: number;
  requiredMinutes?: number;
  difficulty?: string;
  elapsedSeconds?: number;
  scheduledFor?: string;
}

export interface MockGoalItem {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  targetWeeks: number;
  targetDate: string | null;
  effortLevel: string;
  status: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  quests: MockGoalSubQuest[];
}

export interface MockQuestItem {
  id: number;
  userId: number;
  goalId: number | null;
  subjectId: number | null;
  subjectNodeId: number | null;
  title: string;
  description: string | null;
  difficulty: string;
  status: string;
  xpReward: number;
  sylphReward: number;
  targetMinutes: number;
  requiredMinutes: number;
  elapsedSeconds: number;
  scopeWeight: number;
  scheduledFor: string;
  isGateKeyApplied: boolean;
  isKamishWardActive: boolean;
  completedAt: string | null;
  createdAt: string;
  todaySeconds: number;
  goal?: { id: number; title: string; color: string } | null;
  subject?: { id: number; name: string; code: string; color: string } | null;
  subjectNode?: { id: number; name: string } | null;
}

export const MOCK_GOALS_LIST: Array<MockGoalItem> = [
  {
    id: 1,
    userId: 1,
    title: "Master Differential Equations & Multivariable Calculus",
    description: "Derive boundary value solutions, Laplace transforms, and vector field theorems.",
    targetWeeks: 4,
    targetDate: "2026-10-15T00:00:00.000Z",
    effortLevel: "INTENSE",
    status: "ACTIVE",
    color: "EMERALD",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    quests: [
      {
        id: 101,
        title: "Master Differential Equations Keystone",
        status: "ACTIVE",
        xpReward: 350,
        requiredMinutes: 45,
        scheduledFor: "2026-09-14",
      },
    ],
  },
  {
    id: 2,
    userId: 1,
    title: "Modern Physics & Quantum Field Theory",
    description: "Schrödinger equations, wavefunctions, perturbation theory, and relativistic invariants.",
    targetWeeks: 6,
    targetDate: "2026-10-31T00:00:00.000Z",
    effortLevel: "NORMAL",
    status: "ACTIVE",
    color: "VIOLET",
    createdAt: "2026-09-02T14:00:00.000Z",
    updatedAt: "2026-09-08T09:30:00.000Z",
    quests: [
      {
        id: 102,
        title: "Review Quantum Mechanics Wavefunctions",
        status: "ACTIVE",
        xpReward: 200,
        requiredMinutes: 30,
        scheduledFor: "2026-09-15",
      },
    ],
  },
  {
    id: 3,
    userId: 1,
    title: "Neuroscience & Brain Circuitry",
    description: "Synaptic plasticity, action potential dynamics, neural encoding systems.",
    targetWeeks: 3,
    targetDate: "2026-09-28T00:00:00.000Z",
    effortLevel: "NORMAL",
    status: "ACTIVE",
    color: "CYAN",
    createdAt: "2026-09-03T11:00:00.000Z",
    updatedAt: "2026-09-09T16:00:00.000Z",
    quests: [
      {
        id: 103,
        title: "Memorize Neuroanatomy Pathways",
        status: "PENDING",
        xpReward: 100,
        requiredMinutes: 20,
        scheduledFor: "2026-09-16",
      },
    ],
  },
];

export const MOCK_QUESTS_LIST: Array<MockQuestItem> = [
  {
    id: 101,
    userId: 1,
    goalId: 1,
    subjectId: 1,
    subjectNodeId: null,
    title: "Master Differential Equations Keystone",
    description: "Derive boundary value solutions and Laplace transforms.",
    difficulty: "HARD",
    status: "ACTIVE",
    xpReward: 350,
    sylphReward: 25,
    targetMinutes: 45,
    requiredMinutes: 45,
    elapsedSeconds: 900,
    scopeWeight: 0.85,
    scheduledFor: "2026-09-14",
    isGateKeyApplied: false,
    isKamishWardActive: false,
    completedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    todaySeconds: 900,
    goal: { id: 1, title: "Calculus & Analysis", color: "EMERALD" },
    subject: { id: 1, name: "Mathematics", code: "MATH301", color: "#10b981" },
    subjectNode: null,
  },
  {
    id: 102,
    userId: 1,
    goalId: 2,
    subjectId: 2,
    subjectNodeId: null,
    title: "Review Quantum Mechanics Wavefunctions",
    description: "Schrödinger equations, perturbation theory, wave function collapse.",
    difficulty: "MEDIUM",
    status: "ACTIVE",
    xpReward: 200,
    sylphReward: 15,
    targetMinutes: 30,
    requiredMinutes: 30,
    elapsedSeconds: 0,
    scopeWeight: 0.75,
    scheduledFor: "2026-09-15",
    isGateKeyApplied: false,
    isKamishWardActive: false,
    completedAt: null,
    createdAt: "2026-09-02T14:00:00.000Z",
    todaySeconds: 0,
    goal: { id: 2, title: "Modern Physics", color: "VIOLET" },
    subject: { id: 2, name: "Physics", code: "PHYS201", color: "#8b5cf6" },
    subjectNode: null,
  },
  {
    id: 103,
    userId: 1,
    goalId: 3,
    subjectId: 3,
    subjectNodeId: null,
    title: "Memorize Neuroanatomy Pathways",
    description: "Action potentials, motor cortex projections, and hippocampal circuits.",
    difficulty: "EASY",
    status: "PENDING",
    xpReward: 100,
    sylphReward: 10,
    targetMinutes: 20,
    requiredMinutes: 20,
    elapsedSeconds: 0,
    scopeWeight: 0.6,
    scheduledFor: "2026-09-16",
    isGateKeyApplied: false,
    isKamishWardActive: false,
    completedAt: null,
    createdAt: "2026-09-03T11:00:00.000Z",
    todaySeconds: 0,
    goal: { id: 3, title: "Neuroscience", color: "CYAN" },
    subject: { id: 3, name: "Biology", code: "BIO101", color: "#06b6d4" },
    subjectNode: null,
  },
];

export const mockStudyScheduleConfig = {
  dailyGoalMinutes: 120,
  restDays: [0],
  enableHpPenalty: true,
};

export const mockFloatingRestDays = new Set<string>(["2026-09-18"]);

export const MOCK_SHOP_CATALOG: (CatalogItemDefinition & { id: number })[] = [
  {
    id: 101,
    sku: "form-shadow-monarch",
    name: "Shadow Monarch Regalia",
    description: "Form forged from absolute darkness and royal shadow essence.",
    category: "HUNTER_FORM",
    slot: "NONE",
    rarity: "MYTHIC",
    rankRequirement: "RANK S",
    costSylph: 500,
    spriteLayer: "form_shadow_monarch",
  },
  {
    id: 102,
    sku: "form-silver-sentinel",
    name: "Silver Sentinel Vestments",
    description: "Polished silver attire worn by vanguard gate defenders.",
    category: "HUNTER_FORM",
    slot: "NONE",
    rarity: "RARE",
    rankRequirement: "RANK E",
    costSylph: 150,
    spriteLayer: "form_silver_sentinel",
  },
  {
    id: 103,
    sku: "pedestal-obsidian-throne",
    name: "Obsidian Throne Base",
    description: "A dark volcanic plinth humming with latent monarch power.",
    category: "PEDESTAL",
    slot: "NONE",
    rarity: "EPIC",
    rankRequirement: "RANK B",
    costSylph: 250,
    spriteLayer: "pedestal_obsidian",
  },
  {
    id: 104,
    sku: "pedestal-cyber-matrix",
    name: "Cyber Grid Pedestal",
    description: "Futuristic neon grid projecting holographic stability coordinates.",
    category: "PEDESTAL",
    slot: "NONE",
    rarity: "COMMON",
    rankRequirement: "RANK E",
    costSylph: 100,
    spriteLayer: "pedestal_cyber",
  },
  {
    id: 105,
    sku: "aura-monarch-haze",
    name: "Abyssal Shadow Aura",
    description: "Wraiths of abyssal energy swirling around your sovereign avatar.",
    category: "AURA",
    slot: "NONE",
    rarity: "LEGENDARY",
    rankRequirement: "RANK A",
    costSylph: 400,
    spriteLayer: "aura_monarch",
  },
  {
    id: 106,
    sku: "aura-crimson-flare",
    name: "Crimson Berserker Aura",
    description: "Fierce red spiritual pressure surging from physical discipline.",
    category: "AURA",
    slot: "NONE",
    rarity: "RARE",
    rankRequirement: "RANK C",
    costSylph: 180,
    spriteLayer: "aura_crimson",
  },
  {
    id: 107,
    sku: "weapon-rasakas-fang",
    name: "Rasaka's Poison Fang",
    description: "Dagger carved from the venomous fang of a Great Swamp serpent.",
    category: "WEAPON",
    slot: "WEAPON",
    rarity: "RARE",
    rankRequirement: "RANK D",
    costSylph: 200,
    spriteLayer: "weapon_rasaka",
  },
  {
    id: 108,
    sku: "weapon-demon-king-blade",
    name: "Demon King's Shortsword",
    description: "Lightning imbued dual shortsword radiating immense kinetic force.",
    category: "WEAPON",
    slot: "WEAPON",
    rarity: "LEGENDARY",
    rankRequirement: "RANK S",
    costSylph: 600,
    spriteLayer: "weapon_demon_king",
  },
  {
    id: 109,
    sku: "relic-monarch-ring",
    name: "Ring of Ruler's Authority",
    description: "Ancient signet ring granting telekinetic focus resonance.",
    category: "RELIC",
    slot: "RELIC",
    rarity: "MYTHIC",
    rankRequirement: "RANK S",
    costSylph: 800,
    spriteLayer: "relic_ruler_ring",
  },
  {
    id: 110,
    sku: "consumable-stamina-elixir",
    name: "Stamina Restoration Elixir",
    description: "Instantly restores study stamina and eliminates fatigue penalties.",
    category: "CONSUMABLE",
    slot: "NONE",
    rarity: "COMMON",
    rankRequirement: "RANK E",
    costSylph: 50,
  },
  {
    id: 111,
    sku: "consumable-focus-incense",
    name: "Purified Focus Incense",
    description: "Increases XP earned during the next focus block by 25%.",
    category: "CONSUMABLE",
    slot: "NONE",
    rarity: "RARE",
    rankRequirement: "RANK E",
    costSylph: 75,
  },
];

export interface MockInventoryRecord {
  id: number;
  userId: number;
  itemId: number;
  quantity: number;
  isEquipped: boolean;
  acquiredAt: string;
  item: CatalogItemDefinition & { id: number };
}

export const mockUserInventory: MockInventoryRecord[] = [
  {
    id: 1,
    userId: 1,
    itemId: 104,
    quantity: 1,
    isEquipped: true,
    acquiredAt: "2026-08-15T10:00:00.000Z",
    item: {
      id: 104,
      sku: "pedestal-cyber-matrix",
      name: "Cyber Grid Pedestal",
      description: "Futuristic neon grid projecting holographic stability coordinates.",
      category: "PEDESTAL",
      slot: "NONE",
      rarity: "COMMON",
      rankRequirement: "RANK E",
      costSylph: 100,
      spriteLayer: "pedestal_cyber",
    },
  },
  {
    id: 2,
    userId: 1,
    itemId: 110,
    quantity: 3,
    isEquipped: false,
    acquiredAt: "2026-09-01T14:30:00.000Z",
    item: {
      id: 110,
      sku: "consumable-stamina-elixir",
      name: "Stamina Restoration Elixir",
      description: "Instantly restores study stamina and eliminates fatigue penalties.",
      category: "CONSUMABLE",
      slot: "NONE",
      rarity: "COMMON",
      rankRequirement: "RANK E",
      costSylph: 50,
    },
  },
];

export function resetMockShopState() {
  MOCK_STUDENT_USER.sylph = 1250;
  mockUserInventory.length = 0;
  mockUserInventory.push(
    {
      id: 1,
      userId: 1,
      itemId: 104,
      quantity: 1,
      isEquipped: true,
      acquiredAt: "2026-08-15T10:00:00.000Z",
      item: {
        id: 104,
        sku: "pedestal-cyber-matrix",
        name: "Cyber Grid Pedestal",
        description: "Futuristic neon grid projecting holographic stability coordinates.",
        category: "PEDESTAL",
        slot: "NONE",
        rarity: "COMMON",
        rankRequirement: "RANK E",
        costSylph: 100,
        spriteLayer: "pedestal_cyber",
      },
    },
    {
      id: 2,
      userId: 1,
      itemId: 110,
      quantity: 3,
      isEquipped: false,
      acquiredAt: "2026-09-01T14:30:00.000Z",
      item: {
        id: 110,
        sku: "consumable-stamina-elixir",
        name: "Stamina Restoration Elixir",
        description: "Instantly restores study stamina and eliminates fatigue penalties.",
        category: "CONSUMABLE",
        slot: "NONE",
        rarity: "COMMON",
        rankRequirement: "RANK E",
        costSylph: 50,
      },
    }
  );
}

export function generateMockMonthCalendarData(year: number, month: number) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  let totalMinutes = 0;
  let totalSessions = 0;
  let activeDays = 0;
  let goalsMetDays = 0;
  let restDaysCount = 0;
  let totalXpEarned = 0;
  let totalQuestsCompleted = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d);
    const dayOfWeek = dayDate.getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isFixedRest = mockStudyScheduleConfig.restDays.includes(dayOfWeek);
    const isFloatingRest = mockFloatingRestDays.has(dateStr);
    const isRestDay = isFixedRest || isFloatingRest;

    // Realistic study patterns: study on non-rest days up to today
    const isPastOrToday = d <= 14;
    let mins = 0;
    if (!isRestDay && isPastOrToday) {
      mins = [60, 90, 120, 45, 135, 90, 105][(d * 3) % 7];
    }
    const secs = mins * 60;
    const goalMet = mins >= mockStudyScheduleConfig.dailyGoalMinutes;
    const sessions = mins > 0 ? Math.max(1, Math.floor(mins / 45)) : 0;
    const dayQuests = MOCK_QUESTS_LIST.filter((q) => q.scheduledFor === dateStr);
    const dayQuestsCompleted = dayQuests.filter((q) => q.status === "COMPLETED").length;
    const xp = mins * 5 + dayQuestsCompleted * 200;

    totalMinutes += mins;
    totalSessions += sessions;
    if (mins > 0) activeDays++;
    if (goalMet) goalsMetDays++;
    if (isRestDay) restDaysCount++;
    totalXpEarned += xp;
    totalQuestsCompleted += dayQuestsCompleted;

    days.push({
      date: dateStr,
      dayOfWeek,
      isRestDay,
      dailyGoalMinutes: mockStudyScheduleConfig.dailyGoalMinutes,
      totalMinutes: mins,
      totalSeconds: secs,
      completionPercentage: Math.min(100, Math.round((mins / mockStudyScheduleConfig.dailyGoalMinutes) * 100)),
      goalMet,
      sessionsCount: sessions,
      questsCount: dayQuests.length,
      questsCompleted: dayQuestsCompleted,
      xpGained: xp,
      subjectBreakdown: mins > 0 ? [
        {
          subjectId: 1,
          subjectName: "Mathematics",
          subjectColor: "#10b981",
          minutes: Math.round(mins * 0.6),
          seconds: Math.round(mins * 0.6 * 60),
          percentage: 60,
        },
        {
          subjectId: 2,
          subjectName: "Physics",
          subjectColor: "#8b5cf6",
          minutes: Math.round(mins * 0.4),
          seconds: Math.round(mins * 0.4 * 60),
          percentage: 40,
        },
      ] : [],
      quests: dayQuests.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        status: q.status,
        difficulty: q.difficulty,
        requiredMinutes: q.requiredMinutes,
        elapsedSeconds: q.elapsedSeconds,
        xpReward: q.xpReward,
        sylphReward: q.sylphReward,
        goal: q.goal,
      })),
    });
  }

  // Milestones in this month
  const milestones = MOCK_GOALS_LIST
    .filter((g) => {
      if (!g.targetDate) return false;
      const target = new Date(g.targetDate);
      return target.getUTCFullYear() === year && target.getUTCMonth() === month;
    })
    .map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
      targetDate: g.targetDate!,
      date: g.targetDate!.slice(0, 10),
    }));

  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const floatingInMonth = Array.from(mockFloatingRestDays).filter((f) => f.startsWith(prefix));

  return {
    year,
    month,
    monthName: monthNames[month] || "Unknown",
    dailyGoalMinutes: mockStudyScheduleConfig.dailyGoalMinutes,
    restDays: mockStudyScheduleConfig.restDays,
    enableHpPenalty: mockStudyScheduleConfig.enableHpPenalty,
    days,
    milestones,
    floatingRestDays: floatingInMonth,
    monthStats: {
      totalMinutes,
      totalSeconds: totalMinutes * 60,
      totalSessions,
      activeDays,
      totalDays: daysInMonth,
      goalsMetDays,
      restDaysCount,
      totalXpEarned,
      totalQuestsCompleted,
    },
  };
}

export let mockNotificationPreferences: NotificationPreferences = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
};

export const mockCognitiveStats = {
  endurance: 25,
  tenacity: 20,
  velocity: 18,
  discipline: 30,
  synthesis: 15,
};

export let mockSkillPoints = 5;

export const mockUserFocusBackgrounds: Array<{
  id: number;
  userId: number;
  name: string;
  storagePath: string;
  width: number;
  height: number;
  aspectRatio: number;
  focalX: number;
  focalY: number;
  timerPosition: string;
  layoutKey?: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  updatedAt: string;
  signedUrl: string | null;
}> = [];

export const mockClaimedAchievements = new Set<string>();

export const MOCK_DETAILED_STATS = {
  user: {
    username: MOCK_STUDENT_USER.username,
    name: MOCK_STUDENT_USER.name,
    hunterRank: MOCK_STUDENT_USER.hunterRank,
    level: MOCK_STUDENT_USER.level,
    currentXP: MOCK_STUDENT_USER.currentXP,
    xpToNextLevel: MOCK_STUDENT_USER.xpToNextLevel,
    hp: MOCK_STUDENT_USER.hp,
    maxHp: MOCK_STUDENT_USER.maxHp,
    streakDays: MOCK_STUDENT_USER.streakDays,
    totalStudyMinutes: MOCK_STUDENT_USER.totalStudyMinutes,
    totalStudySeconds: MOCK_STUDENT_USER.totalStudySeconds,
    createdAt: MOCK_STUDENT_USER.createdAt,
  },
  dailyStudy: [
    { date: "2026-09-08", minutes: 60 },
    { date: "2026-09-09", minutes: 90 },
    { date: "2026-09-10", minutes: 45 },
    { date: "2026-09-11", minutes: 120 },
    { date: "2026-09-12", minutes: 80 },
    { date: "2026-09-13", minutes: 110 },
    { date: "2026-09-14", minutes: 75 },
  ],
  subjectBreakdown: [
    { name: "Algorithms & Data Structures", color: "#7c3aed", minutes: 1200, sessions: 18 },
    { name: "Computer Systems & Architecture", color: "#3b82f6", minutes: 840, sessions: 12 },
    { name: "Multivariable Calculus", color: "#10b981", minutes: 600, sessions: 8 },
    { name: "Quantum Information Theory", color: "#f59e0b", minutes: 200, sessions: 3 },
  ],
  sessionLog: [
    {
      id: 101,
      startedAt: "2026-09-14T09:00:00.000Z",
      endedAt: "2026-09-14T10:15:00.000Z",
      durationMinutes: 75,
      durationSeconds: 4500,
      breakSeconds: 300,
      focusRate: 96,
      subjectName: "Algorithms & Data Structures",
      subjectColor: "#7c3aed",
      questTitle: "Master Dynamic Programming",
    },
    {
      id: 102,
      startedAt: "2026-09-13T14:00:00.000Z",
      endedAt: "2026-09-13T15:50:00.000Z",
      durationMinutes: 110,
      durationSeconds: 6600,
      breakSeconds: 600,
      focusRate: 94,
      subjectName: "Computer Systems & Architecture",
      subjectColor: "#3b82f6",
      questTitle: "Kernel Memory Mapping",
    },
  ],
  questStats: {
    total: 28,
    completed: 24,
    failed: 1,
    pending: 1,
    inProgress: 2,
    totalXPEarned: 14200,
  },
  goalStats: {
    total: 4,
    active: 3,
    completed: 1,
  },
  todayDate: "2026-09-14",
  summary: {
    totalSessions: 41,
    avgSessionMinutes: 69,
    avgSessionSeconds: 4156,
    activeDaysLast30: 26,
    longestSession: 145,
    longestSessionSeconds: 8700,
    accountAgeDays: 45,
    completionRate: 92,
  },
};

export const MOCK_RANKINGS_DATA = {
  global: [
    {
      id: 1,
      username: "hunter_jinwoo",
      name: "Sung Jin-Woo",
      hunterRank: "S",
      level: 42,
      totalStudyMinutes: 2840,
      studyHours: 47,
      streakDays: 14,
      questsCompleted: 24,
      isCurrentUser: true,
      rank: 1,
    },
    {
      id: 2,
      username: "swordsinger",
      name: "Cha Hae-In",
      hunterRank: "S",
      level: 38,
      totalStudyMinutes: 2400,
      studyHours: 40,
      streakDays: 21,
      questsCompleted: 20,
      isCurrentUser: false,
      rank: 2,
    },
    {
      id: 4,
      username: "association_head",
      name: "Go Gun-Hee",
      hunterRank: "S",
      level: 35,
      totalStudyMinutes: 2100,
      studyHours: 35,
      streakDays: 30,
      questsCompleted: 18,
      isCurrentUser: false,
      rank: 3,
    },
    {
      id: 3,
      username: "guild_master",
      name: "Yoo Jin-Ho",
      hunterRank: "B",
      level: 22,
      totalStudyMinutes: 1200,
      studyHours: 20,
      streakDays: 7,
      questsCompleted: 10,
      isCurrentUser: false,
      rank: 4,
    },
  ],
  friends: [
    {
      id: 1,
      username: "hunter_jinwoo",
      name: "Sung Jin-Woo",
      hunterRank: "S",
      level: 42,
      totalStudyMinutes: 2840,
      studyHours: 47,
      streakDays: 14,
      questsCompleted: 24,
      isCurrentUser: true,
      rank: 1,
      friendRank: 1,
    },
    {
      id: 2,
      username: "swordsinger",
      name: "Cha Hae-In",
      hunterRank: "S",
      level: 38,
      totalStudyMinutes: 2400,
      studyHours: 40,
      streakDays: 21,
      questsCompleted: 20,
      isCurrentUser: false,
      rank: 2,
      friendRank: 2,
    },
    {
      id: 3,
      username: "guild_master",
      name: "Yoo Jin-Ho",
      hunterRank: "B",
      level: 22,
      totalStudyMinutes: 1200,
      studyHours: 20,
      streakDays: 7,
      questsCompleted: 10,
      isCurrentUser: false,
      rank: 4,
      friendRank: 3,
    },
  ],
  currentUserRank: 1,
  totalPlayers: 154,
};

export const MOCK_API_RESPONSES: Record<string, unknown> = {
  "/api/user/stats": MOCK_STUDENT_USER,

  "/api/currency/stats": {
    sylph: 1250,
    currentXP: 4500,
    level: 42,
    hunterRank: "S",
    hp: 95,
    maxHp: 100,
    streakDays: 14,
    todayStudyMinutes: 75,
  },

  "/api/user/detailed-stats": MOCK_DETAILED_STATS,
  "/api/notifications/preferences": {
    preferences: mockNotificationPreferences,
  },
  "/api/user/rankings": MOCK_RANKINGS_DATA,
  "/api/cognitive-stats/invest": {
    stats: mockCognitiveStats,
    skillPoints: mockSkillPoints,
    sylph: 1250,
    cap: 100,
    effects: getCognitiveEffects(mockCognitiveStats),
    abilities: COGNITIVE_STAT_KEYS.map((key) => ({
      ...getAbilitySummary(key, mockCognitiveStats[key]),
      cap: 100,
      investable: canInvest(mockCognitiveStats[key], 100),
      costSp: getInvestCost(mockCognitiveStats[key], "sp"),
      costSylph: getInvestCost(mockCognitiveStats[key], "sylph"),
    })),
  },
  "/api/achievements": {
    achievements: ACHIEVEMENTS_CATALOG.map((ach) => ({
      ...ach,
      currentProgress: 1,
      isClaimed: false,
    })),
  },

  "/api/goals": MOCK_GOALS_LIST,
  "/api/quests": MOCK_QUESTS_LIST,
  "/api/user/study-schedule": mockStudyScheduleConfig,

  "/api/quests/weekly": {
    id: 1,
    title: "Weekly Crucible of Knowledge",
    targetMinutes: 600,
    currentMinutes: 420,
    xpReward: 1000,
    completed: false,
  },

  "/api/friends": [
    {
      id: 2,
      friendshipId: 201,
      name: "Cha Hae-In",
      username: "swordsinger",
      hunterRank: "S",
      level: 38,
      totalStudyMinutes: 2400,
      totalStudySeconds: 144000,
      todayMinutes: 90,
      todaySeconds: 5400,
      isOnline: true,
      isStudying: true,
      activeSessionStartedAt: "2026-09-11T11:00:00.000Z",
      avatarUrl: null,
      activeAvatar: "class_dancer",
      activeFrame: "frame_gold",
      activeAura: "aura_golden",
      activeTitle: "Sword Saint",
      bio: "Focusing on advanced algorithms.",
      streakDays: 21,
      lastSeenAt: "2026-09-11T11:30:00.000Z",
    },
    {
      id: 3,
      friendshipId: 202,
      name: "Yoo Jin-Ho",
      username: "guild_master",
      hunterRank: "B",
      level: 22,
      totalStudyMinutes: 1200,
      totalStudySeconds: 72000,
      todayMinutes: 40,
      todaySeconds: 2400,
      isOnline: false,
      isStudying: false,
      activeSessionStartedAt: null,
      avatarUrl: null,
      activeAvatar: "class_scholar",
      activeFrame: "none",
      activeAura: "none",
      activeTitle: "Guild Vice-Master",
      bio: "Grinding chemistry problem sets.",
      streakDays: 7,
      lastSeenAt: "2026-09-11T09:30:00.000Z",
    },
  ],

  "/api/friends/requests": [
    {
      id: 301,
      sender: {
        id: 4,
        name: "Go Gun-Hee",
        username: "association_head",
        hunterRank: "S",
        level: 65,
        avatarUrl: null,
        activeAvatar: "class_scholar",
        activeFrame: "frame_diamond",
        activeTitle: "Association Chairman",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      createdAt: "2026-09-10T12:00:00.000Z",
    },
  ],

  "/api/conversations": [
    {
      id: 401,
      name: "Cha Hae-In",
      avatarUrl: null,
      isGroup: false,
      hasUnread: false,
      participants: [
        {
          id: 2,
          name: "Cha Hae-In",
          username: "swordsinger",
          hunterRank: "S",
          level: 38,
          avatarUrl: null,
          activeAvatar: "class_dancer",
          activeFrame: "frame_gold",
          isOnline: true,
        },
      ],
    },
    {
      id: 402,
      name: "Ahjin Raid Squad",
      avatarUrl: null,
      isGroup: true,
      hasUnread: true,
      participants: [
        {
          id: 2,
          name: "Cha Hae-In",
          username: "swordsinger",
          hunterRank: "S",
          level: 38,
          isOnline: true,
        },
        {
          id: 3,
          name: "Yoo Jin-Ho",
          username: "guild_master",
          hunterRank: "B",
          level: 22,
          isOnline: false,
        },
      ],
    },
  ],

  "/api/focus-party": {
    activeParty: null,
    pendingInvites: [],
  },

  "/api/cosmetics": {
    cosmetics: [],
    active: {
      activeTheme: "cyberpunk",
      activeBackground: "void",
      activeAvatar: "class_scholar",
      activeFrame: "none",
      activeTitle: "title_novice",
      activeAura: "aura_monarch",
      activeNameColor: "default",
    },
  },

  "/api/user/connections": {
    connections: [
      { provider: "GITHUB", isLinked: false },
      { provider: "DISCORD", isLinked: false },
      { provider: "INSTAGRAM", isLinked: false },
    ],
  },

  "/api/profile/stats": {
    stats: {
      totalStudyHours: 47,
      questsCompleted: 14,
      achievementsEarned: 9,
      joinedDate: "2026-08-01T00:00:00.000Z",
      streakDays: 14,
    },
    nextUnlock: {
      currentXP: 4500,
      requiredXP: 6000,
      nextLevel: 43,
    },
  },



  "/api/focus-backgrounds": {
    catalog: [
      {
        id: "classic",
        slug: "classic",
        title: "Classic Sylf",
        category: "ambient",
        imageUrl: "",
        previewUrl: "",
      },
    ],
  },

  "/api/insights": [
    {
      id: 1,
      type: "EFFICIENCY",
      title: "Optimal Focus Window",
      content: "Your highest retention occurs between 09:00 and 11:30.",
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      type: "STREAK",
      title: "Discipline Velocity",
      content: "14-day streak active. Momentum multiplier is at 1.25x.",
      createdAt: new Date().toISOString(),
    },
  ],

  "/api/subjects": [
    {
      id: 1,
      name: "Calculus & Analysis",
      code: "MATH-301",
      examBoard: "Cambridge CIE",
      level: "A-Level",
      color: "#86aaf4",
      syllabusNote: "Differentiation, Integration, Differential Equations",
      nodesCount: 12,
      todaySeconds: 1800,
    },
    {
      id: 2,
      name: "Modern Physics",
      code: "PHYS-204",
      examBoard: "Edexcel",
      level: "A-Level",
      color: "#a4d5bb",
      syllabusNote: "Wave-Particle Duality, Quantum States, Relativity",
      nodesCount: 9,
      todaySeconds: 2700,
    },
    {
      id: 3,
      name: "Neuroscience",
      code: "NEUR-101",
      examBoard: "AQA",
      level: "Undergraduate",
      color: "#d9b67b",
      syllabusNote: "Synaptic Transmission, Neural Circuits",
      nodesCount: 6,
      todaySeconds: 0,
    },
  ],

  "/api/sessions": {
    id: 999,
    sessionId: 999,
    success: true,
    status: "ACTIVE",
    startedAt: new Date().toISOString(),
  },

  "/api/acoustics": {
    tracks: [
      {
        id: 1,
        title: "Rain on Glass",
        category: "NATURE",
        frequency: "432 Hz",
        audioUrl: "/audio/ambient/rain.ogg",
        duration: 180,
        defaultVolume: 70,
        description: "Gentle rhythmic rain against a windowpane",
        tags: ["rain", "nature", "gentle"],
        isPreset: true,
        orderIndex: 1,
      },
      {
        id: 2,
        title: "Deep Brown Noise",
        category: "NOISE",
        frequency: "Theta 6 Hz",
        audioUrl: "/audio/soundscapes/deep-brown-noise.wav",
        duration: 300,
        defaultVolume: 65,
        description: "Low-frequency acoustic dampening for deep focus",
        tags: ["brown noise", "deep work"],
        isPreset: true,
        orderIndex: 2,
      },
      {
        id: 3,
        title: "Kyoto Study Temple",
        category: "AMBIENT",
        frequency: "Alpha 10 Hz",
        audioUrl: "/audio/ambient/stream.ogg",
        duration: 240,
        defaultVolume: 60,
        description: "Bamboo garden water stream and quiet breeze",
        tags: ["zen", "stream", "ambient"],
        isPreset: true,
        orderIndex: 3,
      },
    ],
  },

  "/api/user/focus-backgrounds": {
    backgrounds: mockUserFocusBackgrounds,
    quota: {
      used: 0,
      max: 10,
      remaining: 10,
    },
  },

  "/api/focus-backgrounds/preference": {
    preference: null,
  },

  "/api/system-messages": {
    messages: [
      {
        id: 1,
        content: "Welcome to the Sanctuary, Hunter. Today's keystone quest in Differential Equations is ready.",
        type: "DAILY_BRIEFING",
        read: false,
        createdAt: new Date().toISOString(),
      },
    ],
    sessions: [
      {
        id: 1,
        title: "Calculus Optimization Strategies",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },

  // ── System AI Workspace Endpoints ─────────────────────────────────────
  // These match the production JSON response contracts verified from
  // app/api/chats/route.ts and app/api/ai-usage/route.ts.

  "/api/chats": {
    sessions: [
      {
        id: 1,
        title: "Calculus Optimization Strategies",
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 2,
        title: "Quantum Mechanics Wave Functions",
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 3,
        title: "Neural Pathway Memorization Techniques",
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
      },
    ],
  },

  "/api/ai-usage": {
    chat: {
      used: 3,
      limit: 15,
      remaining: 12,
      resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
      allowed: true,
    },
    planner: {
      used: 0,
      limit: 1,
      remaining: 1,
      resetsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      allowed: true,
    },
  },

  "/api/ai-costs": {
    today: {
      totalRequests: 3,
      promptTokens: 4200,
      completionTokens: 1800,
      cacheHitTokens: 1200,
      costUsd: 0.012,
      byModel: [
        {
          model: "DeepSeek v4 Flash",
          requests: 2,
          promptTokens: 3000,
          completionTokens: 1200,
          costUsd: 0.008,
        },
        {
          model: "Deterministic (no LLM)",
          requests: 1,
          promptTokens: 0,
          completionTokens: 0,
          costUsd: 0,
        },
      ],
    },
    last7Days: {
      totalRequests: 18,
      costUsd: 0.054,
    },
  },
};

/**
 * Positive opt-in flag for mock API interception.
 *
 * FAIL-CLOSED DEFAULT:
 * Mock API interception is DISABLED BY DEFAULT in all environments:
 * - Ordinary mobile builds: OFF
 * - Future release builds: OFF
 * - CI builds: OFF
 * - Unset / forgotten environment variables: OFF
 *
 * Enabled ONLY when VITE_ENABLE_MOCK_API === "true" is explicitly set.
 */
export const IS_MOCK_API_ENABLED: boolean =
  (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env
    ?.VITE_ENABLE_MOCK_API === "true";

/**
 * Installs a mock fetch handler ONLY when explicitly opted in via VITE_ENABLE_MOCK_API === "true"
 * or when forceEnable is explicitly set to true in test harnesses.
 */
export function setupMockApiInterception(forceEnable: boolean = false): void {
  if (typeof window === "undefined") return;

  if (!IS_MOCK_API_ENABLED) {
    if (!forceEnable) {
      (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = false;
      // FAIL-CLOSED DEFAULT: Mocks are completely disabled unless explicitly enabled
      return;
    }
  }

  if (typeof window !== "undefined") {
    (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = true;
  }

  console.info(
    "%c[Sylf Development Mock Active]%c Intercepting API requests with local mock data (VITE_ENABLE_MOCK_API=true). NOT FOR PRODUCTION.",
    "background: #ffaa00; color: #000; font-weight: bold; padding: 2px 6px; border-radius: 4px;",
    "color: #ffaa00; margin-left: 6px;"
  );

  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Support non-GET mutations during development mock testing
    if (init?.method && init.method !== "GET") {
      if (urlStr.includes("/api/sessions")) {
        return new Response(JSON.stringify({ success: true, id: 999, sessionId: 999, status: "COMPLETED" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/api/subjects")) {
        if (init?.method === "PATCH") {
          try {
            const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
            return new Response(JSON.stringify({ success: true, id: Date.now(), ...body }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch {
            return new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        if (init?.method === "DELETE") {
          return new Response(JSON.stringify({ success: true, message: "Subject removed from active curriculum" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, id: Date.now() }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/api/profile/customization")) {
        return new Response(JSON.stringify({
          success: true,
          message: "Profile identity updated successfully.",
          user: MOCK_STUDENT_USER,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/api/notifications/preferences")) {
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          mockNotificationPreferences = { ...mockNotificationPreferences, ...body };
        } catch {}
        return new Response(
          JSON.stringify({
            success: true,
            message: "Alert preferences updated successfully",
            preferences: mockNotificationPreferences,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/api/cognitive-stats/invest")) {
        let body: Record<string, unknown> = {};
        try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
        const stat = (String(body.stat || "endurance")) as CognitiveStatKey;
        const currency = (String(body.currency || "sp")) as InvestCurrency;
        const curVal = mockCognitiveStats[stat] ?? 10;
        const cost = getInvestCost(curVal, currency);
        const newVal = Math.min(100, curVal + INVEST_STEP);
        mockCognitiveStats[stat] = newVal;
        if (currency === "sp") {
          mockSkillPoints = Math.max(0, mockSkillPoints - cost);
        } else {
          MOCK_STUDENT_USER.sylph = Math.max(0, MOCK_STUDENT_USER.sylph - cost);
        }
        const snapshot = normalizeCognitiveStats(mockCognitiveStats);
        return new Response(
          JSON.stringify({
            success: true,
            stats: snapshot,
            skillPoints: mockSkillPoints,
            sylph: MOCK_STUDENT_USER.sylph,
            investedStat: stat,
            amount: INVEST_STEP,
            cost,
            currency,
            effects: getCognitiveEffects(snapshot),
            ability: getAbilitySummary(stat, snapshot[stat]),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/api/achievements")) {
        let achId = "";
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          achId = body.achievementId || "";
        } catch {}
        if (achId) mockClaimedAchievements.add(achId);
        return new Response(
          JSON.stringify({ success: true, message: "Reward claimed!", user: MOCK_STUDENT_USER }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (urlStr.includes("/api/user/focus-backgrounds")) {
        if (init.method === "POST") {
          const newBg = {
            id: Date.now(),
            userId: 1,
            name: "Custom Environment",
            storagePath: "user-backgrounds/1/bg.jpg",
            width: 1920,
            height: 1080,
            aspectRatio: 1.777,
            focalX: 0.5,
            focalY: 0.5,
            timerPosition: "auto",
            layoutKey: "classic",
            fileSize: 1024 * 1024,
            mimeType: "image/jpeg",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            signedUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='100%' height='100%' fill='%23111827'/></svg>",
          };
          mockUserFocusBackgrounds.push(newBg);
          return new Response(
            JSON.stringify({ success: true, background: newBg }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        const bgMatch = urlStr.match(/\/api\/user\/focus-backgrounds\/(\d+)/);
        if (bgMatch) {
          const bgId = parseInt(bgMatch[1], 10);
          if (init.method === "PATCH") {
            let body: Record<string, unknown> = {};
            try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
            const idx = mockUserFocusBackgrounds.findIndex((b) => b.id === bgId);
            if (idx !== -1) {
              mockUserFocusBackgrounds[idx] = { ...mockUserFocusBackgrounds[idx], ...body, updatedAt: new Date().toISOString() };
              return new Response(
                JSON.stringify({ success: true, background: mockUserFocusBackgrounds[idx] }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              );
            }
          }
          if (init.method === "DELETE") {
            const idx = mockUserFocusBackgrounds.findIndex((b) => b.id === bgId);
            if (idx !== -1) mockUserFocusBackgrounds.splice(idx, 1);
            return new Response(
              JSON.stringify({ success: true, message: "Background deleted" }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      }

      if (
        urlStr.includes("/api/friends/requests") ||
        urlStr.includes("/api/cosmetics")
      ) {
        return new Response(JSON.stringify({ success: true, user: MOCK_STUDENT_USER }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/api/shop/purchase")) {
        let itemId: number | null = null;
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          itemId = Number(body.itemId);
        } catch {}

        if (!itemId || isNaN(itemId)) {
          return new Response(
            JSON.stringify({ error: "Valid itemId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const shopItem = MOCK_SHOP_CATALOG.find((i) => i.id === itemId);
        if (!shopItem) {
          return new Response(
            JSON.stringify({ error: "Item not found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        if (!isRankSufficient(MOCK_STUDENT_USER.hunterRank, shopItem.rankRequirement)) {
          return new Response(
            JSON.stringify({ error: `Insufficient rank: Requires ${shopItem.rankRequirement}` }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }

        if (MOCK_STUDENT_USER.sylph < shopItem.costSylph) {
          return new Response(
            JSON.stringify({ error: "Insufficient Sylph" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const existing = mockUserInventory.find((i) => i.itemId === itemId);
        if (existing && shopItem.category !== "CONSUMABLE") {
          return new Response(
            JSON.stringify({ error: "Item already owned" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        // Deduct currency
        MOCK_STUDENT_USER.sylph -= shopItem.costSylph;

        let targetRecord: MockInventoryRecord;
        if (existing && shopItem.category === "CONSUMABLE") {
          existing.quantity += 1;
          targetRecord = existing;
        } else {
          const nextInvId = mockUserInventory.length > 0 ? Math.max(...mockUserInventory.map((i) => i.id)) + 1 : 1;
          targetRecord = {
            id: nextInvId,
            userId: MOCK_STUDENT_USER.id,
            itemId: shopItem.id,
            quantity: 1,
            isEquipped: false,
            acquiredAt: new Date().toISOString(),
            item: shopItem,
          };
          mockUserInventory.push(targetRecord);
        }

        return new Response(
          JSON.stringify({
            success: true,
            remainingCurrency: MOCK_STUDENT_USER.sylph,
            inventoryId: targetRecord.id,
            newQuantity: targetRecord.quantity,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/api/inventory/equip")) {
        let inventoryId: number | null = null;
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          inventoryId = Number(body.inventoryId);
        } catch {}

        if (!inventoryId || isNaN(inventoryId)) {
          return new Response(
            JSON.stringify({ error: "Valid inventoryId is required" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const target = mockUserInventory.find((i) => i.id === inventoryId);
        if (!target) {
          return new Response(
            JSON.stringify({ error: "Item not found in inventory" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        target.isEquipped = !target.isEquipped;

        // If equipping, unequip conflicting items in same slot or category
        if (target.isEquipped) {
          for (const other of mockUserInventory) {
            if (other.id === target.id) continue;
            if (!other.isEquipped) continue;

            if (target.item.category === "CONSUMABLE" && other.item.category === "CONSUMABLE") {
              other.isEquipped = false;
            } else if (target.item.category !== "CONSUMABLE") {
              const sameSlot = target.item.slot !== "NONE" && target.item.slot === other.item.slot;
              const sameCat = target.item.category === other.item.category;
              if (sameSlot || sameCat) {
                other.isEquipped = false;
              }
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            isEquipped: target.isEquipped,
            itemSlot: target.item.slot,
            item: target,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("/api/conversations")) {
        return new Response(JSON.stringify({ success: true, id: 99 }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ── System AI Chat: POST /api/system-messages/chat ──────────────────
      // Production contract (verified from app/api/system-messages/chat/route.ts):
      //   Transport: ordinary JSON request → JSON response (NOT streaming/SSE)
      //   Response shape: { userMessage, aiMessage, reply, message, sessionId,
      //                     session, modelUsed, modelDisplayName }
      //   ConversationPanel.tsx parses this directly — no ReadableStream/chunking.
      if (urlStr.includes("/api/system-messages/chat")) {
        const now = new Date().toISOString();
        const mockSessionId = 1;
        return new Response(JSON.stringify({
          userMessage: {
            id: Date.now(),
            content: "[Mock] User message received.",
            type: "USER",
            read: true,
            createdAt: now,
            sessionId: mockSessionId,
          },
          aiMessage: {
            id: Date.now() + 1,
            content: "**System Analysis Complete**\n\nBased on your current study trajectory, here's my assessment:\n\n1. **Differential Equations** — You're making strong progress. Focus on boundary value problems next.\n2. **Quantum Mechanics** — Wave function normalization needs review. I recommend 25 minutes of targeted practice.\n3. **Neural Pathways** — Your memorization strategy is solid. Consider spaced repetition intervals of 2-4-7 days.\n\n> *Confidence: High* · *Reasoning: Deterministic analysis of study patterns*\n\nWould you like me to generate a detailed study plan for any of these areas?",
            type: "INFO",
            read: false,
            createdAt: now,
            sessionId: mockSessionId,
            modelUsed: "Mock AI (Development)",
          },
          reply: "System analysis complete.",
          message: "System analysis complete.",
          sessionId: mockSessionId,
          session: null,
          modelUsed: "MOCK",
          modelDisplayName: "Mock AI (Development)",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ── Chat Session Management: PATCH/DELETE /api/chats/:id ────────────
      if (urlStr.match(/\/api\/chats\/\d+/)) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // ── Goals Management: POST /api/goals, PATCH/DELETE /api/goals/:id ───
      if (urlStr.endsWith("/api/goals") || urlStr.includes("/api/goals?")) {
        if (init.method === "POST") {
          let body: Record<string, unknown> = {};
          try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
          const newGoal = {
            id: Date.now(),
            userId: 1,
            title: (body.title as string) || "Untitled Goal",
            description: (body.description as string) || null,
            targetWeeks: Number(body.targetWeeks) || 4,
            targetDate: body.targetDate ? `${String(body.targetDate)}T00:00:00.000Z` : null,
            effortLevel: (body.effortLevel as string) || "NORMAL",
            status: "ACTIVE",
            color: (body.color as string) || "EMERALD",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            quests: [],
          };
          MOCK_GOALS_LIST.unshift(newGoal);
          return new Response(JSON.stringify(newGoal), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      const goalMatch = urlStr.match(/\/api\/goals\/(\d+)/);
      if (goalMatch) {
        const goalId = parseInt(goalMatch[1], 10);
        if (init.method === "PATCH") {
          let body: Record<string, unknown> = {};
          try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
          const idx = MOCK_GOALS_LIST.findIndex((g) => g.id === goalId);
          if (idx !== -1) {
            MOCK_GOALS_LIST[idx] = { ...MOCK_GOALS_LIST[idx], ...body, updatedAt: new Date().toISOString() };
            return new Response(JSON.stringify(MOCK_GOALS_LIST[idx]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        if (init.method === "DELETE") {
          const idx = MOCK_GOALS_LIST.findIndex((g) => g.id === goalId);
          if (idx !== -1) MOCK_GOALS_LIST.splice(idx, 1);
          return new Response(JSON.stringify({ message: "Goal abandoned" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // ── Quests Management: POST /api/quests, PATCH/DELETE /api/quests/:id ──
      if (urlStr.endsWith("/api/quests") || urlStr.includes("/api/quests?")) {
        if (init.method === "POST") {
          let body: Record<string, unknown> = {};
          try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
          const parentGoal = body.goalId ? MOCK_GOALS_LIST.find((g) => g.id === Number(body.goalId)) : null;
          const targetMin = Number(body.targetMinutes) || 45;
          const newQuest = {
            id: Date.now(),
            userId: 1,
            goalId: body.goalId ? Number(body.goalId) : null,
            subjectId: body.subjectId ? Number(body.subjectId) : null,
            subjectNodeId: null,
            title: (body.title as string) || "Untitled Quest",
            description: (body.description as string) || null,
            difficulty: (body.difficulty as string) || "NORMAL",
            status: "ACTIVE",
            xpReward: targetMin * 5,
            sylphReward: 10,
            targetMinutes: targetMin,
            requiredMinutes: targetMin,
            elapsedSeconds: 0,
            scopeWeight: 1.0,
            scheduledFor: (body.scheduledFor as string) || new Date().toISOString().slice(0, 10),
            isGateKeyApplied: false,
            isKamishWardActive: false,
            completedAt: null,
            createdAt: new Date().toISOString(),
            todaySeconds: 0,
            goal: parentGoal ? { id: parentGoal.id, title: parentGoal.title, color: parentGoal.color } : null,
            subject: null,
            subjectNode: null,
          };
          MOCK_QUESTS_LIST.unshift(newQuest);
          return new Response(JSON.stringify(newQuest), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      const questMatch = urlStr.match(/\/api\/quests\/(\d+)/);
      if (questMatch) {
        const questId = parseInt(questMatch[1], 10);
        if (init.method === "PATCH") {
          let body: Record<string, unknown> = {};
          try { body = typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch {}
          const idx = MOCK_QUESTS_LIST.findIndex((q) => q.id === questId);
          if (idx !== -1) {
            MOCK_QUESTS_LIST[idx] = { ...MOCK_QUESTS_LIST[idx], ...body };
            return new Response(JSON.stringify({ quest: MOCK_QUESTS_LIST[idx] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        if (init.method === "DELETE") {
          const idx = MOCK_QUESTS_LIST.findIndex((q) => q.id === questId);
          if (idx !== -1) MOCK_QUESTS_LIST.splice(idx, 1);
          return new Response(JSON.stringify({ message: "Quest deleted" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // ── Study Schedule & Floating Rest Day Mutations ───────────────────
      if (urlStr.includes("/api/user/study-schedule/floating-rest-day")) {
        let dateKey = "";
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          dateKey = body.dateKey || "";
        } catch {}
        if (dateKey) {
          if (mockFloatingRestDays.has(dateKey)) {
            mockFloatingRestDays.delete(dateKey);
          } else {
            mockFloatingRestDays.add(dateKey);
          }
        }
        return new Response(JSON.stringify({
          success: true,
          dateKey,
          isFloatingRest: mockFloatingRestDays.has(dateKey),
          shiftedQuests: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/api/user/study-schedule")) {
        try {
          const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
          if (body.dailyGoalMinutes !== undefined) mockStudyScheduleConfig.dailyGoalMinutes = body.dailyGoalMinutes;
          if (body.restDays !== undefined) mockStudyScheduleConfig.restDays = body.restDays;
          if (body.enableHpPenalty !== undefined) mockStudyScheduleConfig.enableHpPenalty = body.enableHpPenalty;
        } catch {}
        return new Response(JSON.stringify(mockStudyScheduleConfig), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (urlStr.includes("/api/system-messages") || urlStr.includes("/api/focus-backgrounds")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ── Dynamic GET Handlers ───────────────────────────────────────────
    if (urlStr.endsWith("/api/user/focus-backgrounds") || urlStr.includes("/api/user/focus-backgrounds?")) {
      return new Response(
        JSON.stringify({
          backgrounds: mockUserFocusBackgrounds,
          quota: {
            used: mockUserFocusBackgrounds.length,
            max: 10,
            remaining: Math.max(0, 10 - mockUserFocusBackgrounds.length),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.endsWith("/api/notifications/preferences") || urlStr.includes("/api/notifications/preferences?")) {
      return new Response(
        JSON.stringify({ preferences: mockNotificationPreferences }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.endsWith("/api/achievements") || urlStr.includes("/api/achievements?")) {
      return new Response(
        JSON.stringify({
          achievements: ACHIEVEMENTS_CATALOG.map((ach) => ({
            ...ach,
            currentProgress: 1,
            isClaimed: mockClaimedAchievements.has(ach.id),
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.includes("/api/calendar/month")) {
      const url = new URL(urlStr, "https://localhost");
      const now = new Date();
      let year = parseInt(url.searchParams.get("year") || "", 10);
      let month = parseInt(url.searchParams.get("month") || "", 10);
      if (isNaN(year) || year < 2000 || year > 2100) year = now.getFullYear();
      if (isNaN(month) || month < 0 || month > 11) month = now.getMonth();
      const monthData = generateMockMonthCalendarData(year, month);
      return new Response(JSON.stringify(monthData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/api/user/study-schedule/floating-rest-day")) {
      const url = new URL(urlStr, "https://localhost");
      const dateKey = url.searchParams.get("dateKey") || "";
      const dayOfWeek = dateKey ? new Date(`${dateKey}T12:00:00Z`).getDay() : -1;
      const isFixed = mockStudyScheduleConfig.restDays.includes(dayOfWeek);
      return new Response(JSON.stringify({
        dateKey,
        isFloatingRest: mockFloatingRestDays.has(dateKey),
        isFixedRest: isFixed,
        weekKey: "2026-W38",
        weekUsage: mockFloatingRestDays.size,
        weekQuota: 1,
        canAdd: mockFloatingRestDays.size < 1,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/api/user/study-schedule") || urlStr.includes("/api/user/study-schedule?")) {
      return new Response(JSON.stringify(mockStudyScheduleConfig), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/api/goals") || urlStr.includes("/api/goals?")) {
      return new Response(JSON.stringify(MOCK_GOALS_LIST), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/api/quests") || urlStr.includes("/api/quests?")) {
      return new Response(JSON.stringify(MOCK_QUESTS_LIST), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/api/shop") || urlStr.includes("/api/shop?")) {
      return new Response(
        JSON.stringify({
          catalog: MOCK_SHOP_CATALOG,
          inventory: mockUserInventory.map((inv) => ({
            itemId: inv.itemId,
            quantity: inv.quantity,
            isEquipped: inv.isEquipped,
            item: inv.item,
          })),
          stats: {
            level: MOCK_STUDENT_USER.level,
            xp: MOCK_STUDENT_USER.currentXP,
            rank: MOCK_STUDENT_USER.hunterRank,
            currency: MOCK_STUDENT_USER.sylph,
            skillPoints: 5,
            endurance: 25,
            tenacity: 20,
            velocity: 18,
            discipline: 30,
            synthesis: 15,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (urlStr.endsWith("/api/inventory") || urlStr.includes("/api/inventory?")) {
      return new Response(
        JSON.stringify({
          inventory: mockUserInventory,
          stats: {
            level: MOCK_STUDENT_USER.level,
            xp: MOCK_STUDENT_USER.currentXP,
            rank: MOCK_STUDENT_USER.hunterRank,
            currency: MOCK_STUDENT_USER.sylph,
            skillPoints: 5,
            endurance: 25,
            tenacity: 20,
            velocity: 18,
            discipline: 30,
            synthesis: 15,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if matching mock endpoint
    for (const [endpoint, mockData] of Object.entries(MOCK_API_RESPONSES)) {
      if (urlStr === endpoint || urlStr.endsWith(endpoint) || urlStr.includes(`${endpoint}?`)) {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Pass through to original fetch
    return originalFetch(input, init);
  };
}

export function isMockApiInterceptionActive(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__);
}

export function resetMockApiInterception(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __SYLF_MOCK_MODE__?: boolean }).__SYLF_MOCK_MODE__ = false;
}



