// Typed answers for the reads Sylf Native needs most. Each parses at the client's boundary, so a server change shows up as a `contract`
// failure in one place and never as `undefined` on a screen. Unknown extra fields are allowed: an older client keeps working when a route
// grows. Hidden values really are null: `level` and `hunterRank` on a friend can be null, and that is not zero (Phase 11, S-9).
import { z } from "zod";

const instant = z.string();

/** GET /api/user/stats. Rank is `hunterRank`. Rewards and progression are read from here, and never computed on a client. */
export const userStatsSchema = z.object({
  id: z.number().int().optional(),
  username: z.string().optional(),
  name: z.string().nullable().optional(),
  hunterRank: z.string(),
  level: z.number(),
  currentXP: z.number(),
  xpToNextLevel: z.number(),
  streakDays: z.number(),
  sylph: z.number().optional(),
  email: z.string().optional(),
  timezone: z.string().optional(),
  activeTitle: z.string().nullable().optional(),
  activeAvatar: z.string().nullable().optional(),
  createdAt: instant.optional(),
  todayStudySeconds: z.number().optional(),
  totalStudySeconds: z.number().optional(),
  activeSessionId: z.number().int().nullable().optional(),
  activeSessionSubjectId: z.number().int().nullable().optional(),
  /** Whether a password can sign in on this account. OAuth accounts have none. */
  hasPassword: z.boolean().optional(),
});
export type UserStats = z.infer<typeof userStatsSchema>;

/** One page of GET /api/sessions?limit=. Finished sessions only, newest first. */
export const recentSessionsSchema = z.object({
  sessions: z.array(z.object({
    id: z.number().int(),
    startedAt: instant,
    endedAt: instant.nullable(),
    durationSeconds: z.number().int(),
    breakSeconds: z.number().int(),
    focusRate: z.number().nullable(),
    subjectName: z.string().nullable(),
    subjectColor: z.string().nullable(),
    questTitle: z.string().nullable(),
  })),
  nextCursor: z.number().int().nullable(),
});
export type RecentSessions = z.infer<typeof recentSessionsSchema>;

/** GET /api/user/detailed-stats?summary=true. The week chart and subject shares, without the session log. */
export const studySummarySchema = z.object({
  dailyStudy: z.array(z.object({ date: z.string(), minutes: z.number() })),
  subjectBreakdown: z.array(z.object({ name: z.string(), color: z.string(), seconds: z.number(), minutes: z.number(), sessions: z.number() })),
  todayDate: z.string(),
  summary: z.object({ totalSessions: z.number(), activeDaysLast30: z.number(), avgSessionSeconds: z.number(), longestSessionSeconds: z.number() }),
});
export type StudySummary = z.infer<typeof studySummarySchema>;

/** One page of GET /api/quests?all=true&limit=. Fields beyond these stay on the row. `scheduledFor` is a date: quests have no time of day (G-3). */
export const questSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  status: z.string(),
  scheduledFor: z.string().nullable(),
  subjectId: z.number().int().nullable(),
  targetMinutes: z.number().nullable().optional(),
  requiredMinutes: z.number().nullable().optional(),
  plannedMinutes: z.number().nullable().optional(),
  executionVersion: z.number().int().optional(),
  xpReward: z.number().optional(),
  sylphReward: z.number().optional(),
  subject: z.object({ id: z.number().int(), name: z.string() }).nullable().optional(),
  goal: z.object({ id: z.number().int(), title: z.string() }).nullable().optional(),
});
export type Quest = z.infer<typeof questSchema>;
export const questPageSchema = z.object({ quests: z.array(questSchema), nextCursor: z.number().int().nullable() });
export type QuestPage = z.infer<typeof questPageSchema>;
/** GET /api/quests, one day. The date is the student's own, decided by the server. */
export const questDaySchema = z.array(questSchema);

/** GET /api/subjects. Active subjects only: `lib/subject-service` owns what active means. */
export const subjectsSchema = z.array(z.object({ id: z.number().int(), name: z.string(), code: z.string().nullable().optional(), color: z.string().nullable().optional(), todaySeconds: z.number().optional() }));
export type Subject = z.infer<typeof subjectsSchema>[number];

