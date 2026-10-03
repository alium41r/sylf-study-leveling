import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PlannerError } from "../errors";
import { CopilotCommandSchema, COPILOT_LIMITS, type CopilotCommand } from "./contracts";

/**
 * The proposal: a short-lived, signed statement of what Sylf understood.
 *
 * Why a signed token rather than a stored row or a client-held command array:
 *
 * - **No new table.** A proposal is derived state — it exists to be confirmed once, within
 *   minutes, against a version that must not have moved. Persisting it would add a
 *   platform (retention, cleanup, RLS, grants) for something with a thirty-minute life.
 * - **The client cannot rewrite it.** §63 forbids trusting a client-sent command array, and
 *   this is the structural answer: the commands travel *inside* an HMAC-signed payload, so
 *   editing one invalidates the signature. The client holds an opaque token, not a plan.
 * - **It expires twice over.** The payload carries an absolute expiry *and* the intake
 *   version it was built against, so an old "no Fridays" proposal cannot land hours later
 *   on a different brief.
 *
 * The signature is domain-separated from session tokens and uses the same server secret
 * (`JWT_SECRET`), failing closed when it is absent — the same posture as `lib/auth.ts`, so
 * a deployment that cannot sign cannot propose either.
 */

const PayloadSchema = z.strictObject({
  v: z.literal(1),
  /** Random id, so two proposals for the same change are still different proposals. */
  id: z.string().min(8).max(60),
  /** The intake session the proposal belongs to. Confirming elsewhere is refused. */
  session: z.string().min(8).max(60),
  /** The intake version the proposal was interpreted against. */
  version: z.number().int().nonnegative(),
  /** Epoch milliseconds after which the proposal is refused. */
  expiresAt: z.number().int().positive(),
  intent: z.string().min(1).max(40),
  summary: z.string().max(COPILOT_LIMITS.summaryChars),
  commands: z.array(CopilotCommandSchema).max(COPILOT_LIMITS.maxCommandsPerTurn),
});

export type CopilotProposalPayload = z.infer<typeof PayloadSchema>;

const SECRET_DOMAIN = "sylf.planner.copilot.proposal.v1:";

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new PlannerError(503, "MODEL_UNAVAILABLE");
  }
  return `${SECRET_DOMAIN}${value}`;
}

const encode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const sign = (body: string): string =>
  createHmac("sha256", secret()).update(body).digest("base64url");

/**
 * Mint a proposal token.
 *
 * The returned `proposalId` is the payload's own id, safe to log; the token is what the
 * client sends back on confirmation.
 */
export function mintProposal(input: {
  sessionId: string;
  expectedVersion: number;
  intent: string;
  summary: string;
  commands: CopilotCommand[];
  now?: Date;
}): { proposalId: string; token: string; expiresAt: string } {
  const now = input.now ?? new Date();
  const payload: CopilotProposalPayload = {
    v: 1,
    id: randomUUID(),
    session: input.sessionId,
    version: input.expectedVersion,
    expiresAt: now.getTime() + COPILOT_LIMITS.proposalTtlMinutes * 60_000,
    intent: input.intent.slice(0, 40),
    summary: input.summary.slice(0, COPILOT_LIMITS.summaryChars),
    commands: input.commands,
  };
  const body = encode(JSON.stringify(payload));
  return {
    proposalId: payload.id,
    token: `${body}.${sign(body)}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

/**
 * Read a proposal back, verifying signature, session, expiry and version together.
 *
 * Every failure is a distinct closed code, because they have different next actions: a
 * tampered token is not the same thing as a proposal that went stale while the student was
 * reading it, and neither is the same as one that simply aged out.
 */
export function readProposal(input: {
  token: string;
  sessionId: string;
  expectedVersion: number;
  now?: Date;
}): CopilotProposalPayload {
  if (input.token.length > COPILOT_LIMITS.proposalTokenChars)
    throw new PlannerError(422, "COPILOT_PROPOSAL_UNKNOWN");
  const [body, signature] = input.token.split(".");
  if (!body || !signature) throw new PlannerError(422, "COPILOT_PROPOSAL_UNKNOWN");
  const expected = sign(body);
  const given = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted))
    throw new PlannerError(422, "COPILOT_PROPOSAL_UNKNOWN");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decode(body));
  } catch {
    throw new PlannerError(422, "COPILOT_PROPOSAL_UNKNOWN");
  }
  const payload = PayloadSchema.safeParse(parsed);
  if (!payload.success) throw new PlannerError(422, "COPILOT_PROPOSAL_UNKNOWN");
  if (payload.data.session !== input.sessionId)
    throw new PlannerError(409, "COPILOT_PROPOSAL_STALE");
  const now = (input.now ?? new Date()).getTime();
  if (now > payload.data.expiresAt) throw new PlannerError(409, "COPILOT_PROPOSAL_EXPIRED");
  if (payload.data.version !== input.expectedVersion)
    throw new PlannerError(409, "COPILOT_PROPOSAL_STALE");
  return payload.data;
}
