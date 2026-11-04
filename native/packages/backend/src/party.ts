// Study parties, the lifecycle only (Part 3 slice D, first part): create, invite, answer an invitation, leave. One active party and four members,
// as the server says. A party session is a kind of the one active study session (ADR 0015), and starting one waits for E-13 and the session owner
// work; nothing here starts a clock or computes a reward. The server refuses with its own words, and joining needs an invitation.
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
    disband: (partyId: number) => client.send("DELETE", `/api/focus-party/${partyId}`),
  };
}
export type PartyReads = ReturnType<typeof createPartyReads>;
