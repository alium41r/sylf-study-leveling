import { describe, expect, it } from "vitest";
import { STUDY_MODES, defaultModeSettings, modeNext, modePattern, modeStart, onDemandBreak, takesBreaksOnDemand, type StudyModeId } from "@/lib/timer-modes";

// Expected phases are web's, as FocusScreen ran them before the rules moved: [phase, minutes] in order, null minutes for an open block.
type Expected = [string, number | null][];
const f = (minutes: number): [string, number] => ["focus", minutes];
const TABLE: [StudyModeId, string, Expected][] = [
  ["pomodoro", "four focus blocks, short breaks between, a long one after the fourth", [f(25), ["short-break", 5], f(25), ["short-break", 5], f(25), ["short-break", 5], f(25), ["long-break", 15]]],
  ["5217", "three 52 minute blocks, each followed by a 17 minute recovery", [f(52), ["short-break", 17], f(52), ["short-break", 17], f(52), ["short-break", 17]]],
  ["animedoro", "three 45 minute blocks, each followed by a 20 minute reward", [f(45), ["long-break", 20], f(45), ["long-break", 20], f(45), ["long-break", 20]]],
  ["deepwork", "ninety minutes, then one 20 minute break", [f(90), ["long-break", 20]]],
  ["sprint", "six ten minute sprints with a two minute rest between", [f(10), ["rest", 2], f(10), ["rest", 2], f(10), ["rest", 2], f(10), ["rest", 2], f(10), ["rest", 2], f(10)]],
  ["flowtime", "one open block", [["focus", null]]],
  ["freeflow", "one open block", [["focus", null]]],
];

describe("the seven modes", () => {
  it("are exactly the seven web has", () => {
    expect(STUDY_MODES.map((mode) => mode.id).sort()).toEqual(["5217", "animedoro", "deepwork", "flowtime", "freeflow", "pomodoro", "sprint"]);
  });

  describe.each(TABLE)("%s", (id, words, expected) => {
    const settings = defaultModeSettings(id);
    it(`draws ${words}`, () => {
      expect(modePattern(id, settings).map((segment) => [segment.phase, segment.seconds === null ? null : segment.seconds / 60])).toEqual(expected);
    });
    it("walks the same phases when stepped one at a time", () => {
      const start = modeStart(id, settings);
      const walked: Expected = [["focus", start.seconds === null ? null : start.seconds / 60]];
      let phase = start.phase as string; let round = start.round;
      for (let guard = 0; guard < 40 && start.seconds !== null; guard++) {
        const step = modeNext(id, settings, phase as never, round, start.rounds);
        if (!step || step.phase === "done") break;
        if (id === "pomodoro" && phase === "long-break") break;
        walked.push([step.phase, step.seconds === null ? null : step.seconds / 60]);
        phase = step.phase; round = step.round;
      }
      expect(walked).toEqual(expected);
    });
  });

  it("a Pomodoro's focus ends in a long break only after the configured number of rounds", () => {
    const settings = { ...defaultModeSettings("pomodoro"), sessionsBeforeLong: 2 };
    expect(modeNext("pomodoro", settings, "focus", 1, 2)?.phase).toBe("short-break");
    expect(modeNext("pomodoro", settings, "focus", 2, 2)?.phase).toBe("long-break");
    expect(modeNext("pomodoro", settings, "long-break", 2, 2)).toMatchObject({ phase: "focus", round: 1 });
  });

  it("waits for the person when auto-start is off, and never otherwise", () => {
    const manual = { ...defaultModeSettings("pomodoro"), autoStartBreaks: false };
    expect(modeNext("pomodoro", manual, "focus", 1, 4)?.pause).toBe(true);
    expect(modeNext("pomodoro", defaultModeSettings("pomodoro"), "focus", 1, 4)?.pause).toBe(false);
    expect(modeNext("pomodoro", defaultModeSettings("pomodoro"), "short-break", 1, 4)?.pause).toBe(true);
  });

  it("ends the last block of a finite mode with done, not another break", () => {
    expect(modeNext("5217", defaultModeSettings("5217"), "short-break", 3, 3)?.phase).toBe("done");
    expect(modeNext("sprint", defaultModeSettings("sprint"), "focus", 6, 6)?.phase).toBe("done");
    expect(modeNext("deepwork", defaultModeSettings("deepwork"), "long-break", 1, 1)?.phase).toBe("done");
  });

  it("open modes never resume by themselves after a break", () => {
    for (const id of ["flowtime", "freeflow"] as const) expect(modeNext(id, defaultModeSettings(id), "short-break", 1, 1)).toMatchObject({ phase: "focus", pause: true, pauseReason: "break-over" });
  });

  it("only Free Flow and Flowtime take breaks on demand", () => {
    expect(STUDY_MODES.filter((mode) => takesBreaksOnDemand(mode.id)).map((mode) => mode.id).sort()).toEqual(["flowtime", "freeflow"]);
  });

  it("sizes an on-demand break from the focus before it, within each mode's bounds", () => {
    expect(onDemandBreak("freeflow", {}, 10 * 60).seconds).toBe(5 * 60);
    expect(onDemandBreak("freeflow", {}, 600 * 60).seconds).toBe(20 * 60);
    const flow = defaultModeSettings("flowtime");
    expect(onDemandBreak("flowtime", flow, 120 * 60).seconds).toBe(12 * 60);
    expect(onDemandBreak("flowtime", { ...flow, autoScaleBreak: false, defaultBreak: 7 }, 120 * 60).seconds).toBe(7 * 60);
  });
});
