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
  server: {
    host: "127.0.0.1",
    port: 4393,
    strictPort: true,
    fs: { allow: [root] },
  },
  preview: { host: "127.0.0.1", port: 4393, strictPort: true },
  build: {
    outDir: process.env.NOTES_QA_OUT_DIR || "/private/tmp/sylf-notes-phase7-ui",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        qualification: path.join(import.meta.dirname, "index.html"),
        workspace: path.join(import.meta.dirname, "workspace.html"),
        drivePdf: path.join(import.meta.dirname, "drive-pdf.html"),
      },
    },
  },
});