/** GET /api/goals. */
export const goalsSchema = z.array(z.object({ id: z.number().int(), title: z.string(), status: z.string().optional(), quests: z.array(z.object({ id: z.number().int(), status: z.string() })).optional() }));
export type Goal = z.infer<typeof goalsSchema>[number];

/** GET /api/calendar/personal?start&end. `end` is exclusive. All-day events have no instant. */
export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  allDay: z.boolean(),
  startDate: z.string(),
  endDate: z.string(),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  category: z.string().optional(),
  occurrenceDate: z.string().nullable().optional(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export const calendarRangeSchema = z.object({ events: z.array(calendarEventSchema) });

/** GET /api/planner/capabilities. The server's own idea of today, and whether AI planning is open to this person. */
export const plannerCapabilitiesSchema = z.object({ timezone: z.string(), today: z.string(), restDays: z.array(z.number()), studentWorkspace: z.object({ enabled: z.boolean() }).optional() });
export type PlannerCapabilities = z.infer<typeof plannerCapabilitiesSchema>;

/** GET /api/friends. `level` and `hunterRank` are null when a friend hides them, and `visible` says which of the other fields are real. */
export const friendsSchema = z.array(z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  username: z.string(),
  hunterRank: z.string().nullable(),
  level: z.number().nullable(),
  todaySeconds: z.number(),
  isOnline: z.boolean(),
  isStudying: z.boolean(),
  activeSessionStartedAt: instant.nullable(),
  visible: z.object({ hours: z.boolean(), session: z.boolean(), online: z.boolean(), rank: z.boolean() }).optional(),
}));
export type Friend = z.infer<typeof friendsSchema>[number];
/** GET /api/friends/requests. */
export const friendRequestsSchema = z.array(z.object({ id: z.number().int(), sender: z.object({ id: z.number().int(), name: z.string().nullable(), username: z.string() }) }));
export type FriendRequest = z.infer<typeof friendRequestsSchema>[number];

/** GET /api/focus-party. One active party and any invitations, not a list of parties. No schedule and no running state: the summary carries neither. */
export const focusPartySchema = z.object({
  activeParty: z.object({ id: z.number().int(), name: z.string(), memberCount: z.number() }).nullable(),
  pendingInvites: z.array(z.object({ id: z.number().int(), partyName: z.string(), senderName: z.string().nullable(), senderUsername: z.string() })),
});
export type FocusParty = z.infer<typeof focusPartySchema>;

/** GET /api/achievements. */
export const achievementsSchema = z.object({ achievements: z.array(z.object({ id: z.string(), title: z.string(), description: z.string(), target: z.number(), currentProgress: z.number(), isClaimed: z.boolean(), reward: z.object({ type: z.string(), amount: z.number() }).optional() })) });
export type AchievementRecord = z.infer<typeof achievementsSchema>["achievements"][number];

/** GET /api/cosmetics. Names and rarity live in lib/cosmetics-catalog. */
export const cosmeticsSchema = z.object({
  cosmetics: z.array(z.object({ itemKey: z.string(), category: z.string() })),
  active: z.object({ activeTitle: z.string().nullable(), activeAvatar: z.string().nullable(), activeFrame: z.string().nullable(), activeNameColor: z.string().nullable() }).loose(),
});
export type Cosmetics = z.infer<typeof cosmeticsSchema>;

/** GET /api/acoustics. `audioUrl` is relative (G-8). */
export const soundsSchema = z.object({ tracks: z.array(z.object({ id: z.number().int(), title: z.string(), category: z.string(), audioUrl: z.string(), description: z.string().optional() })) });

/** GET /api/chats?limit=. Sylvie's threads. */
export const chatsSchema = z.object({ sessions: z.array(z.object({ id: z.number().int(), title: z.string() }).loose()), nextCursor: z.number().int().nullable() });
export type ChatThread = z.infer<typeof chatsSchema>["sessions"][number];
/** GET /api/system-messages?sessionId=&limit=. Newest first, from the server. */
export const chatMessagesSchema = z.object({ messages: z.array(z.object({ id: z.number().int(), content: z.string(), type: z.string() }).loose()) });

/** GET /api/user/earned-this-week. What the ledgers credited since the student's own Monday. */
export const earnedThisWeekSchema = z.object({ xp: z.number(), sylph: z.number() });
