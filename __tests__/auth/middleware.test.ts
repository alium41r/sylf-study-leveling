/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("allows user with existing cookie to access /login when force=true is supplied", async () => {
    const token = await signToken({
      userId: 1,
      email: "veteran@system.dev",
      username: "veteran",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/login?force=true", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("allows user with existing cookie to access /register when force=true is supplied", async () => {
    const token = await signToken({
      userId: 1,
      email: "veteran@system.dev",
      username: "veteran",
      hasCompletedOnboarding: true,
    });

    const req = new NextRequest("http://localhost:3000/register?force=true", {
      headers: {
        cookie: `hunter_token=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
