// A person's public profile, as the server decides to show it to this viewer (`getProfileDossier`). The server applies privacy: a hidden rank, hours or
// achievements arrive as absent, and `permissions` says which actions are allowed, so nothing here works out who may do what. HP is in the answer for the
// web. Native never reads it (ADR 0017): the nested profile schema is not loose, so `hp` and `maxHp` are dropped when the answer is parsed.
import { z } from "zod";
import type { BackendClient } from "./client";

const profileSchema = z.object({
  id: z.number().int(), name: z.string().nullable().optional(), username: z.string(), bio: z.string().nullable().optional(),
  hunterRank: z.string().optional(), level: z.number().optional(), levelProgress: z.number().optional(), streakDays: z.number().optional(),
  totalStudyMinutes: z.number().optional(), todayStudyMinutes: z.number().optional(), isStudying: z.boolean().optional(), isOnline: z.boolean().optional(),
  activeTitle: z.string().nullable().optional(), activeFrame: z.string().nullable().optional(), activeNameColor: z.string().nullable().optional(), activeAura: z.string().nullable().optional(),
  stats: z.object({ endurance: z.number(), tenacity: z.number(), velocity: z.number(), discipline: z.number(), synthesis: z.number() }).partial().optional(),
  completedQuestsCount: z.number().optional(), achievementsCount: z.number().optional(),
  recentAchievements: z.array(z.object({ title: z.string().optional(), name: z.string().optional(), rarity: z.string().optional() }).loose()).optional(),
  createdAt: z.string().optional(),
});
export const profileViewSchema = z.object({
  profile: profileSchema,
  relationship: z.string().optional(),
  isSelf: z.boolean().optional(),
  permissions: z.object({ canSendFriendRequest: z.boolean().optional(), canSendMessage: z.boolean().optional(), canRemoveFriend: z.boolean().optional(), canBlock: z.boolean().optional(), canUnblock: z.boolean().optional() }).partial().optional(),
  privacySettings: z.object({ isProfileVisible: z.boolean().optional(), showRank: z.boolean().optional(), showStudyHours: z.boolean().optional(), showAchievements: z.boolean().optional() }).partial().optional(),
}).loose();
export type ProfileView = z.infer<typeof profileViewSchema>;

export function createProfileReads(client: BackendClient) {
  return {
    profile: (username: string, signal: AbortSignal) => client.get(`/api/profile/${encodeURIComponent(username)}`, profileViewSchema, { signal }),
  };
}
