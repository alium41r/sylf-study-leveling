import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence =
  root + "documentation/notes/reports/2026-10-24-fluid-phase-3/evidence/";
const { chromium } = await import(
  process.env.NOTES_PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = {};
try {
  for (const name of [
    "open",
    "regression",
    "creative",
    "workflows",
    "fresh",
    "fluid",
    "scale",
  ]) {
    if (name === "fresh")
      for (const context of browser.contexts())
        if (context !== page.context()) await context.close();
    const { default: fn } = await import(
      (["open", "fresh"].includes(name) ? "../notes-redesign/" : "./") +
        (name === "fresh" ? "open" : name) +
        ".mjs"
    );
    results[name] = await fn(page, { root, evidence });
    console.log(name, JSON.stringify(results[name]));
  }
  if ([...results.open.errors, ...results.fresh.errors].length)
    throw new Error(
      "Browser errors: " +
        [...results.open.errors, ...results.fresh.errors].join("\n")
    );
  rmSync(evidence + "failure.png", { force: true });
  writeFileSync(
    new URL(
      "../../../documentation/notes/reports/2026-10-24-fluid-phase-3/evidence/browser-results.json",
      import.meta.url
    ),
    JSON.stringify(results, null, 2) + "\n"
  );
} catch (error) {
  for (const p of browser
    .contexts()
    .flatMap((c) => c.pages())
    .slice(-1)) {
    await p.screenshot({ path: evidence + "failure.png" }).catch(() => {});
    console.error("FAILURE STATE", await p.locator("body").innerText());
    console.error(
      "DOC STATE",
      await p.evaluate(() => ({
        notes: window.qa?.library?.snapshot().notes.map((n) => ({
          title: n.view.descriptor.title,
          pages: n.view.descriptor.pages,
          assets: n.view.descriptor.assets,
          streams: n.view.descriptor.streams,
        })),
        html: document.querySelector(".bn-editor")?.innerHTML,
      }))
    );
  }
  throw error;
} finally {
  await browser.close();
}
