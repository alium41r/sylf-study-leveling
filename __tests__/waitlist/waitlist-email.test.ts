import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { sendWaitlistWelcomeEmail } from "@/lib/email";
import { buildWaitlistWelcomeEmail } from "@/lib/emails/waitlist-welcome";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

const params = {
  to: "student@example.com", name: "Ali", queuePosition: 9,
  referralCode: "sylf-8230e805", targetExam: "General Academic",
};
const sendMail = vi.fn();
const emailEnv = ["SMTP_USER", "SMTP_PASS", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_REPLY_TO", "WAITLIST_EMAIL_PROVIDER", "WAITLIST_EMAIL_FROM", "WAITLIST_EMAIL_REPLY_TO"];

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of emailEnv) vi.stubEnv(key, "");
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as unknown as ReturnType<typeof nodemailer.createTransport>);
  sendMail.mockResolvedValue({ accepted: [params.to], messageId: "test-message" });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("waitlist confirmation content", () => {
  it("escapes user content without changing the plain-text pass", () => {
    const result = buildWaitlistWelcomeEmail({ ...params, name: '<img src=x onerror="alert(1)">', targetExam: "A&B <exam>", referralCode: "a<b&c" });
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("A&amp;B &lt;exam&gt;");
    expect(result.html).toContain("a&lt;b&amp;c");
    expect(result.text).toContain("A&B <exam>");
    expect(result.text).toContain("a<b&c");
    expect(result.html).toContain('role="presentation"');
  });

  it("keeps queue, goal, pass and next steps in both formats without a name", () => {
    const result = buildWaitlistWelcomeEmail({ ...params, name: "  ", targetExam: null });
    for (const content of [result.text, result.html]) {
      expect(content).toContain("#9");
      expect(content).toContain("General Academic");
      expect(content).toContain(params.referralCode);
      expect(content).toContain("when early access opens");
      expect(content).toContain("reply to ask us to remove your entry");
    }
  });
});

describe("waitlist email dispatch", () => {
  it("preserves Gmail selection and submits multipart content with required TLS", async () => {
    vi.stubEnv("SMTP_USER", "owner@gmail.com"); vi.stubEnv("SMTP_PASS", "test-password");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    expect(await sendWaitlistWelcomeEmail(params)).toEqual({ sent: true, provider: "smtp" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: true }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "Sylf <owner@gmail.com>", to: params.to, ...buildWaitlistWelcomeEmail(params) }));
  });

  it("selects Resend explicitly even when Gmail is configured, using the domain sender", async () => {
    vi.stubEnv("SMTP_USER", "owner@gmail.com"); vi.stubEnv("SMTP_PASS", "test-password");
    vi.stubEnv("WAITLIST_EMAIL_PROVIDER", "resend"); vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "The System <owner@gmail.com>");
    vi.stubEnv("WAITLIST_EMAIL_FROM", "Sylf <hello@sylf.study>"); vi.stubEnv("WAITLIST_EMAIL_REPLY_TO", "support@sylf.study");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "resend-message" }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendWaitlistWelcomeEmail(params)).toEqual({ sent: true, provider: "resend" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ from: "Sylf <hello@sylf.study>", reply_to: "support@sylf.study", to: [params.to], ...buildWaitlistWelcomeEmail(params) });
  });

  it.each(["", "Sylf <onboarding@resend.dev>", "Sylf <owner@gmail.com>", "one@sylf.study, two@sylf.study", "hello@sylf.study\r\nBcc: other@example.com"])("does not send Resend email with an unsafe sender: %s", async (sender) => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", sender);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect((await sendWaitlistWelcomeEmail(params)).sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects domain spoofing through personal Gmail", async () => {
    vi.stubEnv("SMTP_USER", "owner@gmail.com"); vi.stubEnv("SMTP_PASS", "test-password");
    vi.stubEnv("EMAIL_FROM", "Sylf <hello@sylf.study>");
    expect((await sendWaitlistWelcomeEmail(params)).sent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("requires STARTTLS on port 587", async () => {
    vi.stubEnv("SMTP_USER", "owner@gmail.com"); vi.stubEnv("SMTP_PASS", "test-password"); vi.stubEnv("SMTP_PORT", "587");
    await sendWaitlistWelcomeEmail(params);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
  });

  it("reports SMTP rejection and exceptions", async () => {
    vi.stubEnv("SMTP_USER", "owner@gmail.com"); vi.stubEnv("SMTP_PASS", "test-password");
    sendMail.mockResolvedValueOnce({ accepted: [], rejected: [params.to] });
    expect((await sendWaitlistWelcomeEmail(params)).sent).toBe(false);
    sendMail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    expect(await sendWaitlistWelcomeEmail(params)).toMatchObject({ sent: false, error: "SMTP unavailable" });
  });

  it("reports Resend errors without falling back to another sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "Sylf <hello@sylf.study>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Domain not verified" }) }));
    expect(await sendWaitlistWelcomeEmail(params)).toEqual({ sent: false, provider: "resend", error: "Domain not verified" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("fails explicitly when a selected provider is missing credentials or invalid", async () => {
    vi.stubEnv("WAITLIST_EMAIL_PROVIDER", "resend");
    expect((await sendWaitlistWelcomeEmail(params)).sent).toBe(false);
    vi.stubEnv("WAITLIST_EMAIL_PROVIDER", "invalid");
    expect((await sendWaitlistWelcomeEmail(params)).provider).toBe("configuration");
  });

  it("does not claim delivery with missing production configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await sendWaitlistWelcomeEmail(params)).toMatchObject({ sent: false, provider: "configuration" });
    vi.stubEnv("NODE_ENV", "development");
    expect(await sendWaitlistWelcomeEmail(params)).toEqual({ sent: true, provider: "console_dev" });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
