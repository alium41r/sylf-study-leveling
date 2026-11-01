import "server-only";
import { z } from "zod";
import { PACK_BYTES } from "../pack";
import { NotesServerError, limitedBytes, sha, driveRealm } from "./security";

const fileSchema = z.object({
  id: z.string().regex(/^[\w-]{1,200}$/),
  name: z.string(),
  mimeType: z.string().optional(),
  parents: z.array(z.string()).optional(),
  appProperties: z.record(z.string(), z.string()).optional(),
  trashed: z.boolean().optional(),
  version: z.string().optional(),
  size: z.string().optional(),
  sha256Checksum: z.string().optional(),
});
export type DriveFile = z.infer<typeof fileSchema>;
export const escapeQuery = (s: string) =>
  s.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
const fields =
  "id,name,mimeType,parents,appProperties,trashed,version,size,sha256Checksum";

/** Google endpoints are fixed here. No caller supplies an arbitrary URL or upload destination. */
export class GoogleDrive {
  constructor(
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
    private readonly signal?: AbortSignal
  ) {}
  private async call(
    path: string,
    init: RequestInit = {},
    upload = false,
    version: "v2" | "v3" = "v3"
  ) {
    const response = await this.request(
      `https://www.googleapis.com/${upload ? "upload/" : ""}drive/${version}/${path}`,
      {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: this.signal
          ? AbortSignal.any([this.signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
      }
    );
    if (!response.ok) {
      const text = new TextDecoder().decode(
        await limitedBytes(response, 100000)
      );
      const retry = response.headers.get("retry-after");
      const seconds = retry
        ? Number.isFinite(Number(retry))
          ? Number(retry)
          : (Date.parse(retry) - Date.now()) / 1000
        : 5;
      const code =
        response.status === 429 ||
        /rateLimitExceeded|userRateLimitExceeded/.test(text)
          ? "THROTTLE"
          : /storageQuotaExceeded|quotaExceeded/.test(text)
            ? "QUOTA"
            : response.status === 404
              ? "CORRUPT"
              : response.status === 401 ||
                  (response.status === 403 &&
                    /authError|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(
                      text
                    ))
                ? "AUTH"
                : response.status === 400 && /pageToken|page token/i.test(text)
                  ? "CURSOR_EXPIRED"
                  : "NETWORK";
      throw new NotesServerError(
        code === "CORRUPT"
          ? "A Drive file is unavailable. Local originals are retained; restore the original file or use Recovery."
          : code === "AUTH"
            ? "Drive access or the original library is unavailable. Reconnect the same account; local notes are retained."
            : "Drive synchronization paused. Your local notes are retained.",
        ["AUTH", "CORRUPT", "CURSOR_EXPIRED"].includes(code) ? 409 : 503,
        code,
        Number.isFinite(seconds) ? Math.max(1, Math.min(86400, seconds)) : 5
      );
    }
    return response;
  }
  private async json(
    path: string,
    init?: RequestInit,
    version: "v2" | "v3" = "v3"
  ) {
    return JSON.parse(
      new TextDecoder().decode(
        await limitedBytes(
          await this.call(path, init, false, version),
          1024 * 1024
        )
      )
    );
  }
  async list(query: string, pageToken?: string, pageSize = 100) {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,incompleteSearch,files(${fields})`,
      pageSize: String(pageSize),
      spaces: "drive",
      corpora: "user",
      ...(pageToken ? { pageToken } : {}),
    });
    const result = z
      .object({
        files: z.array(fileSchema).max(100),
        nextPageToken: z.string().max(4000).optional(),
        incompleteSearch: z.boolean().optional(),
      })
      .parse(await this.json(`files?${params}`));
    if (result.incompleteSearch)
      throw new NotesServerError(
        "Drive returned an incomplete library scan. Retry synchronization.",
        503,
        "NETWORK"
      );
    return result;
  }
  async metadata(id: string) {
    fileSchema.shape.id.parse(id);
    return fileSchema.parse(await this.json(`files/${id}?fields=${fields}`));
  }
  /** Exact conditional metadata updates; missing ETags fail closed. */
  async updateUnchanged(
    file: DriveFile,
    patch: { trashed?: boolean; appProperties?: Record<string, string> }
  ) {
    fileSchema.shape.id.parse(file.id);
    // Live qualification found that v3 omits ETags and ignores stale If-Match.
    // The supported v2 metadata endpoint enforces the conditional update.
    const snapshot = z
      .object({
        id: z.string(),
        etag: z.string().optional(),
        version: z.string(),
        properties: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              visibility: z.enum(["PRIVATE", "PUBLIC"]),
            })
          )
          .max(100)
          .optional(),
      })
      .parse(
        await this.json(
          `files/${file.id}?fields=id,etag,version,properties`,
          undefined,
          "v2"
        )
      );
    const current = await this.metadata(file.id);
    const etag = snapshot.etag;
    if (
      !etag ||
      snapshot.id !== file.id ||
      snapshot.version !== file.version ||
      current.trashed ||
      current.version !== file.version ||
      current.sha256Checksum !== file.sha256Checksum ||
      JSON.stringify(current.parents) !== JSON.stringify(file.parents) ||
      Object.keys(current.appProperties || {}).length !==
        Object.keys(file.appProperties || {}).length ||
      Object.entries(file.appProperties || {}).some(
        ([key, value]) => current.appProperties?.[key] !== value
      )
    )
      return undefined;
    const properties = patch.appProperties
      ? [
          ...(snapshot.properties || []).filter(
            (p) =>
              p.visibility !== "PRIVATE" || !(p.key in patch.appProperties!)
          ),
          ...Object.entries(patch.appProperties).map(([key, value]) => ({
            key,
            value,
            visibility: "PRIVATE",
          })),
        ]
      : undefined;
    const result = z.object({ id: z.string() }).parse(
      await this.json(
        `files/${file.id}?fields=id`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": etag },
          body: JSON.stringify({
            ...(patch.trashed !== undefined
              ? { labels: { trashed: patch.trashed } }
              : {}),
            ...(properties ? { properties } : {}),
          }),
        },
        "v2"
      )
    );
    const updated = await this.metadata(file.id);
    if (
      result.id !== file.id ||
      updated.id !== file.id ||
      (patch.trashed && !updated.trashed) ||
      (patch.appProperties &&
        Object.entries(patch.appProperties).some(
          ([key, value]) => updated.appProperties?.[key] !== value
        ))
    )
      throw new NotesServerError(
        "Drive did not confirm duplicate cleanup. Originals were kept.",
        409,
        "CORRUPT"
      );
    return updated;
  }
  /** Cleanup is recoverable. Never empty the user's Trash. */
  async trashUnchanged(file: DriveFile) {
    return !!(await this.updateUnchanged(file, { trashed: true }));
  }
  async read(id: string, maximum = PACK_BYTES) {
    fileSchema.shape.id.parse(id);
    return limitedBytes(await this.call(`files/${id}?alt=media`), maximum);
  }
  async folder(
    name: string,
    properties: Record<string, string>,
    parentId?: string
  ) {
    return fileSchema.parse(
      await this.json("files?fields=" + fields, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          appProperties: properties,
          ...(parentId
            ? { parents: [fileSchema.shape.id.parse(parentId)] }
            : {}),
        }),
      })
    );
  }
  async systemFolder(rootId: string, libraryId: string, create = false) {
    const result = await this.list(
      `'${escapeQuery(rootId)}' in parents and trashed = false and appProperties has { key='sylfNotes' and value='system-v1' } and appProperties has { key='libraryId' and value='${libraryId}' }`
    );
    if (result.nextPageToken || result.files.length > 1)
      throw new NotesServerError(
        "Multiple Notes system folders need review. Originals were kept.",
        409,
        "CORRUPT"
      );
    const folder = result.files[0];
    if (
      folder &&
      (folder.mimeType !== "application/vnd.google-apps.folder" ||
        !folder.parents?.includes(rootId))
    )
      throw new NotesServerError(
        "Notes system folder needs recovery.",
        409,
        "CORRUPT"
      );
    return (
      folder ||
      (create
        ? this.folder(
            "_Sylf system — do not edit",
            { sylfNotes: "system-v1", libraryId },
            rootId
          )
        : undefined)
    );
  }
  async renameAndMove(file: DriveFile, name: string, parentId: string) {
    fileSchema.shape.id.parse(parentId);
    const params = new URLSearchParams({ fields });
    if (!file.parents?.includes(parentId)) {
      params.set("addParents", parentId);
      if (file.parents?.length)
        params.set("removeParents", file.parents.join(","));
    }
    const moved = fileSchema.parse(
      await this.json(`files/${file.id}?${params}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    );
    if (
      moved.id !== file.id ||
      moved.name !== name ||
      !moved.parents?.includes(parentId)
    )
      throw new NotesServerError(
        "Drive did not confirm the file's name and folder. Original copies were kept.",
        409,
        "CORRUPT"
      );
    return moved;
  }
  async startArchive(
    fileId: string,
    size: number,
    mimeType = "application/octet-stream"
  ) {
    fileSchema.shape.id.parse(fileId);
    const response = await this.call(
      `files/${fileId}?uploadType=resumable&fields=${fields}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Upload-Content-Type": mimeType,
          "X-Upload-Content-Length": String(size),
        },
        body: JSON.stringify({ mimeType }),
      },
      true
    );
    const location = response.headers.get("location");
    this.archiveLocation(location || "", fileId);
    return location!;
  }
  private archiveLocation(location: string, fileId?: string) {
    const url = new URL(location);
    if (
      url.origin !== "https://www.googleapis.com" ||
      !/^\/upload\/drive\/v3\/files(?:\/[\w-]{1,200})?$/.test(url.pathname) ||
      (fileId &&
        url.pathname !== "/upload/drive/v3/files" &&
        url.pathname !== `/upload/drive/v3/files/${fileId}`) ||
      url.searchParams.get("uploadType") !== "resumable" ||
      !url.searchParams.get("upload_id") ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new NotesServerError(
        "Unexpected Drive upload session.",
        409,
        "CORRUPT"
      );
    return url.href;
  }
  async archiveChunk(
    location: string,
    bytes: Uint8Array,
    offset: number,
    total: number,
    fileId?: string
  ) {
    const response = await this.request(
      this.archiveLocation(location, fileId),
      {
        method: "PUT",
        redirect: "manual",
        cache: "no-store",
        signal: this.signal
          ? AbortSignal.any([this.signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
          "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${total}`,
        },
        body: bytes.slice().buffer,
      }
    );
    if (response.status === 308) {
      const match = /^bytes=0-(\d+)$/.exec(response.headers.get("range") || "");
      if (!match)
        throw new NotesServerError(
          "Drive did not confirm the archive chunk. Retry safely.",
          503,
          "NETWORK"
        );
      return { offset: Number(match[1]) + 1 };
    }
    if (!response.ok)
      throw new NotesServerError(
        "Drive archive upload paused. Your original notes are retained.",
        503,
        response.status === 429 ? "THROTTLE" : "NETWORK"
      );
    const file = fileSchema.parse(
      JSON.parse(new TextDecoder().decode(await limitedBytes(response, 100000)))
    );
    return { offset: total, file };
  }
  async create(
    rootId: string,
    name: string,
    bytes: Uint8Array,
    properties: Record<string, string>,
    mimeType = "application/octet-stream"
  ) {
    fileSchema.shape.id.parse(rootId);
    if (bytes.length > PACK_BYTES)
      throw new NotesServerError("Drive transfer is too large.", 413);
    const boundary = "sylf_" + crypto.randomUUID().replaceAll("-", "");
    const metadata = {
      name,
      parents: [rootId],
      mimeType,
      appProperties: properties,
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
      ),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await this.call(
      "files?uploadType=multipart&fields=" + fields,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
      true
    );
    return fileSchema.parse(
      JSON.parse(new TextDecoder().decode(await limitedBytes(response, 100000)))
    );
  }
  async checkedRoot(rootId: string, libraryId: string) {
    const file = await this.metadata(rootId);
    if (
      file.trashed ||
      file.mimeType !== "application/vnd.google-apps.folder" ||
      file.appProperties?.libraryId !== libraryId ||
      file.appProperties?.sylfNotes !== "library-v1" ||
      file.appProperties?.sylfRealm !== driveRealm()
    )
      throw new NotesServerError(
        "The original Drive library is unavailable. Recover it instead of creating an empty replacement.",
        409,
        "CORRUPT"
      );
    return file;
  }
  async checkedPack(rootId: string, libraryId: string, fileId: string) {
    const file = await this.metadata(fileId);
    let validParent = file.parents?.includes(rootId);
    if (!validParent && file.parents?.length === 1) {
      try {
        const parent = await this.metadata(file.parents[0]);
        validParent =
          !parent.trashed &&
          parent.mimeType === "application/vnd.google-apps.folder" &&
          parent.parents?.includes(rootId) &&
          parent.appProperties?.sylfNotes === "system-v1" &&
          parent.appProperties?.libraryId === libraryId;
      } catch (error) {
        if (!(error instanceof NotesServerError) || error.code !== "CORRUPT")
          throw error;
      }
    }
    if (
      file.trashed ||
      !validParent ||
      file.appProperties?.libraryId !== libraryId ||
      file.appProperties?.sylfNotes !== "pack-v1" ||
      !/^[a-f0-9]{64}$/.test(file.appProperties?.sha256 || "")
    )
      throw new NotesServerError(
        "This file does not belong to the connected Notes library.",
        403,
        "OWNERSHIP"
      );
    const bytes = await this.read(file.id);
    if (sha(bytes) !== file.appProperties.sha256)
      throw new NotesServerError(
        "Drive batch integrity failed. Original local data was retained.",
        409,
        "CORRUPT"
      );
    return bytes;
  }
}
