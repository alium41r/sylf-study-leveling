// Every read and write a Sylf Native screen makes, by name, so a screen never holds a path or a schema and @sylf/backend can stay behind import().
// Reads go through `client.get`, which retries, shares and parses. Writes go through `client.send`, which does neither on its own. Time never goes
// through here: it goes through the journal.
import { COSMETICS_CATALOG, getClassInfo } from "@sylf/shared/backend";
import type { BackendClient } from "./client";
import { BackendError } from "./errors";
import { createPlanReads } from "./plan";
import { createFocusReads } from "./focus";
import { createProgressReads } from "./progress";
import { createAccountReads } from "./account";
import { createSocialReads } from "./social";
import { createPartyReads } from "./party";
import { appendFile, type PickedFile } from "./files";

/** The server's limits (lib/ai/sylvie/image-contract.ts). Saying so before the upload saves a slow request that is certain to fail. */
export const SYLVIE_IMAGE_LIMIT = 4;
export const SYLVIE_IMAGE_BYTES = 5 * 1024 * 1024;
import { insightsSchema, pendingActionSchema, type PendingAction, achievementsSchema, calendarRangeSchema, chatMessagesSchema, chatsSchema, cosmeticsSchema, earnedThisWeekSchema, focusPartySchema, friendRequestsSchema, friendsSchema, goalsSchema, plannerCapabilitiesSchema, questDaySchema, recentSessionsSchema, soundsSchema, studyScheduleSchema, studySummarySchema, subjectsSchema, userStatsSchema, type Quest } from "./contracts";

export interface SylvieTurn {
  /** Text so far, as it arrives. */
  onDelta(text: string): void;
  /** A reply can start again when the model changes course. */
  onReset(): void;
  onSession(sessionId: number): void;
  /** What the server is doing before words arrive, in its own terms ("searching", "checking your calendar"). Shown as status, never as a typing effect. */
  onStatus?(status: string): void;
}

/** `day` and `endDay` are local to `timezone`, which the server checks. An all-day event has no instants. */
export interface NewCalendarEvent { id: string; title: string; day: string; endDay: string; startsAt: string | null; endsAt: string | null; timezone: string }

const dayAfter = (day: string) => { const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); };

