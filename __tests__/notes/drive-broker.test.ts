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
import { cleanDuplicatePacks } from "@/lib/notes/server/organize-drive";
import {
  publicationSchema,
  finishPublication,
  publicationSource,
} from "@/lib/notes/server/publications";
import { POST as unlock } from "@/app/api/notes/unlock/route";
import { POST as publications } from "@/app/api/notes/publications/route";
import { POST as relay } from "@/app/api/notes/drive/route";
import {
  GET as readConnection,
  POST as connect,
} from "@/app/api/notes/connection/route";
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
      size?: string;
      sha256Checksum?: string;
      trashed?: boolean;
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
    expect(init.redirect).toBe(init.method === "PUT" ? "manual" : "error");
    expect(init.cache).toBe("no-store");
    if (this.denied)
      return Response.json(
        { error: { errors: [{ reason: this.denied }] } },
        { status: 403, headers: { "Retry-After": "7" } }
      );
    if (
      u.pathname.startsWith("/upload/drive/v3/files/") &&
      init.method === "PATCH"
    ) {
      const id = u.pathname.split("/").at(-1)!;
      return new Response(null, {
        headers: {
          location: `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=resumable&upload_id=${id}`,
        },
      });
    }
    if (init.method === "PUT") {
      const file = this.files.get(u.searchParams.get("upload_id")!)!;
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
        String((init.headers as Record<string, string>)["Content-Range"])
      )!;
      const offset = Number(range[1]),
        total = Number(range[3]);
      if (file.bytes.length !== total) file.bytes = new Uint8Array(total);
      file.bytes.set(new Uint8Array(init.body as ArrayBuffer), offset);
      const end = Number(range[2]) + 1;
      if (end < total)
        return new Response(null, {
          status: 308,
          headers: { range: `bytes=0-${end - 1}` },
        });
      file.size = String(total);
      file.sha256Checksum = sha(file.bytes);
      file.version = String(Number(file.version) + 1);
      const { bytes: _bytes, ...meta } = file;
      void _bytes;
      return Response.json(meta);
    }
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
        size: String(end - start),
        sha256Checksum: sha(new Uint8Array(body.subarray(start, end))),
      };
      this.files.set(id, file);
      return Response.json(
        Object.fromEntries(
          Object.entries(file).filter(([key]) => key !== "bytes")
        )
      );
    }
    if (u.pathname === "/drive/v3/files" && init.method === "POST") {
      const metadata = JSON.parse(String(init.body)),
        id = "file-" + this.files.size,
        file = {
          ...metadata,
          id,
          parents: metadata.parents || [],
          version: "1",
          bytes: new Uint8Array(),
        };
      this.files.set(id, file);
      return Response.json(
        Object.fromEntries(
          Object.entries(file).filter(([key]) => key !== "bytes")
        )
      );
    }
    const id = u.pathname.split("/")[4];
    if (id) {
      const file = this.files.get(id);
      if (!file) return new Response(null, { status: 404 });
      const v2 = u.pathname.startsWith("/drive/v2/");
      if (init.method === "PATCH") {
        const match = new Headers(init.headers).get("If-Match");
        if (v2 && match && match !== `"${file.id}-${file.version}"`)
          return new Response(null, { status: 412 });
        const patch = JSON.parse(String(init.body));
        if (v2) {
          if (patch.labels) file.trashed = patch.labels.trashed;
          if (patch.properties)
            file.appProperties = Object.fromEntries(
              patch.properties
                .filter(
                  (p: { visibility: string }) => p.visibility === "PRIVATE"
                )
                .map((p: { key: string; value: string }) => [p.key, p.value])
            );
        } else Object.assign(file, patch);
        if (u.searchParams.has("addParents"))
          file.parents = [u.searchParams.get("addParents")!];
        file.version = String(Number(file.version) + 1);
      }
      if (v2)
        return Response.json({
          id: file.id,
          etag: `"${file.id}-${file.version}"`,
          version: file.version,
          properties: Object.entries(file.appProperties).map(
            ([key, value]) => ({ key, value, visibility: "PRIVATE" })
          ),
        });
      return u.searchParams.get("alt") === "media"
        ? new Response(file.bytes.slice().buffer)
        : Response.json(
            Object.fromEntries(
              Object.entries(file).filter(([key]) => key !== "bytes")
            ),
            {}
          );
    }
    const query = u.searchParams.get("q") || "";
    const properties = [
      ...query.matchAll(
        /appProperties has \{ key='([^']+)' and value='([^']+)' \}/g
      ),
    ];
    const parents = [...query.matchAll(/'([^']+)' in parents/g)].map(
      (m) => m[1]
    );
    const matched = [...this.files.values()]
      .filter(
        (file) =>
          (!query.includes("trashed = false") || !file.trashed) &&
          properties.every(
            ([, key, value]) => file.appProperties[key] === value
          ) &&
          (!parents.length || file.parents.some((p) => parents.includes(p)))
      )
      .map(({ bytes: _bytes, ...meta }) => {
        void _bytes;
        return meta;
      });
    const offset = Number(u.searchParams.get("pageToken") || 0),
      size = Number(u.searchParams.get("pageSize") || 100);
    return Response.json({
      files: matched.slice(offset, offset + size),
      ...(offset + size < matched.length
        ? { nextPageToken: String(offset + size) }
        : {}),
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
  it("advertises the fixed Notes address to authenticated clients without starting consent", async () => {
    mocks.db.notesConnection.findUnique.mockResolvedValueOnce(null);
    const response = await readConnection(
      new Request("https://deployment.sylf.test/api/notes/connection")
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      configured: true,
      notesUrl: "https://sylf.test/notes",
      connection: null,
    });
    expect(mocks.db.notesOAuthState.create).not.toHaveBeenCalled();
  });
  it("rejects a deployment alias before creating OAuth state with a distinct origin error", async () => {
    const response = await connect(
      request(
        "/api/notes/connection",
        JSON.stringify({ action: "connect" }),
        "https://deployment.sylf.test"
      )
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ORIGIN" });
    expect(mocks.db.notesOAuthState.create).not.toHaveBeenCalled();
  });
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
    expect((await response.json()).code).toBe("CORRUPT");
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
  it("bootstraps connected access and the encrypted-device key in one owner-scoped lookup without contacting Google", async () => {
    const remote = vi.fn();
    vi.stubGlobal("fetch", remote);
    const response = await unlock(request("/api/notes/unlock?bootstrap=1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      access: {
        configured: true,
        localAccess: true,
        connection: { status: "ACTIVE" },
      },
      descriptor: { ownerRef: "1" },
      vaultKey: unseal(row.vaultKey, `notes-vault:${row.id}`),
    });
    expect(mocks.session).toHaveBeenCalledTimes(1);
    expect(mocks.db.notesConnection.findUnique).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
  });
  it("never releases a bootstrap key without authentication, ownership, and same-origin validation", async () => {
    const hostile = await unlock(
      request(
        "/api/notes/unlock?bootstrap=1",
        undefined,
        "https://hostile.invalid"
      )
    );
    expect(hostile.status).toBe(403);
    expect(await hostile.text()).not.toContain("vaultKey");
    mocks.session.mockResolvedValue(null);
    expect(
      (await unlock(request("/api/notes/unlock?bootstrap=1"))).status
    ).toBe(401);
    mocks.session.mockResolvedValue({ userId: 2 });
    const other = await unlock(request("/api/notes/unlock?bootstrap=1"));
    expect(await other.json()).toMatchObject({ access: { connection: null } });
    row.verifiedAt = null;
    mocks.session.mockResolvedValue({ userId: 1 });
    const unverified = await unlock(request("/api/notes/unlock?bootstrap=1"));
    expect(await unverified.text()).not.toContain("vaultKey");
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

describe("Phase 7 organized Drive publications", () => {
  it("keeps native archive copies in the system folder instead of the readable document tree", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = new TextEncoder().encode(
      "Synthetic native archive retained intact"
    );
    const p = {
      documentId: newId(),
      fingerprint: sha("native"),
      hash: sha(bytes),
      size: bytes.length,
      title: "Lecture one",
      folders: [{ id: newId(), name: "Mathematics" }],
    };
    const { token } = await (
      await publications(request("/api/notes/publications", JSON.stringify(p)))
    ).json();
    const req = request(
      "/api/notes/publications?action=chunk&offset=0",
      bytes.buffer
    );
    req.headers.set("x-sylf-upload", token);
    expect((await publications(req)).status).toBe(200);
    const file = [...google.files.values()].find(
      (f) => f.appProperties.sylfNotes === "publication-v1"
    )!;
    const system = [...google.files.values()].find(
      (f) => f.appProperties.sylfNotes === "system-v1"
    )!;
    expect(file.name).toBe("Lecture one.sylfnote");
    expect(file.parents).toEqual([system.id]);
    expect(file.bytes).toEqual(bytes);
    expect(
      [...google.files.values()].some((f) => f.name === "Mathematics")
    ).toBe(false);
  });
  it("rejects a non-PDF readable upload and a session pointing at another file", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = new Uint8Array(32).fill(7);
    const p = {
      format: "pdf",
      documentId: newId(),
      fingerprint: sha("bad-pdf"),
      hash: sha(bytes),
      size: bytes.length,
      title: "Retain originals",
      folders: [],
    };
    const { token } = await (
      await publications(request("/api/notes/publications", JSON.stringify(p)))
    ).json();
    const req = request(
      "/api/notes/publications?action=chunk&offset=0",
      bytes.buffer
    );
    req.headers.set("x-sylf-upload", token);
    expect((await publications(req)).status).toBe(400);
    expect(
      [...google.files.values()].find(
        (f) => f.appProperties.sylfNotes === "publication-v1"
      )!.size
    ).toBe("0");
    const wrong = new GoogleDrive(
      "synthetic",
      async () =>
        new Response(null, {
          headers: {
            location:
              "https://www.googleapis.com/upload/drive/v3/files/another-file?uploadType=resumable&upload_id=synthetic",
          },
        })
    );
    await expect(wrong.startArchive("owned-file", 32)).rejects.toThrow(
      "Unexpected Drive upload session"
    );
  });
  it("places new packs in the system folder and still enumerates legacy root packs", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = await encodePack(row.libraryId, [], []),
      hash = sha(bytes);
    const response = await relay(
      request(
        `/api/notes/drive?action=upload&hash=${hash}`,
        bytes.slice().buffer
      )
    );
    expect(response.status).toBe(200);
    const id = (await response.json()).file.id;
    const system = [...google.files.values()].find(
      (f) => f.appProperties.sylfNotes === "system-v1"
    )!;
    expect(google.files.get(id)!.parents).toEqual([system.id]);
    const legacy = {
      ...google.files.get(id)!,
      id: "legacy",
      parents: ["root"],
    };
    google.files.set("legacy", legacy);
    const listing = await relay(
      request("/api/notes/drive", JSON.stringify({ action: "list" }))
    );
    expect(
      (await listing.json()).files.map((f: { id: string }) => f.id).sort()
    ).toEqual([id, "legacy"].sort());
    expect(
      new Uint8Array(
        await (
          await relay(
            request(
              "/api/notes/drive",
              JSON.stringify({ action: "read", fileId: "legacy" })
            )
          )
        ).arrayBuffer()
      )
    ).toEqual(bytes);
  });
  it("uploads a named PDF across bounded chunks, reconciles a lost completion and mirrors folders", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = new Uint8Array(300000).fill(17);
    bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
    const p = {
      format: "pdf",
      documentId: newId(),
      fingerprint: sha("snapshot"),
      hash: sha(bytes),
      size: bytes.length,
      title: "Lecture / one",
      folders: [
        { id: newId(), name: "Mathematics" },
        { id: newId(), name: "Complex numbers" },
      ],
    };
    const start = await publications(
      request("/api/notes/publications", JSON.stringify(p))
    );
    expect(start.status).toBe(200);
    const { token } = await start.json();
    expect(token).not.toContain("googleapis");
    const chunk = async (offset: number, end: number) => {
      const req = request(
        `/api/notes/publications?action=chunk&offset=${offset}`,
        bytes.slice(offset, end).buffer
      );
      req.headers.set("x-sylf-upload", token);
      return publications(req);
    };
    expect(await (await chunk(0, 262144)).json()).toEqual({
      complete: false,
      offset: 262144,
    });
    expect(await (await chunk(262144, bytes.length)).json()).toEqual({
      complete: true,
      offset: bytes.length,
    });
    const files = [...google.files.values()];
    const saved = files.find(
      (f) => f.appProperties.sylfNotes === "publication-v1"
    )!;
    expect(saved.name).toBe("Lecture _ one.pdf");
    expect(saved.mimeType).toBe("application/pdf");
    const subject = files.find((f) => f.name === "Mathematics")!,
      topic = files.find((f) => f.name === "Complex numbers")!;
    expect(topic.parents).toEqual([subject.id]);
    expect(saved.parents).toEqual([topic.id]);
    expect(saved.bytes).toEqual(bytes);
    // A retry after a lost final response observes the exact provider checksum.
    expect(
      await (
        await publications(
          request("/api/notes/publications", JSON.stringify(p))
        )
      ).json()
    ).toEqual({ complete: true });
    expect(
      [...google.files.values()].filter(
        (f) => f.appProperties.sylfNotes === "publication-v1"
      )
    ).toHaveLength(1);
    // Caller cannot move someone else's arbitrary provider ID via this endpoint.
    expect(
      (
        await publications(
          request(
            "/api/notes/publications",
            JSON.stringify({ ...p, fileId: "root" })
          )
        )
      ).status
    ).not.toBe(200);
  });
  it("binds resumable upload capabilities to the account and rejects corrupted final bytes", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = new Uint8Array(22).fill(17);
    const p = {
      documentId: newId(),
      fingerprint: sha("snapshot"),
      hash: sha(bytes),
      size: 22,
      title: "Retain originals",
      folders: [],
    };
    const { token } = await (
      await publications(request("/api/notes/publications", JSON.stringify(p)))
    ).json();
    const req = request(
      "/api/notes/publications?action=chunk&offset=0",
      new Uint8Array(22).fill(3).buffer
    );
    req.headers.set("x-sylf-upload", token);
    const result = await publications(req);
    expect(result.status).toBe(409);
    expect((await result.json()).code).toBe("CORRUPT");
    row.bindingGeneration = 2;
    const switched = request(
      "/api/notes/publications?action=chunk&offset=0",
      bytes.buffer
    );
    switched.headers.set("x-sylf-upload", token);
    expect((await publications(switched)).status).toBe(403);
    expect(
      [...google.files.values()]
        .filter((f) => f.appProperties.sylfNotes === "publication-v1")
        .every((f) => f.name.startsWith("Pending archive"))
    ).toBe(true);
  });
  it("refuses unsafe resumable endpoints and ambiguous system folders", async () => {
    const google = new GoogleDrive(
      "synthetic",
      async () =>
        new Response(null, {
          headers: { location: "https://attacker.invalid/upload" },
        })
    );
    await expect(google.startArchive("owned-file", 100)).rejects.toThrow(
      "Unexpected Drive upload session"
    );
    const fake = new FakeGoogle();
    vi.stubGlobal("fetch", fake.fetch);
    for (const id of ["one", "two"])
      fake.files.set(id, {
        id,
        name: "system",
        parents: ["root"],
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { sylfNotes: "system-v1", libraryId: row.libraryId },
        version: "1",
        bytes: new Uint8Array(),
      });
    const result = await relay(
      request("/api/notes/drive", JSON.stringify({ action: "list" }))
    );
    expect(result.status).toBe(409);
    expect((await result.json()).code).toBe("CORRUPT");
  });
});

