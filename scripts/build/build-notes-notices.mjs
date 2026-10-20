/** Ship exact pinned BlockNote covered source and dependency notices with web/mobile output. No network. */
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { zipSync } from "fflate";
const root = resolve(import.meta.dirname, "../.."),
  out = join(root, "public/notes-licenses");
mkdirSync(out, { recursive: true });
const seen = new Map();
function locate(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", name, "package.json");
    if (existsSync(candidate)) return dirname(candidate);
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Missing pinned dependency " + name);
    dir = parent;
  }
}
function walk(name, from = root) {
  const dir = realpathSync(locate(name, from));
  if (seen.has(dir)) return;
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  seen.set(dir, pkg);
  for (const dependency of Object.keys(pkg.dependencies || {}))
    walk(dependency, dir);
}
for (const name of [
  "./@blocknote/core",
  "./@blocknote/react",
  "dexie",
  "yjs",
  "y-prosemirror",
  "y-protocols",
  "fflate",
  "perfect-freehand",
])
  walk(name);
let text =
  "Sylf Notes third-party notices\nGenerated from installed package-lock.json versions. No third-party source files were changed by this phase.\nBlockNote core/react covered source: /notes-licenses/blocknote-0.56.0-source.zip\nCovered files remain under MPL-2.0; Sylf is a larger work with separately licensed files.\n\n";
for (const [dir, pkg] of [...seen].sort((a, b) =>
  a[1].name.localeCompare(b[1].name)
)) {
  text += `\n=== ${pkg.name} ${pkg.version} (${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license || "see package source")}) ===\nhttps://www.npmjs.com/package/${pkg.name}/v/${pkg.version}\n`;
  for (const file of readdirSync(dir).filter((f) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(f)
  )) {
    const path = join(dir, file);
    try {
      text += file + "\n" + readFileSync(path, "utf8") + "\n";
    } catch {
      /* Directories are not notices. */
    }
  }
}
writeFileSync(join(out, "notices.txt"), text);
for (const name of ["core", "react"]) {
  const pkg = JSON.parse(
    readFileSync(
      join(root, "node_modules/@blocknote", name, "package.json"),
      "utf8"
    )
  );
  if (pkg.version !== "0.56.0" || pkg.license !== "MPL-2.0")
    throw new Error(
      "Requalify BlockNote version and source offer before shipping."
    );
}
const sourceFiles = {};
function source(path, name) {
  const entries = readdirSync(path, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(path, entry.name),
      relative = name + "/" + entry.name;
    if (entry.isDirectory()) source(absolute, relative);
    else if (entry.isFile())
      sourceFiles[relative] = [
        new Uint8Array(readFileSync(absolute)),
        { mtime: new Date("1980-01-01T00:00:00Z") },
      ];
    else throw new Error("Unexpected covered-source file type");
  }
}
for (const name of ["core", "react"]) {
  const dir = join(root, "node_modules/@blocknote", name),
    prefix = "@blocknote/" + name;
  source(join(dir, "src"), prefix + "/src");
  for (const file of ["LICENSE", "package.json"])
    sourceFiles[prefix + "/" + file] = [
      new Uint8Array(readFileSync(join(dir, file))),
      { mtime: new Date("1980-01-01T00:00:00Z") },
    ];
}
writeFileSync(
  join(out, "blocknote-0.56.0-source.zip"),
  zipSync(sourceFiles, { level: 6 })
);
console.log(
  `Notes notices generated for ${seen.size} installed dependency packages; exact BlockNote source included.`
);
