// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { newId } from "@/lib/notes/contracts";
import { encodeJson } from "@/lib/notes/bytes";
import { encodePack } from "@/lib/notes/pack";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  db: {
    notesConnection: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    notesOAuthState: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth-server", () => ({ getSession: mocks.session }));
import {
  config,
  seal,
  unseal,
  sha,
  sessionHash,
  requireOrigin,
} from "@/lib/notes/server/security";
import {
  beginOAuth,
  finishOAuth,
  connectionToken,
  publicBinding,
} from "@/lib/notes/server/connections";
import { GoogleDrive } from "@/lib/notes/server/google-drive";
import { POST as unlock } from "@/app/api/notes/unlock/route";
import { POST as relay } from "@/app/api/notes/drive/route";
import type { NotesConnection } from "@prisma/client";

let row: NotesConnection;
const request = (path: string, body?: BodyInit, origin = "https://sylf.test") =>
  new Request("https://sylf.test" + path, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: "hunter_token=synthetic-session",
      ...(typeof body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body,
  });
class FakeGoogle {
  files = new Map<
    string,
    {
      id: string;
      name: string;
      mimeType: string;
      parents: string[];
      appProperties: Record<string, string>;
      version: string;
      bytes: Uint8Array;
    }
  >();
  requests: { url: string; init: RequestInit }[] = [];
  profile = "google-owner";
  denied = "";
  constructor() {
    this.files.set("root", {
      id: "root",
      name: "Sylf Notes",
      mimeType: "application/vnd.google-apps.folder",
      parents: [],
      appProperties: {
        sylfNotes: "library-v1",
        libraryId: row.libraryId,
        ownerRef: "1",
        sylfRealm: sha("https://sylf.test"),
      },
      version: "1",
      bytes: new Uint8Array(),
    });
    const bytes = encodeJson(publicBinding(row).descriptor);
    this.files.set("header", {
      id: "header",
      name: "library.v1.json",
      mimeType: "application/octet-stream",
      parents: ["root"],
      appProperties: { sylfNotes: "descriptor-v1", libraryId: row.libraryId },
      version: "1",
      bytes,
    });
  }
  fetch: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    this.requests.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "new-token",
        refresh_token: "refresh",
        expires_in: 3600,
        scope: "openid email https://www.googleapis.com/auth/drive.file",
      });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo")
      return Response.json({
        sub: this.profile,
        email: "synthetic@example.invalid",
      });
    const u = new URL(url);
    expect(u.hostname).toBe("www.googleapis.com");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    if (this.denied)
      return Response.json(
        { error: { errors: [{ reason: this.denied }] } },
        { status: 403, headers: { "Retry-After": "7" } }
      );
    if (u.pathname === "/upload/drive/v3/files") {
      const body = Buffer.from(init.body as Uint8Array),
        first = body.indexOf("\r\n\r\n") + 4,
        metaEnd = body.indexOf("\r\n--", first),
        metadata = JSON.parse(body.subarray(first, metaEnd).toString()),
        start = body.indexOf("\r\n\r\n", metaEnd) + 4,
        end = body.lastIndexOf("\r\n--");
      const id = "file-" + this.files.size;
      const file = {
        ...metadata,
        id,
        version: "1",
        bytes: new Uint8Array(body.subarray(start, end)),
      };
      this.files.set(id, file);
      return Response.json(file);
    }
    if (u.pathname === "/drive/v3/files" && init.method === "POST") {
      const metadata = JSON.parse(String(init.body)),
        id = "file-" + this.files.size,
        file = {
          ...metadata,
          id,
          parents: [],
          version: "1",
          bytes: new Uint8Array(),
        };
      this.files.set(id, file);
      return Response.json(file);
    }
    const id = u.pathname.split("/")[4];
    if (id) {
      const file = this.files.get(id);
      if (!file) return new Response(null, { status: 404 });
      return u.searchParams.get("alt") === "media"
        ? new Response(file.bytes.slice().buffer)
        : Response.json(file);
    }
    const query = u.searchParams.get("q") || "";
    const kind = query.includes("descriptor-v1")
      ? "descriptor-v1"
      : query.includes("pack-v1")
        ? "pack-v1"
        : "library-v1";
    return Response.json({
      files: [...this.files.values()].filter(
        (file) => file.appProperties.sylfNotes === kind
      ),
    });
  };
}
beforeEach(() => {
  vi.stubEnv("NOTES_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("NOTES_PUBLIC_URL", "https://sylf.test");
  vi.stubEnv("GOOGLE_NOTES_CLIENT_ID", "synthetic-client");
  vi.stubEnv("GOOGLE_NOTES_CLIENT_SECRET", "synthetic-secret");
  row = {
    id: newId(),
    userId: 1,
    libraryId: newId(),
    accountId: "google-owner",
    rootId: "root",
    label: "Synthetic Drive",
    credentials: "",
    vaultKey: "",
    status: "ACTIVE",
    bindingGeneration: 1,
    credentialRevision: 1,
    refreshLeaseUntil: null,
    verifiedAt: new Date(0),
    probeHash: "0".repeat(64),
    createdAt: new Date(0),
  };
  row.credentials = seal(
    {
      accessToken: "old-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    },
    `notes-connection:${row.id}`
  );
  row.vaultKey = seal(
    randomBytes(32).toString("base64"),
    `notes-vault:${row.id}`
  );
  mocks.session.mockResolvedValue({ userId: 1 });
  mocks.db.notesConnection.findUnique.mockImplementation(async ({ where }) =>
    where.userId === row.userId ? row : null
  );
  mocks.db.notesConnection.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.notesOAuthState.count.mockResolvedValue(0);
  mocks.db.notesOAuthState.deleteMany.mockResolvedValue({ count: 1 });
  mocks.db.notesOAuthState.create.mockResolvedValue({});
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Notes credential broker and Drive routes", () => {
  it("binds PKCE, single-use state and least privilege to the cookie session", async () => {
    const req = request("/api/notes/connection"),
      url = new URL(await beginOAuth(1, req));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(config().scopes);
    expect(url.searchParams.get("scope")).not.toContain("calendar");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const saved = mocks.db.notesOAuthState.create.mock.calls[0][0].data;
    expect(saved.id).toBe(sha(url.searchParams.get("state")!));
    expect(saved.sessionHash).toBe(sessionHash(req));
    expect(saved.verifier).not.toBe(url.searchParams.get("code_challenge"));
    expect(
      unseal<string>(saved.verifier, `notes-oauth:${saved.id}`).length
    ).toBeGreaterThan(40);
  });
  it("rejects expired state before contacting Google", async () => {
    mocks.db.notesOAuthState.findFirst.mockResolvedValue(null);
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    await expect(
      finishOAuth(1, request("/api/notes/callback"), "expired", "code")
    ).rejects.toMatchObject({ status: 409 });
    expect(network).not.toHaveBeenCalled();
  });
  it("provisions a first connection only after descriptor and fresh probe readback, with an encrypted stable vault key", async () => {
    const google = new FakeGoogle();
    google.files.clear();
    vi.stubGlobal("fetch", google.fetch);
    mocks.db.notesConnection.findUnique.mockResolvedValue(null);
    mocks.db.notesConnection.create.mockImplementation(async ({ data }) => {
      row = {
        ...row,
        ...data,
        rootId: null,
        verifiedAt: null,
        probeHash: null,
        status: "PROVISIONING",
      };
      return row;
    });
    const id = sha("new-state");
    mocks.db.notesOAuthState.findFirst.mockResolvedValue({
      id,
      verifier: seal("verifier", `notes-oauth:${id}`),
    });
    await finishOAuth(
      1,
      request("/api/notes/callback"),
      "new-state",
      "new-code"
    );
    const activated = mocks.db.notesConnection.updateMany.mock.calls.find(
      ([v]) => v.data.status === "ACTIVE"
    )![0].data;
    expect(activated.rootId).toBeTruthy();
    expect(activated.probeHash).toHaveLength(64);
    expect(google.files.get(activated.rootId)!.appProperties.sylfRealm).toBe(
      sha("https://sylf.test")
    );
    expect(
      [...google.files.values()].filter(
        (f) => f.appProperties.sylfNotes === "descriptor-v1"
      )
    ).toHaveLength(1);
    expect(
      [...google.files.values()].filter(
        (f) => f.appProperties.sylfNotes === "probe-v1"
      )
    ).toHaveLength(1);
    expect(
      Buffer.from(
        unseal<string>(row.vaultKey, `notes-vault:${row.id}`),
        "base64"
      )
    ).toHaveLength(32);
    expect(row.credentials).not.toContain("new-token");
  });
  it("verifies original root, descriptor and a fresh storage round trip on reconnect", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const state = "synthetic-state",
      id = sha(state);
    mocks.db.notesOAuthState.findFirst.mockResolvedValue({
      id,
      verifier: seal("verifier", `notes-oauth:${id}`),
    });
    await finishOAuth(1, request("/api/notes/callback"), state, "code");
    const calls = mocks.db.notesConnection.updateMany.mock.calls;
    expect(
      calls.some(
        ([input]) =>
          input.data.status === "ACTIVE" && input.data.probeHash?.length === 64
      )
    ).toBe(true);
    expect(
      [...google.files.values()].some(
        (file) => file.appProperties.sylfNotes === "probe-v1"
      )
    ).toBe(true);
  });
  it("never rebinds an existing library to a different Google account", async () => {
    const google = new FakeGoogle();
    google.profile = "wrong-google-account";
    vi.stubGlobal("fetch", google.fetch);
    const id = sha("state");
    mocks.db.notesOAuthState.findFirst.mockResolvedValue({
      id,
      verifier: seal("verifier", `notes-oauth:${id}`),
    });
    await expect(
      finishOAuth(1, request("/api/notes/callback"), "state", "code")
    ).rejects.toMatchObject({ code: "AUTH" });
    expect(mocks.db.notesConnection.updateMany).not.toHaveBeenCalled();
    expect(google.requests.some((req) => req.url.includes("drive/v3"))).toBe(
      false
    );
  });
  it("does not replace a missing established cloud descriptor with an empty library", async () => {
    const google = new FakeGoogle();
    google.files.delete("header");
    vi.stubGlobal("fetch", google.fetch);
    const id = sha("state");
    mocks.db.notesOAuthState.findFirst.mockResolvedValue({
      id,
      verifier: seal("verifier", `notes-oauth:${id}`),
    });
    await expect(
      finishOAuth(1, request("/api/notes/callback"), "state", "code")
    ).rejects.toMatchObject({ status: 409 });
    expect(
      google.requests.some(
        (req) => req.init.method === "POST" && req.url.includes("drive/v3")
      )
    ).toBe(false);
  });
  it("refuses to initialize a discovered old root when its original descriptor is missing", async () => {
    const google = new FakeGoogle();
    google.files.delete("header");
    row.rootId = null;
    row.verifiedAt = null;
    row.status = "PROVISIONING";
    vi.stubGlobal("fetch", google.fetch);
    const id = sha("state");
    mocks.db.notesOAuthState.findFirst.mockResolvedValue({
      id,
      verifier: seal("verifier", `notes-oauth:${id}`),
    });
    await expect(
      finishOAuth(1, request("/api/notes/callback"), "state", "code")
    ).rejects.toMatchObject({ status: 409 });
    expect(
      google.requests.some(
        (r) => r.init.method === "POST" && r.url.includes("drive/v3")
      )
    ).toBe(false);
  });
  it("refuses an enrolled root from another deployment realm", async () => {
    const google = new FakeGoogle();
    google.files.get("root")!.appProperties.sylfRealm = sha(
      "https://staging.sylf.test"
    );
    vi.stubGlobal("fetch", google.fetch);
    const response = await relay(
      request("/api/notes/drive", JSON.stringify({ action: "list" }))
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("AUTH");
    expect(google.requests.some((r) => r.init.method === "POST")).toBe(false);
  });
  it("requires authentication and the canonical origin before releasing a local key", async () => {
    expect(
      (
        await unlock(
          request("/api/notes/unlock", undefined, "https://hostile.invalid")
        )
      ).status
    ).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await unlock(request("/api/notes/unlock"))).status).toBe(401);
    mocks.session.mockResolvedValue({ userId: 2 });
    const other = await unlock(request("/api/notes/unlock"));
    expect(other.status).toBe(409);
    expect(await other.text()).not.toContain("vaultKey");
    mocks.session.mockResolvedValue({ userId: 1 });
    const own = await unlock(request("/api/notes/unlock"));
    expect(own.headers.get("cache-control")).toContain("no-store");
    expect((await own.json()).vaultKey).toBe(
      unseal(row.vaultKey, `notes-vault:${row.id}`)
    );
  });
  it("authenticates a header recovery against the current original cloud descriptor", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const result = await unlock(request("/api/notes/unlock?verify=1"));
    expect(result.status).toBe(200);
    expect((await result.json()).headerVerified).toBe(true);
    google.files.get("header")!.bytes = new Uint8Array([1]);
    expect((await unlock(request("/api/notes/unlock?verify=1"))).status).toBe(
      409
    );
  });
  it("uploads bounded immutable packs and refuses files outside the bound root", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = await encodePack(row.libraryId, [], []),
      hash = sha(bytes),
      uploaded = await relay(
        request(
          `/api/notes/drive?action=upload&hash=${hash}`,
          bytes.slice().buffer
        )
      );
    expect(uploaded.status).toBe(200);
    const file = (await uploaded.json()).file;
    expect(file.hash).toBe(hash);
    const read = await relay(
      request(
        "/api/notes/drive",
        JSON.stringify({ action: "read", fileId: file.id })
      )
    );
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
    google.files.get(file.id)!.parents = ["other-root"];
    expect(
      (
        await relay(
          request(
            "/api/notes/drive",
            JSON.stringify({ action: "read", fileId: file.id })
          )
        )
      ).status
    ).toBe(403);
  });
  it("does not accept corrupt uploads or broader arbitrary-provider operations", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    expect(
      (
        await relay(
          request(
            `/api/notes/drive?action=upload&hash=${"a".repeat(64)}`,
            new Uint8Array([1]).buffer
          )
        )
      ).status
    ).toBe(409);
    expect(
      (
        await relay(
          request(
            "/api/notes/drive",
            JSON.stringify({ action: "read", fileId: "../../other" })
          )
        )
      ).status
    ).not.toBe(200);
    expect(google.requests.some((req) => req.url.includes(".."))).toBe(false);
  });
  it("honors credential refresh leases and blocks revoked grants without returning secrets", async () => {
    row.credentials = seal(
      { accessToken: "old", refreshToken: "refresh", expiresAt: 0 },
      `notes-connection:${row.id}`
    );
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    mocks.db.notesConnection.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(connectionToken(row)).rejects.toMatchObject({
      code: "THROTTLE",
    });
    expect(google.requests).toHaveLength(0);
    mocks.db.notesConnection.updateMany.mockResolvedValue({ count: 1 });
    expect(await connectionToken(row)).toBe("new-token");
    expect(
      mocks.db.notesConnection.updateMany.mock.calls.some(
        ([input]) => input.data.credentialRevision?.increment === 1
      )
    ).toBe(true);
  });
  it("classifies provider quota and throttling with Retry-After", async () => {
    const google = new FakeGoogle();
    google.denied = "storageQuotaExceeded";
    vi.stubGlobal("fetch", google.fetch);
    await expect(
      new GoogleDrive("token").metadata("root")
    ).rejects.toMatchObject({ code: "QUOTA", retryAfter: 7 });
    google.denied = "rateLimitExceeded";
    await expect(
      new GoogleDrive("token").metadata("root")
    ).rejects.toMatchObject({ code: "THROTTLE", retryAfter: 7 });
    expect(() =>
      requireOrigin(request("/api/notes/unlock", undefined, "null"))
    ).toThrow();
  });
});
