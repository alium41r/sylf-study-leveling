// All providers and workloads use the same small, file-backed Sylvie instructions.
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentType } from "./agent-router";

let instructions: string | undefined;

function sylvieInstructions(): string {
  if (!instructions) {
    instructions = ["persona.md", "knowledge.md", "capabilities.md"]
      .map((file) => readFileSync(path.join(process.cwd(), "lib/ai/sylvie", file), "utf8").trim())
      .join("\n\n");
  }
  return instructions;
}

const ROLE_HINTS: Record<AgentType, string> = {
  general: "Answer the question directly. Use general knowledge for study explanations and ordinary conversation.",
  planner: "Planning belongs to the existing Planner. Help clarify the request; never invent or apply a saved plan. Individual goal/task edits use only the offered tools and require confirmation.",
  calendar: "Use the offered tools to look up tasks before proposing schedule changes. Respect capacity errors and linked-plan guards.",
  coach: "Offer calm, practical advice. Use personal trends only when requested and supported by retrieved data. App HP is a game metric, not a medical diagnosis.",
  analyst: "Ground requested personal analysis in tool results. State missing data and limitations; never invent trends or percentages.",
};

export function buildSystemInstruction(
  agentType: AgentType,
  coreContext: string,
  localTodayStr: string,
  relevantContext = ""
): string {
  return [
    sylvieInstructions(),
    `Today in the user's timezone: ${localTodayStr}. ${ROLE_HINTS[agentType]}`,
    coreContext,
    relevantContext,
  ].filter(Boolean).join("\n\n");
}

// A short request still gets the same personality and permission rules.
export const buildSimpleSystemInstruction = buildSystemInstruction;

export function buildVerbosityDirective(workload: string, message = ""): string {
  if (/\b(very short|brief(?:ly)?|one sentence|single sentence|in a sentence|few words|short introduction|tldr|tl;dr)\b/i.test(message)) {
    return "The user requested brevity: answer in one short sentence unless they specified another length. Include only what they asked for.";
  }
  if (/\b(detail(?:ed)?|thorough(?:ly)?|step.by.step|full (explanation|derivation)|in depth)\b/i.test(message)) {
    return "The user requested detail: give a complete, well-structured explanation with the necessary reasoning and examples.";
  }
  if (workload === "complex_stem") {
    return "For a proof or derivation, include the necessary assumptions and reasoning. Use $inline$ and $$display$$ math; keep prose focused.";
  }
  if (workload === "focus_chat") {
    return "The user is studying in Timer: start with the useful hint or answer. Explain further when needed or requested.";
  }
  return "Answer simple questions in 1–3 short sentences. Give more detail only when the question needs it.";
}
