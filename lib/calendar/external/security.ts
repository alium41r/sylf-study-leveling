import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { CalendarError } from "../personal-service";
export type CalendarProvider = "google" | "microsoft" | "ics";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function encryptionKey() {
  const key = Buffer.from(process.env.CALENDAR_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw new CalendarError(
      "Calendar connections need a server encryption key.",
      503
    );
  return key;
}
export function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}
export function unseal<T>(value: string, purpose: string): T {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1")
    throw new CalendarError("Reconnect this calendar account.", 409);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  );
}
export function publicOrigin() {
  const raw = process.env.CALENDAR_PUBLIC_URL;
  if (!raw)
    throw new CalendarError(
      "Set the calendar callback URL on the server before connecting accounts.",
      503
    );
  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new CalendarError("Calendar callbacks require HTTPS.", 503);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new CalendarError("Calendar public URL must be an origin.", 503);
  return url.origin;
}
export function providerConfig(provider: Exclude<CalendarProvider, "ics">) {
  const google = provider === "google";
  const clientId =
    process.env[
      google ? "GOOGLE_CALENDAR_CLIENT_ID" : "MICROSOFT_CALENDAR_CLIENT_ID"
    ] || (google ? process.env.GOOGLE_CLIENT_ID : undefined);
  const clientSecret =
    process.env[
      google
        ? "GOOGLE_CALENDAR_CLIENT_SECRET"
        : "MICROSOFT_CALENDAR_CLIENT_SECRET"
    ] || (google ? process.env.GOOGLE_CLIENT_SECRET : undefined);
  if (!clientId || !clientSecret)
    throw new CalendarError(
      `${google ? "Google" : "Outlook"} calendar authorization is not configured on this server.`,
      503
    );
  const base = google
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const token = google
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const scopes = google
    ? "openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events"
    : "openid offline_access User.Read Calendars.ReadWrite";
  return {
    clientId,
    clientSecret,
    base,
    token,
    scopes,
    redirectUri: `${publicOrigin()}/api/calendar/connections/callback/${provider}`,
  };
}
export function integrationConfigured(
  provider: Exclude<CalendarProvider, "ics">
) {
  try {
    encryptionKey();
    providerConfig(provider);
    return true;
  } catch {
    return false;
  }
}
export function stableExternalId(calendarId: string, remoteId: string) {
  const hex = digest(`${calendarId}:${remoteId}`).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "a";
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
