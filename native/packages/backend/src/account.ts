// Everything the Account page reads and writes, by name. The server decides every rule here: who may change an email, what a password must be, which device
// stays signed in. A refusal comes back in its own words, and `code: "password_incorrect"` is the one a screen answers in place. Nothing is stored here.
// The privacy levels are the three the database has. `GROUPS` exists in web's code and not in the database's enum, so no screen offers it.
import { z } from "zod";
import type { BackendClient } from "./client";

export const PRIVACY_LEVELS = ["PUBLIC", "FRIENDS", "PRIVATE"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];
export const PRIVACY_SETTINGS = ["profileVisibility", "showOnlineStatus", "showCurrentSession", "showStudyHours", "showRank", "showAchievements", "allowFriendRequests", "allowDirectMessages"] as const;
export type PrivacySetting = (typeof PRIVACY_SETTINGS)[number];
const level = z.string();
export const privacySchema = z.object({ profileVisibility: level, showOnlineStatus: level, showCurrentSession: level, showStudyHours: level, showRank: level, showAchievements: level, allowFriendRequests: level, allowDirectMessages: level }).loose();
export type Privacy = z.infer<typeof privacySchema>;

export const NOTIFICATION_KEYS = ["masterEnabled", "levelRankPromotions", "streakMilestones", "unlockedAchievements", "aiStudyPlans", "questAssignments", "scheduledFocusReminders", "incomingFriendRequests", "directMessages", "groupActivity"] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];
export const notificationPreferencesSchema = z.object({ preferences: z.object(Object.fromEntries(NOTIFICATION_KEYS.map((key) => [key, z.boolean().optional()]))).loose() });
export type NotificationPreferences = Partial<Record<NotificationKey, boolean>>;

export const deviceSessionsSchema = z.object({ sessions: z.array(z.object({ id: z.string(), device: z.string(), platform: z.string().optional(), location: z.string().optional(), lastActive: z.string(), isCurrent: z.boolean(), createdAt: z.string().optional() })) });
export type DeviceSession = z.infer<typeof deviceSessionsSchema>["sessions"][number];

export const connectionsSchema = z.object({ connections: z.array(z.object({ provider: z.string(), isLinked: z.boolean(), email: z.string().nullable().optional(), username: z.string().nullable().optional() })) });
export type Connection = z.infer<typeof connectionsSchema>["connections"][number];

/** What proves a person is the account's owner for a step that cannot be undone: an emailed code, or for an unverified account its password. */
export type Proof = { code: string } | { password: string };
export type SecurityAction = "RESET_PROGRESS" | "DELETE_ACCOUNT" | "CHANGE_EMAIL";

export interface ProfileChange {
  bio?: string | null;
  activeFrame?: string;
  activeTitle?: string;
  activeAura?: string;
  activeNameColor?: string;
  socialLinks?: Partial<Record<"github" | "linkedin" | "discord" | "twitter" | "website", string | null>>;
}

export function createAccountReads(client: BackendClient) {
  return {
    privacy: (signal: AbortSignal) => client.get("/api/user/privacy", privacySchema, { signal }),
    savePrivacy: (change: Partial<Record<PrivacySetting, PrivacyLevel>>) => client.send("PATCH", "/api/user/privacy", { body: change }),
    notificationPreferences: (signal: AbortSignal) => client.get("/api/notifications/preferences", notificationPreferencesSchema, { signal }),
    saveNotificationPreferences: (change: NotificationPreferences) => client.send("PATCH", "/api/notifications/preferences", { body: change }),
    devices: (signal: AbortSignal) => client.get("/api/user/sessions", deviceSessionsSchema, { signal }),
    /** Ends one device for real: the server refuses it from its next request on. */
    endDevice: (sessionId: string) => client.send("DELETE", "/api/user/sessions", { body: { sessionId } }),
    /** Signs every device out, this one included. An account with a password must give it. */
    signOutEverywhere: (password?: string) => client.send("POST", "/api/auth/logout-all", { body: password ? { password } : {} }),
    connections: (signal: AbortSignal) => client.get("/api/user/connections", connectionsSchema, { signal }),
    unlink: (provider: string) => client.send("DELETE", `/api/user/connections/${encodeURIComponent(provider.toLowerCase())}`),
    changePassword: (currentPassword: string, newPassword: string) => client.send("PATCH", "/api/user/security", { body: { action: "password", currentPassword, newPassword, confirmPassword: newPassword } }),
    /** Mails a six digit code to the account's address. The server limits it to three in ten minutes. */
    sendCode: (action: SecurityAction) => client.send("POST", "/api/user/security/send-code", { body: { action } }),
    resetProgress: (proof: Proof) => client.send("POST", "/api/user/reset-progress", { body: proof }),
    deleteAccount: (proof: Proof) => client.send("POST", "/api/user/account/delete", { body: proof }),
    saveProfile: (change: ProfileChange) => client.send("PATCH", "/api/profile/customization", { body: change }),
  };
}
