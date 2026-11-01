import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { cpSync } from "node:fs";
const root = path.resolve(import.meta.dirname, "../../..");
export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [
    react(),
    {
      name: "notes-pdf-qa-assets",
      writeBundle() {
        cpSync(
          path.join(root, "public/notes-pdf"),
          "/private/tmp/sylf-notes-phase3-ui/notes-pdf",
          { recursive: true }
        );
      },
    },
  ],
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
    outDir: "/private/tmp/sylf-notes-phase3-ui",
    emptyOutDir: true,
    target: "es2022",
  },
  server: { host: "127.0.0.1", port: 4390, strictPort: true },
  preview: { host: "127.0.0.1", port: 4390, strictPort: true },
});
