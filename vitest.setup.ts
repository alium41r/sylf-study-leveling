import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { jwtVerify } from 'jose';

// S3: auth code fails closed when JWT_SECRET is missing — provide test values.
process.env.JWT_SECRET = process.env.JWT_SECRET || "s3-test-jwt-secret";
process.env.JWT_ISSUER = process.env.JWT_ISSUER || "sylf";
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "sylf-app";
process.env.CRON_SECRET = process.env.CRON_SECRET || "s4-test-cron-secret";
process.env.TOOL_CONFIRMATION_SECRET = process.env.TOOL_CONFIRMATION_SECRET || "s4-test-tool-secret";

// jsdom in this vitest setup does not expose localStorage — provide a
// minimal in-memory implementation for the leadership-lease tests.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

// ─── S3 test shim ────────────────────────────────────────────────
// Route-handler tests construct requests with signed tokens and call the
// handlers directly. The real lib/auth-server resolves the httpOnly cookie
// AND checks the DB tokenVersion; this shim verifies the token signature the
// same way (cookie or legacy Bearer header for test convenience) and returns
// the payload without a DB round-trip, so existing suites keep working.
// Tests that need the REAL revocation semantics import it explicitly via
// `vi.importActual("@/lib/auth-server")` (see __tests__/auth/auth-engine.test.ts).
vi.mock("@/lib/auth-server", () => ({
  getSession: vi.fn(async (req: Request) => {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "s3-test-jwt-secret"
    );
    const issuer = process.env.JWT_ISSUER || "sylf";
    const audience = process.env.JWT_AUDIENCE || "sylf-app";

    const cookieHeader = req.headers.get("cookie") || "";
    const cookieMatch = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("hunter_token="));
    const bearer = req.headers.get("authorization") || "";
    const token = cookieMatch
      ? cookieMatch.substring("hunter_token=".length)
      : bearer.startsWith("Bearer ")
        ? bearer.split(" ")[1]
        : null;
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret, { issuer, audience });
      if (!payload || !payload.userId) return null;
      return { ...payload, userId: Number(payload.userId) };
    } catch {
      // Legacy suites pass literal fake tokens ("test-token", "mock-jwt-token")
      // — accept any non-JWT literal as a synthetic test session.
      if (!token.includes(".")) {
        return { userId: 1, email: "test@system.dev" };
      }
      return null;
    }
  }),
}));
