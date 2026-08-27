/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatScholarId, generateRandomScholarId } from "@/lib/scholar-id";
import { signToken, verifyToken, type AuthTokenPayload } from "@/lib/auth";
import { validateUsername, generateUniqueUsername } from "@/lib/auth-service";
import { isOAuthProvider, getOAuthAuthorizationUrl } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

// The global vitest.setup shim mocks lib/auth-server for route tests. These
// tests exercise the REAL revocation semantics, so resolve the actual module.
const authServer = await vi.importActual<typeof import("@/lib/auth-server")>("@/lib/auth-server");
const getSession = authServer.getSession;

describe("Phase 1: Scholar ID Formatting & Generation", () => {
  it("formats numeric IDs into 6-digit zero-padded Scholar IDs", () => {
    expect(formatScholarId(1)).toBe("#000001");
    expect(formatScholarId(42)).toBe("#000042");
    expect(formatScholarId(123456)).toBe("#123456");
  });

  it("generates 6-character random alphanumeric Scholar ID fallback", () => {
    const id = generateRandomScholarId();
    expect(id).toMatch(/^#[A-Z0-9]{6}$/);
  });
});

describe("Phase 1: Username Validation & Sanitization", () => {
  it("accepts valid alphanumeric and underscored usernames", () => {
    expect(validateUsername("shadow_monarch").valid).toBe(true);
    expect(validateUsername("hunter123").valid).toBe(true);
    expect(validateUsername("E_Rank").valid).toBe(true);
    expect(validateUsername("E_Rank").sanitized).toBe("e_rank");
  });

  it("rejects usernames that are too short, too long, or contain invalid characters", () => {
    expect(validateUsername("ab").valid).toBe(false);
    expect(validateUsername("this_username_is_way_too_long_for_system").valid).toBe(false);
    expect(validateUsername("user@name").valid).toBe(false);
    expect(validateUsername("user name").valid).toBe(false);
    expect(validateUsername("user!").valid).toBe(false);
  });
});

describe("Phase 1: Core JWT Auth Engine & Session Extraction", () => {
  const mockPayload: AuthTokenPayload = {
    userId: 101,
    email: "sung.jinwoo@system.dev",
    username: "jinwoo",
    name: "Sung Jin-Woo",
    scholarId: "#000101",
    verificationStatus: "VERIFIED",
    hunterRank: "S",
    level: 50,
    tokenVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tokenVersion: 1 } as any);
  });

  it("signs and verifies JWT tokens with complete payload integrity", async () => {
    const token = await signToken(mockPayload, "1h");
    expect(typeof token).toBe("string");

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(mockPayload.userId);
    expect(verified?.email).toBe(mockPayload.email);
    expect(verified?.username).toBe(mockPayload.username);
    expect(verified?.scholarId).toBe(mockPayload.scholarId);
    expect(verified?.verificationStatus).toBe("VERIFIED");
    expect(verified?.hunterRank).toBe("S");
  });

  it("returns null when verifying an invalid or tampered token", async () => {
    const invalidToken = "invalid.tampered.token";
    const verified = await verifyToken(invalidToken);
    expect(verified).toBeNull();
  });

  it("S3: tokens carry issuer and audience and verify against them", async () => {
    const token = await signToken(mockPayload, "1h");
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    expect(payload.iss).toBe(process.env.JWT_ISSUER || "sylf");
    expect(payload.aud).toBe(process.env.JWT_AUDIENCE || "sylf-app");
    expect(await verifyToken(token)).not.toBeNull();
  });

  it("S3: rejects tokens signed with a different issuer/audience", async () => {
    const originalIssuer = process.env.JWT_ISSUER;
    const originalAudience = process.env.JWT_AUDIENCE;
    // Mint under a different configuration...
    process.env.JWT_ISSUER = "evil-issuer";
    const forged = await signToken(mockPayload, "1h");
    process.env.JWT_ISSUER = originalIssuer;
    process.env.JWT_AUDIENCE = originalAudience;
    // ...and verify under ours: must fail.
    expect(await verifyToken(forged)).toBeNull();

    process.env.JWT_AUDIENCE = "evil-audience";
    const forgedAud = await signToken(mockPayload, "1h");
    process.env.JWT_AUDIENCE = originalAudience;
    expect(await verifyToken(forgedAud)).toBeNull();
  });

  it("S3: Bearer header alone no longer authenticates (cookie-only)", async () => {
    const token = await signToken(mockPayload, "1h");
    const req = new NextRequest("http://localhost:3000/api/user/stats", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const session = await getSession(req);
    expect(session).toBeNull();
  });

  it("extracts session from hunter_token cookie", async () => {
    const token = await signToken(mockPayload, "1h");
    const req = new NextRequest("http://localhost:3000/api/user/stats", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const session = await getSession(req);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(101);
    expect(session?.scholarId).toBe("#000101");
  });

  it("S3: rejects a cookie token whose tokenVersion no longer matches (revocation)", async () => {
    const token = await signToken(mockPayload, "1h");
    const req = new NextRequest("http://localhost:3000/api/user/stats", {
      headers: { cookie: `hunter_token=${token}` },
    });

    // logout-all / password change bumped the version in the DB.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tokenVersion: 2 } as any);
    const revoked = await getSession(req);
    expect(revoked).toBeNull();

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ tokenVersion: 1 } as any);
    const active = await getSession(req);
    expect(active).not.toBeNull();
  });

  it("S3: rejects when the user record is missing", async () => {
    const token = await signToken(mockPayload, "1h");
    const req = new NextRequest("http://localhost:3000/api/user/stats", {
      headers: { cookie: `hunter_token=${token}` },
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    expect(await getSession(req)).toBeNull();
  });
});

describe("Phase 1: OAuth Configuration & Provider Registry", () => {
  it("identifies supported OAuth providers", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("GOOGLE")).toBe(true);
    expect(isOAuthProvider("github")).toBe(true);
    expect(isOAuthProvider("discord")).toBe(true);
    expect(isOAuthProvider("instagram")).toBe(true);
    expect(isOAuthProvider("facebook")).toBe(false);
  });

  it("generates valid OAuth redirect URLs with state parameter", () => {
    process.env.GOOGLE_CLIENT_ID = "mock_client_id.apps.googleusercontent.com";
    const state = "test_csrf_state_12345";
    const redirectUri = "http://localhost:3000/api/auth/callback/google";

    const googleUrl = getOAuthAuthorizationUrl("google", state, redirectUri);
    expect(googleUrl).toContain(encodeURIComponent(state));
    expect(googleUrl).toContain("accounts.google.com");
  });
});
