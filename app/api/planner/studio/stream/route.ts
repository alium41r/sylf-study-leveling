// Planning Studio workflows that may call the model, streamed as newline-delimited JSON: stages for the activity line, the interpretation chip, work
// items as they are written, solver previews as blocks settle, and finally the verified proposal. Drags, what-ifs and repairs never come here.
import { z } from "zod";
import { eventStream, readStudioBody } from "@/lib/planner/studio/http";
import { runAddGoal, runAnswer, runBrief, runCommand, runExplain, runQuestion } from "@/lib/planner/studio/workflows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const key = z.string().regex(/^[A-Za-z0-9_:.-]{8,120}$/);
const workflow = z.discriminatedUnion("workflow", [
  z.object({ workflow: z.literal("command"), key, text: z.string().min(2).max(600) }),
  z.object({ workflow: z.literal("add_goal"), key, title: z.string().min(1).max(200).optional(), type: z.string().max(20).optional(), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), subjectId: z.number().int().positive().nullable().optional(), priority: z.number().int().min(1).max(3).optional(), notes: z.string().max(6000).optional(), goalKey: z.string().max(80).optional() }),
  z.object({ workflow: z.literal("answer"), key, question: z.string().max(80), answer: z.string().min(1).max(300) }),
  z.object({ workflow: z.literal("brief") }),
  z.object({ workflow: z.literal("question"), text: z.string().min(2).max(400) }),
  z.object({ workflow: z.literal("explain"), block: z.string().min(1).max(80) }),
]);

export async function POST(req: Request) {
  let body: z.infer<typeof workflow>;
  try { body = workflow.parse(await readStudioBody(req)); }
  catch { return Response.json({ error: "That request didn't look right.", code: "INVALID_REQUEST" }, { status: 400 }); }
  return eventStream(req, async (userId, emit, signal) => {
    switch (body.workflow) {
      case "command": return runCommand(userId, { key: body.key, text: body.text }, emit, signal);
      case "add_goal": return runAddGoal(userId, body, emit, signal);
      case "answer": return runAnswer(userId, body, emit, signal);
      case "brief": return { text: await runBrief(userId, emit, signal) };
      case "question": return { text: await runQuestion(userId, { text: body.text }, emit, signal) };
      case "explain": return runExplain(userId, { block: body.block, phrase: true }, emit, signal);
    }
  });
}
