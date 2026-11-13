import "server-only";
// Event-driven repair from outside the Studio. The overnight deadline check calls this before failing a quest the plan owns: missed work is re-placed
// inside the student's slack first, so a plan the system could have repaired never costs HP. "Ask me" students keep the existing rule.
import { prisma } from "@/lib/prisma";
import { propose } from "../kernel";
import { studioEnabled } from "./config";
import { compileContext } from "./snapshot";
import { commitDirect, persistProposal, persistTransitions } from "./store";

export async function studioOwnedQuests(questIds: number[]): Promise<Map<number, number>> {
  if (!studioEnabled() || !questIds.length) return new Map();
  const rows = await prisma.planItemQuest.findMany({ where: { questId: { in: questIds } }, select: { questId: true, userId: true } });
  return new Map(rows.filter((r) => r.questId != null).map((r) => [r.questId!, r.userId]));
}

/** Re-places missed work for one student. Returns true when the plan changed. Never throws into the caller's loop. */
export async function repairBeforeDeadline(userId: number, now = new Date()): Promise<boolean> {
  try {
    const ctx = await compileContext(userId, now);
    await persistTransitions(ctx);
    const candidate = propose(ctx.snapshot, { model: ctx.model, blocks: ctx.blocks }, ctx.model, null, undefined, "repair");
    if (candidate.diff.empty || !candidate.verification.pass) return false;
    const key = `nightly:${ctx.snapshot.today}:${ctx.space.version}`;
    if (ctx.space.settings.autonomy === "ASK") {
      await persistProposal(ctx, candidate, { key, source: "REPAIR", workflow: "repair", notes: ["Some sessions were missed. Here is where their time could go."] });
      return false;
    }
    const outcome = await commitDirect(ctx, candidate, { key, source: "REPAIR", workflow: "repair", request: { trigger: "deadline" } });
    return !outcome.replayed;
  } catch {
    return false;
  }
}
