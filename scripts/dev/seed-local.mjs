/** Seeds a LOCAL disposable backend with a believable student and friends, through the real API, so both apps can be inspected with live data.
 *   node scripts/dev/seed-local.mjs [--backend http://127.0.0.1:3111]
 * Prints the sign-in details. Refuses anything that is not this machine.
 */
import { randomUUID } from "node:crypto";

const backendArg = process.argv.indexOf("--backend");
const base = backendArg > 0 ? process.argv[backendArg + 1] : "http://127.0.0.1:3111";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error("Local backends only.");
const PASSWORD = "a-long-enough-password";
let device = 40;
const call = async (token, method, path, body) => {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "x-real-ip": `10.50.0.${device}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
};
const register = async (name, username) => {
  device++;
  const made = await call(null, "POST", "/api/auth/native/register", { email: `${username}@local.test`, password: PASSWORD, name, username, timezone: "Europe/London", clientName: "Seed" });
  if (!made.json?.session?.accessToken) throw new Error(`register ${username}: ${made.status} ${JSON.stringify(made.json)}`);
  return { token: made.json.session.accessToken, id: made.json.session.userId, username };
};
const day = (offset) => { const date = new Date(Date.now() + offset * 86_400_000); return date.toISOString().slice(0, 10); };

const alice = await register("Alice Quill", "alice");
const bob = await register("Bob Marsh", "bob");
const cara = await register("Cara Idris", "cara");
const dev = await register("Dev Anand", "dev");

const subjects = {};
for (const [name, code, color] of [["Physics", "PHY", "blue"], ["Mathematics", "MAT", "violet"], ["Chemistry", "CHE", "green"], ["English Literature", "ENG", "amber"]]) {
  const made = await call(alice.token, "POST", "/api/subjects", { name, code, color });
  subjects[name] = made.json?.id;
}
const goal = await call(alice.token, "POST", "/api/goals", { title: "Mock exams", targetDate: day(40) });
for (const [title, offset, minutes, subject, difficulty] of [
  ["Waves: past paper", 0, 45, "Physics", "MEDIUM"], ["Integration by parts", 0, 30, "Mathematics", "HARD"], ["Organic reactions summary", 1, 40, "Chemistry", "MEDIUM"],
  ["Macbeth: key quotes", 2, 25, "English Literature", "EASY"], ["Mechanics problem set", 3, 50, "Physics", "HARD"], ["Differential equations", 5, 45, "Mathematics", "HARD"],
]) await call(alice.token, "POST", "/api/quests", { title, scheduledFor: day(offset), targetMinutes: minutes, difficulty, subjectId: subjects[subject], goalId: goal.json?.id ?? null });
await call(alice.token, "POST", "/api/calendar/personal", { kind: "event", id: randomUUID(), revision: 1, data: { title: "Physics mock", description: "", color: "blue", allDay: false, startDate: day(6), endDate: day(6), startsAt: `${day(6)}T09:00:00.000Z`, endsAt: `${day(6)}T11:00:00.000Z`, timezone: "Europe/London" } });

// A few finished study sessions across the past week, through the real protocol.
for (const [ago, minutes, subject] of [[1, 50, "Physics"], [2, 35, "Mathematics"], [2, 25, "Chemistry"], [4, 60, "Physics"], [5, 40, "English Literature"]]) {
  const key = randomUUID();
  const started = new Date(Date.now() - ago * 86_400_000 - minutes * 60_000).toISOString();
  const start = await call(alice.token, "POST", "/api/sessions", { executionProtocol: 2, clientSessionKey: key, startedAt: started, subjectId: subjects[subject] });
  if (!start.json?.id) continue;
  await call(alice.token, "PATCH", "/api/sessions", { executionTransition: { schemaVersion: 2, sessionId: start.json.id, action: "END", expectedExecutionVersion: start.json.execution?.executionVersion, idempotencyKey: randomUUID(), cumulativeFocusSeconds: minutes * 60, cumulativeBreakSeconds: 120 } });
}

// Friends: Bob and Cara accepted, Dev has asked.
for (const other of [bob, cara]) {
  await call(other.token, "POST", "/api/friends/requests", { username: alice.username });
  const pending = await call(alice.token, "GET", "/api/friends/requests");
  const request = (Array.isArray(pending.json) ? pending.json : pending.json?.requests ?? []).find((item) => item.id);
  if (request) await call(alice.token, "PATCH", `/api/friends/requests/${request.id}`, { action: "ACCEPT" });
}
await call(dev.token, "POST", "/api/friends/requests", { username: alice.username });
const chat = await call(alice.token, "POST", "/api/conversations", { participantIds: [bob.id], isGroup: false });
if (chat.json?.id) { await call(bob.token, "POST", `/api/conversations/${chat.json.id}/messages`, { content: "Did you finish the waves paper?" }); await call(alice.token, "POST", `/api/conversations/${chat.json.id}/messages`, { content: "Halfway. Question 4 is brutal." }); await call(bob.token, "POST", `/api/conversations/${chat.json.id}/messages`, { content: "Same. Study session at 8?" }); }
const party = await call(bob.token, "POST", "/api/focus-party", { name: "Night owls" });
if (party.json?.partyId) await call(bob.token, "POST", `/api/focus-party/${party.json.partyId}/invite`, { friendId: alice.id });

console.log(JSON.stringify({ signIn: { email: "alice@local.test", username: "alice", password: PASSWORD }, others: ["bob", "cara", "dev"], subjects, goal: goal.json?.id }, null, 1));
