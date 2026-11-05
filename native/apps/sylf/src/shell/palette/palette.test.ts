import { describe, expect, it } from "vitest";
import { commandPalette, rankCommands, scoreCommand, type Command } from "./palette";

const command = (id: string, title: string, group: Command["group"], extra: Partial<Command> = {}): Command => ({ id, title, group, icon: "notes", run: () => undefined, ...extra });
const commands: Command[] = [
  command("doc:1", "Complex numbers", "Notes", { suggested: true, keywords: ["Note", "modulus argument"] }),
  command("new:note", "New note", "Create", { suggested: true }),
  command("tool:calculator", "Calculator", "Tools", { keywords: ["maths"] }),
  command("home:plan", "Plan", "Go to"),
  command("layout:fill", "Full screen", "Layouts", { keywords: ["fullscreen maximise"] }),
];

describe("command palette", () => {
  it("suggests before anything is typed, under one heading", () => {
    const shown = rankCommands(commands, "");
    expect(shown.map((c) => c.id)).toEqual(["doc:1", "new:note"]);
    expect(new Set(shown.map((c) => c.group))).toEqual(new Set(["Suggested"]));
  });

  it("puts a title that starts with the words first, then words, then keywords and letters in order", () => {
    expect(scoreCommand(commands[2], "calc")).toBeGreaterThan(scoreCommand(commands[0], "calc"));
    expect(rankCommands(commands, "calc")[0].id).toBe("tool:calculator");
    expect(rankCommands(commands, "maths")[0].id).toBe("tool:calculator");
    expect(rankCommands(commands, "argument")[0].id).toBe("doc:1");
    expect(rankCommands(commands, "nn")[0].id).toBe("new:note");
    expect(rankCommands(commands, "screen")[0].id).toBe("layout:fill");
    expect(rankCommands(commands, "zzz")).toEqual([]);
  });

  it("opens, closes and toggles from anywhere", () => {
    const seen: boolean[] = [];
    const stop = commandPalette.subscribe(() => seen.push(commandPalette.isOpen()));
    commandPalette.open();
    commandPalette.open();
    commandPalette.toggle();
    commandPalette.toggle();
    commandPalette.close();
    stop();
    expect(seen).toEqual([true, false, true, false]);
  });
});
