import { describe, expect, it } from "vitest";
import { sylvieCalendarTools } from "@/lib/ai/sylvie/calendar-contracts";
import { geminiToolSchema } from "@/lib/ai/providers/tool-schema";
import { Type } from "@google/genai";
describe("calendar tools through the existing Gemini fallback", () => {
  it("retains nullable recurrence objects, scope enums, reminders and required fields", () => {
    for (const tool of sylvieCalendarTools)
      expect(() => geminiToolSchema(tool.parameters)).not.toThrow();
    const create = geminiToolSchema(
      sylvieCalendarTools.find((t) => t.name === "createCalendarEvent")!
        .parameters
    );
    const changes = create.properties!.changes;
    expect(changes.required).toEqual(
      expect.arrayContaining(["title", "startDate", "allDay"])
    );
    expect(changes.properties!.recurrence).toMatchObject({
      type: Type.OBJECT,
      nullable: true,
    });
    expect(changes.properties!.recurrence.properties!.frequency.enum).toEqual([
      "daily",
      "weekly",
      "monthly",
      "yearly",
    ]);
    expect(changes.properties!.reminders).toMatchObject({
      type: Type.ARRAY,
      maxItems: "5",
      items: { type: Type.INTEGER, minimum: 0, maximum: 40320 },
    });
    const update = geminiToolSchema(
      sylvieCalendarTools.find((t) => t.name === "updateCalendarEvent")!
        .parameters
    );
    expect(update.properties!.scope.enum).toEqual([
      "event",
      "occurrence",
      "series",
    ]);
  });
});
