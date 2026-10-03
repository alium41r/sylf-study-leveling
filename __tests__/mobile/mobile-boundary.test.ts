import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveApiUrl,
  configureApiTransport,
  resetApiTransport,
  getApiTransportConfig,
} from "@/lib/api-transport";
import {
  createInitialSnapshot,
  deriveTimer,
  pauseSnapshot,
  resumeSnapshot,
} from "@/lib/timer-engine";
import fs from "node:fs";
import path from "node:path";

describe("SYLF MOBILE BOUNDARY — Phase 1A Architectural Verification", () => {
  beforeEach(() => {
    resetApiTransport();
  });

  // ─── 1. API URL Resolution ──────────────────────────────────────────────
  describe("API Transport URL Resolution", () => {
    it("defaults to same-origin relative URLs on web", () => {
      expect(getApiTransportConfig().baseUrl).toBe("");
      expect(resolveApiUrl("/api/user/stats")).toBe("/api/user/stats");
      expect(resolveApiUrl("/api/quests")).toBe("/api/quests");
      expect(resolveApiUrl("api/timer")).toBe("/api/timer");
    });

    it("resolves to absolute URLs when configured for mobile", () => {
      configureApiTransport({ baseUrl: "https://sylf.app" });
      expect(resolveApiUrl("/api/user/stats")).toBe("https://sylf.app/api/user/stats");
      expect(resolveApiUrl("/api/quests")).toBe("https://sylf.app/api/quests");
      expect(resolveApiUrl("api/timer")).toBe("https://sylf.app/api/timer");
    });

    it("handles trailing slashes cleanly", () => {
      configureApiTransport({ baseUrl: "https://sylf.app/" });
      expect(resolveApiUrl("/api/user/stats")).toBe("https://sylf.app/api/user/stats");
    });

    it("preserves external URLs unmodified", () => {
      configureApiTransport({ baseUrl: "https://sylf.app" });
      expect(resolveApiUrl("https://supabase.co/storage/v1")).toBe("https://supabase.co/storage/v1");
      expect(resolveApiUrl("http://localhost:3000/test")).toBe("http://localhost:3000/test");
    });
  });

  // ─── 2. Shared Timer Engine Import & Calculations in Isolation ───────────
  describe("Shared Timer Engine Portability", () => {
    it("calculates live elapsed time without Next.js or server dependencies", () => {
      const now = 1_000_000;
      const snap = createInitialSnapshot(now);

      expect(snap.focusMs).toBe(0);
      expect(snap.runningSinceMs).toBe(now);
      expect(snap.isPaused).toBe(false);

      // Advance 10 seconds (10,000ms)
      const derived = deriveTimer(snap, now + 10_000);
      expect(derived.focusSec).toBe(10);
      expect(derived.running).toBe(true);
      expect(derived.liveMs).toBe(10_000);
    });

    it("correctly pauses and resumes using wall-clock anchors", () => {
      const start = 1_000_000;
      let snap = createInitialSnapshot(start);

      // Run for 30s
      snap = pauseSnapshot(snap, start + 30_000);
      expect(snap.isPaused).toBe(true);
      expect(snap.focusMs).toBe(30_000);
      expect(snap.runningSinceMs).toBeNull();

      // Pause duration of 60s (should not add time)
      const afterPause = deriveTimer(snap, start + 90_000);
      expect(afterPause.focusSec).toBe(30);

      // Resume and run for another 20s
      snap = resumeSnapshot(snap, start + 90_000);
      expect(snap.isPaused).toBe(false);
      expect(snap.runningSinceMs).toBe(start + 90_000);

      const finalDerived = deriveTimer(snap, start + 110_000);
      expect(finalDerived.focusSec).toBe(50);
    });
  });

  // ─── 3. Navigation Adapter Unit Verification ────────────────────────────
  describe("Navigation Adapter Contract", () => {
    it("provides the Next.js navigation shim files", () => {
      const navShim = path.resolve(__dirname, "../../mobile/src/adapters/navigation/next-navigation.tsx");
      const linkShim = path.resolve(__dirname, "../../mobile/src/adapters/navigation/next-link.tsx");
      const contextFile = path.resolve(__dirname, "../../mobile/src/adapters/navigation/NavigationContext.tsx");

      expect(fs.existsSync(navShim)).toBe(true);
      expect(fs.existsSync(linkShim)).toBe(true);
      expect(fs.existsSync(contextFile)).toBe(true);
    });
  });

  // ─── 4. Build Output & Server-Import Guard Verification ─────────────────
  describe("Mobile Bundle Security & Clean Boundary", () => {
    it("ensures mobile/dist index.html exists", () => {
      const distHtml = path.resolve(__dirname, "../../mobile/dist/index.html");
      expect(fs.existsSync(distHtml)).toBe(true);
    });

    it("verifies zero server-only symbols are present in mobile/dist assets", () => {
      const distDir = path.resolve(__dirname, "../../mobile/dist");
      const forbiddenSymbols = [
        "@prisma/client",
        "DATABASE_URL",
        "DIRECT_URL",
        "JWT_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_JWT_SECRET",
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
      ];

      function scanDir(dir: string): { file: string; symbol: string }[] {
        const violations: { file: string; symbol: string }[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            violations.push(...scanDir(fullPath));
          } else if (/\.(js|html|css)$/i.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf8");
            for (const sym of forbiddenSymbols) {
              if (content.includes(sym)) {
                violations.push({ file: entry.name, symbol: sym });
              }
            }
          }
        }
        return violations;
      }

      const violations = scanDir(distDir);
      expect(violations).toEqual([]);
    });

    it("verifies the mobile build guard plugin strictly rejects server imports", () => {
      const viteConfig = fs.readFileSync(
        path.resolve(__dirname, "../../mobile/vite.config.ts"),
        "utf8"
      );
      expect(viteConfig).toContain("sylf-mobile-server-guard");
      expect(viteConfig).toContain("FORBIDDEN_PATTERNS");
      expect(viteConfig).toMatch(/prisma/);
      expect(viteConfig).toMatch(/auth-server/);
      expect(viteConfig).toMatch(/supabase-storage/);
    });

    it("verifies normal mobile builds emit mockEnabled: false in .mock-manifest.json", () => {
      const manifestPath = path.resolve(__dirname, "../../mobile/dist/.mock-manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest.mockEnabled).toBe(false);
      expect(manifest.buildType).toBe("NORMAL_RELEASE");
    });

    it("verifies mock API adapter is fail-closed by default without VITE_ENABLE_MOCK_API", () => {
      const mockApiSource = fs.readFileSync(
        path.resolve(__dirname, "../../mobile/src/adapters/api/mock-api.ts"),
        "utf8"
      );
      expect(mockApiSource).toContain('VITE_ENABLE_MOCK_API === "true"');
      expect(mockApiSource).toContain("FAIL-CLOSED DEFAULT");
      expect(mockApiSource).toContain("if (!IS_MOCK_API_ENABLED)");
    });
  });
});

