// An isolated loopback server for Electron checks. It serves existing audio assets and keeps all test data in memory.
import { randomUUID } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

export const FIXTURE_LOGIN = { identifier: "native_qa", password: "fixture-only" };
export const EMPTY_LOGIN = { identifier: "empty_qa", password: FIXTURE_LOGIN.password };
export const AUDIO_FILE = fileURLToPath(new URL("../../../../public/audio/ambient/rain.wav", import.meta.url));
const TRACKS = [
  { id: 1, title: "Forest Wind & Leaves", category: "NATURE", audioUrl: "/audio/ambient/wind.ogg" },
  { id: 10, title: "Mechanical Typing Room", category: "AMBIENT", audioUrl: "/audio/ambient/keyboard.wav" },
  { id: 999, title: "Unavailable track", category: "AMBIENT", audioUrl: "/audio/missing.wav" },
];
const media = new Map(TRACKS.slice(0, 2).map(({ audioUrl }) => [audioUrl, fileURLToPath(new URL(`../../../../public${audioUrl}`, import.meta.url))]));
const dayKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const dayAt = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return dayKey(date); };

export async function startFrontendFixture() {
  const tokens = new Map();
  const today = dayAt(0);
  const start = new Date();
  start.setHours(22, 0, 0, 0);
  const timeBlock = { id: "qa-study", revision: 1, title: "Review motion graphs", category: "time-block", allDay: false, startDate: today, endDate: today, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2_700_000).toISOString() };
  const dayEvent = { id: "qa-lab", revision: 1, title: "Bring the lab notebook", allDay: true, startDate: today, endDate: dayAt(1), startsAt: null, endsAt: null };
  const subject = { id: 12, name: "Physics", code: "PHY", color: "BLUE" };
  const quests = [
    { id: 31, title: "Solve the velocity problems", status: "PENDING", scheduledFor: today, subjectId: 12, plannedMinutes: 35, subject },
    { id: 32, title: "Finish the lab write-up", status: "PENDING", scheduledFor: today, subjectId: 12, plannedMinutes: 30, subject },
    { id: 33, title: "Read the optics chapter", status: "PENDING", scheduledFor: dayAt(2), subjectId: 12, targetMinutes: 25, subject },
  ];
  // Home's social and goal data for the signed-in fixture account. A request and an invitation can each be answered once, as on the server.
  const friends = [
    { id: 21, name: "Aiko Tanaka", username: "aiko", hunterRank: "D", level: 12, todaySeconds: 5400, isOnline: true, isStudying: true, activeSessionStartedAt: new Date(Date.now() - 40 * 60_000).toISOString() },
    { id: 22, name: "Sam Okafor", username: "samo", hunterRank: null, level: null, todaySeconds: 0, isOnline: true, isStudying: false, activeSessionStartedAt: null, visible: { hours: false, session: true, online: true, rank: false } },
    { id: 23, name: "Lena Fischer", username: "lena", hunterRank: "E", level: 4, todaySeconds: 0, isOnline: false, isStudying: false, activeSessionStartedAt: null },
  ];
  const friendRequests = [{ id: 71, sender: { id: 24, name: "Mira Chen", username: "mira" } }];
  const partyInvites = [{ id: 91, partyName: "Night owls", senderName: "Aiko Tanaka", senderUsername: "aiko" }];
  const goals = [{ id: 5, title: "Mechanics exam", status: "ACTIVE", targetDate: dayAt(20), quests: [{ id: 30, status: "COMPLETED" }, { id: 31, status: "PENDING" }, { id: 32, status: "PENDING" }] }];
  const mediaResponses = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const json = (body, status = 200) => res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body));
    const body = async () => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { return {}; }
    };

    if (media.has(path)) {
      const file = media.get(path);
      const size = statSync(file).size;
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = Math.min(size - 1, range?.[2] ? Number(range[2]) : size - 1);
      if (start > end) return res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      const status = range ? 206 : 200;
      mediaResponses.push({ path, status, bytes: end - start + 1, credentials: Boolean(req.headers.authorization || req.headers.cookie) });
      res.writeHead(status, {
        "Content-Type": path.endsWith(".wav") ? "audio/wav" : "audio/ogg",
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(file, { start, end }).pipe(res);
    }

    if (path === "/api/auth/native/login") {
      const { identifier, password } = await body();
      if (![FIXTURE_LOGIN.identifier, EMPTY_LOGIN.identifier].includes(identifier) || password !== FIXTURE_LOGIN.password) return json({ error: "Invalid credentials", code: "invalid_credentials" }, 401);
      const userId = identifier === FIXTURE_LOGIN.identifier ? 801 : 802;
      const user = {
        id: userId, name: userId === 801 ? "Native QA" : "Empty QA", username: identifier, email: `${identifier}@local.test`,
        scholarId: null, verificationStatus: "VERIFIED", hunterRank: "E", level: userId === 801 ? 7 : 1, hasCompletedOnboarding: true, avatarUrl: null,
      };
      const accessToken = randomUUID();
      const session = { accessToken, accessExpiresAt: Date.now() + 3_600_000, refreshToken: randomUUID(), sessionId: randomUUID(), userId };
      tokens.set(accessToken, user);
      return json({ session, user });
    }
    if (path === "/api/auth/native/logout") return json({ success: true });
    if (path === "/api/auth/native/ping") return json({ ok: true });
    if (path === "/api/acoustics") return json({ tracks: TRACKS });
    if (path.startsWith("/audio/")) return json({ error: "File not found" }, 404);

    const user = tokens.get(req.headers.authorization?.replace(/^Bearer /, ""));
    if (!user) return json({ error: "Sign in to continue" }, 401);
    const full = user.id === 801;
    const schedule = { dailyGoalMinutes: full ? 90 : 0, restDays: [] };
    if (path === "/api/quests") return json(url.searchParams.has("all") ? { quests: full ? quests : [], nextCursor: null } : full ? quests.filter((quest) => quest.scheduledFor === today) : []);
    if (full && path.startsWith("/api/quests/") && req.method === "PATCH") {
      const quest = quests.find((item) => item.id === Number(path.split("/").at(-1)));
      if (!quest) return json({ error: "Quest not found" }, 404);
      quest.status = (await body()).status;
      return json(quest);
    }
    if (full && req.method === "PATCH" && path.startsWith("/api/friends/requests/")) {
      const index = friendRequests.findIndex((item) => item.id === Number(path.split("/").at(-1)));
      if (index < 0) return json({ error: "Request not found" }, 404);
      const [request] = friendRequests.splice(index, 1);
      if ((await body()).action === "ACCEPT") friends.push({ id: request.sender.id, name: request.sender.name, username: request.sender.username, hunterRank: "E", level: 2, todaySeconds: 0, isOnline: true, isStudying: false, activeSessionStartedAt: null });
      return json({ success: true });
    }
    if (full && req.method === "PATCH" && path.startsWith("/api/focus-party/invites/")) {
      const index = partyInvites.findIndex((item) => item.id === Number(path.split("/").at(-1)));
      if (index < 0) return json({ error: "Invitation not found" }, 404);
      partyInvites.splice(index, 1);
      return json({ success: true });
    }
    const responses = {
      "/api/user/stats": { ...user, hasCompletedOnboarding: true, hunterRank: "E", level: full ? 7 : 1, currentXP: full ? 120 : 0, xpToNextLevel: 360, streakDays: full ? 3 : 0, sylph: full ? 340 : 0 },
      "/api/user/study-schedule": schedule,
      "/api/user/detailed-stats": { todayDate: today, dailyStudy: full ? [{ date: dayAt(-2), minutes: 76 }, { date: dayAt(-1), minutes: 54 }, { date: today, minutes: 42 }] : [], subjectBreakdown: [], summary: { totalSessions: full ? 3 : 0, activeDaysLast30: full ? 3 : 0, avgSessionSeconds: 0, longestSessionSeconds: 0 } },
      "/api/user/earned-this-week": { xp: full ? 120 : 0, sylph: full ? 340 : 0 },
      "/api/calendar/personal": { events: full ? [timeBlock, dayEvent] : [] },
      "/api/calendar/month": { ...schedule, year: Number(url.searchParams.get("year")), month: Number(url.searchParams.get("month")), monthName: new Date().toLocaleDateString([], { month: "long" }), days: [], milestones: [], floatingRestDays: [], monthStats: { totalMinutes: 0, activeDays: 0, goalsMetDays: 0 } },
      "/api/quests/weekly": { targetMinutes: 240, progressMinutes: full ? 172 : 0, percentComplete: full ? 72 : 0, isCompleted: false },
      "/api/goals": full ? goals : [],
      "/api/subjects": full ? [subject] : [],
      "/api/sessions": { sessions: [], nextCursor: null },
      "/api/friends": full ? friends : [],
      "/api/friends/requests": full ? friendRequests : [],
      "/api/focus-party": { activeParty: null, pendingInvites: full ? partyInvites : [] },
      "/api/user/heartbeat": {},
      "/api/focus-backgrounds": { categories: [] },
      "/api/focus-backgrounds/preference": { selection: { source: "classic" } },
      "/api/system-messages": { messages: [] },
      "/api/chats": { sessions: [], nextCursor: null },
      "/api/insights": [],
      "/api/cosmetics": { cosmetics: [], active: { activeTitle: null, activeAvatar: null, activeFrame: null, activeNameColor: null } },
      "/api/achievements": { achievements: [] },
      "/api/planner/capabilities": { today, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, restDays: [] },
    };
    if (Object.hasOwn(responses, path)) return json(responses[path]);
    return json({ error: "Route unavailable in this check" }, 404);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback fixture did not bind");
  return { origin: `http://127.0.0.1:${address.port}`, mediaResponses, close: () => { server.close(); server.closeAllConnections(); } };
}
