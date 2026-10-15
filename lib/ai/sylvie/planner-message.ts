import "server-only";
import { SylviePlannerHandoffSchema, type SylviePlannerHandoff } from "./planner-bridge";

/** Keep the review action available when the authenticated chat is reopened. */
export function attachPlannerHandoff(content: string, handoff: SylviePlannerHandoff): string {
  return `${content}\n<!-- sylvie-planner:${Buffer.from(JSON.stringify(handoff)).toString("base64")} -->`;
}

export function parsePlannerHandoff(content: string): SylviePlannerHandoff | undefined {
  const match = /<!-- sylvie-planner:([A-Za-z0-9+/=]{1,20000}) -->/.exec(content);
  if (!match) return undefined;
  try {
    const parsed = SylviePlannerHandoffSchema.safeParse(JSON.parse(Buffer.from(match[1], "base64").toString("utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
