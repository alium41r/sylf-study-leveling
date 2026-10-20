import "server-only";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { CalendarConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { CalendarError } from "../personal-service";
import {
  digest,
  seal,
  unseal,
  providerConfig,
  type CalendarProvider,
} from "./security";
import { limitedJSON, ProviderError, providerRequest } from "./http";
import { listProviderCalendars } from "./providers";
export interface CalendarCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  url?: string;
}
const providerSchema = z.enum(["google", "microsoft"]);
export const sessionHash = (req: Request) =>
  digest(
    (req.headers.get("cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(AUTH_COOKIE_NAME + "=")) || ""
  );
export async function beginCalendarOAuth(
  userId: number,
  req: Request,
  rawProvider: string
) {
  const provider = providerSchema.parse(rawProvider),
    config = providerConfig(provider);
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url"),
    id = digest(state);
  await prisma.calendarOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if ((await prisma.calendarConnection.count({ where: { userId } })) >= 10)
    throw new CalendarError("Connect up to ten calendar accounts.", 400);
  if ((await prisma.calendarOAuthState.count({ where: { userId } })) >= 5)
    throw new CalendarError(
      "Too many connection attempts. Wait ten minutes before trying again.",
      429
    );
  await prisma.calendarOAuthState.create({
    data: {
      id,
      userId,
      provider,
      sessionHash: sessionHash(req),
      verifier: seal(verifier, `oauth:${id}`),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(provider === "google"
      ? { access_type: "offline", prompt: "consent select_account" }
      : { response_mode: "query", prompt: "select_account" }),
  });
  return config.base + "?" + params;
}
async function exchange(
  provider: Exclude<CalendarProvider, "ics">,
  fields: Record<string, string>
) {
  const config = providerConfig(provider);
  const response = await fetch(config.token, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...fields,
    }),
  });
  if (!response.ok)
    throw new ProviderError(response.status === 400 ? 401 : response.status);
  const raw = await limitedJSON(response, 100000);
  const token = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().optional(),
      expires_in: z.number().positive(),
      scope: z.string().optional(),
    })
    .parse(raw);
  // An offline calendar connection cannot be represented by a short-lived token only.
  if (token.scope) {
    const granted = new Set(
      token.scope
        .toLowerCase()
        .split(" ")
        .map((scope) => scope.replace("https://graph.microsoft.com/", ""))
    );
    const required =
      provider === "google"
        ? [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
          ]
        : ["calendars.readwrite"];
    if (required.some((s) => !granted.has(s)))
      throw new CalendarError(
        "Calendar permissions were not granted. Connect again and allow calendar access.",
        403
      );
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || "",
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
export async function finishCalendarOAuth(
  userId: number,
  req: Request,
  rawProvider: string,
  state: string,
  code: string
) {
  const provider = providerSchema.parse(rawProvider),
    id = digest(state);
  const saved = await prisma.calendarOAuthState.findFirst({
    where: {
      id,
      userId,
      provider,
      sessionHash: sessionHash(req),
      expiresAt: { gt: new Date() },
    },
  });
  if (!saved)
    throw new CalendarError(
      "This connection request expired or belongs to another session. Try connecting again.",
      409
    );
  const claimed = await prisma.calendarOAuthState.deleteMany({
    where: { id, userId, sessionHash: saved.sessionHash },
  });
  if (claimed.count !== 1)
    throw new CalendarError("This connection request was already used.", 409);
  const config = providerConfig(provider),
    tokens = await exchange(provider, {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: unseal<string>(saved.verifier, `oauth:${id}`),
    });
  const profile =
    provider === "google"
      ? await (async () => {
          const r = await fetch(
            "https://openidconnect.googleapis.com/v1/userinfo",
            {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
              redirect: "error",
              signal: AbortSignal.timeout(10000),
            }
          );
          if (!r.ok) throw new ProviderError(r.status);
          return limitedJSON(r, 100000);
        })()
      : await providerRequest(
          "https://graph.microsoft.com/v1.0/me/?$select=id,displayName,mail,userPrincipalName",
          tokens.accessToken
        );
  const accountId = z
      .string()
      .min(1)
      .parse(profile.sub ?? profile.id),
    label = z
      .string()
      .parse(
        profile.email ??
          profile.mail ??
          profile.userPrincipalName ??
          profile.displayName ??
          "Calendar account"
      )
      .slice(0, 180);
  const existing = await prisma.calendarConnection.findUnique({
    where: { userId_provider_accountId: { userId, provider, accountId } },
  });
  if (!tokens.refreshToken && existing)
    tokens.refreshToken = unseal<CalendarCredentials>(
      existing.credentials,
      `connection:${existing.id}`
    ).refreshToken;
  if (!tokens.refreshToken)
    throw new CalendarError(
      "Offline calendar access was not granted. Reconnect with consent.",
      409
    );
  // A short transaction serializes reconnection of the same provider identity.
  // Ciphertext AAD always uses the persisted row ID, including concurrent callbacks.
  const connection = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${provider}:${accountId}`}))`;
    const current = await tx.calendarConnection.findUnique({
      where: { userId_provider_accountId: { userId, provider, accountId } },
    });
    const connectionId = current?.id ?? randomUUID();
    return tx.calendarConnection.upsert({
      where: { userId_provider_accountId: { userId, provider, accountId } },
      create: {
        id: connectionId,
        userId,
        provider,
        accountId,
        label,
        credentials: seal(tokens, `connection:${connectionId}`),
      },
      update: {
        label,
        credentials: seal(tokens, `connection:${connectionId}`),
        status: "ACTIVE",
        credentialRevision: { increment: 1 },
        refreshLeaseUntil: null,
      },
    });
  });
  await refreshCalendarList(connection);
  return connection.id;
}
export async function connectionToken(connection: CalendarConnection) {
  if (connection.status !== "ACTIVE")
    throw new CalendarError("Reconnect this calendar account.", 409);
  const credentials = unseal<CalendarCredentials>(
    connection.credentials,
    `connection:${connection.id}`
  );
  if (credentials.expiresAt > Date.now() + 120000)
    return credentials.accessToken;
  const lock = await prisma.calendarConnection.updateMany({
    where: {
      id: connection.id,
      status: "ACTIVE",
      credentialRevision: connection.credentialRevision,
      OR: [
        { refreshLeaseUntil: null },
        { refreshLeaseUntil: { lt: new Date() } },
      ],
    },
    data: { refreshLeaseUntil: new Date(Date.now() + 30000) },
  });
  if (!lock.count) throw new ProviderError(429, 5);
  try {
    const next = await exchange(providerSchema.parse(connection.provider), {
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    });
    next.refreshToken = next.refreshToken || credentials.refreshToken;
    const saved = await prisma.calendarConnection.updateMany({
      where: {
        id: connection.id,
        status: "ACTIVE",
        credentialRevision: connection.credentialRevision,
      },
      data: {
        credentials: seal(next, `connection:${connection.id}`),
        credentialRevision: { increment: 1 },
        refreshLeaseUntil: null,
      },
    });
    if (!saved.count)
      throw new CalendarError(
        "Calendar connection changed. Retry synchronization.",
        409
      );
    return next.accessToken;
  } catch (error) {
    await prisma.calendarConnection.updateMany({
      where: {
        id: connection.id,
        credentialRevision: connection.credentialRevision,
      },
      data: {
        refreshLeaseUntil: null,
        ...(error instanceof ProviderError && error.providerStatus === 401
          ? { status: "RECONNECT" }
          : {}),
      },
    });
    throw error;
  }
}
export async function refreshCalendarList(connection: CalendarConnection) {
  const calendars = await listProviderCalendars(
    connection.provider as CalendarProvider,
    await connectionToken(connection)
  );
  await prisma.$transaction(async (tx) => {
    const active = await tx.calendarConnection.findFirst({
      where: { id: connection.id, status: "ACTIVE" },
    });
    if (!active) return;
    for (const c of calendars)
      await tx.connectedCalendar.upsert({
        where: {
          connectionId_remoteId: {
            connectionId: connection.id,
            remoteId: c.remoteId,
          },
        },
        create: {
          id: randomUUID(),
          connectionId: connection.id,
          remoteId: c.remoteId,
          name: c.name.slice(0, 180),
          writable: c.writable,
          incremental: connection.provider === "google" || c.primary,
        },
        update: {
          name: c.name.slice(0, 180),
          writable: c.writable,
          incremental: connection.provider === "google" || c.primary,
        },
      });
    await tx.connectedCalendar.updateMany({
      where: {
        connectionId: connection.id,
        remoteId: { notIn: calendars.map((c) => c.remoteId) },
      },
      data: {
        writable: false,
        error:
          "This calendar is no longer accessible. Reconnect or remove the account.",
      },
    });
  });
}
export async function disconnectCalendar(userId: number, id: string) {
  const connection = await prisma.calendarConnection.findFirst({
    where: { id, userId },
  });
  if (!connection) return;
  // Remove local access first. Cascades affect only external credentials/cache/operations.
  await prisma.calendarConnection.deleteMany({ where: { id, userId } });
  if (connection.provider === "google")
    try {
      const c = unseal<CalendarCredentials>(
        connection.credentials,
        `connection:${id}`
      );
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: c.refreshToken }),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
    } catch {
      /* Local access is already gone; provider settings can revoke any remaining grant. */
    }
}
