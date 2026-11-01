import { describe, expect, it } from "vitest";
import { formatMinutes, greetingFor, plannedMinutes, summarizeDay } from "../format";
import { emptyHomeData, homeDataFor, sampleHomeData, sampleProgress, sampleToday, slowHomeData } from "./sample";

const friday = new Date(2026, 9, 30, 15, 12);
const monday = new Date(2026, 9, 26, 9, 0);
const sunday = new Date(2026, 10, 1, 9, 0);

describe("Sample data", () => {
  it("marks every result as sample, so the screens can say so", async () => {
    const results = [await sampleHomeData.today(friday), await sampleHomeData.focus(), await sampleHomeData.circle(), await sampleHomeData.progress(friday)];
    expect(results.every((result) => result.provenance === "sample" && result.data)).toBe(true);
  });
  it("always has exactly one next item, after now, in time order", () => {
    for (const now of [friday, monday, new Date(2026, 9, 30, 23, 50), new Date(2026, 9, 31, 0, 5)]) {
      const { entries } = sampleToday(now);
      const next = entries.filter((entry) => entry.state === "next");
      expect(next).toHaveLength(1);
      expect(next[0].startsAt).toBeGreaterThan(now.getTime());
      expect(entries.filter((entry) => entry.state === "past").every((entry) => entry.startsAt < now.getTime())).toBe(true);
      expect([...entries].sort((a, b) => a.startsAt - b.startsAt)).toEqual(entries);
    }
  });
  it("shows days to come as empty and adds its totals up from the same week", () => {
    const week = sampleProgress(monday);
    expect(week.week.filter((day) => day.today).map((day) => day.day)).toEqual(["Mon"]);
    expect(week.week.slice(1).every((day) => day.minutes === 0)).toBe(true);
    expect(sampleProgress(sunday).week.at(-1)?.today).toBe(true);
    expect(sampleProgress(friday).stats[0].value).toBe("7.3");
  });
  it("keeps every share and progress value on the scale the screen draws", () => {
    const progress = sampleProgress(friday);
    expect(progress.levelProgress).toBeGreaterThan(0);
    expect(progress.levelProgress).toBeLessThan(1);
    expect(progress.subjects.reduce((sum, subject) => sum + subject.share, 0)).toBeCloseTo(1);
  });
});

describe("Data binding", () => {
  it("never reaches sample content in a build without development tools", async () => {
    expect(homeDataFor(false, null)).toBe(emptyHomeData);
    expect(homeDataFor(false, "sample")).toBe(emptyHomeData);
    expect((await homeDataFor(false, "slow").today(friday)).data).toBeNull();
  });
  it("uses sample content for reviews, and shows other states on request", () => {
    expect(homeDataFor(true, null)).toBe(sampleHomeData);
    expect(homeDataFor(true, "empty")).toBe(emptyHomeData);
    expect(homeDataFor(true, "slow")).not.toBe(sampleHomeData);
  });
  it("delays without changing the answer", async () => {
    await expect(slowHomeData(sampleHomeData, 1).circle()).resolves.toEqual(await sampleHomeData.circle());
  });
  it("claims nothing is sample when there is nothing to show", async () => {
    await expect(emptyHomeData.progress(friday)).resolves.toEqual({ provenance: "live", data: null });
  });
});

describe("Home's words and numbers", () => {
  it("greets by the time of day", () => {
    expect([greetingFor(3), greetingFor(8), greetingFor(13), greetingFor(21)]).toEqual(["Still up.", "Good morning.", "Good afternoon.", "Good evening."]);
    expect([greetingFor(5), greetingFor(12), greetingFor(18)]).toEqual(["Good morning.", "Good afternoon.", "Good evening."]);
  });
  it("works out the day from its entries", () => {
    const { entries } = sampleToday(friday);
    expect(summarizeDay(entries)).toBe("2 sessions left, and one deadline to come.");
    expect(plannedMinutes(entries)).toBe(115);
    expect(summarizeDay(entries.filter((entry) => entry.kind === "deadline"))).toBe("One deadline to come.");
    expect(summarizeDay(entries.filter((entry) => entry.state === "past"))).toBe("Nothing left to do today.");
    expect(summarizeDay(entries.filter((entry) => entry.id === "physics"))).toBe("One session left.");
  });
  it("writes durations", () => {
    expect([formatMinutes(45), formatMinutes(60), formatMinutes(115)]).toEqual(["45 min", "1 hr", "1 hr 55 min"]);
  });
});
