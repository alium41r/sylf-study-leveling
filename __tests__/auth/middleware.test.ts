/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { proxy as middleware } from "@/proxy";
import { signToken } from "@/lib/auth";
import { NextRequest } from "next/server";

describe("Phase 2: Next.js Edge Middleware Route Guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated request from /dashboard to /login", async () => {
    const req = new NextRequest("http://localhost:3000/dashboard");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirects unauthenticated request from /quests to /login with redirect query param", async () => {
    const req = new NextRequest("http://localhost:3000/quests");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?redirect=%2Fquests");
  });

  it("redirects unauthenticated request from /settings/account to /login with redirect query param", async () => {
    const req = new NextRequest("http://localhost:3000/settings/account");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?redirect=%2Fsettings%2Faccount");
  });

  it("allows unauthenticated visitor on public route /login", async () => {
    const req = new NextRequest("http://localhost:3000/login");
    const res = await middleware(req);

    // NextResponse.next() returns a 200 without redirect
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("allows unauthenticated visitor on public route /register", async () => {
    const req = new NextRequest("http://localhost:3000/register");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects authenticated user away from /login to /dashboard", async () => {
    const token = await signToken({
      userId: 1,
      email: "test@system.dev",
      username: "tester",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("redirects authenticated user away from /register to /dashboard", async () => {
    const token = await signToken({
      userId: 1,
      email: "test@system.dev",
      username: "tester",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/register", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("allows authenticated user with completed onboarding on /dashboard", async () => {
    const token = await signToken({
      userId: 1,
      email: "test@system.dev",
      username: "tester",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects authenticated user with incomplete onboarding from /dashboard to /onboarding", async () => {
    const token = await signToken({
      userId: 2,
      email: "fresh@system.dev",
      username: "fresh_user",
      hasCompletedOnboarding: false,
    });

    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("redirects authenticated user with completed onboarding from /onboarding to /dashboard", async () => {
    const token = await signToken({
      userId: 1,
      email: "veteran@system.dev",
      username: "veteran",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/onboarding", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("S3: force/logout GET params no longer clear a valid session cookie", async () => {
    const token = await signToken({
      userId: 1,
      email: "veteran@system.dev",
      username: "veteran",
      hasCompletedOnboarding: true,
    });

    for (const param of ["force", "logout", "error"]) {
      const req = new NextRequest(`http://localhost:3000/login?${param}=true`, {
        headers: { cookie: `hunter_token=${token}` },
      });
      const res = await middleware(req);
      // Authenticated user on a guest route is redirected to the dashboard and
      // the cookie is NOT cleared.
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard");
      // The response must NOT emit a cookie-clearing header (no GET logout).
      expect(res.headers.get("set-cookie") ?? "").not.toContain("hunter_token=;");
    }
  });
});

describe("Prelaunch lockdown (PRELAUNCH_MODE=true)", () => {
  const original = process.env.PRELAUNCH_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.PRELAUNCH_MODE;
    else process.env.PRELAUNCH_MODE = original;
  });

  it("redirects /login to the landing page when prelaunch is enabled", async () => {
    process.env.PRELAUNCH_MODE = "true";
    const req = new NextRequest("http://localhost:3000/login");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects /register to the landing page when prelaunch is enabled", async () => {
    process.env.PRELAUNCH_MODE = "1";
    const req = new NextRequest("http://localhost:3000/register");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects /onboarding to the landing page when prelaunch is enabled", async () => {
    process.env.PRELAUNCH_MODE = "true";
    const req = new NextRequest("http://localhost:3000/onboarding");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it.each([
    "/dashboard",
    "/settings/account",
    "/focus-party",
    "/shop",
    "/admin",
    "/companion-prototype",
    "/profile/alex",
  ])("redirects direct page access at %s during prelaunch", async (path) => {
    process.env.PRELAUNCH_MODE = "true";
    const res = await middleware(new NextRequest(`http://localhost:3000${path}`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("keeps an existing authenticated session on the landing page during prelaunch", async () => {
    process.env.PRELAUNCH_MODE = "true";
    const token = await signToken({
      userId: 1,
      email: "test@system.dev",
      username: "tester",
      hasCompletedOnboarding: true,
    });
    const req = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `hunter_token=${token}` },
    });
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    "/?ref=sylf-friend42",
    "/api/waitlist?code=sylf-friend42",
    "/api/auth/me",
    "/_next/static/chunks/main.js",
    "/_next/image?url=%2Flanding%2Fscreenshots%2Fhome.webp&w=640&q=75",
    "/landing/screenshots/home.webp",
    "/companions/legacy/walk.webm",
    "/fonts/body.woff2",
    "/robots.txt",
    "/sitemap.xml",
  ])("preserves APIs, referral URLs, and assets at %s during prelaunch", async (path) => {
    process.env.PRELAUNCH_MODE = "true";
    const res = await middleware(new NextRequest(`http://localhost:3000${path}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes waitlist POST requests through to their existing handler", async () => {
    process.env.PRELAUNCH_MODE = "true";
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "scholar@example.com" }),
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps the landing page public when prelaunch is enabled", async () => {
    process.env.PRELAUNCH_MODE = "true";
    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
