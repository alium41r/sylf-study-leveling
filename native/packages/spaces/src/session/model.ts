// The one study session (master plan §3.2): a shell-level service that outlives every Space, created outside React like the Spaces
// store. The dock, Home's Focus and Workspace's Timer are three views of this object, and none of them keeps time. Elapsed time is
// always derived from the epoch snapshots of Sylf's own timer engine, so navigation, unmounting, backgrounding and a process kill lose
// nothing, and there is no tick to drift. Every change is written at once, because a session must survive whatever comes next.
//
// Time here is tracked on this device, and nothing in this file reaches a server. `createSessionBridge` in @sylf/backend reads this model
// and writes to the existing timer journal, and the journal delivers through SessionProtocolV2. What the server accepts comes back through
// `settleAccepted`, which is the only way a record becomes `saved`. Rewards are never computed on the client.
import { modes, timer } from "@sylf/shared";

export type TimerSnapshot = timer.TimerSnapshot;
export type SessionStatus = "idle" | "running" | "paused" | "finished";

export const STUDY_SESSION_STORAGE_KEY = "sylf.native.study-session.v1";
/** Minutes. null is a session with no limit, which is the web timer's stopwatch mode. */
export type SessionLength = number | null;
export const SESSION_LENGTHS: readonly SessionLength[] = [15, 25, 50, 90, null];
export const DEFAULT_SESSION_LENGTH: SessionLength = 25;
export const sessionLengthLabel = (length: SessionLength) => (length === null ? "No limit" : `${length} min`);
export const DEFAULT_SESSION_TITLE = "Study session";
/** How a session is shaped. "countdown" is one block of the chosen length, as before modes existed. The others are web's seven modes, from lib/timer-modes.ts. */
export type SessionMode = "countdown" | modes.StudyModeId;
export const SESSION_MODES: readonly SessionMode[] = ["countdown", ...modes.STUDY_MODES.map((mode) => mode.id)];
const isMode = (value: unknown): value is SessionMode => value === "countdown" || modes.isStudyModeId(value);
/** A mode's settings, starting from its definition. A person's changes are kept on this device, as web keeps them. */
export const sessionModeSettings = (state: Pick<StudySessionState, "modeSettings">, mode: modes.StudyModeId): modes.ModeSettings => ({ ...modes.defaultModeSettings(mode), ...state.modeSettings?.[mode] });
/** The most one session can credit on the server. Time past this still ends normally, and the screens say that it does not count. */
export const MAX_CREDITED_FOCUS_SECONDS = timer.MAX_SESSION_FOCUS_SECONDS;

/** Exactly the web journal's operation (lib/timer-sync.ts), so Phase 13 can hand these over unchanged. Start is the session itself. */
export interface SessionOperation { id: string; action: "PAUSE" | "RESUME" | "END"; sequence: number; focus: number; breaks: number; at: string }

/** What the next session is about. One choice, seen from all three surfaces, like the length. Ids exist only for a signed-in person's data. */
export interface SessionPlan { title: string | null; subject: string | null; subjectId: number | null; questId: number | null }

/**
 * A session studied inside a party's room (ADR 0015 decision 11). It is the same session: its time, its record and its credit are the study
 * session's alone, so the party adds no second clock and no second reward. The room is only where the others see you. `roomSessionId` and
 * `joinedAt` arrive once the server has seated this person, and they let a lost exit be replayed exactly (TimerSync's party branch).
 */
export interface SessionParty { partyId: number; name: string | null; roomSessionId: number | null; joinedAt: string | null }

/** What both kinds of record carry about their way to the server. */
interface SessionDelivery {
  /** Present when this session is studied with a party. */
  party?: SessionParty;
  /** The account signed in when it started, for good. Null is a session that belongs to nobody, and it is never delivered (ADR 0010). */
  ownerId: number | null;
  subjectId: number | null;
  questId: number | null;
  /** The last operation already handed to the journal. A crash between the two writes replays one, and the journal's protocol absorbs it. */
  journaled: number;
  /** Someone was asked whether this ownerless session should join their record and said no. It is not asked again (ADR 0010 decision 6). */
  declined: boolean;
}

/** Where a mode session is. Absent on a countdown. `seconds` is the length of the phase now running, for drawing its progress. */
export interface ActivePhase { mode: modes.StudyModeId; label: string; round: number; rounds: number; seconds: number | null }

export interface ActiveSession extends SessionDelivery {
  phase?: ActivePhase;
  /** TimerSessionStart.clientKey: one stable identity, so a replayed start can never make a second StudySession. */
  clientKey: string;
  title: string;
  subject: string | null;
  startedAt: number;
  length: SessionLength;
  snapshot: TimerSnapshot;
  operations: SessionOperation[];
}

