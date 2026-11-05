// The pinned PDF.js worker and its resources, copied into the app's public folder so the web export and Electron serve them locally,
// exactly as the web app's scripts/build/build-notes-pdf-assets.mjs does. No CDN, no network.
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const source = join(workspace, "node_modules/pdfjs-dist");
const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
if (pkg.version !== "6.4.299" || pkg.license !== "Apache-2.0") throw new Error("Requalify PDF.js and its resource notices before changing versions.");
const out = join(workspace, "apps/sylf/public/notes-pdf/6.4.299");
if (!existsSync(join(out, "pdf.worker.min.mjs"))) {
  mkdirSync(out, { recursive: true });
  copyFileSync(join(source, "build/pdf.worker.min.mjs"), join(out, "pdf.worker.min.mjs"));
  copyFileSync(join(source, "LICENSE"), join(out, "LICENSE"));
  for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(join(source, name), join(out, name), { recursive: true });
}
