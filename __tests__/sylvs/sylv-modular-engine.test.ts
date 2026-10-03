import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SYLV_ANCHORS,
  SYLV_ANCHOR_LIST,
  SYLV_CANVAS_HEIGHT,
  SYLV_CANVAS_WIDTH,
  SYLV_VIEWBOX,
} from "../../lib/sylvs/anchors";
import {
  DEFAULT_FEMALE_COLORS,
  DEFAULT_MALE_COLORS,
  SYLV_COLOR_PRESETS,
  SYLV_CSS_VARS,
  getDefaultColors,
  resolveSylvCssVariables,
} from "../../lib/sylvs/colors";
import { createDefaultSylvAppearance } from "../../lib/sylvs/registry";
import { SylvAnchorKey } from "../../lib/sylvs/types";

describe("Sylv Modular Character System (Phase 1)", () => {
  describe("1. Canonical Coordinate System & Anchors", () => {
    it("has canonical viewBox matching 400 x 600", () => {
      expect(SYLV_CANVAS_WIDTH).toBe(400);
      expect(SYLV_CANVAS_HEIGHT).toBe(600);
      expect(SYLV_VIEWBOX).toBe("0 0 400 600");
    });

    it("defines all 15 explicit canonical anchors", () => {
      const requiredAnchors: SylvAnchorKey[] = [
        "HEAD",
        "FACE",
        "LEFT_EYE",
        "RIGHT_EYE",
        "LEFT_EAR",
        "RIGHT_EAR",
        "BODY",
        "LEFT_ARM",
        "RIGHT_ARM",
        "TAIL_ROOT",
        "TAIL_MID",
        "TAIL_TIP",
        "HEAD_ACCESSORY",
        "CHEST_ACCESSORY",
        "FLOATING_ACCESSORY",
      ];

      expect(SYLV_ANCHOR_LIST.length).toBe(15);
      for (const key of requiredAnchors) {
        expect(SYLV_ANCHORS[key]).toBeDefined();
        expect(SYLV_ANCHORS[key].key).toBe(key);
        expect(typeof SYLV_ANCHORS[key].name).toBe("string");
        expect(typeof SYLV_ANCHORS[key].description).toBe("string");
      }
    });

    it("verifies all anchor coordinates lie within canvas boundaries", () => {
      for (const anchor of SYLV_ANCHOR_LIST) {
        expect(anchor.point.x).toBeGreaterThanOrEqual(0);
        expect(anchor.point.x).toBeLessThanOrEqual(SYLV_CANVAS_WIDTH);
        expect(anchor.point.y).toBeGreaterThanOrEqual(0);
        expect(anchor.point.y).toBeLessThanOrEqual(SYLV_CANVAS_HEIGHT);
      }
    });

    it("enforces bilateral symmetry about center X = 200 for paired anatomy", () => {
      const centerX = SYLV_CANVAS_WIDTH / 2;

      // Eyes
      const leftEyeDist = centerX - SYLV_ANCHORS.LEFT_EYE.point.x;
      const rightEyeDist = SYLV_ANCHORS.RIGHT_EYE.point.x - centerX;
      expect(leftEyeDist).toBe(rightEyeDist);
      expect(SYLV_ANCHORS.LEFT_EYE.point.y).toBe(SYLV_ANCHORS.RIGHT_EYE.point.y);

      // Ears
      const leftEarDist = centerX - SYLV_ANCHORS.LEFT_EAR.point.x;
      const rightEarDist = SYLV_ANCHORS.RIGHT_EAR.point.x - centerX;
      expect(leftEarDist).toBe(rightEarDist);
      expect(SYLV_ANCHORS.LEFT_EAR.point.y).toBe(SYLV_ANCHORS.RIGHT_EAR.point.y);

      // Arms / Shoulders
      const leftArmDist = centerX - SYLV_ANCHORS.LEFT_ARM.point.x;
      const rightArmDist = SYLV_ANCHORS.RIGHT_ARM.point.x - centerX;
      expect(leftArmDist).toBe(rightArmDist);
      expect(SYLV_ANCHORS.LEFT_ARM.point.y).toBe(SYLV_ANCHORS.RIGHT_ARM.point.y);
    });

    it("ensures central midline anchors align precisely at X = 200", () => {
      expect(SYLV_ANCHORS.HEAD.point.x).toBe(200);
      expect(SYLV_ANCHORS.FACE.point.x).toBe(200);
      expect(SYLV_ANCHORS.BODY.point.x).toBe(200);
      expect(SYLV_ANCHORS.TAIL_ROOT.point.x).toBe(200);
      expect(SYLV_ANCHORS.HEAD_ACCESSORY.point.x).toBe(200);
      expect(SYLV_ANCHORS.CHEST_ACCESSORY.point.x).toBe(200);
    });
  });

  describe("2. Color Architecture & Dynamic CSS Custom Properties", () => {
    it("maps color keys to expected --sylv-* CSS variable tokens", () => {
      expect(SYLV_CSS_VARS.primary).toBe("--sylv-primary");
      expect(SYLV_CSS_VARS.secondary).toBe("--sylv-secondary");
      expect(SYLV_CSS_VARS.accent).toBe("--sylv-accent");
      expect(SYLV_CSS_VARS.eye).toBe("--sylv-eye");
      expect(SYLV_CSS_VARS.marking).toBe("--sylv-marking");
      expect(SYLV_CSS_VARS.glow).toBe("--sylv-glow");
    });

    it("resolves CSS variables dynamically from color objects", () => {
      const vars = resolveSylvCssVariables({
        primary: "#FFFFFF",
        secondary: "#CCCCCC",
        eye: "#111111",
        accent: "#AAAAAA",
        marking: "#999999",
        glow: "rgba(255, 255, 255, 0.5)",
      });

      expect(vars["--sylv-primary"]).toBe("#FFFFFF");
      expect(vars["--sylv-secondary"]).toBe("#CCCCCC");
      expect(vars["--sylv-eye"]).toBe("#111111");
      expect(vars["--sylv-accent"]).toBe("#AAAAAA");
      expect(vars["--sylv-marking"]).toBe("#999999");
      expect(vars["--sylv-glow"]).toBe("rgba(255, 255, 255, 0.5)");
    });

    it("provides valid canonical default baselines for male and female", () => {
      expect(getDefaultColors("male")).toEqual(DEFAULT_MALE_COLORS);
      expect(getDefaultColors("female")).toEqual(DEFAULT_FEMALE_COLORS);

      expect(DEFAULT_MALE_COLORS.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(DEFAULT_FEMALE_COLORS.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(DEFAULT_MALE_COLORS.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(DEFAULT_FEMALE_COLORS.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it("contains robust color presets", () => {
      expect(SYLV_COLOR_PRESETS.length).toBeGreaterThanOrEqual(5);
      for (const preset of SYLV_COLOR_PRESETS) {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.colors.primary).toBeTruthy();
        expect(preset.colors.secondary).toBeTruthy();
        expect(preset.colors.eye).toBeTruthy();
      }
    });
  });

  describe("3. Metadata & Asset Directory Schema", () => {
    const rootDir = process.cwd();

    it("validates categories.json schema and layer hierarchy", () => {
      const categoriesPath = path.join(rootDir, "sylvs/metadata/categories.json");
      expect(fs.existsSync(categoriesPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));
      expect(data.system).toBe("sylv");
      expect(Array.isArray(data.categories)).toBe(true);
      expect(data.categories.length).toBeGreaterThan(10);

      // Verify layers are strictly ordered by zIndexLayer
      const zIndexes = data.categories.map((c: { zIndexLayer: number }) => c.zIndexLayer);
      for (let i = 1; i < zIndexes.length; i++) {
        expect(zIndexes[i]).toBeGreaterThanOrEqual(zIndexes[i - 1]);
      }
    });

    it("validates assets.json contains canonical male and female bases", () => {
      const assetsPath = path.join(rootDir, "sylvs/metadata/assets.json");
      expect(fs.existsSync(assetsPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(assetsPath, "utf-8"));
      expect(data.system).toBe("sylv");
      expect(Array.isArray(data.assets)).toBe(true);

      const maleAsset = data.assets.find((a: { id: string }) => a.id === "base-male");
      const femaleAsset = data.assets.find((a: { id: string }) => a.id === "base-female");

      expect(maleAsset).toBeDefined();
      expect(maleAsset.gender).toBe("male");
      expect(maleAsset.category).toBe("base");

      expect(femaleAsset).toBeDefined();
      expect(femaleAsset.gender).toBe("female");
      expect(femaleAsset.category).toBe("base");
    });

    it("validates compatibility.json defines canvas specifications", () => {
      const compatPath = path.join(rootDir, "sylvs/metadata/compatibility.json");
      expect(fs.existsSync(compatPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(compatPath, "utf-8"));
      expect(data.system).toBe("sylv");
      expect(data.rules.canvas.viewBox).toBe("0 0 400 600");
    });
  });

  describe("4. Static SVG Asset Cleanliness & Geometry Quality", () => {
    const rootDir = process.cwd();
    const maleSvgPath = path.join(rootDir, "sylvs/base/male/base-male.svg");
    const femaleSvgPath = path.join(rootDir, "sylvs/base/female/base-female.svg");

    it("verifies male base SVG structure and complexity limits", () => {
      expect(fs.existsSync(maleSvgPath)).toBe(true);
      const content = fs.readFileSync(maleSvgPath, "utf-8");

      expect(content).toContain('viewBox="0 0 400 600"');
      expect(content).toContain("var(--sylv-primary");
      expect(content).toContain("var(--sylv-secondary");
      expect(content).toContain("var(--sylv-eye");
      expect(content).toContain('id="sylv-character-root"');
      expect(content).toContain('id="sylv-tail"');
      expect(content).toContain('id="sylv-head"');
      expect(content).toContain('id="sylv-arms"');

      // Check path complexity (high-fidelity vector preservation)
      const pathCount = (content.match(/<path\b/gi) || []).length;
      expect(pathCount).toBeGreaterThanOrEqual(25);
      expect(pathCount).toBeLessThan(60); // High-fidelity vector range
    });

    it("verifies female base SVG structure and complexity limits", () => {
      expect(fs.existsSync(femaleSvgPath)).toBe(true);
      const content = fs.readFileSync(femaleSvgPath, "utf-8");

      expect(content).toContain('viewBox="0 0 400 600"');
      expect(content).toContain("var(--sylv-primary");
      expect(content).toContain("var(--sylv-secondary");
      expect(content).toContain("var(--sylv-eye");
      expect(content).toContain('id="sylv-character-root"');
      expect(content).toContain('id="sylv-tail"');
      expect(content).toContain('id="sylv-head"');
      expect(content).toContain('id="sylv-arms"');

      const pathCount = (content.match(/<path\b/gi) || []).length;
      expect(pathCount).toBeGreaterThanOrEqual(25);
      expect(pathCount).toBeLessThan(60);
    });
  });

  describe("5. Registry & Model Instantiation", () => {
    it("instantiates default male appearance correctly", () => {
      const app = createDefaultSylvAppearance("male");
      expect(app.gender).toBe("male");
      expect(app.colors.primary).toBe(DEFAULT_MALE_COLORS.primary);
      expect(app.colors.secondary).toBe(DEFAULT_MALE_COLORS.secondary);
      expect(app.colors.eye).toBe(DEFAULT_MALE_COLORS.eye);
    });

    it("instantiates default female appearance correctly", () => {
      const app = createDefaultSylvAppearance("female");
      expect(app.gender).toBe("female");
      expect(app.colors.primary).toBe(DEFAULT_FEMALE_COLORS.primary);
      expect(app.colors.secondary).toBe(DEFAULT_FEMALE_COLORS.secondary);
      expect(app.colors.eye).toBe(DEFAULT_FEMALE_COLORS.eye);
    });

    it("allows custom overrides during instantiation", () => {
      const app = createDefaultSylvAppearance("male", {
        primary: "#123456",
        eye: "#654321",
      });
      expect(app.colors.primary).toBe("#123456");
      expect(app.colors.eye).toBe("#654321");
      expect(app.colors.secondary).toBe(DEFAULT_MALE_COLORS.secondary);
    });
  });
});