describe("Phase 7 legacy organization safety", () => {
  it("moves verified legacy technical files without changing IDs or bytes, and header recovery still works", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = await encodePack(row.libraryId, [], []),
      hash = sha(bytes);
    const drive = new GoogleDrive("synthetic", google.fetch);
    const pack = await drive.create("root", hash + ".sylfpack", bytes, {
      sylfNotes: "pack-v1",
      libraryId: row.libraryId,
      sha256: hash,
    });
    const before = new Map(
      [...google.files].map(([id, f]) => [id, sha(f.bytes)])
    );
    const result = await relay(
      request("/api/notes/drive", JSON.stringify({ action: "organize" }))
    );
    expect(result.status).toBe(200);
    expect((await result.json()).moved).toBe(2);
    const system = [...google.files.values()].find(
      (f) => f.appProperties.sylfNotes === "system-v1"
    )!;
    for (const id of ["header", pack.id]) {
      expect(google.files.get(id)!.parents).toEqual([system.id]);
      expect(sha(google.files.get(id)!.bytes)).toBe(before.get(id));
    }
    expect((await unlock(request("/api/notes/unlock?verify=1"))).status).toBe(
      200
    );
    expect(
      (
        await relay(
          request("/api/notes/drive", JSON.stringify({ action: "organize" }))
        )
      ).status
    ).toBe(200);
    expect(google.files.size).toBe(4);
  });
  it("retains a corrupt legacy pack and refuses to move it", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const drive = new GoogleDrive("synthetic", google.fetch),
      bytes = await encodePack(row.libraryId, [], []),
      hash = sha(bytes);
    const pack = await drive.create("root", hash + ".sylfpack", bytes, {
      sylfNotes: "pack-v1",
      libraryId: row.libraryId,
      sha256: hash,
    });
    google.files.get(pack.id)!.bytes = new Uint8Array([99]);
    const result = await relay(
      request("/api/notes/drive", JSON.stringify({ action: "organize" }))
    );
    expect(result.status).toBe(409);
    expect((await result.json()).code).toBe("CORRUPT");
    expect(google.files.get(pack.id)!.parents).toEqual(["root"]);
    expect(google.files.get(pack.id)!.bytes).toEqual(new Uint8Array([99]));
  });
});

