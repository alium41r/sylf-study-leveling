import "server-only";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import type { NotesConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { librarySchema } from "../contracts";
import { encodeJson } from "../bytes";
import { GoogleDrive, escapeQuery } from "./google-drive";
import {
  config,
  sessionHash,
  seal,
  unseal,
  sha,
  limitedBytes,
  NotesServerError,
  driveRealm,
} from "./security";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
async function exchange(fields: Record<string, string>): Promise<Tokens> {
  const settings = config();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      ...fields,
    }),
  });
  if (!response.ok)
    throw new NotesServerError(
      "Reconnect Google Drive with the same account.",
      409,
      response.status === 400 ? "AUTH" : "NETWORK"
    );
  const value = z
    .object({
      access_token: z.string().min(1),
      refresh_token: z.string().optional(),
      expires_in: z.number().positive(),
      scope: z.string().optional(),
    })
    .parse(
      JSON.parse(new TextDecoder().decode(await limitedBytes(response, 100000)))
    );
  if (
    value.scope &&
    !value.scope
      .split(" ")
      .includes("https://www.googleapis.com/auth/drive.file")
  )
    throw new NotesServerError(
      "Allow Notes access to its own Drive files.",
      403,
      "AUTH"
    );
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token || "",
    expiresAt: Date.now() + value.expires_in * 1000,
  };
}
export async function beginOAuth(userId: number, request: Request) {
  const settings = config(),
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url"),
    id = sha(state);
  await prisma.notesOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if ((await prisma.notesOAuthState.count({ where: { userId } })) >= 5)
    throw new NotesServerError(
      "Wait a few minutes before connecting again.",
      429
    );
  await prisma.notesOAuthState.create({
    data: {
      id,
      userId,
      sessionHash: sessionHash(request),
      verifier: seal(verifier, `notes-oauth:${id}`),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return (
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      response_type: "code",
      scope: settings.scopes,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "false",
    })
  );
}
export async function finishOAuth(
  userId: number,
  request: Request,
  state: string,
  code: string
) {
  const id = sha(state);
  const saved = await prisma.notesOAuthState.findFirst({
    where: {
      id,
      userId,
      sessionHash: sessionHash(request),
      expiresAt: { gt: new Date() },
    },
  });
  if (
    !saved ||
    (
      await prisma.notesOAuthState.deleteMany({
        where: { id, userId, sessionHash: sessionHash(request) },
      })
    ).count !== 1
  )
    throw new NotesServerError(
      "This Drive consent request expired or was already used.",
      409
    );
  const tokens = await exchange({
    grant_type: "authorization_code",
    code,
    redirect_uri: config().redirectUri,
    code_verifier: unseal<string>(saved.verifier, `notes-oauth:${id}`),
  });
  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    }
  );
  if (!profileResponse.ok)
    throw new NotesServerError(
      "Google identity could not be verified.",
      409,
      "AUTH"
    );
  const profile = z
    .object({
      sub: z.string().min(1).max(200),
      email: z.string().max(180).optional(),
    })
    .parse(
      JSON.parse(
        new TextDecoder().decode(await limitedBytes(profileResponse, 100000))
      )
    );
  let connection = await prisma.notesConnection.findUnique({
    where: { userId },
  });
  if (connection && connection.accountId !== profile.sub)
    throw new NotesServerError(
      "Reconnect the original Google account. Changing storage accounts requires an explicit copy-and-verify operation.",
      409,
      "AUTH"
    );
  if (connection && !tokens.refreshToken)
    tokens.refreshToken = unseal<Tokens>(
      connection.credentials,
      `notes-connection:${connection.id}`
    ).refreshToken;
  if (!tokens.refreshToken)
    throw new NotesServerError(
      "Google did not grant offline access. Reconnect with consent.",
      409,
      "AUTH"
    );
  if (!connection) {
    const connectionId = randomUUID();
    try {
      connection = await prisma.notesConnection.create({
        data: {
          id: connectionId,
          userId,
          libraryId: randomUUID(),
          accountId: profile.sub,
          label: profile.email || "Google Drive",
          credentials: seal(tokens, `notes-connection:${connectionId}`),
          vaultKey: seal(
            randomBytes(32).toString("base64"),
            `notes-vault:${connectionId}`
          ),
          status: "PROVISIONING",
        },
      });
    } catch {
      connection = await prisma.notesConnection.findUnique({
        where: { userId },
      });
      if (!connection || connection.accountId !== profile.sub)
        throw new NotesServerError(
          "Another connection is being provisioned. Retry with the original account.",
          409
        );
    }
  }
  const lock = await prisma.notesConnection.updateMany({
    where: {
      id: connection.id,
      userId,
      accountId: profile.sub,
      credentialRevision: connection.credentialRevision,
      OR: [
        { refreshLeaseUntil: null },
        { refreshLeaseUntil: { lt: new Date() } },
      ],
    },
    data: { refreshLeaseUntil: new Date(Date.now() + 120000) },
  });
  if (!lock.count)
    throw new NotesServerError(
      "Another Drive connection operation is running. Retry shortly.",
      409
    );
  try {
    const drive = new GoogleDrive(tokens.accessToken);
    let discoveredExistingRoot = false;
    let rootId = connection.rootId,
      libraryId = connection.libraryId;
    if (!rootId) {
      const roots = await drive.list(
        `trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='sylfNotes' and value='library-v1' } and appProperties has { key='ownerRef' and value='${userId}' }`
      );
      const matching = roots.files.filter(
        (file) => file.appProperties?.sylfRealm === driveRealm()
      );
      if (
        roots.nextPageToken ||
        matching.length > 1 ||
        roots.files.some((file) => !file.appProperties?.sylfRealm)
      )
        throw new NotesServerError(
          "Multiple Drive libraries were found. Keep them intact and resolve the original library before connecting.",
          409
        );
      if (matching[0]) {
        discoveredExistingRoot = true;
        rootId = matching[0].id;
        libraryId = z.uuid().parse(matching[0].appProperties?.libraryId);
      } else
        rootId = (
          await drive.folder("Sylf Notes", {
            sylfNotes: "library-v1",
            ownerRef: String(userId),
            libraryId,
            sylfRealm: driveRealm(),
          })
        ).id;
      // Preserve the root before subsequent network work so retries cannot silently create a new library.
      const savedRoot = await prisma.notesConnection.updateMany({
        where: {
          id: connection.id,
          credentialRevision: connection.credentialRevision,
        },
        data: { rootId, libraryId },
      });
      if (!savedRoot.count)
        throw new NotesServerError(
          "Drive binding changed during provisioning.",
          409
        );
    }
    await drive.checkedRoot(rootId, libraryId);
    const query = `'${escapeQuery(rootId)}' in parents and trashed = false and appProperties has { key='sylfNotes' and value='descriptor-v1' }`;
    const descriptors = await drive.list(query);
    const descriptor = librarySchema.parse({
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId,
      ownerRef: String(userId),
      bindingGeneration: connection.bindingGeneration,
      extensions: {},
    });
    const bytes = encodeJson(descriptor);
    if (!descriptors.files.length) {
      if (
        discoveredExistingRoot ||
        connection.status === "ACTIVE" ||
        connection.verifiedAt
      )
        throw new NotesServerError(
          "The cloud library descriptor is missing. Restore it from a verified copy before reconnecting.",
          409
        );
      const file = await drive.create(rootId, "library.v1.json", bytes, {
        sylfNotes: "descriptor-v1",
        libraryId,
      });
      if (sha(await drive.read(file.id, 100000)) !== sha(bytes))
        throw new NotesServerError(
          "Drive storage verification failed.",
          409,
          "CORRUPT"
        );
    } else {
      if (descriptors.nextPageToken || descriptors.files.length > 8)
        throw new NotesServerError(
          "Resolve duplicate library descriptors before opening Notes.",
          409
        );
      for (const file of descriptors.files)
        if (sha(await drive.read(file.id, 100000)) !== sha(bytes))
          throw new NotesServerError(
            "Drive library identity changed. Original data was retained.",
            409,
            "CORRUPT"
          );
    }
    const probe = randomBytes(48),
      probeHash = sha(probe);
    const probeFile = await drive.create(
      rootId,
      `connection-check-${randomUUID()}`,
      probe,
      { sylfNotes: "probe-v1", libraryId }
    );
    if (sha(await drive.read(probeFile.id, 10000)) !== probeHash)
      throw new NotesServerError(
        "Google Drive round-trip verification failed.",
        409,
        "CORRUPT"
      );
    const updated = await prisma.notesConnection.updateMany({
      where: {
        id: connection.id,
        userId,
        credentialRevision: connection.credentialRevision,
      },
      data: {
        rootId,
        libraryId,
        label: profile.email || "Google Drive",
        credentials: seal(tokens, `notes-connection:${connection.id}`),
        status: "ACTIVE",
        credentialRevision: { increment: 1 },
        refreshLeaseUntil: null,
        verifiedAt: new Date(),
        probeHash,
      },
    });
    if (!updated.count)
      throw new NotesServerError(
        "Drive binding changed during verification. Reconnect.",
        409
      );
  } catch (error) {
    await prisma.notesConnection.updateMany({
      where: {
        id: connection.id,
        credentialRevision: connection.credentialRevision,
      },
      data: { refreshLeaseUntil: null },
    });
    throw error;
  }
}
export async function connectionToken(connection: NotesConnection) {
  if (connection.status !== "ACTIVE")
    throw new NotesServerError(
      "Reconnect the original Google Drive account.",
      409,
      "AUTH"
    );
  const tokens = unseal<Tokens>(
    connection.credentials,
    `notes-connection:${connection.id}`
  );
  if (tokens.expiresAt > Date.now() + 120000) return tokens.accessToken;
  const lease = await prisma.notesConnection.updateMany({
    where: {
      id: connection.id,
      credentialRevision: connection.credentialRevision,
      status: "ACTIVE",
      OR: [
        { refreshLeaseUntil: null },
        { refreshLeaseUntil: { lt: new Date() } },
      ],
    },
    data: { refreshLeaseUntil: new Date(Date.now() + 30000) },
  });
  if (!lease.count)
    throw new NotesServerError(
      "Drive credentials are refreshing. Retry shortly.",
      503,
      "THROTTLE",
      5
    );
  try {
    const next = await exchange({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    next.refreshToken ||= tokens.refreshToken;
    const saved = await prisma.notesConnection.updateMany({
      where: {
        id: connection.id,
        credentialRevision: connection.credentialRevision,
        status: "ACTIVE",
      },
      data: {
        credentials: seal(next, `notes-connection:${connection.id}`),
        credentialRevision: { increment: 1 },
        refreshLeaseUntil: null,
      },
    });
    if (!saved.count)
      throw new NotesServerError(
        "Drive connection changed. Retry synchronization.",
        409,
        "AUTH"
      );
    return next.accessToken;
  } catch (error) {
    await prisma.notesConnection.updateMany({
      where: {
        id: connection.id,
        credentialRevision: connection.credentialRevision,
      },
      data: {
        refreshLeaseUntil: null,
        ...(error instanceof NotesServerError && error.code === "AUTH"
          ? { status: "RECONNECT" }
          : {}),
      },
    });
    throw error;
  }
}
export function publicBinding(connection: NotesConnection) {
  if (!connection.rootId || !connection.verifiedAt || !connection.probeHash)
    throw new NotesServerError(
      "Complete verified Drive setup before opening a Notes library.",
      409
    );
  return {
    descriptor: {
      format: "sylf-notes" as const,
      formatVersion: 1 as const,
      minimumReaderVersion: 1,
      libraryId: connection.libraryId,
      ownerRef: String(connection.userId),
      bindingGeneration: connection.bindingGeneration,
      extensions: {},
    },
    binding: {
      provider: "google-drive" as const,
      accountId: connection.accountId,
      rootId: connection.rootId,
      generation: connection.bindingGeneration,
      verifiedAt: connection.verifiedAt.toISOString(),
      probeHash: connection.probeHash,
    },
    label: connection.label,
    status: connection.status,
  };
}
