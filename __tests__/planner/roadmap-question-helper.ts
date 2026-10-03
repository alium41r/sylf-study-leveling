import { smartQuestions, type SmartQuestion } from "@/lib/planner/smart-setup";
import type { RoadmapInput } from "@/lib/planner/roadmap-policy";

/** Thin typed wrapper so roadmap tests read the same catalog the wizard uses. */
export function roadmapQuestionSet(input: RoadmapInput): SmartQuestion[] {
  return smartQuestions(input);
}
