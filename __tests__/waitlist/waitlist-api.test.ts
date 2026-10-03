import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/waitlist/route";
import { prisma } from "@/lib/prisma";
import { sendWaitlistWelcomeEmail } from "@/lib/email";

// Mock Prisma
vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      $transaction: vi.fn(),
      waitlistEntry: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
    },
  };
});

// Mock the email engine so tests never touch SMTP/Resend
vi.mock("@/lib/email", () => ({
  sendWaitlistWelcomeEmail: vi.fn().mockResolvedValue({ sent: true, provider: "console_dev" }),
}));

describe("Waitlist API (/api/waitlist)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (sendWaitlistWelcomeEmail as any).mockResolvedValue({ sent: true, provider: "console_dev" });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(["returned failure", "exception"])("preserves the signup and logs email %s", async (failure) => {
    vi.mocked(prisma.$transaction).mockResolvedValue({
      entry: { email: "student@example.com", referralCode: "sylf-failure123", referralCount: 0 },
      position: 9,
      alreadyRegistered: false,
    });
    if (failure === "exception") {
      vi.mocked(sendWaitlistWelcomeEmail).mockRejectedValueOnce(new Error("SMTP unavailable"));
    } else {
      vi.mocked(sendWaitlistWelcomeEmail).mockResolvedValueOnce({ sent: false, provider: "smtp", error: "SMTP unavailable" });
    }
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      headers: { "x-forwarded-for": failure === "exception" ? "192.0.2.1" : "192.0.2.2" },
      body: JSON.stringify({ email: "student@example.com" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, position: 9, referralCode: "sylf-failure123" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("signup still succeeded"), expect.anything());
  });

  it("rejects invalid email formats with 400 status", async () => {
    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email: "invalid-email-string" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/valid email/i);
  });

  it("handles new valid signup atomically and returns position + referralCode", async () => {
    const mockCreatedEntry = {
      id: 1,
      email: "scholar.new@domain.com",
      name: "Scholar One",
      targetExam: "MCAT",
      scholarClass: "SCHOLAR",
      referralCode: "sylf-a1b2c3d4",
      referredBy: null,
      referralCount: 0,
      createdAt: new Date(),
    };

    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      return callback({
        waitlistEntry: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockCreatedEntry),
          count: vi.fn().mockResolvedValue(42),
        },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({
        email: "scholar.new@domain.com",
        name: "Scholar One",
        targetExam: "MCAT",
        scholarClass: "SCHOLAR",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.referralCode).toBe("sylf-a1b2c3d4");
    expect(data.position).toBe(42);
    expect(data.alreadyRegistered).toBe(false);

    // The thank-you email fires once for a brand-new signup.
    expect(sendWaitlistWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(sendWaitlistWelcomeEmail).toHaveBeenCalledWith({
      to: "scholar.new@domain.com",
      name: "Scholar One",
      queuePosition: 42,
      referralCode: "sylf-a1b2c3d4",
      targetExam: "MCAT",
    });
  });

  it("is idempotent: returning existing waitlist entry position if email is already registered", async () => {
    const existingEntry = {
      id: 5,
      email: "existing@domain.com",
      name: "Existing Scholar",
      targetExam: "A-Levels",
      scholarClass: "ANALYST",
      referralCode: "sylf-exist123",
      referredBy: null,
      referralCount: 3,
      createdAt: new Date("2026-08-01"),
    };

    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      return callback({
        waitlistEntry: {
          findUnique: vi.fn().mockResolvedValue(existingEntry),
          count: vi.fn().mockResolvedValue(15),
        },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({
        email: "existing@domain.com",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.alreadyRegistered).toBe(true);
    expect(data.referralCode).toBe("sylf-exist123");
    expect(data.position).toBe(15);

    // No thank-you email on an idempotent re-submit.
    expect(sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });

  it("atomically increments referrer's count when referredBy is valid", async () => {
    const referrerEntry = {
      id: 2,
      referralCode: "sylf-referrer99",
      referralCount: 2,
    };

    const newEntry = {
      id: 3,
      email: "referred.student@domain.com",
      referralCode: "sylf-newstudent",
      referredBy: "sylf-referrer99",
      referralCount: 0,
      createdAt: new Date(),
    };

    const updateSpy = vi.fn().mockResolvedValue({ ...referrerEntry, referralCount: 3 });

    (prisma.$transaction as any).mockImplementation(async (callback: any) => {
      return callback({
        waitlistEntry: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null) // email check
            .mockResolvedValueOnce(referrerEntry) // referrer check
            .mockResolvedValueOnce(null), // code collision check
          update: updateSpy,
          create: vi.fn().mockResolvedValue(newEntry),
          count: vi.fn().mockResolvedValue(100),
        },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/waitlist", {
      method: "POST",
      body: JSON.stringify({
        email: "referred.student@domain.com",
        referredBy: "sylf-referrer99",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { referralCode: "sylf-referrer99" },
      data: { referralCount: { increment: 1 } },
    });
  });

  it("GET /api/waitlist returns position and referral count safely for valid code", async () => {
    (prisma.waitlistEntry.findUnique as any).mockResolvedValue({
      referralCode: "sylf-validcode",
      referralCount: 4,
      scholarClass: "ENGINEER",
      targetExam: "Computer Science",
      createdAt: new Date(),
    });
    (prisma.waitlistEntry.count as any).mockResolvedValue(55);

    const req = new NextRequest("http://localhost:3000/api/waitlist?code=sylf-validcode", {
      method: "GET",
    });

    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.referralCode).toBe("sylf-validcode");
    expect(data.position).toBe(55);
    expect(data.referralCount).toBe(4);
    // Ensure sensitive fields (like email or id) are not leaked
    expect(data.email).toBeUndefined();
    expect(data.id).toBeUndefined();
  });
});
