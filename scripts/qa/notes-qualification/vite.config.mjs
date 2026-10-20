import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const forbidden = [
  /@prisma\/client/,
  /\/lib\/auth-server/,
  /\/lib\/prisma/,
  /server-only/,
  /bcryptjs/,
  /\/lib\/planner\/server\//,
];
export default defineConfig({
  root: directory,
  publicDir: false,
  resolve: { alias: { "@": root } },
  build: {
    outDir:
      process.env.NOTES_QUALIFICATION_OUT ||
      "/private/tmp/sylf-notes-phase2-dist",
    emptyOutDir: true,
    target: "es2022",
  },
  plugins: [
    {
      name: "notes-client-boundary",
      generateBundle(_options, bundle) {
        const modules = [
          ...new Set(
            Object.values(bundle)
              .filter((item) => item.type === "chunk")
              .flatMap((item) => Object.keys(item.modules))
          ),
        ];
        const violations = modules.filter((id) =>
          forbidden.some((pattern) => pattern.test(id))
        );
        if (violations.length)
          throw new Error(
            "Server imports in shared Notes graph: " + violations.join(",")
          );
        this.emitFile({
          type: "asset",
          fileName: "client-boundary.json",
          source: JSON.stringify(
            { moduleCount: modules.length, violations },
            null,
            2
          ),
        });
      },
    },
  ],
  preview: { host: "127.0.0.1", port: 4389, strictPort: true },
});
