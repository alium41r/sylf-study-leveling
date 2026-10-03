import fs from "fs";
import path from "path";
import sharp from "sharp";

const ARTIFACT_DIR = "/Users/aliumair/.gemini/antigravity-ide/brain/25fcef4d-d9cb-41ad-9e2a-69f0c8d0bd29";
const maleSvgPath = path.resolve(process.cwd(), "sylvs/base/male/base-male.svg");
const femaleSvgPath = path.resolve(process.cwd(), "sylvs/base/female/base-female.svg");

function resolveCssVarsForRaster(svgStr, gender) {
  const primary = gender === "female" ? "#FAF5F3" : "#F6F5F2";
  const secondary = gender === "female" ? "#EAD3D3" : "#CAD5E2";
  const accent = gender === "female" ? "#DBBEBE" : "#B8C7D8";
  const eye = gender === "female" ? "#3E292B" : "#2D3342";

  return svgStr
    .replace(/var\(--sylv-primary,\s*[^)]+\)/g, primary)
    .replace(/var\(--sylv-secondary,\s*[^)]+\)/g, secondary)
    .replace(/var\(--sylv-accent,\s*[^)]+\)/g, accent)
    .replace(/var\(--sylv-eye,\s*[^)]+\)/g, eye);
}

async function render() {
  const maleSvgRaw = fs.readFileSync(maleSvgPath, "utf-8");
  const femaleSvgRaw = fs.readFileSync(femaleSvgPath, "utf-8");

  const maleSvgResolved = resolveCssVarsForRaster(maleSvgRaw, "male");
  const femaleSvgResolved = resolveCssVarsForRaster(femaleSvgRaw, "female");

  const sizes = [
    { width: 48, height: 72, label: "48px" },
    { width: 140, height: 210, label: "140px" },
    { width: 380, height: 570, label: "380px" },
  ];

  for (const s of sizes) {
    const maleOut = path.join(ARTIFACT_DIR, `male_${s.label}.png`);
    const femaleOut = path.join(ARTIFACT_DIR, `female_${s.label}.png`);

    await sharp(Buffer.from(maleSvgResolved))
      .resize(s.width, s.height)
      .png()
      .toFile(maleOut);

    await sharp(Buffer.from(femaleSvgResolved))
      .resize(s.width, s.height)
      .png()
      .toFile(femaleOut);

    console.log(`Rendered ${s.label}: ${maleOut}, ${femaleOut}`);
  }

  // Also create a side-by-side comparison board with dark background
  const maleBuf = await sharp(Buffer.from(maleSvgResolved)).resize(360, 540).png().toBuffer();
  const femaleBuf = await sharp(Buffer.from(femaleSvgResolved)).resize(360, 540).png().toBuffer();

  await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 4,
      background: { r: 18, g: 20, b: 26, alpha: 1 },
    },
  })
    .composite([
      { input: maleBuf, top: 30, left: 30 },
      { input: femaleBuf, top: 30, left: 410 },
    ])
    .png()
    .toFile(path.join(ARTIFACT_DIR, "male_female_side_by_side_380px.png"));

  console.log("Comparison board rendered:", path.join(ARTIFACT_DIR, "male_female_side_by_side_380px.png"));
}

render().catch(console.error);