/** Finished on this device. `saved` flips in `settleAccepted`, when the server has accepted it, and nowhere else. */
export interface EndedSession extends SessionDelivery {
  clientKey: string;
  title: string;
  subject: string | null;
  startedAt: number;
  endedAt: number;
  focusSeconds: number;
  breakSeconds: number;
  operations: SessionOperation[];
  saved: boolean;
  /** StudySession.id, once the server has answered. */
  serverId: number | null;
  /** What the server credited, which can be less than `focusSeconds`. Null until it answers. */
  acceptedFocusSeconds: number | null;
}

/** What the server said about a session that is over. */
export interface AcceptedOutcome { serverId: number; focusSeconds: number; breakSeconds: number; endedAt?: string | null }

export interface StudySessionState {
  version: 1;
  /** The length the next session will have. One choice, seen from all three surfaces. */
  length: SessionLength;
  /** The subject and task the next session starts with. Personal, so it goes when the account changes. */
  plan: SessionPlan | null;
  /** How the next session is shaped. Absent in records from before modes, which read as a countdown. */
  mode?: SessionMode;
  modeSettings?: Partial<Record<modes.StudyModeId, Record<string, boolean | number | string>>>;
  active: ActiveSession | null;
  ended: EndedSession[];
}

export interface SessionReadout {
  status: SessionStatus;
  /** What a clock shows: time left on a countdown, time so far with no limit, or the chosen length when idle. */
  clock: number;
  focusSeconds: number;
  breakSeconds: number;
  /** 0 to 1 through a countdown, or null when there is no limit. In a mode, through the phase now running. */
  fraction: number | null;
  /** The phase now running, and the words a timer shows for it. Focus on a countdown. */
  phase: timer.TimerPhase;
  label: string | null;
}

export const INITIAL_SESSION_STATE: StudySessionState = { version: 1, length: DEFAULT_SESSION_LENGTH, plan: null, active: null, ended: [] };
const MAX_ENDED = 12;
const MAX_OPERATIONS = 64;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isLength = (value: unknown): value is SessionLength => value === null || (finite(value) && value > 0);
const statusOf = (active: ActiveSession | null): SessionStatus => (!active ? "idle" : active.snapshot.phase === "done" ? "finished" : active.snapshot.isPaused ? "paused" : "running");

/** The same m:ss the web timer shows, growing an hours place only when it needs one. */
export function formatSessionClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
}