export function createReads(client: BackendClient) {
  return {
    plan: createPlanReads(client),
    focus: createFocusReads(client),
    progress: createProgressReads(client),
    account: createAccountReads(client),
    social: createSocialReads(client),
    parties: createPartyReads(client),
    /** The catalog's name and rarity for something a person owns. Unknown keys read as themselves. */
    cosmetic(category: keyof typeof COSMETICS_CATALOG | string, key: string) {
      const item = (COSMETICS_CATALOG as Record<string, { id: string; name: string; rarity: string }[]>)[category]?.find((entry) => entry.id === key);
      return { name: item?.name ?? key, rarity: item?.rarity ?? "Common" };
    },
    className: (key: string | null | undefined) => getClassInfo(key).name,
    stats: (signal: AbortSignal) => client.get("/api/user/stats", userStatsSchema, { signal }),
    schedule: (signal: AbortSignal) => client.get("/api/user/study-schedule", studyScheduleSchema, { signal }),
    saveSchedule: (change: { dailyGoalMinutes?: number; restDays?: number[] }) => client.send("PATCH", "/api/user/study-schedule", { body: change }),
    /** Finishes the first-run questions. The server makes each subject's code, and answers with no change if this already happened. */
    completeOnboarding: (answers: { subjects: { name: string; examBoard?: string; level?: string }[]; timezone?: string }) => client.send("POST", "/api/user/onboarding", { body: { ...answers, classId: "class_scholar" } }),
    saveAccount: (change: { name?: string; username?: string; email?: string; timezone?: string; currentPassword?: string; code?: string }) => client.send("PATCH", "/api/user/account", { body: change }),
    heartbeat: () => client.send("POST", "/api/user/heartbeat"),
    subjects: (signal: AbortSignal) => client.get("/api/subjects", subjectsSchema, { signal }),
    recentSessions: (limit: number, signal: AbortSignal) => client.get(`/api/sessions?limit=${limit}`, recentSessionsSchema, { signal }),
    studySummary: (signal: AbortSignal) => client.get("/api/user/detailed-stats?summary=true", studySummarySchema, { signal }),
    achievements: (signal: AbortSignal) => client.get("/api/achievements", achievementsSchema, { signal }),
    /** The student's today, decided by the server in their timezone. */
    questsToday: (signal: AbortSignal) => client.get("/api/quests", questDaySchema, { signal }),
    goals: (signal: AbortSignal) => client.get("/api/goals", goalsSchema, { signal }),
    /** `end` is exclusive, and the server accepts up to 93 days. */
    calendar: (start: string, end: string, signal: AbortSignal) => client.get(`/api/calendar/personal?start=${start}&end=${end}`, calendarRangeSchema, { signal }),
    planner: (signal: AbortSignal) => client.get("/api/planner/capabilities", plannerCapabilitiesSchema, { signal }),
    friends: (signal: AbortSignal) => client.get("/api/friends", friendsSchema, { signal }),
    friendRequests: (signal: AbortSignal) => client.get("/api/friends/requests", friendRequestsSchema, { signal }),
    party: (signal: AbortSignal) => client.get("/api/focus-party", focusPartySchema, { signal }),
    cosmetics: (signal: AbortSignal) => client.get("/api/cosmetics", cosmeticsSchema, { signal }),
    earnedThisWeek: (signal: AbortSignal) => client.get("/api/user/earned-this-week", earnedThisWeekSchema, { signal }),
    sounds: (signal: AbortSignal) => client.get("/api/acoustics", soundsSchema, { signal }),
    /** What Sylvie noticed lately. Read-only: the server has no way to dismiss one. */
    insights: (signal: AbortSignal) => client.get("/api/insights", insightsSchema, { signal }),
    /** Today's unread briefing, if the morning job wrote one. Never required: an empty answer is normal. */
    briefing: (signal: AbortSignal) => client.get("/api/system-messages?type=DAILY_BRIEFING&global=true&limit=1&unreadOnly=true", chatMessagesSchema, { signal }),
    chats: (signal: AbortSignal) => client.get("/api/chats?limit=20", chatsSchema, { signal }),
    chatMessages: (chatId: number, signal: AbortSignal) => client.get(`/api/system-messages?sessionId=${chatId}&limit=50`, chatMessagesSchema, { signal }),

    /**
     * Marks a quest done through the server's own rules: a planned quest goes through the versioned protocol, and rewards are the server's.
     * A conflict means something moved on, and the caller reloads.
     */
    completeQuest: (quest: Pick<Quest, "id" | "plannedMinutes" | "executionVersion">) => client.send("PATCH", `/api/quests/${quest.id}`, { body: quest.plannedMinutes != null ? { status: "COMPLETED", executionProtocol: 2, expectedExecutionVersion: quest.executionVersion } : { status: "COMPLETED" } }),
    claimAchievement: (achievementId: string) => client.send("POST", "/api/achievements", { body: { achievementId } }),
    acceptFriend: (requestId: number, accept: boolean) => client.send("PATCH", `/api/friends/requests/${requestId}`, { body: { action: accept ? "ACCEPT" : "REJECT" } }),
    /** One new event, on one day. Edits, repeats and shared calendars stay on the web for now. */
    createEvent: ({ id, title, day, endDay, startsAt, endsAt, timezone }: NewCalendarEvent) => client.send("POST", "/api/calendar/personal", { body: { kind: "event", id, revision: 1, data: { title, description: "", color: "BLUE", allDay: startsAt === null, startDate: day, endDate: startsAt === null ? dayAfter(day) : endDay, startsAt, endsAt, timezone } } }),

    /**
     * Confirms a change Sylvie proposed, by sending back the server's own token. The server runs exactly what it signed, once. A later message from
     * the person, an expired token or a calendar that moved on makes it refuse with its own words, and nothing is changed. Never automatic.
     */
    confirmSylvieAction: (chatId: number, token: string) => client.send("POST", "/api/system-messages/chat", { body: { sessionId: chatId, confirmationToken: token }, timeoutMs: 60_000 }),

    /** One turn with Sylvie, read as it arrives. Quotas, tools and every model choice stay on the server. Resolves with the full reply. */
    /** What the server accepts with a message, so a screen can say so before anyone picks a file. */
    sylvieImages: { limit: SYLVIE_IMAGE_LIMIT, bytes: SYLVIE_IMAGE_BYTES },
    async sendToSylvie(message: string, chatId: number | null, turn: SylvieTurn, signal: AbortSignal, images: PickedFile[] = []): Promise<{ reply: string; chatId: number | null; pendingAction: PendingAction | null; planRequest: string | null }> {
      let buffer = "";
      let text = "";
      let reply: string | null = null;
      let session = chatId;
      let pendingAction: PendingAction | null = null;
      let planRequest: string | null = null;
      let failure: BackendError | null = null;
      const frame = (raw: string) => {
        const lines = raw.split("\n");
        const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!event || !data) return;
        let value: { text?: unknown; sessionId?: unknown; reply?: unknown; error?: unknown; message?: unknown; status?: unknown; pendingAction?: unknown; plannerHandoff?: unknown; phase?: unknown; label?: unknown };
        try { value = JSON.parse(data); } catch { return; }
        if (event === "delta" && typeof value.text === "string") { text += value.text; turn.onDelta(text); }
        else if (event === "reset") { text = ""; turn.onReset(); }
        else if (event === "session" && typeof value.sessionId === "number") { session = value.sessionId; turn.onSession(value.sessionId); }
        else if (event === "status" && typeof (value.label ?? value.phase ?? value.message) === "string") turn.onStatus?.(String(value.label ?? value.phase ?? value.message));
        else if (event === "result") { if (typeof value.sessionId === "number") session = value.sessionId; reply = typeof value.reply === "string" ? value.reply : text; const pending = pendingActionSchema.safeParse(value.pendingAction); pendingAction = pending.success ? pending.data : null; const handoff = value.plannerHandoff as { request?: unknown } | null | undefined; planRequest = typeof handoff?.request === "string" && handoff.request.trim() ? handoff.request.trim().slice(0, 2000) : null; }
        else if (event === "error") failure = new BackendError(value.status === 429 ? "rate-limited" : "server", typeof value.error === "string" && Number(value.status) < 500 ? value.error : "Sylvie could not answer just now. Try again shortly.");
      };
      if (images.length > SYLVIE_IMAGE_LIMIT) throw new BackendError("invalid", `Attach up to ${SYLVIE_IMAGE_LIMIT} images at a time.`);
      if (images.some((image) => image.size !== undefined && image.size > SYLVIE_IMAGE_BYTES)) throw new BackendError("invalid", "Each image must be 5 MB or less.");
      // Images go as multipart, with the field names the web uses. Without them the request is the same JSON as ever, so a text turn never changes.
      let body: string | FormData;
      if (images.length) {
        const form = new FormData();
        form.set("message", message);
        if (chatId) form.set("sessionId", String(chatId));
        images.forEach((image) => appendFile(form, "images", image));
        body = form;
      } else body = JSON.stringify({ message, ...(chatId ? { sessionId: chatId } : {}) });
      await client.stream("/api/system-messages/chat", { method: "POST", signal, headers: { ...(images.length ? {} : { "Content-Type": "application/json" }), Accept: "text/event-stream" }, body }, (chunk) => {
        buffer += chunk.replace(/\r\n/g, "\n");
        for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) { frame(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
      });
      if (failure) throw failure;
      if (reply === null) throw new BackendError("server", "Sylvie's answer stopped before it finished.");
      return { reply, chatId: session, pendingAction, planRequest };
    },
  };
}
export type Reads = ReturnType<typeof createReads>;
