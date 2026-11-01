import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
      "next/navigation": path.join(
        root,
        "mobile/src/adapters/navigation/next-navigation.tsx"
      ),
      "next/link": path.join(
        root,
        "mobile/src/adapters/navigation/next-link.tsx"
      ),
      "next/image": path.join(
        root,
        "mobile/src/adapters/navigation/next-image.tsx"
      ),
    },
  },
  build: {
    outDir: "/private/tmp/sylf-planner-workspace-ui",
    emptyOutDir: true,
    target: "es2022",
  },
  server: { host: "127.0.0.1", port: 4393, strictPort: true },
  preview: { host: "127.0.0.1", port: 4393, strictPort: true },
});
