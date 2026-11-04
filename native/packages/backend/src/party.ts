// Study parties, the lifecycle only (Part 3 slice D, first part): create, invite, answer an invitation, leave. One active party and four members,
// as the server says. A party session is a kind of the one active study session (ADR 0015), and the session owner work that drives these calls waits for E-13;
// nothing here starts a clock or computes a reward. The server refuses with its own words, and joining needs an invitation.
import { z } from "zod";
import type { BackendClient } from "./client";

export const partyStateSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().optional(),
  members: z.array(z.object({ id: z.number().int(), userId: z.number().int().optional(), user: z.object({ name: z.string().nullable().optional(), username: z.string().optional() }).loose().optional(), status: z.string().optional() }).loose()).optional(),
}).loose();
export type PartyState = z.infer<typeof partyStateSchema>;

export function createPartyReads(client: BackendClient) {
  return {
    state: (id: number, signal: AbortSignal) => client.get(`/api/focus-party/${id}`, partyStateSchema, { signal }),
    create: (name: string) => client.send<{ partyId?: number }>("POST", "/api/focus-party", { body: { name } }),
    invite: (partyId: number, friendId: number) => client.send("POST", `/api/focus-party/${partyId}/invite`, { body: { friendId } }),
    answerInvite: (inviteId: number, accept: boolean) => client.send("PATCH", `/api/focus-party/invites/${inviteId}`, { body: { action: accept ? "ACCEPTED" : "DECLINED" } }),
    /** Leaving removes oneself. A leader who leaves, or ends the party, uses `disband`. */
    leave: (partyId: number, memberId: number) => client.send("DELETE", `/api/focus-party/${partyId}/members/${memberId}`),
    /** Enters the party's focus room. The server answers with the room's state. No clock starts on the device from this. */
    enter: (partyId: number) => client.send<unknown>("POST", `/api/focus-party/${partyId}/session`, { body: {} }),
    /**
     * An acknowledged, authoritative timer action for the caller within the party session. Start, pause and resume are the server's: nothing is
     * decided locally. `leave` carries the original join and exit instants so a replay after a lost answer credits exactly what happened, and
     * `expectedOwnerId` makes the server refuse if the account changed since the action was saved.
     */
    timer: (partyId: number, action: "start" | "pause" | "resume" | "leave", options: { sessionId?: number; expectedOwnerId?: number; joinedAt?: string; endedAt?: string } = {}) => client.send<unknown>("POST", `/api/focus-party/${partyId}/session/timer`, { body: { action, ...options } }),
    disband: (partyId: number) => client.send("DELETE", `/api/focus-party/${partyId}`),
  };
}
export type PartyReads = ReturnType<typeof createPartyReads>;