it("does not acknowledge a provider move whose returned identity, title or parent disagrees", async () => {
  const drive = new GoogleDrive("synthetic", async () =>
    Response.json({ id: "owned", name: "Old name", parents: ["old-parent"] })
  );
  await expect(
    drive.renameAndMove(
      { id: "owned", name: "Old name", parents: ["old-parent"] },
      "New name",
      "new-parent"
    )
  ).rejects.toMatchObject({ code: "CORRUPT" });
});

describe("persistent Notes connection regression checks", () => {
  it("allows only exact deployment identities and still rejects cross-origin mutation requests", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "sylf-release.vercel.app");
    const req = new Request(
      "https://sylf-release.vercel.app/api/notes/unlock",
      { method: "POST", headers: { origin: "https://sylf-release.vercel.app" } }
    );
    expect(() => requireOrigin(req)).not.toThrow();
    expect(
      await (
        await readConnection(
          new Request("https://sylf-release.vercel.app/api/notes/connection")
        )
      ).json()
    ).toMatchObject({ localAccess: true, connection: { status: "ACTIVE" } });
    expect(() =>
      requireOrigin(
        new Request(req.url, {
          method: "POST",
          headers: { origin: "https://attacker.vercel.app" },
        })
      )
    ).toThrow();
    expect(() =>
      requireOrigin(
        new Request("https://attacker.vercel.app/api/notes/unlock", {
          method: "POST",
          headers: { origin: "https://attacker.vercel.app" },
        })
      )
    ).toThrow();
    expect(() =>
      requireOrigin(
        new Request(req.url, {
          method: "POST",
          headers: { origin: "https://sylf.test" },
        })
      )
    ).toThrow();
  });
  it.each(["invalid_client", "temporarily_unavailable"])(
    "does not revoke stored authorization for %s",
    async (error) => {
      row.credentials = seal(
        {
          accessToken: "expired",
          refreshToken: "retained-refresh",
          expiresAt: 0,
        },
        `notes-connection:${row.id}`
      );
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ error }, { status: 400 }))
      );
      await expect(connectionToken(row)).rejects.toMatchObject({
        code: "NETWORK",
      });
      expect(
        mocks.db.notesConnection.updateMany.mock.calls.some(
          ([arg]) => arg.data.status === "RECONNECT"
        )
      ).toBe(false);
    }
  );
  it("requests consent only for an actually rejected refresh grant", async () => {
    row.credentials = seal(
      { accessToken: "expired", refreshToken: "revoked-refresh", expiresAt: 0 },
      `notes-connection:${row.id}`
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "invalid_grant" }, { status: 400 })
        )
    );
    await expect(connectionToken(row)).rejects.toMatchObject({ code: "AUTH" });
    expect(
      mocks.db.notesConnection.updateMany.mock.calls.some(
        ([arg]) => arg.data.status === "RECONNECT"
      )
    ).toBe(true);
  });
  it("reuses a newer same-binding credential after losing a refresh lease instead of demanding consent", async () => {
    row.credentials = seal(
      {
        accessToken: "expired",
        refreshToken: "original-refresh",
        expiresAt: 0,
      },
      `notes-connection:${row.id}`
    );
    const latest = {
      ...row,
      credentialRevision: row.credentialRevision + 1,
      credentials: seal(
        {
          accessToken: "already-refreshed",
          refreshToken: "new-refresh",
          expiresAt: Date.now() + 3600000,
        },
        `notes-connection:${row.id}`
      ),
    };
    mocks.db.notesConnection.findUnique.mockResolvedValue(latest);
    mocks.db.notesConnection.updateMany.mockResolvedValue({ count: 0 });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await connectionToken(row)).toBe("already-refreshed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not mistake missing provider files for expired consent", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: { code: 404 } }, { status: 404 })
      );
    await expect(
      new GoogleDrive("synthetic", fetch).metadata("missing")
    ).rejects.toMatchObject({ code: "CORRUPT" });
  });
});

