// Planning Studio switches and versions. The Studio is a strangler beside the existing planner: it is on by default in development and off in
// production until `SYLF_PLANNING_STUDIO=on`, which is also the switch that needs the 20261113100000_planning_kernel migration applied first.
import { KERNEL_VERSION, PATH_VERSION, SOLVER_VERSION, STRATEGY_VERSION } from "../kernel";
import { DEEPSEEK_MODELS } from "@/lib/ai/config";

export const STUDIO_PROMPT_VERSION = "studio-prompts-1.2.0";
export const STUDIO_CONTRACT = "1";

export function studioEnabled(): boolean {
  const flag = (process.env.SYLF_PLANNING_STUDIO ?? "").trim().toLowerCase();
  if (flag === "on" || flag === "true" || flag === "1") return true;
  if (flag === "off" || flag === "false" || flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function studioAiAvailable(): boolean {
  return Boolean((process.env.DEEPSEEK_API_KEY ?? "").trim()) && (process.env.SYLF_PLANNING_STUDIO_AI ?? "on") !== "off";
}

export interface StudioReadiness { enabled: boolean; ai: boolean; reason: string | null; model: string }
export function studioReadiness(): StudioReadiness {
  const enabled = studioEnabled();
  const ai = enabled && studioAiAvailable();
  return {
    enabled, ai, model: DEEPSEEK_MODELS.planner,
    reason: !enabled ? "The Planning Studio is not switched on in this deployment." : !ai ? "AI planning is unavailable, so new goals start from study templates. Everything else works." : null,
  };
}

/** Recorded on every plan version, so any plan can be reproduced. */
export const studioVersions = (servedModel?: string | null) => ({
  kernel: KERNEL_VERSION, solver: SOLVER_VERSION, strategy: STRATEGY_VERSION, path: PATH_VERSION, prompts: STUDIO_PROMPT_VERSION, model: servedModel ?? DEEPSEEK_MODELS.planner,
});
