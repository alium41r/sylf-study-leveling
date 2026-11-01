// @ts-check
// Captures Showcase chapters at every scroll position for a person to review (run with --sylf-review-capture). This checks
// nothing by itself: a contrast test cannot say whether a page looks right. SYLF_REVIEW_OUT sets the folder.
// SYLF_REVIEW_LINK adds to each app link (custom colors, say), and SYLF_REVIEW_OPEN lists labels to click first.
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { APP_ORIGIN } from "./security.mjs";

const CHAPTERS = (process.env.SYLF_REVIEW_CHAPTERS ?? "color,type,icons,fields,feedback,layout,input").split(",");
const THEMES = (process.env.SYLF_REVIEW_THEMES ?? "signature").split(",");
const MODES = (process.env.SYLF_REVIEW_MODES ?? "light,dark").split(",");
const LINK = process.env.SYLF_REVIEW_LINK ?? "";
const OPEN = (process.env.SYLF_REVIEW_OPEN ?? "").split(",").filter(Boolean);
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {Electron.BrowserWindow} window */
export async function runReviewCapture(window) {
  const contents = window.webContents;
  const out = process.env.SYLF_REVIEW_OUT ?? path.join(app.getPath("temp"), "sylf-review");
  fs.mkdirSync(out, { recursive: true });
  const js = (/** @type {string} */ code) => contents.executeJavaScript(code);
  window.setContentSize(Number(process.env.SYLF_REVIEW_WIDTH ?? 1280), Number(process.env.SYLF_REVIEW_HEIGHT ?? 820));
  for (const theme of THEMES) for (const mode of MODES) for (const chapter of CHAPTERS) {
    await contents.loadURL(`${APP_ORIGIN}/?chapter=${chapter}&theme=${theme}&mode=${mode}${LINK}`);
    await sleep(1500);
    await js("document.fonts.ready.then(() => true)");
    for (const label of OPEN) {
      await js(`[...document.querySelectorAll('[aria-label]')].filter((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)}).forEach((e) => e.click()); true`);
      await sleep(400);
    }
    const pages = await js(`(() => { const all = [...document.querySelectorAll('div')].filter((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible' && e.clientWidth > 300); window.__s = all.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; const s = window.__s; return s ? Math.min(8, Math.ceil(s.scrollHeight / (s.clientHeight * 0.9))) : 1; })()`);
    for (let page = 0; page < pages; page++) {
      await js(`window.__s && (window.__s.scrollTop = window.__s.clientHeight * 0.9 * ${page}); true`);
      await sleep(300);
      const image = await contents.capturePage();
      fs.writeFileSync(path.join(out, `${theme}-${mode}-${chapter}-${page}.png`), image.toPNG());
    }
  }
  console.log("SYLF_REVIEW_CAPTURE done");
  app.exit(0);
}
