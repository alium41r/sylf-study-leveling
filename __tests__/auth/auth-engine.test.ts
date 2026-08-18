/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatScholarId, generateRandomScholarId } from "@/lib/scholar-id";
import { signToken, verifyToken, getSession, type AuthTokenPayload } from "@/lib/auth";
import { validateUsername, generateUniqueUsername } from "@/lib/auth-service";
import { isOAuthProvider, getOAuthAuthorizationUrl } from "@/lib/oauth";
import { NextRequest } from "next/server";

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
  };

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

  it("extracts session from Authorization Bearer header", async () => {
    const token = await signToken(mockPayload, "1h");
    const req = new NextRequest("http://localhost:3000/api/user/stats", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    const session = await getSession(req);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(101);
    expect(session?.username).toBe("jinwoo");
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
});

describe("Phase 1: OAuth Configuration & Provider Registry", () => {
  it("identifies supported OAuth providers", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("GOOGLE")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
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
