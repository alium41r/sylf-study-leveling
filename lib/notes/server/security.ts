import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
export class NotesServerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "NOTES_ERROR",
    readonly retryAfter = 0
  ) {
    super(message);
  }
}
export const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
function key() {
  const key = Buffer.from(process.env.NOTES_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32)
    throw new NotesServerError(
      "Notes connection encryption is not configured.",
      503
    );
  return key;
}
export function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value)),
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
    throw new NotesServerError("Notes credentials need recovery.", 409);
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url")
  );
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(body, "base64url")),
      cipher.final(),
    ]).toString("utf8")
  );
}
export function publicOrigin() {
  const url = new URL(
    process.env.NOTES_PUBLIC_URL || "https://unconfigured.invalid"
  );
  if (
    url.hostname === "unconfigured.invalid" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new NotesServerError(
      "Set a valid Notes public origin on the server.",
      503
    );
  return url.origin;
}
export function config() {
  key();
  const clientId =
      process.env.GOOGLE_NOTES_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret =
      process.env.GOOGLE_NOTES_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new NotesServerError(
      "Google Drive connection is not configured.",
      503
    );
  return {
    clientId,
    clientSecret,
    redirectUri: `${publicOrigin()}/api/notes/callback`,
    scopes: "openid email https://www.googleapis.com/auth/drive.file",
  };
}
export function configured() {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}
/** Isolate staging/production discovery even when both use the same Google app and numeric user IDs. */
export const driveRealm = () => sha(publicOrigin());
export function sessionHash(req: Request) {
  return sha(
    (req.headers.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(AUTH_COOKIE_NAME + "=")) || ""
  );
}
export function requireOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== publicOrigin())
    throw new NotesServerError(
      "Open Notes from its authenticated Sylf origin.",
      403
    );
}
export async function limitedBytes(
  response: Response,
  maximum: number
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") || 0) > maximum)
    throw new NotesServerError("Transfer exceeds its byte limit.", 413);
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum)
        throw new NotesServerError("Transfer exceeds its byte limit.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function limitedRequest(req: Request, maximum = 10000) {
  return limitedBytes(
    new Response(req.body, { headers: req.headers }),
    maximum
  );
}