describe("verified Drive copy retirement", () => {
  it("keeps long cleanup metadata out of upload headers and promotes only after final reconciliation", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const bytes = new TextEncoder().encode(
      "%PDF-1.7\nSynthetic long metadata test\n%%EOF"
    );
    const p = publicationSchema.parse({
      format: "pdf",
      documentId: newId(),
      fingerprint: sha("large metadata"),
      title: "界".repeat(500),
      folders: Array.from({ length: 32 }, () => ({
        id: newId(),
        name: "界".repeat(160),
      })),
      hash: sha(bytes),
      size: bytes.length,
      heads: [sha("source")],
      recoveryVerified: true,
      deferPromotion: true,
    });
    const started = await publications(
      request("/api/notes/publications", JSON.stringify(p))
    );
    expect(started.status).toBe(200);
    const { token } = await started.json();
    expect(token.length).toBeLessThan(4000);
    const chunk = request(
      "/api/notes/publications?action=chunk&offset=0",
      bytes.buffer
    );
    chunk.headers.set("x-sylf-upload", token);
    expect((await publications(chunk)).status).toBe(200);
    expect(
      [...google.files.values()].find(
        (f) => f.appProperties.documentId === p.documentId
      )!.name
    ).toContain("Pending archive");
    expect(
      (
        await publications(
          request("/api/notes/publications", JSON.stringify(p))
        )
      ).status
    ).toBe(200);
    expect(
      [...google.files.values()].find(
        (f) => f.appProperties.documentId === p.documentId
      )!.name
    ).toBe("界".repeat(180) + ".pdf");
  });
  async function publishPdf(
    google: FakeGoogle,
    input: Record<string, unknown>,
    content = "%PDF-1.7\nSynthetic current note\n%%EOF"
  ) {
    const bytes = new TextEncoder().encode(content);
    const p = publicationSchema.parse({
      format: "pdf",
      documentId: newId(),
      fingerprint: sha(content),
      title: "Lecture",
      folders: [],
      recoveryVerified: true,
      heads: [sha(content)],
      ...input,
      ...(input.supersedes
        ? {
            supersedes: (input.supersedes as string[]).map((fingerprint) => ({
              fingerprint,
              source: publicationSource(
                [...google.files.values()].find(
                  (f) => f.appProperties.fingerprint === fingerprint
                )!
              )!,
            })),
          }
        : {}),
      hash: sha(bytes),
      size: bytes.length,
    });
    const start = await publications(
      request("/api/notes/publications", JSON.stringify(p))
    );
    expect(start.status).toBe(200);
    const result = await start.json();
    if (!result.complete) {
      const chunk = request(
        "/api/notes/publications?action=chunk&offset=0",
        bytes.buffer
      );
      chunk.headers.set("x-sylf-upload", result.token);
      expect((await publications(chunk)).status).toBe(200);
    }
    const completed = await publications(
      request("/api/notes/publications", JSON.stringify(p))
    );
    expect(completed.status).toBe(200);
    return {
      p,
      result: await completed.json(),
      file: [...google.files.values()].find(
        (f) => !f.trashed && f.appProperties.fingerprint === p.fingerprint
      )!,
    };
  }
  const currentFiles = (google: FakeGoogle) =>
    [...google.files.values()].filter(
      (f) => !f.trashed && f.appProperties.sylfNotes === "publication-v1"
    );

  it("keeps one latest named PDF in its folder, retiring ancestors after native recovery verification", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const documentId = newId(),
      folders = [{ id: newId(), name: "Mathematics" }];
    const first = await publishPdf(google, {
      documentId,
      folders,
      heads: [sha("head1")],
    });
    const second = await publishPdf(
      google,
      {
        documentId,
        folders,
        heads: [sha("head2")],
        supersedes: [first.p.fingerprint],
      },
      "%PDF-1.7\nSecond revision\n%%EOF"
    );
    expect(google.files.get(first.file.id)!.trashed).toBe(true);
    expect(currentFiles(google).map((f) => f.id)).toEqual([second.file.id]);
    expect(second.file.name).toBe("Lecture.pdf");
    expect(second.file.parents).toEqual([
      [...google.files.values()].find((f) => f.name === "Mathematics")!.id,
    ]);
    expect(google.requests.some((r) => r.init.method === "DELETE")).toBe(false);
  });

  it("does not retire a prior copy without verified native recovery, even with a predecessor claim", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const documentId = newId();
    const first = await publishPdf(google, { documentId });
    await publishPdf(
      google,
      { documentId, recoveryVerified: false, predecessor: first.p.fingerprint },
      "%PDF-1.7\nUnverified new copy\n%%EOF"
    );
    expect(currentFiles(google)).toHaveLength(2);
    expect(first.file.trashed).not.toBe(true);
  });

  it("preserves unrelated concurrent branches, and retires both after an explicitly merged snapshot", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const documentId = newId();
    const a = await publishPdf(google, {
      documentId,
      heads: [sha("branch-a")],
    });
    const b = await publishPdf(
      google,
      { documentId, heads: [sha("branch-b")], predecessor: a.p.fingerprint },
      "%PDF-1.7\nConcurrent B\n%%EOF"
    );
    expect(currentFiles(google)).toHaveLength(2); // a receipt cannot override new ancestry metadata
    const merged = await publishPdf(
      google,
      {
        documentId,
        heads: [sha("merged")],
        supersedes: [a.p.fingerprint, b.p.fingerprint],
      },
      "%PDF-1.7\nMerged A and B\n%%EOF"
    );
    expect(currentFiles(google).map((f) => f.id)).toEqual([merged.file.id]);
  });
  it("rejects stale source claims after another device advances a reused rendering's context", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const a = await publishPdf(google, { heads: [sha("a")] });
    const b = await publishPdf(
      google,
      { documentId: a.p.documentId, heads: [sha("b")] },
      "%PDF-1.7\nB snapshot\n%%EOF"
    );
    const oldA = {
      fingerprint: a.p.fingerprint,
      source: publicationSource(a.file)!,
    };
    const oldB = {
      fingerprint: b.p.fingerprint,
      source: publicationSource(b.file)!,
    };
    const drive = new GoogleDrive("synthetic");
    await finishPublication(
      drive,
      "root",
      row.libraryId,
      { ...b.p, heads: [sha("new-b")], supersedes: [oldB] },
      b.file
    );
    await finishPublication(
      drive,
      "root",
      row.libraryId,
      { ...a.p, heads: [sha("new-a")], supersedes: [oldA, oldB] },
      a.file
    );
    expect(currentFiles(google)).toHaveLength(2);
    const merged = {
      ...a.p,
      heads: [sha("merged-context")],
      supersedes: [
        { fingerprint: a.p.fingerprint, source: publicationSource(a.file)! },
        { fingerprint: b.p.fingerprint, source: publicationSource(b.file)! },
      ],
    };
    await finishPublication(drive, "root", row.libraryId, merged, a.file);
    expect(currentFiles(google).map((f) => f.id)).toEqual([a.file.id]);
  });

  it("reconciles duplicate completion and unfinished copies with a deterministic single survivor", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const initial = await publishPdf(google, { heads: [sha("head")] });
    const duplicate = { ...structuredClone(initial.file), id: "zz-identical" };
    google.files.set(duplicate.id, duplicate);
    const pending = {
      ...structuredClone(initial.file),
      id: "zz-pending",
      name: "Pending archive " + initial.p.documentId,
      bytes: new Uint8Array(),
      size: "0",
      sha256Checksum: sha(new Uint8Array()),
    };
    google.files.set(pending.id, pending);
    const drive = new GoogleDrive("synthetic");
    const results = await Promise.allSettled([
      finishPublication(drive, "root", row.libraryId, initial.p, initial.file),
      finishPublication(drive, "root", row.libraryId, initial.p, duplicate),
    ]); // a conditional race may retry, never trash the chosen survivor
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason.code).toBe("NETWORK");
    expect(currentFiles(google).map((f) => f.id)).toEqual([initial.file.id]);
    expect(google.files.get(initial.file.id)!.bytes).toEqual(
      initial.file.bytes
    );
  });

  it("cleans paginated legacy PDF copies in bounded resumable passes while retaining source archives", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const current = await publishPdf(google, {});
    const system = [...google.files.values()].find(
      (f) => f.appProperties.sylfNotes === "system-v1"
    )!;
    for (let i = 0; i < 105; i++)
      google.files.set(`old-${i}`, {
        ...structuredClone(current.file),
        id: `old-${i}`,
        parents: [system.id],
        appProperties: {
          ...current.file.appProperties,
          fingerprint: sha("old" + i),
        },
      });
    for (const old of google.files.values())
      if (old.id.startsWith("old-")) {
        delete old.appProperties.sourceCount;
        delete old.appProperties.source0;
      }
    const archive = {
      ...structuredClone(current.file),
      id: "portable-source",
      mimeType: "application/octet-stream",
      parents: [system.id],
      appProperties: {
        ...current.file.appProperties,
        publicationFormat: "archive",
      },
    };
    google.files.set(archive.id, archive);
    const drive = new GoogleDrive("synthetic");
    let passes = 0,
      pending = true;
    while (pending && passes++ < 20) {
      const result = await finishPublication(
        drive,
        "root",
        row.libraryId,
        current.p,
        current.file
      );
      pending = result.maintenancePending;
    }
    expect(passes).toBeGreaterThan(1);
    expect(pending).toBe(false);
    expect(
      currentFiles(google)
        .map((f) => f.id)
        .sort()
    ).toEqual([current.file.id, archive.id].sort());
  });

  it("keeps old copies if replacement bytes are corrupt or have disappeared", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const first = await publishPdf(google, {});
    const second = await publishPdf(
      google,
      { documentId: first.p.documentId },
      "%PDF-1.7\nSecond complete copy\n%%EOF"
    );
    const p = {
      ...second.p,
      supersedes: [
        {
          fingerprint: first.p.fingerprint,
          source: publicationSource(first.file)!,
        },
      ],
    };
    second.file.sha256Checksum = sha("corrupt");
    await expect(
      finishPublication(
        new GoogleDrive("synthetic"),
        "root",
        row.libraryId,
        p,
        second.file
      )
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect(first.file.trashed).not.toBe(true);
  });

  it("refuses conditional cleanup after an external edit, missing ETag, or a move outside the root", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const first = await publishPdf(google, {});
    const second = await publishPdf(
      google,
      { documentId: first.p.documentId },
      "%PDF-1.7\nReplacement survives\n%%EOF"
    );
    const p = {
      ...second.p,
      supersedes: [
        {
          fingerprint: first.p.fingerprint,
          source: publicationSource(first.file)!,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init: RequestInit = {}) => {
        if (new Headers(init.headers).has("If-Match"))
          first.file.version = String(Number(first.file.version) + 1);
        return google.fetch(input, init);
      }
    );
    await expect(
      finishPublication(
        new GoogleDrive("synthetic"),
        "root",
        row.libraryId,
        p,
        second.file
      )
    ).rejects.toMatchObject({ code: "NETWORK" });
    expect(first.file.trashed).not.toBe(true);
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const result = await google.fetch(input, init);
        if (String(input).includes("/drive/v2/") && init.method !== "PATCH") {
          const data = await result.json();
          delete data.etag;
          return Response.json(data);
        }
        return result;
      }
    );
    expect(
      (
        await finishPublication(
          new GoogleDrive("synthetic"),
          "root",
          row.libraryId,
          p,
          second.file
        )
      ).maintenancePending
    ).toBe(true);
    expect(first.file.trashed).not.toBe(true);
    vi.stubGlobal("fetch", google.fetch);
    first.file.parents = ["outside"];
    await expect(
      finishPublication(
        new GoogleDrive("synthetic"),
        "root",
        row.libraryId,
        p,
        second.file
      )
    ).rejects.toBeDefined();
    expect(first.file.trashed).not.toBe(true);
  });

  it("reuses a native upload after a lost response and removes only verified byte-identical packs", async () => {
    const google = new FakeGoogle();
    vi.stubGlobal("fetch", google.fetch);
    const object = encodeJson({
      synthetic: "history and attachment remain intact",
    });
    const bytes = await encodePack(
      row.libraryId,
      [{ hash: sha(object), bytes: object }],
      []
    );
    const path = "/api/notes/drive?action=upload&hash=" + sha(bytes);
    const first = await (
      await relay(request(path, bytes.slice().buffer))
    ).json();
    const retry = await (
      await relay(request(path, bytes.slice().buffer))
    ).json();
    expect(retry.file.id).toBe(first.file.id);
    const original = google.files.get(first.file.id)!;
    const clone = { ...structuredClone(original), id: "zz-duplicate" };
    google.files.set(clone.id, clone);
    const unique = {
      ...structuredClone(original),
      id: "unique-history",
      bytes: encodeJson({ unique: "do not delete" }),
    };
    unique.appProperties.sha256 = sha(unique.bytes);
    unique.sha256Checksum = sha(unique.bytes);
    unique.size = String(unique.bytes.length);
    google.files.set(unique.id, unique);
    expect(
      await cleanDuplicatePacks(new GoogleDrive("synthetic"), row, [sha(bytes)])
    ).toBe(1);
    expect(google.files.get(clone.id)!.trashed).toBe(true);
    expect(google.files.get(unique.id)!.trashed).not.toBe(true);
    const cold = await new GoogleDrive("synthetic").checkedPack(
      "root",
      row.libraryId,
      original.id
    );
    expect(cold).toEqual(bytes);
    expect(google.requests.some((r) => r.init.method === "DELETE")).toBe(false);
  });
});
