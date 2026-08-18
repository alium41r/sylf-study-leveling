/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { COSMETICS_CATALOG, getClassInfo, LEGACY_CLASS_MAP } from "@/lib/cosmetics-catalog";

describe("Class System Architecture & Catalog", () => {
  it("contains all 8 designated classes with complete metadata", () => {
    const classes = COSMETICS_CATALOG.CLASS;
    expect(classes).toHaveLength(8);

    const expectedClassNames = [
      "Scholar",
      "Analyst",
      "Engineer",
      "Scientist",
      "Researcher",
      "Psychologist",
      "Strategist",
      "Creative",
    ];

    const classNames = classes.map((c) => c.name);
    expectedClassNames.forEach((name) => {
      expect(classNames).toContain(name);
    });

    classes.forEach((c) => {
      expect(c.id).toMatch(/^class_/);
      expect(c.category).toBe("CLASS");
      expect(c.description.length).toBeGreaterThan(20);
      expect(c.value).toMatch(/^\/classes\//);
      expect(c.fallbackIcon).toBeDefined();
    });
  });

  it("maintains backward compatibility alias for AVATAR category", () => {
    expect(COSMETICS_CATALOG.AVATAR).toBe(COSMETICS_CATALOG.CLASS);
  });

  it("resolves specific classes correctly via getClassInfo", () => {
    const scholar = getClassInfo("class_scholar");
    expect(scholar.name).toBe("Scholar");
    expect(scholar.value).toBe("/classes/scholar.png");

    const strategist = getClassInfo("class_strategist");
    expect(strategist.name).toBe("Strategist");

    const analyst = getClassInfo("class_analyst");
    expect(analyst.name).toBe("Analyst");
  });

  it("gracefully maps legacy avatar IDs to modern classes without breaking", () => {
    expect(getClassInfo("avatar_default").name).toBe("Scholar");
    expect(getClassInfo("avatar_shadow").name).toBe("Strategist");
    expect(getClassInfo("avatar_monarch").name).toBe("Analyst");
    expect(getClassInfo("default").name).toBe("Scholar");
    expect(getClassInfo(null).name).toBe("Scholar");
    expect(getClassInfo(undefined).name).toBe("Scholar");
    expect(getClassInfo("unknown_id_123").name).toBe("Scholar");
  });
});
