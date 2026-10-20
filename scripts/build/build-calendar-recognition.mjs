/** Build a separate, lazy worker. Model weights are fetched only by explicit
 * browser recognition, never bundled into the app or stored in Supabase. */
import { build } from "vite";
import { mkdir, copyFile, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = process.cwd(),
  out = path.join(root, "public/calendar-recognition");
const signature = createHash("sha256")
  .update(await readFile("lib/calendar/recognition.worker.ts"))
  .update(await readFile("package-lock.json"))
  .update(await readFile("scripts/build/build-calendar-recognition.mjs"))
  .update(await readFile("lib/calendar/recognition-NOTICES.txt"))
  .digest("hex");
try {
  if ((await readFile(path.join(out, "version"), "utf8")) === signature) {
    await stat(path.join(out, "worker.js"));
    process.exit(0);
  }
} catch {}
await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  resolve: { conditions: ["browser"] },
  build: {
    outDir: out,
    emptyOutDir: true,
    target: "es2022",
    minify: true,
    assetsInlineLimit: 0,
    license: { fileName: "THIRD-PARTY-LICENSES.md" },
    rolldownOptions: {
      input: path.join(root, "lib/calendar/recognition.worker.ts"),
      output: {
        entryFileNames: "worker.js",
        assetFileNames: "runtime/[name][extname]",
        format: "es",
        codeSplitting: false,
      },
    },
  },
});
await mkdir(path.join(out, "runtime"), { recursive: true });
for (const name of [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await copyFile(
    path.join(root, "node_modules/onnxruntime-web/dist", name),
    path.join(out, "runtime", name)
  );
await copyFile(
  "node_modules/@huggingface/transformers/LICENSE",
  path.join(out, "TRANSFORMERS-LICENSE")
);
const workerSize = (await stat(path.join(out, "worker.js"))).size;
if (workerSize > 3 * 1024 * 1024)
  throw new Error("Recognition worker unexpectedly embeds large assets.");
await copyFile(
  "lib/calendar/recognition-NOTICES.txt",
  path.join(out, "RUNTIME-NOTICES.txt")
);
await writeFile(path.join(out, "version"), signature);
console.log(
  "Built optional local handwriting worker. Model weights are not included."
);
