// The stand-in host: everything a real host does except the game. It goes through every step of the lifecycle with real timing and
// a real resource scope, so the way in and the way out are proven before an engine exists. Its stages are short pauses, not real
// work, and the screen says so. It is imported only on entry, and Phase 15 replaces this file with the engine's host.
import type { WorldHost, WorldHostContext, WorldSaveReceipt } from "@sylf/spaces";
import type { WorldHostScenario } from "../../../shell/links";

const STAGES = [
  { stage: "gate", label: "Opening the gate", fraction: 0.3, ms: 260 },
  { stage: "visit", label: "Reading your last visit", fraction: 0.65, ms: 300 },
  { stage: "through", label: "Stepping through", fraction: 1, ms: 300 },
];
const SAVE_MS = 900;

export function createPreviewHost(scenario: WorldHostScenario): WorldHost {
  const stretch = scenario === "slow" ? 4 : 1;
  let context: WorldHostContext | null = null;
  let releaseSurface: (() => void) | undefined;

  const wait = (ms: number) => new Promise<void>((resolve) => { context?.resources.after(ms * stretch, resolve); });

  return {
    descriptor: { id: "preview", kind: "preview", label: "Preview" },
    async initialize(given) {
      context = given;
      releaseSurface = given.resources.track("preview-surface", () => undefined);
    },
    async load() {
      for (const { ms, ...progress } of STAGES) {
        if (context?.cancelled()) return;
        context?.report(progress);
        await wait(ms);
        if (scenario === "fail-load" && progress.stage === "visit") throw new Error("preview: the load was told to fail");
      }
    },
    // There is nothing running to stop. A real host stops all of its work here.
    async suspend() { return; },
    async resume() { return; },
    async save() {
      await wait(SAVE_MS);
      if (scenario === "fail-save") throw new Error("preview: the save was told to fail");
      const savedAt = Date.now();
      return { ref: `preview-${savedAt}`, savedAt, location: "device", pendingSync: false } satisfies WorldSaveReceipt;
    },
    async exit() { return; },
    dispose() { releaseSurface?.(); context = null; },
    memory: () => null,
  };
}