/** What a person hears: "12 minutes" rather than a row of digits. */
export function speakSessionClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const parts = [[Math.floor(total / 3600), "hour"], [Math.floor((total % 3600) / 60), "minute"], [total % 60, "second"]] as const;
  const said = parts.filter(([value]) => value > 0).map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`);
  return said.length ? said.join(" ") : "0 seconds";
}

export function readSession(state: StudySessionState, now: number): SessionReadout {
  const { active } = state;
  if (!active) {
    const mode = state.mode ?? "countdown";
    const start = mode === "countdown" ? null : modes.modeStart(mode, sessionModeSettings(state, mode));
    const idle = start ? start.seconds : state.length === null ? null : Math.round(state.length * 60);
    return { status: "idle", clock: idle ?? 0, focusSeconds: 0, breakSeconds: 0, fraction: idle === null ? null : 0, phase: "focus", label: start?.label ?? null };
  }
  const derived = timer.deriveTimer(active.snapshot, now);
  if (active.phase) {
    const seconds = active.phase.seconds;
    const remaining = derived.remainingSec;
    const breaking = timer.isBreakPhase(active.snapshot.phase);
    return { status: statusOf(active), clock: remaining !== null ? remaining : breaking ? derived.breakSec : derived.focusSec, focusSeconds: derived.focusSec, breakSeconds: derived.breakSec, fraction: seconds && remaining !== null ? Math.min(1, 1 - remaining / seconds) : null, phase: active.snapshot.phase, label: active.phase.label };
  }
  const total = active.length === null ? null : Math.round(active.length * 60);
  const fraction = total === null ? null : Math.min(1, derived.focusSec / Math.max(1, total));
  return { status: statusOf(active), clock: total !== null && active.snapshot.remainingMs !== null ? derived.remainingSec ?? 0 : derived.focusSec, focusSeconds: derived.focusSec, breakSeconds: derived.breakSec, fraction, phase: active.snapshot.phase, label: null };
}

const isSnapshot = (value: unknown): value is TimerSnapshot => {
  const s = value as Partial<TimerSnapshot> | null;
  return !!s && s.v === 2 && finite(s.focusMs) && finite(s.breakMs) && (s.runningSinceMs === null || finite(s.runningSinceMs)) && typeof s.isPaused === "boolean" && (s.remainingMs === null || finite(s.remainingMs)) && finite(s.timestamp) && ["focus", "short-break", "long-break", "rest", "done"].includes(s.phase as string);
};
/** Anything but a real account id reads as nobody's, which is what Phase 10's stored sessions are. */
const parseOwner = (raw: unknown) => (Number.isSafeInteger(raw) && (raw as number) > 0 ? (raw as number) : null);
const parseId = parseOwner;
function parseParty(raw: unknown): SessionParty | null {
  const value = raw as Partial<SessionParty> | null;
  if (!value || typeof value !== "object" || !finite(value.partyId) || value.partyId <= 0) return null;
  return { partyId: value.partyId, name: typeof value.name === "string" ? value.name : null, roomSessionId: finite(value.roomSessionId) && value.roomSessionId > 0 ? value.roomSessionId : null, joinedAt: typeof value.joinedAt === "string" ? value.joinedAt : null };
}
const parseDelivery = (value: Partial<SessionDelivery>): SessionDelivery => ({ ...(parseParty(value.party) ? { party: parseParty(value.party)! } : {}), ownerId: parseOwner(value.ownerId), subjectId: parseId(value.subjectId), questId: parseId(value.questId), journaled: finite(value.journaled) ? value.journaled : 0, declined: value.declined === true });
const parseOperations = (raw: unknown): SessionOperation[] => (Array.isArray(raw) ? raw.filter((op): op is SessionOperation => !!op && typeof op.id === "string" && ["PAUSE", "RESUME", "END"].includes(op.action) && finite(op.sequence) && finite(op.focus) && finite(op.breaks) && typeof op.at === "string") : []);

function parsePhase(raw: unknown): ActivePhase | null {
  const value = raw as Partial<ActivePhase> | null;
  if (!value || typeof value !== "object" || !modes.isStudyModeId(value.mode) || typeof value.label !== "string" || !finite(value.round) || !finite(value.rounds)) return null;
  return { mode: value.mode, label: value.label, round: value.round, rounds: value.rounds, seconds: finite(value.seconds) ? value.seconds : null };
}

function parseModeSettings(raw: unknown): StudySessionState["modeSettings"] {
  if (!raw || typeof raw !== "object") return undefined;
  const out: NonNullable<StudySessionState["modeSettings"]> = {};
  for (const [mode, settings] of Object.entries(raw)) {
    if (!modes.isStudyModeId(mode) || !settings || typeof settings !== "object") continue;
    out[mode] = Object.fromEntries(Object.entries(settings).filter(([, item]) => ["boolean", "number", "string"].includes(typeof item) && (typeof item !== "number" || Number.isFinite(item)))) as Record<string, boolean | number | string>;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseActive(raw: unknown): ActiveSession | null {
  const value = raw as Partial<ActiveSession> | null;
  if (!value || typeof value !== "object" || typeof value.clientKey !== "string" || typeof value.title !== "string" || !finite(value.startedAt) || !isLength(value.length) || !isSnapshot(value.snapshot)) return null;
  const phase = parsePhase(value.phase);
  return { ...parseDelivery(value), clientKey: value.clientKey, title: value.title, subject: typeof value.subject === "string" ? value.subject : null, startedAt: value.startedAt, length: value.length, snapshot: value.snapshot, operations: parseOperations(value.operations), ...(phase ? { phase } : {}) };
}

function parseEnded(raw: unknown): EndedSession | null {
  const value = raw as Partial<EndedSession> | null;
  if (!value || typeof value !== "object" || typeof value.clientKey !== "string" || typeof value.title !== "string" || !finite(value.startedAt) || !finite(value.endedAt) || !finite(value.focusSeconds) || !finite(value.breakSeconds)) return null;
  return { ...parseDelivery(value), clientKey: value.clientKey, title: value.title, subject: typeof value.subject === "string" ? value.subject : null, startedAt: value.startedAt, endedAt: value.endedAt, focusSeconds: value.focusSeconds, breakSeconds: value.breakSeconds, operations: parseOperations(value.operations), saved: value.saved === true, serverId: parseId(value.serverId), acceptedFocusSeconds: finite(value.acceptedFocusSeconds) ? value.acceptedFocusSeconds : null };
}

function parsePlan(raw: unknown): SessionPlan | null {
  const value = raw as Partial<SessionPlan> | null;
  if (!value || typeof value !== "object") return null;
  const text = (item: unknown) => (typeof item === "string" && item ? item : null);
  return { title: text(value.title), subject: text(value.subject), subjectId: parseId(value.subjectId), questId: parseId(value.questId) };
}

/** Reads what storage holds. A record that cannot be read is dropped alone, so a bad value can never stop the app or cost the rest. */
export function parseSessionState(raw: unknown): StudySessionState {
  if (!raw || typeof raw !== "object") return INITIAL_SESSION_STATE;
  const value = raw as Partial<StudySessionState>;
  if (value.version !== 1) return INITIAL_SESSION_STATE;
  const modeSettings = parseModeSettings(value.modeSettings);
  return { version: 1, length: value.length === undefined || !isLength(value.length) ? DEFAULT_SESSION_LENGTH : value.length, plan: parsePlan(value.plan), active: parseActive(value.active), ended: Array.isArray(value.ended) ? value.ended.map(parseEnded).filter((item): item is EndedSession => !!item).slice(0, MAX_ENDED) : [], ...(isMode(value.mode) && value.mode !== "countdown" ? { mode: value.mode } : {}), ...(modeSettings ? { modeSettings } : {}) };
}

/** A person's view of the ended list: their own, and whatever belongs to nobody. Another account's work is never shown to them. */
export const endedSessionsFor = (state: StudySessionState, ownerId: number | null) => state.ended.filter((item) => item.ownerId === null || item.ownerId === ownerId);

export interface SessionOffer { clientKeys: string[]; count: number; focusSeconds: number }

/**
 * Ownerless sessions someone could add to their record, or null when there is nothing to ask (ADR 0010). A session from before the account
 * existed is not offered: the server clamps a start to the account's creation, so offering it would promise something that does not happen.
 * A session that began before the account did is left out too, for the same reason, even when it ended afterwards.
 */
export function ownerlessOffer(state: StudySessionState, accountCreatedAt: number, now: number): SessionOffer | null {
  const eligible = (item: { ownerId: number | null; declined: boolean; startedAt: number }) => item.ownerId === null && !item.declined && item.startedAt >= accountCreatedAt;
  const ended = state.ended.filter((item) => eligible(item) && item.focusSeconds > 0);
  const active = state.active && eligible(state.active) ? state.active : null;
  const focusSeconds = ended.reduce((sum, item) => sum + item.focusSeconds, active ? readSession({ ...state, active }, now).focusSeconds : 0);
  const clientKeys = [...(active ? [active.clientKey] : []), ...ended.map((item) => item.clientKey)];
  return clientKeys.length ? { clientKeys, count: clientKeys.length, focusSeconds } : null;
}

/** What a session keeps when it ends. */
const carried = ({ clientKey, ownerId, subjectId, questId, journaled, declined, title, subject, startedAt, party }: ActiveSession) => ({ clientKey, ownerId, subjectId, questId, journaled, declined, title, subject, startedAt, ...(party ? { party } : {}) });

/** Newest first, and what has already reached the server goes before anything still waiting. */
function keepEnded(ended: EndedSession[]) {
  if (ended.length <= MAX_ENDED) return ended;
  const drop = new Set(ended.filter((item) => item.saved).slice(MAX_ENDED - ended.length).map((item) => item.clientKey));
  return ended.filter((item) => !drop.has(item.clientKey)).slice(0, MAX_ENDED);
}

export interface StudySessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export interface StudySessionModelOptions {
  now?: () => number;
  /** Must be unique per session. The app passes the platform's randomUUID. */
  createKey?: () => string;
  /** Who is signed in right now, read once when a session starts. */
  ownerId?: () => number | null;
  log?: (event: string, detail?: unknown) => void;
}

export interface StudySessionModel {
  /** Changes only when something happens, never with the clock. */
  state(): StudySessionState;
  subscribe(listener: () => void): () => void;
  status(): SessionStatus;
  readout(): SessionReadout;
  /** Beats once for every second a clock shows, for as long as someone is listening and the app is in front. */
  subscribeClock(listener: () => void): () => void;
  /** A number that changes with every beat and every change, so a view can tell when to read again. */
  revision(): number;
  setLength(length: SessionLength): boolean;
  /** How the next session is shaped. Refused while a session exists, because a running session keeps the shape it began with. */
  setMode(mode: SessionMode): boolean;
  /** One of a mode's settings, kept on this device. */
  setModeSetting(mode: modes.StudyModeId, key: string, value: boolean | number | string): boolean;
  /** A break when the person asks for one, in Free Flow and Flowtime. Its length comes from how long they have focused. */
  takeBreak(): boolean;
  /** Chooses what the next session is about. */
  setPlan(plan: SessionPlan | null): boolean;
  /** Refuses while a session exists: there is one session, and a second start is a mistake rather than a new one. */
  start(context?: { title?: string; subject?: string | null; subjectId?: number | null; questId?: number | null; party?: { partyId: number; name?: string | null } }): boolean;
  /** The server has seated this person in the party's room. Kept on the record, so a lost exit can be replayed exactly. Returns false if nothing matched. */
  setPartyRoom(clientKey: string, room: { roomSessionId: number; joinedAt: string }): boolean;
  pause(): boolean;
  resume(): boolean;
  /** After a countdown ends: the same session carries on with no limit. */
  keepGoing(): boolean;
  end(): EndedSession | null;
  /** Accepted state wins over what the device holds. The bridge works out the snapshot through `reconcileSessionSnapshot`. */
  applyAccepted(clientKey: string, snapshot: TimerSnapshot): boolean;
  /** The server accepted the end of this session, here or on another device. The only way a record becomes `saved`. */
  settleAccepted(clientKey: string, outcome: AcceptedOutcome): boolean;
  /** These operations are in the journal now. */
  noteJournaled(clientKey: string, sequence: number): void;
  /** Gives ownerless sessions to this account, once and for good (ADR 0010 decision 4). */
  assignOwner(clientKeys: string[], ownerId: number): void;
  /** Leaves ownerless sessions on this device, and stops asking about them. */
  declineOwner(clientKeys: string[]): void;
  /** The account behind these sessions was deleted, so what the device kept for it goes too: its running session and every ended one. Ownerless ones stay. */
  forgetOwner(ownerId: number): void;
  /** The app left or returned to the foreground. Nothing beats behind it, and it catches up at once on return. */
  setForeground(active: boolean): void;
}

export function createStudySessionModel(storage: StudySessionStorage | undefined, options: StudySessionModelOptions = {}): StudySessionModel {
  const { now = Date.now, log = () => undefined, ownerId = () => null } = options;
  let sequence = 0;
  const createKey = options.createKey ?? (() => `session-${now().toString(36)}-${(sequence++).toString(36)}`);
  const load = (): StudySessionState => {
    try {
      const raw = storage?.getItem(STUDY_SESSION_STORAGE_KEY);
      return raw ? parseSessionState(JSON.parse(raw)) : INITIAL_SESSION_STATE;
    } catch {
      return INITIAL_SESSION_STATE; // A corrupt record must never stop the app from starting.
    }
  };

  let state = load();
  let revision = 0;
  let beatAt = now();
  let foreground = true;
  let beat: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const clockListeners = new Set<() => void>();

  const running = () => statusOf(state.active) === "running";
  const beating = () => foreground && clockListeners.size > 0 && running();
  const save = () => { try { storage?.setItem(STUDY_SESSION_STORAGE_KEY, JSON.stringify(state)); } catch { /* The session still runs for as long as the app does. */ } };

  const operation = (active: ActiveSession, action: SessionOperation["action"], at: number): SessionOperation => {
    const { focusSec, breakSec } = timer.deriveTimer(active.snapshot, at);
    const last = active.operations[active.operations.length - 1]?.sequence ?? 0;
    return { id: action === "END" ? `${active.clientKey}:END` : `${active.clientKey}:${last + 1}`, action, sequence: last + 1, focus: focusSec, breaks: breakSec, at: new Date(at).toISOString() };
  };
  // A cumulative total in every operation means the oldest can go, in a session long enough to reach this, without changing any total.
  const withOperation = (active: ActiveSession, action: SessionOperation["action"], at: number) => [...active.operations, operation(active, action, at)].slice(-MAX_OPERATIONS);

  /** The next moment a clock's whole second changes, so the beat follows the epoch and cannot drift from it. */
  const untilNextSecond = (at: number) => {
    const active = state.active;
    if (!active) return 1000;
    const derived = timer.deriveTimer(active.snapshot, at);
    const ms = derived.remainingRawMs !== null ? ((derived.remainingRawMs % 1000) + 1000) % 1000 || 1000 : 1000 - ((active.snapshot.focusMs + derived.liveMs) % 1000);
    return Math.max(16, ms + 4);
  };
  const stopBeat = () => { if (beat !== undefined) { clearTimeout(beat); beat = undefined; } };
  const startBeat = () => {
    stopBeat();
    if (!beating()) return;
    beat = setTimeout(() => {
      beat = undefined;
      beatAt = now();
      if (!settle(beatAt)) { revision++; clockListeners.forEach((listener) => listener()); }
      startBeat();
    }, untilNextSecond(now()));
  };
  const armDeadline = () => {
    if (deadline !== undefined) { clearTimeout(deadline); deadline = undefined; }
    const snapshot = state.active?.snapshot;
    if (!snapshot || !running() || snapshot.remainingMs === null) return;
    const left = timer.deriveTimer(snapshot, now()).remainingRawMs ?? 0;
    deadline = setTimeout(() => { deadline = undefined; settle(now()); }, Math.max(0, left) + 4);
  };

  const change = (next: StudySessionState, event: string) => {
    state = next;
    save();
    beatAt = now();
    revision++;
    log(event, { status: statusOf(state.active), clientKey: state.active?.clientKey });
    armDeadline();
    startBeat();
    listeners.forEach((listener) => listener());
    clockListeners.forEach((listener) => listener());
  };

  /**
   * A mode session moves through its phases at their own deadlines, however long the app was away, so a break that ended an hour ago ended an hour
   * ago. A phase that waits for the person pauses at its boundary, with a PAUSE in the journal, exactly where web pauses. Breaks add to `breakMs`,
   * which every later operation carries, so nothing else changes for the server.
   */
  const advance = (start: ActiveSession, at: number): ActiveSession => {
    let active = start;
    for (let guard = 0; guard < 64 && active.phase && timer.countdownCrossed(active.snapshot, at); guard++) {
      const { snapshot, phase } = active;
      const ends = (snapshot.runningSinceMs ?? at) + (snapshot.remainingMs ?? 0);
      const step = modes.modeNext(phase.mode, sessionModeSettings(state, phase.mode), snapshot.phase, phase.round, phase.rounds);
      if (!step || step.phase === "done") {
        active = { ...active, phase: { ...phase, label: step?.label ?? phase.label, seconds: null }, snapshot: timer.transitionSnapshot(snapshot, ends, { phase: "done", remainingSec: 0, paused: true }), operations: withOperation(active, "PAUSE", ends) };
        break;
      }
      const next = timer.transitionSnapshot(snapshot, ends, { phase: step.phase, remainingSec: step.seconds, paused: step.pause });
      active = { ...active, phase: { ...phase, label: step.label, round: step.round, seconds: step.seconds }, snapshot: next, operations: step.pause ? withOperation(active, "PAUSE", ends) : active.operations };
      log("phase", { phase: step.phase, label: step.label, chime: step.chime });
      if (step.pause) break;
    }
    return active;
  };

  /**
   * Catches the record up with the clock. A countdown that ended while nobody was looking ends at its own deadline, not at the moment
   * someone came back, and a wall clock moved backwards cannot leave time stuck: the live stretch restarts from what is banked. Returns
   * whether anything changed.
   */
  const settle = (at: number) => {
    const active = state.active;
    if (!active || !running()) return false;
    const { snapshot } = active;
    if (timer.countdownCrossed(snapshot, at)) {
      if (active.phase) { change({ ...state, active: advance(active, at) }, "phase"); return true; }
      const ends = (snapshot.runningSinceMs ?? at) + (snapshot.remainingMs ?? 0);
      change({ ...state, active: { ...active, snapshot: timer.transitionSnapshot(snapshot, ends, { phase: "done", remainingSec: 0, paused: true }), operations: withOperation(active, "PAUSE", ends) } }, "finished");
      return true;
    }
    if (snapshot.runningSinceMs !== null && snapshot.runningSinceMs > at) {
      const banked = timer.resumeSnapshot({ ...snapshot, runningSinceMs: null, isPaused: true }, at);
      change({ ...state, active: { ...active, snapshot: banked } }, "clock-moved");
      return true;
    }
    return false;
  };

  armDeadline();
  settle(now());

  return {
    state: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    status: () => statusOf(state.active),
    readout: () => readSession(state, beat !== undefined ? beatAt : now()),
    subscribeClock(listener) {
      clockListeners.add(listener);
      // The first listener starts the beat, and a view that has just appeared reads the true time at once.
      if (clockListeners.size === 1) { beatAt = now(); revision++; startBeat(); }
      return () => { clockListeners.delete(listener); if (!clockListeners.size) stopBeat(); };
    },
    revision: () => revision,
    setLength(length) {
      if (state.active || !isLength(length) || length === state.length) return false;
      change({ ...state, length }, "length");
      return true;
    },
    setMode(mode) {
      if (state.active || !isMode(mode) || mode === (state.mode ?? "countdown")) return false;
      const rest: StudySessionState = { ...state };
      delete rest.mode;
      change(mode === "countdown" ? rest : { ...rest, mode }, "mode");
      return true;
    },
    setModeSetting(mode, key, value) {
      const definition = modes.studyMode(mode).settings.find((setting) => setting.key === key);
      if (!definition || typeof value !== typeof definition.value) return false;
      if (typeof value === "number" && (!Number.isFinite(value) || (definition.min !== undefined && value < definition.min) || (definition.max !== undefined && value > definition.max))) return false;
      change({ ...state, modeSettings: { ...state.modeSettings, [mode]: { ...state.modeSettings?.[mode], [key]: value } } }, "mode-setting");
      return true;
    },
    takeBreak() {
      const active = state.active;
      if (settle(now()) || !active?.phase || !running() || active.snapshot.phase !== "focus" || !modes.takesBreaksOnDemand(active.phase.mode)) return false;
      const at = now();
      const { focusSec } = timer.deriveTimer(active.snapshot, at);
      const rest = modes.onDemandBreak(active.phase.mode, sessionModeSettings(state, active.phase.mode), focusSec);
      change({ ...state, active: { ...active, phase: { ...active.phase, label: rest.label, seconds: rest.seconds }, snapshot: timer.transitionSnapshot(active.snapshot, at, { phase: "short-break", remainingSec: rest.seconds, paused: false }) } }, "break");
      return true;
    },
    setPlan(plan) {
      const next = plan ? parsePlan(plan) : null;
      if (JSON.stringify(next) === JSON.stringify(state.plan)) return false;
      change({ ...state, plan: next }, "plan");
      return true;
    },
    start(context) {
      if (state.active) return false;
      const at = now();
      const mode = state.mode ?? "countdown";
      const shape = mode === "countdown" ? null : modes.modeStart(mode, sessionModeSettings(state, mode));
      const seconds = shape ? shape.seconds : state.length === null ? null : Math.round(state.length * 60);
      const snapshot = timer.setCountdownSnapshot(timer.createInitialSnapshot(at), seconds, at);
      const phase: ActivePhase | null = shape && mode !== "countdown" ? { mode, label: shape.label, round: shape.round, rounds: shape.rounds, seconds: shape.seconds } : null;
      const { plan } = state;
      const active: ActiveSession = {
        clientKey: createKey(), ownerId: ownerId(), title: context?.title?.trim() || plan?.title || DEFAULT_SESSION_TITLE, subject: context?.subject ?? plan?.subject ?? null,
        subjectId: context?.subjectId ?? plan?.subjectId ?? null, questId: context?.questId ?? plan?.questId ?? null, journaled: 0, declined: false,
        startedAt: at, length: phase ? null : state.length, snapshot, operations: [], ...(phase ? { phase } : {}),
        ...(context?.party ? { party: { partyId: context.party.partyId, name: context.party.name ?? null, roomSessionId: null, joinedAt: null } } : {}),
      };
      // A task is finished by working on it, so it does not carry over to the next session. The subject does.
      change({ ...state, plan: plan?.subject ? { ...plan, title: null, questId: null } : null, active }, "start");
      return true;
    },
    setPartyRoom(clientKey, room) {
      const seat = <T extends { clientKey: string; party?: SessionParty }>(item: T): T => (item.clientKey === clientKey && item.party && (item.party.roomSessionId !== room.roomSessionId || item.party.joinedAt !== room.joinedAt) ? { ...item, party: { ...item.party, ...room } } : item);
      const next = { ...state, active: state.active ? seat(state.active) : null, ended: state.ended.map(seat) };
      if (JSON.stringify(next) === JSON.stringify(state)) return false;
      change(next, "party-room");
      return true;
    },
    pause() {
      const active = state.active;
      if (settle(now()) || !active || !running()) return false;
      const at = now();
      change({ ...state, active: { ...active, snapshot: timer.pauseSnapshot(active.snapshot, at), operations: withOperation(active, "PAUSE", at) } }, "pause");
      return true;
    },
    resume() {
      const active = state.active;
      if (!active || statusOf(active) !== "paused") return false;
      const at = now();
      const phase = active.phase?.label === "BREAK OVER" ? { ...active.phase, label: active.phase.mode === "flowtime" ? "FLOW" : "FREE FLOW" } : active.phase;
      change({ ...state, active: { ...active, ...(phase ? { phase } : {}), snapshot: timer.resumeSnapshot(active.snapshot, at), operations: withOperation(active, "RESUME", at) } }, "resume");
      return true;
    },
    keepGoing() {
      const active = state.active;
      if (!active || statusOf(active) !== "finished") return false;
      const at = now();
      const phase = active.phase ? { ...active.phase, label: "KEEP GOING", seconds: null } : undefined;
      change({ ...state, active: { ...active, length: null, ...(phase ? { phase } : {}), snapshot: timer.transitionSnapshot(active.snapshot, at, { phase: "focus", remainingSec: null }), operations: withOperation(active, "RESUME", at) } }, "keep-going");
      return true;
    },
    end() {
      const active = (settle(now()), state.active);
      if (!active) return null;
      const at = now();
      const stopped = timer.pauseSnapshot(active.snapshot, at);
      const { focusSec, breakSec } = timer.deriveTimer(stopped, at);
      const operations = withOperation({ ...active, snapshot: stopped }, "END", at);
      const ended: EndedSession = { ...carried(active), operations, endedAt: at, focusSeconds: focusSec, breakSeconds: breakSec, saved: false, serverId: null, acceptedFocusSeconds: null };
      // A mis-tap that lasted no time at all is not a session anyone would want kept. One with an owner stays until the journal has closed it:
      // the server may already hold it open, and only an END can end that. The screens skip it.
      change({ ...state, active: null, ended: focusSec > 0 || active.ownerId !== null ? keepEnded([ended, ...state.ended]) : state.ended }, "end");
      return ended;
    },
    applyAccepted(clientKey, snapshot) {
      const active = state.active;
      if (active?.clientKey !== clientKey) return false;
      change({ ...state, active: { ...active, snapshot } }, "accepted");
      return true;
    },
    settleAccepted(clientKey, outcome) {
      const accepted = { saved: true, serverId: outcome.serverId, acceptedFocusSeconds: outcome.focusSeconds };
      const active = state.active;
      if (active?.clientKey === clientKey) {
        // It ended somewhere else, so the server's times are the record, and this device's clock has nothing to add.
        const at = outcome.endedAt ? Date.parse(outcome.endedAt) : now();
        change({ ...state, active: null, ended: keepEnded([{ ...carried(active), operations: active.operations, ...accepted, endedAt: Number.isFinite(at) ? at : now(), focusSeconds: outcome.focusSeconds, breakSeconds: outcome.breakSeconds }, ...state.ended]) }, "ended-elsewhere");
        return true;
      }
      if (!state.ended.some((item) => item.clientKey === clientKey)) return false;
      change({ ...state, ended: state.ended.map((item) => (item.clientKey === clientKey ? { ...item, ...accepted } : item)) }, "saved");
      return true;
    },
    noteJournaled(clientKey, sequence) {
      const mark = <T extends { clientKey: string; journaled: number }>(item: T): T => (item.clientKey === clientKey && sequence > item.journaled ? { ...item, journaled: sequence } : item);
      // Written and kept, with nobody told: this is bookkeeping, and nothing on a screen depends on it.
      state = { ...state, active: state.active ? mark(state.active) : null, ended: state.ended.map(mark) };
      save();
    },
    assignOwner(clientKeys, owner) {
      const keys = new Set(clientKeys);
      const take = <T extends { clientKey: string; ownerId: number | null }>(item: T): T => (keys.has(item.clientKey) && item.ownerId === null ? { ...item, ownerId: owner } : item);
      change({ ...state, active: state.active ? take(state.active) : null, ended: state.ended.map(take) }, "assigned");
    },
    declineOwner(clientKeys) {
      const keys = new Set(clientKeys);
      const leave = <T extends { clientKey: string; ownerId: number | null }>(item: T): T => (keys.has(item.clientKey) && item.ownerId === null ? { ...item, declined: true } : item);
      change({ ...state, active: state.active ? leave(state.active) : null, ended: state.ended.map(leave) }, "declined");
    },
    forgetOwner(owner) {
      const mine = (item: { ownerId: number | null }) => item.ownerId === owner;
      if (!(state.active && mine(state.active)) && !state.ended.some(mine)) return;
      change({ ...state, active: state.active && mine(state.active) ? null : state.active, ended: state.ended.filter((item) => !mine(item)) }, "forgotten");
    },
    setForeground(active) {
      if (foreground === active) return;
      foreground = active;
      if (!active) { stopBeat(); return; }
      beatAt = now();
      if (!settle(beatAt)) { armDeadline(); revision++; startBeat(); clockListeners.forEach((listener) => listener()); }
    },
  };
}
