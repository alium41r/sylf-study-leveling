/**
 * Mints a browser-QA session for the Planner QA harness.
 *
 * Creates a throwaway account in whatever database `.env` points at and prints a signed
 * `hunter_token` for it, so `scripts/verify/verify-planner-browser.mjs` can drive the real app as a
 * signed-in student. It prints the token and nothing else — no password, no secret.
 *
 * The account is ordinary test data: a unique email, a unique username, no content of anyone
 * else's. Re-running creates another one, which is safe and is why nothing is reused.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { SignJWT } from "jose";

const env = readFileSync(".env", "utf8");
const pick = (key) => env.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1];
const url = pick("DIRECT_URL") ?? pick("DATABASE_URL");
const secret = pick("JWT_SECRET");
if (!url || !secret) throw new Error("DATABASE_URL and JWT_SECRET are required");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const stamp = `qa-${Date.now()}`;
const created = await client.query(
  `INSERT INTO "User" (email, username, timezone, "restDays", "createdAt")
   VALUES ($1, $2, 'UTC', ARRAY[0], now()) RETURNING id, "tokenVersion"`,
  [`${stamp}@planner.qa`, stamp]
);
await client.end();

const user = created.rows[0];
const token = await new SignJWT({ userId: user.id, email: `${stamp}@planner.qa`, tokenVersion: user.tokenVersion })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuer(process.env.JWT_ISSUER || "sylf")
  .setAudience(process.env.JWT_AUDIENCE || "sylf-app")
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

console.log(token);
