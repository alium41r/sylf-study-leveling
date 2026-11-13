// Planning Studio: state and the deterministic actions. Model-using workflows stream from ./stream. Every action is authenticated, scoped to the
// signed-in student's own plan, and carries an idempotency key where it writes.
import { z } from "zod";
import { readStudioBody, studioRoute } from "@/lib/planner/studio/http";
import { loadState, runDirect, runExplain, runWhatIf, type BlockEdit } from "@/lib/planner/studio/workflows";
import { StudioError, acceptProposal, discardProposal, undoLatest, updateSettings } from "@/lib/planner/studio/store";
import { studioReadiness } from "@/lib/planner/studio/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const key = z.string().regex(/^[A-Za-z0-9_:.-]{8,120}$/);
const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minute = z.number().int().min(0).max(1440);
const edit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), block: z.string().min(1).max(80), date, start: minute }),
  z.object({ kind: z.enum(["pin", "unpin", "skip", "restore"]), block: z.string().min(1).max(80) }),
]);
const whatIf = z.object({
  dailyCap: z.number().int().min(0).max(720).nullable().optional(), weekdayCap: z.number().int().min(0).max(720).nullable().optional(),
  extraWindows: z.array(z.object({ date, start: minute, end: minute })).max(7).optional(), daysOff: z.array(date).max(14).optional(),
  startEarlier: z.number().int().min(0).max(14).optional(), compress: z.array(z.object({ goal: z.string().max(80), fraction: z.number().min(0.1).max(0.5) })).max(5).optional(),
  extendDue: z.array(z.object({ goal: z.string().max(80), days: z.number().int().min(1).max(14) })).max(5).optional(), release: z.array(z.string().max(80)).max(20).optional(),
}).strict();
const settings = z.object({
  dayStart: minute.optional(), dayEnd: minute.optional(), dailyCap: z.number().int().min(30).max(720).optional(), breakMinutes: z.number().int().min(0).max(30).optional(),
  transitionBuffer: z.number().int().min(0).max(45).optional(), dayOnly: z.boolean().optional(), horizonDays: z.number().int().min(7).max(21).optional(), autonomy: z.enum(["ASK", "SMART", "AUTOPILOT"]).optional(),
}).strict();

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open") }),
  z.object({ action: z.literal("accept"), proposalId: id, key }),
  z.object({ action: z.literal("discard"), proposalId: id }),
  z.object({ action: z.literal("undo"), key }),
  z.object({ action: z.literal("direct"), key, edits: z.array(edit).min(1).max(20) }),
  z.object({ action: z.literal("whatif"), key, whatIf }),
  z.object({ action: z.literal("settings"), settings }),
  z.object({ action: z.literal("explain"), block: z.string().min(1).max(80) }),
]);

export function GET(req: Request) {
  return studioRoute(req, async (userId) => {
    if (new URL(req.url).searchParams.get("readiness") === "1") return { readiness: studioReadiness() };
    return loadState(userId, { sync: false });
  });
}

export function POST(req: Request) {
  return studioRoute(req, async (userId) => {
    const body = action.parse(await readStudioBody(req));
    switch (body.action) {
      case "open": return loadState(userId, { sync: true });
      case "accept": {
        const outcome = await acceptProposal(userId, body.proposalId, body.key);
        return { committed: outcome.committed ? { version: outcome.committed.version, summary: outcome.committed.proposal.summary, replayed: outcome.committed.replayed, stats: outcome.committed.stats } : null, rebased: outcome.rebased, state: await loadState(userId, { sync: false }) };
      }
      case "discard": await discardProposal(userId, body.proposalId); return { state: await loadState(userId, { sync: false }) };
      case "undo": { const outcome = await undoLatest(userId, body.key); return { committed: { version: outcome.version, summary: outcome.proposal.summary, replayed: outcome.replayed }, state: await loadState(userId, { sync: false }) }; }
      case "direct": { const outcome = await runDirect(userId, { key: body.key, edits: body.edits as BlockEdit[] }); return { committed: { version: outcome.version, summary: outcome.proposal.summary, replayed: outcome.replayed }, state: await loadState(userId, { sync: false }) }; }
      case "whatif": { const proposal = await runWhatIf(userId, { key: body.key, whatIf: body.whatIf }, () => undefined); return { proposal, state: await loadState(userId, { sync: false }) }; }
      case "settings": await updateSettings(userId, body.settings); return { state: await loadState(userId, { sync: true }) };
      case "explain": return runExplain(userId, { block: body.block, phrase: false }, () => undefined);
    }
    throw new StudioError(400, "UNKNOWN_ACTION", "Unknown action.");
  });
}
