// Study parties: create, invite, answer an invitation, leave, and the room. One active party and four members, as the server says. A party session is
// a kind of the one active study session (ADR 0015, owner decision E-13): the study session carries the time and the credit, and these calls only
// say where the person is studying. The server banks room seconds on the room member for the others to see, and nothing here computes a reward.
import { z } from "zod";
import type { BackendClient } from "./client";

const timerStateSchema = z.string();
const roomMemberSchema = z.object({
  userId: z.number().int(),
  timerState: timerStateSchema,
  accumulatedSeconds: z.number().optional(),
  liveSeconds: z.number().optional(),
  isFocusing: z.boolean().optional(),
  joinedAt: z.string().nullable().optional(),
  leftAt: z.string().nullable().optional(),
}).loose();
export type PartyRoomMember = z.infer<typeof roomMemberSchema>;

/** GET /api/focus-party/[id]: the party, its people, and the room if anyone is studying (FocusPartyStateView in lib/focus-party-types.ts). */
export const partyStateSchema = z.object({
  party: z.object({ id: z.number().int(), name: z.string(), leaderId: z.number().int(), isCurrentUserLeader: z.boolean().optional(), memberCount: z.number().optional() }).loose(),
  members: z.array(z.object({ userId: z.number().int(), username: z.string(), name: z.string().nullable().optional(), isLeader: z.boolean().optional(), joinedAt: z.string().optional() }).loose()),
  activeSession: z.object({ id: z.number().int(), startedAt: z.string().optional(), collectiveSeconds: z.number().optional(), members: z.array(roomMemberSchema) }).loose().nullable(),
}).loose();
export type PartyState = z.infer<typeof partyStateSchema>;

/** What an entry or a timer action answers (lib/focus-party-service.ts): the room's session, and this person's state in it. */
export const roomEntrySchema = z.object({ sessionId: z.number().int(), timerState: timerStateSchema.optional(), accumulatedSeconds: z.number().optional() }).loose();
export type RoomEntry = z.infer<typeof roomEntrySchema>;

export type RoomAction = "start" | "pause" | "resume" | "leave";

/** The instant this person was seated in the room, which the exit must name to be replayed exactly. Null when they are not seated. */
export function seatedAt(state: PartyState, userId: number): string | null {
  const mine = state.activeSession?.members.find((member) => member.userId === userId && member.timerState !== "LEFT");
  return mine?.joinedAt ?? null;
}

export function createPartyReads(client: BackendClient) {
  return {
    state: (id: number, signal: AbortSignal) => client.get(`/api/focus-party/${id}`, partyStateSchema, { signal }),
    create: (name: string) => client.send<{ partyId?: number }>("POST", "/api/focus-party", { body: { name } }),
    invite: (partyId: number, friendId: number) => client.send("POST", `/api/focus-party/${partyId}/invite`, { body: { friendId } }),
    answerInvite: (inviteId: number, accept: boolean) => client.send("PATCH", `/api/focus-party/invites/${inviteId}`, { body: { action: accept ? "ACCEPTED" : "DECLINED" } }),
    /** Leaves the party. A leader who leaves hands the party to its longest-standing member, and the last person out disbands it. */
    leave: (partyId: number) => client.send("DELETE", `/api/focus-party/${partyId}`),
    /** The leader removes someone, by that person's user id. */
    remove: (partyId: number, userId: number) => client.send("DELETE", `/api/focus-party/${partyId}/members/${userId}`),
    /** Enters the room. Idempotent: the server seats a person once and answers the same session again. */
    enter: async (partyId: number): Promise<RoomEntry> => roomEntrySchema.parse(await client.send<unknown>("POST", `/api/focus-party/${partyId}/session`, { body: {} })),
    /**
     * An acknowledged room action for the caller. Each is idempotent on the server, so a replay after a lost answer is safe. `leave` carries the original
     * seating and exit instants, and `expectedOwnerId` makes the server refuse if the account changed since the action was saved.
     */
    timer: async (partyId: number, action: RoomAction, options: { sessionId?: number; expectedOwnerId?: number; joinedAt?: string; endedAt?: string } = {}): Promise<RoomEntry> => roomEntrySchema.parse(await client.send<unknown>("POST", `/api/focus-party/${partyId}/session/timer`, { body: { action, ...options } })),
  };
}
export type PartyReads = ReturnType<typeof createPartyReads>;
