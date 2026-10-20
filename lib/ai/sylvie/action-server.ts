import "server-only";
import { z } from "zod";
import { signConfirmationToken, verifyConfirmationToken } from "../tool-confirmation";
import { stripSylvieAction, type PendingSylvieAction } from "./action";
import { CALENDAR_MUTATION_TOOLS } from "./calendar-contracts";

export const MUTATION_TOOLS = new Set([
  ...CALENDAR_MUTATION_TOOLS,
  "createGoal", "updateGoal", "deleteGoal", "deleteAllTasks", "createQuest",
  "updateQuest", "deleteQuest", "moveQuest", "swapQuests", "clearDay",
  "completeQuest", "saveMemory", "forgetMemory", "generateInsight",
]);

const OperationSchema = z.object({
  name: z.string().refine((name) => MUTATION_TOOLS.has(name)),
  args: z.record(z.string(), z.unknown()),
});
const ActionSchema = z.object({
  kind: z.literal("SYLVIE_MUTATION"),
  sessionId: z.number().int().positive(),
  messageId: z.number().int().positive(),
  operations: z.array(OperationSchema).min(1).max(8),
});
export type SylvieOperation = z.infer<typeof OperationSchema>;
export type ConfirmedSylvieAction = z.infer<typeof ActionSchema>;

/** Sign the exact preview, bound to user, session and the persisted proposal. */
export function stageSylvieAction(
  userId: number, sessionId: number, messageId: number, operations: SylvieOperation[],
): PendingSylvieAction {
  const action = ActionSchema.parse({ kind: "SYLVIE_MUTATION", sessionId, messageId, operations });
  const serialized = JSON.stringify(action);
  if (serialized.length > 12_000) throw new Error("Too many changes to preview at once. Please request fewer changes.");
  return { token: signConfirmationToken(serialized, userId), summary: operations.map(summarizeOperation).join("\n") };
}

export function readSylvieAction(token: unknown, userId: number, sessionId: number): ConfirmedSylvieAction | null {
  if (typeof token !== "string" || token.length > 24_000) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    if (!verifyConfirmationToken(token, payload.action, userId)) return null;
    const result = ActionSchema.safeParse(JSON.parse(payload.action));
    return result.success && result.data.sessionId === sessionId ? result.data : null;
  } catch { return null; }
}

export function attachSylvieAction(content: string, pending: PendingSylvieAction): string {
  return `${stripSylvieAction(content)}\n<!-- sylvie-action:${Buffer.from(JSON.stringify(pending)).toString("base64")} -->`;
}

export function parseSylvieAction(content: string, userId: number, sessionId: number | null, messageId: number): PendingSylvieAction | undefined {
  if (!sessionId) return undefined;
  const match = /<!-- sylvie-action:([A-Za-z0-9+/=]+) -->/.exec(content);
  if (!match) return undefined;
  try {
    const pending = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    const action = readSylvieAction(pending.token, userId, sessionId);
    if (!action || action.messageId !== messageId) return undefined;
    return { token: pending.token, summary: action.operations.map(summarizeOperation).join("\n") };
  } catch { return undefined; }
}

function summarizeOperation({ name, args }: SylvieOperation): string {
  if (CALENDAR_MUTATION_TOOLS.has(name) && typeof args.summary === "string") return args.summary;
  const labels: Record<string, string> = {
    createGoal: "Add goal", updateGoal: "Update goal", deleteGoal: "Delete goal",
    deleteAllTasks: "Delete all goals and tasks", createQuest: "Add task", updateQuest: "Update task",
    deleteQuest: "Delete task", moveQuest: "Move task", swapQuests: "Swap task dates", clearDay: "Clear day",
    completeQuest: "Complete task", saveMemory: "Remember preference", forgetMemory: "Forget preference",
    generateInsight: "Save insight",
  };
  // Include every effective argument in the preview; hidden tokens never confer scope.
  const fields = Object.entries(args).filter(([key]) => key !== "confirmationToken")
    .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return `${labels[name] ?? name}${fields.length ? ` — ${fields.join("; ")}` : ""}`;
}
