/**
 * Email Dispatch Engine
 * Supports Gmail SMTP (Nodemailer), Resend API, and development console logging.
 */

import nodemailer from "nodemailer";
import addressparser from "nodemailer/lib/addressparser";
import { buildWaitlistWelcomeEmail } from "@/lib/emails/waitlist-welcome";

export interface SendVerificationEmailParams {
  to: string;
  name?: string | null;
  verificationUrl: string;
}

export async function sendVerificationEmail({
  to,
  name,
  verificationUrl,
}: SendVerificationEmailParams): Promise<{ sent: boolean; provider: string; error?: string }> {
  const recipientName = name || "Scholar";
  const resendApiKey = process.env.RESEND_API_KEY;
  
  // Gmail / SMTP configuration
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const fromEmail = process.env.EMAIL_FROM || (smtpUser ? `"The System" <${smtpUser}>` : "The System <onboarding@resend.dev>");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Inter, -apple-system, sans-serif; background-color: #06080F; color: #E2E8F0; margin: 0; padding: 40px 20px; }
          .card { max-width: 540px; margin: 0 auto; background-color: #0B0E18; border: 1px solid #1E2640; border-radius: 12px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
          .header { text-align: center; margin-bottom: 28px; }
          .tag { font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: #818CF8; text-transform: uppercase; margin-bottom: 8px; }
          .title { font-size: 24px; font-weight: 800; text-transform: uppercase; color: #FFFFFF; letter-spacing: 0.05em; margin: 0; }
          .body-text { font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 20px 0; text-align: center; }
          .btn-container { text-align: center; margin: 32px 0; }
          .btn { display: inline-block; background: linear-gradient(135deg, #6366F1 0%, #A855F7 100%); color: #FFFFFF; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; padding: 14px 32px; border-radius: 6px; box-shadow: 0 0 20px rgba(124, 58, 237, 0.4); }
          .footer { text-align: center; font-size: 11px; color: #64748B; margin-top: 30px; border-top: 1px solid #1E2640; padding-top: 20px; }
          .code-box { background: #06080F; border: 1px solid #1E2640; border-radius: 6px; padding: 10px; font-family: monospace; font-size: 11px; color: #818CF8; word-break: break-all; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="tag">THE SYSTEM • SECURITY PROTOCOL</div>
            <h1 class="title">Verify Scholar Identity</h1>
          </div>
          <p class="body-text">
            Greetings, <strong>${recipientName}</strong>.<br/>
            An authentication request has been initialized for this email. Click the button below to confirm your Scholar identity and unlock system rankings.
          </p>
          <div class="btn-container">
            <a href="${verificationUrl}" class="btn">CONFIRM IDENTITY</a>
          </div>
          <p class="body-text" style="font-size: 12px; margin-bottom: 4px;">
            If the button does not work, copy and paste this verification link into your browser:
          </p>
          <div class="code-box">${verificationUrl}</div>
          <div class="footer">
            THE SYSTEM • Solo Leveling Study Platform<br/>
            If you did not initiate this request, you may safely ignore this message.
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. If SMTP (e.g. Gmail) credentials are provided, dispatch via Nodemailer
  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to,
        subject: "Verify Your Scholar Account - The System",
        text: `Greetings ${recipientName},\n\nPlease verify your scholar account by visiting this link:\n${verificationUrl}\n\nThe System`,
        html: htmlContent,
      });

      console.log(`✅ [EMAIL DISPATCH SUCCESS] Sent verification email to ${to} via SMTP (${smtpHost})`);
      return { sent: true, provider: "smtp" };
    } catch (err: any) {
      console.error("❌ [SMTP DISPATCH ERROR]:", err);
      return { sent: false, provider: "smtp", error: err?.message };
    }
  }

  // 2. If Resend API key is available, dispatch live email via Resend
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: "Verify Your Scholar Account • The System",
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Resend Email Error:", errorData);
        return { sent: false, provider: "resend", error: errorData?.message || "Failed to send email" };
      }

      console.log(`✅ [EMAIL DISPATCH SUCCESS] Sent verification email to ${to} via Resend`);
      return { sent: true, provider: "resend" };
    } catch (err: any) {
      console.error("Email Dispatch Error:", err);
      return { sent: false, provider: "resend", error: err?.message };
    }
  }

  // 3. Development / Console Fallback (No SMTP or API key configured)
  console.log("\n=======================================================");
  console.log("📨 [EMAIL DISPATCH - THE SYSTEM]");
  console.log(`Recipient: ${to}`);
  console.log(`Verification URL: ${verificationUrl}`);
  console.log("To send real emails to inboxes, add SMTP_USER & SMTP_PASS (Gmail) or RESEND_API_KEY to your .env file.");
  console.log("=======================================================\n");

  return { sent: true, provider: "console_dev" };
}

