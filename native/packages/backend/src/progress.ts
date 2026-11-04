// What Progress reads beyond the study record: who is ahead, and the five attributes. Every number comes from the server. A person who keeps their
// rank or hours private is already left out of `rankings` for this viewer (S-8), so nothing here filters or hides anything itself. HP is never read:
// Native shows none (ADR 0017), and none of these answers carries it.
import { z } from "zod";
import type { BackendClient } from "./client";

export const rankingEntrySchema = z.object({
  id: z.number().int(), username: z.string(), name: z.string().nullable().optional(), hunterRank: z.string(), level: z.number(), currentXP: z.number().optional(),
  totalStudyMinutes: z.number(), studyHours: z.number().optional(), streakDays: z.number(), questsCompleted: z.number(), isCurrentUser: z.boolean(), rank: z.number().int(), friendRank: z.number().int().optional(),
}).loose();
export const rankingsSchema = z.object({ global: z.array(rankingEntrySchema), friends: z.array(rankingEntrySchema), currentUserRank: z.number(), totalPlayers: z.number() });
export type Rankings = z.infer<typeof rankingsSchema>;
export type RankingEntry = z.infer<typeof rankingEntrySchema>;
export type RankingSort = "level" | "studyHours" | "streak" | "quests";

const abilitySchema = z.object({ key: z.string(), label: z.string(), description: z.string(), perkName: z.string().optional(), perkLadder: z.string().optional(), value: z.number(), tier: z.number(), maxTier: z.number(), nextTierAt: z.number().nullable(), cap: z.number(), investable: z.boolean(), costSp: z.number(), costSylph: z.number() }).loose();
export const attributesSchema = z.object({ skillPoints: z.number(), sylph: z.number(), cap: z.number(), abilities: z.array(abilitySchema) }).loose();
export type Attributes = z.infer<typeof attributesSchema>;
export type Ability = z.infer<typeof abilitySchema>;
export type InvestCurrency = "sp" | "sylph";

export function createProgressReads(client: BackendClient) {
  return {
    rankings: (sortBy: RankingSort, signal: AbortSignal) => client.get(`/api/user/rankings?sortBy=${sortBy}`, rankingsSchema, { signal }),
    attributes: (signal: AbortSignal) => client.get("/api/cognitive-stats/invest", attributesSchema, { signal }),
    /** One step of five points in one attribute, paid in skill points or Sylph. The server prices it and refuses what cannot be afforded. */
    invest: (stat: string, currency: InvestCurrency) => client.send("POST", "/api/cognitive-stats/invest", { body: { stat, currency } }),
  };
}
