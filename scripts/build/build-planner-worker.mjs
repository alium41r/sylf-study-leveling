import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
if (Number(process.versions.node.split(".")[0]) !== 26) throw new Error("Planner web/worker qualification pins Node major 26.");
execFileSync(resolve(root, "node_modules/.bin/tsc"), ["-p", "config/tsconfig.planner-worker.json"], { cwd: root, stdio: "inherit" });
writeFileSync(resolve(root, "dist/planner-worker/main.js"), '"use strict";\nrequire("./planner/v2/main.js");\n');
