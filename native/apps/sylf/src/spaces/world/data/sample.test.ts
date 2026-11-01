import { describe, expect, it } from "vitest";
import { worldDataFor } from "./sample";

describe("World data", () => {
  it("binds nothing sample without development tools", async () => {
    for (const scenario of [null, "sample", "slow"] as const) {
      const adapter = worldDataFor(false, scenario);
      expect(await adapter.traveller()).toEqual({ provenance: "live", data: null });
      expect(await adapter.collection()).toEqual({ provenance: "live", data: null });
    }
  });
  it("marks everything sample as sample", async () => {
    const adapter = worldDataFor(true, null);
    expect((await adapter.traveller()).provenance).toBe("sample");
    expect((await adapter.collection()).provenance).toBe("sample");
  });
  it("offers an empty state", async () => {
    expect((await worldDataFor(true, "empty").traveller()).data).toBeNull();
  });
  it("keeps equipped cosmetics to one in each group", async () => {
    const { data } = await worldDataFor(true, null).collection();
    data!.groups.forEach((group) => expect(group.items.filter((item) => item.equipped)).toHaveLength(1));
  });
});
