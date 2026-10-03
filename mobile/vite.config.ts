import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

/**
 * Build-Time Server Guard Plugin
 * Strictly blocks server-only modules and secrets from being bundled into
 * the client mobile output.
 */
function serverGuardPlugin(): Plugin {
  const FORBIDDEN_PATTERNS = [
    /@prisma\/client/,
    /\/prisma\//,
    /\/lib\/prisma/,
    /\/lib\/auth-server/,
    /\/lib\/supabase-storage/,
    /\/lib\/auth-admin/,
    /\/lib\/ai\/providers/,
    /\/lib\/ai\/orchestrator/,
    /\/lib\/ai\/syllabus-compiler/,
    /(?:@|\.)?\/lib\/planner\/server\//,
    /bcryptjs/,
    /server-only/,
  ];

  return {
    name: "sylf-mobile-server-guard",
    resolveId(source, importer) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          throw new Error(
            `[MOBILE_BUILD_SECURITY_VIOLATION] Server-only module "${source}" cannot be imported into the mobile client bundle (imported by: ${importer || "unknown"}).`
          );
        }
      }
      return null;
    },
  };
}

function mockManifestPlugin(isMockEnabled: boolean): Plugin {
  return {
    name: "sylf-mobile-mock-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: ".mock-manifest.json",
        source: JSON.stringify(
          {
            mockEnabled: isMockEnabled,
            buildType: isMockEnabled ? "DEVELOPMENT_MOCK" : "NORMAL_RELEASE",
            builtAt: new Date().toISOString(),
          },
          null,
          2
        ),
      });
    },
  };
}

const isMockEnabled = process.env.VITE_ENABLE_MOCK_API === "true";

export default defineConfig({
  root: __dirname,
  publicDir: path.resolve(ROOT_DIR, "public"),
  plugins: [react(), serverGuardPlugin(), mockManifestPlugin(isMockEnabled)],
  resolve: {
    alias: {
      "@": ROOT_DIR,
      "next/navigation": path.resolve(__dirname, "src/adapters/navigation/next-navigation.tsx"),
      "next/link": path.resolve(__dirname, "src/adapters/navigation/next-link.tsx"),
      "next/image": path.resolve(__dirname, "src/adapters/navigation/next-image.tsx"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/framer-motion/")) {
            return "vendor-motion";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
        },
      },
    },
  },
});