export interface SendSecurityOtpParams {
  to: string;
  name?: string | null;
  code: string;
  action: "RESET_PROGRESS" | "DELETE_ACCOUNT";
}

export async function sendSecurityOtpEmail({
  to,
  name,
  code,
  action,
}: SendSecurityOtpParams): Promise<{ sent: boolean; provider: string; error?: string }> {
  const recipientName = name || "Scholar";
  const isDelete = action === "DELETE_ACCOUNT";
  const actionTitle = isDelete ? "Permanent Account Deletion" : "Reset Hunter Progress";
  const actionDesc = isDelete
    ? "A request has been initialized to PERMANENTLY ERASE your Scholar account and all associated study logs, quests, and rankings."
    : "A request has been initialized to reset your Hunter level, rank, and study progression back to Level 1.";

  const subject = isDelete
    ? "Account Deletion Security Code - The System"
    : "Reset Progress Security Code - The System";

  const resendApiKey = process.env.RESEND_API_KEY;
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const fromEmail = process.env.EMAIL_FROM || (smtpUser ? `"The System Security" <${smtpUser}>` : "The System Security <onboarding@resend.dev>");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: "Inter", -apple-system, sans-serif; background-color: #06080F; color: #E2E8F0; margin: 0; padding: 40px 20px; }
          .card { max-width: 520px; margin: 0 auto; background-color: #0B0E18; border: 1px solid ${isDelete ? "#7F1D1D" : "#1E2640"}; border-radius: 12px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); }
          .header { text-align: center; margin-bottom: 24px; }
          .tag { font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: ${isDelete ? "#EF4444" : "#818CF8"}; text-transform: uppercase; margin-bottom: 8px; }
          .title { font-size: 22px; font-weight: 800; text-transform: uppercase; color: #FFFFFF; letter-spacing: 0.05em; margin: 0; }
          .body-text { font-size: 14px; line-height: 1.6; color: #94A3B8; margin: 16px 0; text-align: center; }
          .otp-container { text-align: center; margin: 28px 0; }
          .otp-code { display: inline-block; background-color: #06080F; border: 2px solid ${isDelete ? "#EF4444" : "#6366F1"}; color: #FFFFFF; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.35em; padding: 14px 28px; border-radius: 8px; box-shadow: 0 0 25px ${isDelete ? "rgba(239,68,68,0.3)" : "rgba(99,102,241,0.3)"}; }
          .expiry { font-size: 12px; color: #64748B; text-align: center; margin-top: 10px; }
          .footer { text-align: center; font-size: 11px; color: #64748B; margin-top: 28px; border-top: 1px solid #1E2640; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="tag">THE SYSTEM • DANGER ZONE PROTOCOL</div>
            <h1 class="title">${actionTitle}</h1>
          </div>
          <p class="body-text">
            Greetings, <strong>${recipientName}</strong>.<br/>
            ${actionDesc}
          </p>
          <div class="otp-container">
            <div class="otp-code">${code}</div>
            <div class="expiry">Expires in 10 minutes. Do not share this code with anyone.</div>
          </div>
          <div class="footer">
            THE SYSTEM • Solo Leveling Study Platform<br/>
            If you did not initiate this action, please secure your account immediately.
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. SMTP / Gmail
  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        text: `Greetings ${recipientName},\n\n${actionDesc}\n\nYour Verification Code: ${code}\n\nThis code will expire in 10 minutes.\n\nThe System`,
        html: htmlContent,
      });

      console.log(`✅ [SECURITY OTP DISPATCH] Sent ${action} code to ${to} via SMTP`);
      return { sent: true, provider: "smtp" };
    } catch (err: any) {
      console.error("❌ [SMTP SECURITY OTP ERROR]:", err);
      return { sent: false, provider: "smtp", error: err?.message };
    }
  }

  // 2. Resend API
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        return { sent: false, provider: "resend", error: errorData?.message || "Failed to send code" };
      }

      console.log(`✅ [SECURITY OTP DISPATCH] Sent ${action} code to ${to} via Resend`);
      return { sent: true, provider: "resend" };
    } catch (err: any) {
      return { sent: false, provider: "resend", error: err?.message };
    }
  }

  // 3. Dev Console
  console.log("\n=======================================================");
  console.log(`🔐 [SECURITY OTP DISPATCH - ${action}]`);
  console.log(`Recipient: ${to}`);
  console.log(`Verification Code: ${code}`);
  console.log("Expires in: 10 minutes");
  console.log("=======================================================\n");

  return { sent: true, provider: "console_dev" };
}

