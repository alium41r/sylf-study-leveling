/** Exact local PDF.js assets, no CDN/network and no application content. */
import { cpSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "../.."),
  source = join(root, "node_modules/pdfjs-dist");
const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
if (pkg.version !== "6.4.299" || pkg.license !== "Apache-2.0")
  throw new Error(
    "Requalify PDF.js and its resource notices before changing versions."
  );
const out = join(root, "public/notes-pdf/6.4.299");
mkdirSync(out, { recursive: true });
copyFileSync(
  join(source, "build/pdf.worker.min.mjs"),
  join(out, "pdf.worker.min.mjs")
);
copyFileSync(join(source, "LICENSE"), join(out, "LICENSE"));
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"])
  cpSync(join(source, name), join(out, name), { recursive: true });
console.log("Pinned PDF.js worker and local resource/license files copied.");
