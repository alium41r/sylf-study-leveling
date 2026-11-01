import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import pg from "pg";
import { signToken, AUTH_COOKIE_NAME, type AuthTokenPayload } from "@/lib/auth";

if (process.env.BACKEND_TEST_DATABASE !== "disposable") throw new Error("Run these through scripts/test/test-backend-postgres.mjs.");

export const base = "http://localhost:3000";
export const db = () => new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

export interface TestUser { id: number; email: string; username: string; tokenVersion: number; password?: string }

/** A real row in User with a default privacy row, as registration makes. */
export async function createUser(pool: pg.Pool, overrides: Record<string, unknown> = {}): Promise<TestUser> {
  const tag = randomBytes(5).toString("hex");
  const fields: Record<string, unknown> = { email: `u${tag}@local.test`, username: `u${tag}`, password: "$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyzABCDEFG", scholarId: `#${tag}`, verificationStatus: "VERIFIED", hasCompletedOnboarding: true, ...overrides };
  const names = Object.keys(fields);
  const { rows } = await pool.query(`INSERT INTO "User" (${names.map(name => `"${name}"`).join(",")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(",")}) RETURNING id, email, username, "tokenVersion"`, Object.values(fields));
  await pool.query('INSERT INTO "UserPrivacy" ("userId") VALUES ($1)', [rows[0].id]);
  return rows[0];
}

export async function tokenFor(user: TestUser, extra: Partial<AuthTokenPayload> = {}) {
  return signToken({ userId: user.id, email: user.email, username: user.username, tokenVersion: user.tokenVersion, hasCompletedOnboarding: true, ...extra });
}

interface RequestOptions { token?: string; method?: string; body?: unknown; cookies?: Record<string, string>; headers?: Record<string, string> }
export function request(path: string, { token, method = "GET", body, cookies = {}, headers = {} }: RequestOptions = {}) {
  const jar = { ...(token ? { [AUTH_COOKIE_NAME]: token } : {}), ...cookies };
  const cookie = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");
  return new NextRequest(`${base}${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Marks a native client request: a bearer header and no browser headers. A distinct address keeps each test clear of the shared login limits. */
export function nativeRequest(path: string, accessToken: string | undefined, { method = "GET", body, headers = {} }: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return request(path, { method, body, headers: { ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), "user-agent": "okhttp/4.12", ...headers } });
}
