import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import { CompanionArt } from "@/app/components/landing/companion/artwork";

const painting = sharp(
  readFileSync("public/landing/companion/original-rig.webp")
)
  .png()
  .toBuffer()
  .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`);

async function rig(
  jointSeams: boolean,
  omitMovingParts = false,
  moving = false
) {
  const source = renderToStaticMarkup(
    <CompanionArt
      id="qa-rig"
      expression="NEUTRAL"
      action="FLOATING"
      jointSeams={jointSeams}
    />
  );
  const holder = document.createElement("div");
  holder.innerHTML = source;
  const svg = holder.querySelector("svg")!;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "252");
  svg.setAttribute("height", "346");
  svg.querySelector("image")!.setAttribute("href", await painting);
  if (omitMovingParts) {
    svg.querySelector('[data-part="cloak"]')!.remove();
    svg.querySelector('[data-part="lower-body"]')!.remove();
  }
  if (moving) {
    svg
      .querySelector('[data-part="cape-lag"]')!
      .setAttribute(
        "transform",
        "translate(0 18) rotate(3.4 491 605) translate(491 605) skewX(8) translate(-491 -605)"
      );
    svg
      .querySelector('[data-part="lower-body-lag"]')!
      .setAttribute("transform", "rotate(5.2 491 617) translate(0 3)");
  }
  return sharp(Buffer.from(svg.outerHTML))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

it("keeps the neutral painted silhouette while removing stationary spare tails", async () => {
  const [before, after, oldBase, newBase] = await Promise.all([
    rig(false),
    rig(true),
    rig(false, true),
    rig(true, true),
  ]);
  let changed = 0,
    opaque = 0,
    oldTail = 0,
    newTail = 0;
  for (let p = 0; p < before.data.length; p += 4) {
    if (before.data[p + 3] > 100) opaque++;
    if (
      Math.max(
        ...[0, 1, 2, 3].map((c) =>
          Math.abs(before.data[p + c] - after.data[p + c])
        )
      ) > 16
    )
      changed++;
    const y = Math.floor(p / 4 / before.info.width);
    if (y >= Math.floor((760 - 28) * 0.4)) {
      if (oldBase.data[p + 3] > 100) oldTail++;
      if (newBase.data[p + 3] > 100) newTail++;
    }
  }
  console.log({
    neutralChangedPixels: changed,
    opaquePixels: opaque,
    oldStationaryTailPixels: oldTail,
    newStationaryTailPixels: newTail,
  });
  if (process.env.SYLF_QA_ARTIFACTS) {
    const dir = "documentation/landing-companion/performance";
    mkdirSync(dir, { recursive: true });
    const poses = {
      "neutral-before": before,
      "neutral-after": after,
      "stationary-underlay-before": oldBase,
      "stationary-underlay-after": newBase,
      "moving-before": await rig(false, false, true),
      "moving-after": await rig(true, false, true),
    };
    for (const [name, { data, info }] of Object.entries(poses))
      await sharp(data, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toFile(`${dir}/${name}.png`);
    writeFileSync(
      `${dir}/layering-measurements.json`,
      JSON.stringify({ changed, opaque, oldTail, newTail }, null, 2)
    );
  }
  expect(changed / opaque).toBeLessThan(0.015);
  expect(newTail).toBeLessThan(oldTail * 0.2);
});