// ─── Waitlist Welcome / Thank-You ──────────────────────────────

export interface SendWaitlistWelcomeParams {
  to: string;
  name?: string | null;
  queuePosition: number;
  referralCode: string;
  targetExam?: string | null;
}

/** Confirms a new signup; existing entries never receive duplicate confirmations. */
export async function sendWaitlistWelcomeEmail(
  params: SendWaitlistWelcomeParams,
): Promise<{ sent: boolean; provider: string; error?: string }> {
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const resendApiKey = process.env.RESEND_API_KEY;
  const preference = process.env.WAITLIST_EMAIL_PROVIDER || "auto";
  if (!["auto", "smtp", "resend"].includes(preference)) {
    return { sent: false, provider: "configuration", error: "WAITLIST_EMAIL_PROVIDER must be auto, smtp or resend." };
  }

  // Preserve existing SMTP precedence unless an operator explicitly selects Resend.
  const provider = preference === "auto"
    ? (smtpUser && smtpPass ? "smtp" : resendApiKey ? "resend" : "console_dev")
    : preference;
  const configuredFrom = process.env.WAITLIST_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  const fromEmail = configuredFrom || (provider === "smtp" && smtpUser ? `Sylf <${smtpUser}>` : "");
  const replyTo = process.env.WAITLIST_EMAIL_REPLY_TO?.trim() || process.env.EMAIL_REPLY_TO?.trim();
  const { subject, text, html } = buildWaitlistWelcomeEmail(params);

  if (provider === "console_dev") {
    if (process.env.NODE_ENV === "production") {
      return { sent: false, provider: "configuration", error: "No waitlist email provider is configured." };
    }
    console.info("[Waitlist email] Development preview (not delivered):", { subject, text });
    return { sent: true, provider: "console_dev" };
  }

  if ((provider === "smtp" && (!smtpUser || !smtpPass)) || (provider === "resend" && !resendApiKey)) {
    return { sent: false, provider, error: `Missing credentials for the selected ${provider} provider.` };
  }

  // Parse a single real sender. The Resend testing domain is not a production sender.
  const addresses = addressparser(fromEmail);
  const fromAddress = addresses.length === 1 && "address" in addresses[0] ? addresses[0].address : "";
  if (!fromAddress || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromAddress) || /[\r\n]/.test(fromEmail)) {
    return { sent: false, provider, error: "Set WAITLIST_EMAIL_FROM (or EMAIL_FROM) to a single sender address authorized by your email provider." };
  }
  const senderDomain = fromAddress.split("@")[1].toLowerCase();
  if (provider === "resend" && ["resend.dev", "gmail.com", "googlemail.com"].includes(senderDomain)) {
    return { sent: false, provider, error: "Resend requires WAITLIST_EMAIL_FROM (or EMAIL_FROM) on your own verified sending domain." };
  }
  if (provider === "smtp" && smtpHost.toLowerCase() === "smtp.gmail.com" &&
      /@(gmail|googlemail)\.com$/i.test(smtpUser!) && fromAddress.toLowerCase() !== smtpUser!.toLowerCase()) {
    return { sent: false, provider, error: "Personal Gmail SMTP must use its authenticated account as EMAIL_FROM. Use a verified-domain provider for a Sylf domain sender." };
  }

  const headers = { "Auto-Submitted": "auto-generated" };
  try {
    if (provider === "smtp") {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        requireTLS: true,
        auth: { user: smtpUser!, pass: smtpPass! },
      });
      const result = await transporter.sendMail({
        from: fromEmail, to: params.to, replyTo, subject, text, html, headers,
      });
      // SMTP acceptance is not evidence of Gmail inbox placement.
      if (!result.accepted?.length) {
        return { sent: false, provider, error: "SMTP did not accept the waitlist recipient." };
      }
      console.info("[Waitlist email] Accepted by SMTP:", { messageId: result.messageId });
    } else {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail, to: [params.to], reply_to: replyTo, subject, text, html, headers,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        return { sent: false, provider, error: result?.message || "Resend did not accept the email." };
      }
      console.info("[Waitlist email] Accepted by Resend:", { messageId: result.id });
    }
    return { sent: true, provider };
  } catch (error: unknown) {
    return { sent: false, provider, error: error instanceof Error ? error.message : "Email dispatch failed." };
  }
}
