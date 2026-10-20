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
});
export type DriveFile = z.infer<typeof fileSchema>;
export const escapeQuery = (s: string) =>
  s.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
const fields = "id,name,mimeType,parents,appProperties,trashed,version,size";

/** Google endpoints are fixed here. No caller supplies an arbitrary URL or upload destination. */
export class GoogleDrive {
  constructor(
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
    private readonly signal?: AbortSignal
  ) {}
  private async call(path: string, init: RequestInit = {}, upload = false) {
    const response = await this.request(
      `https://www.googleapis.com/${upload ? "upload/" : ""}drive/v3/${path}`,
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
            : [401, 403, 404].includes(response.status)
              ? "AUTH"
              : response.status === 400 && /pageToken|page token/i.test(text)
                ? "CURSOR_EXPIRED"
                : "NETWORK";
      throw new NotesServerError(
        code === "AUTH"
          ? "Drive access or the original library is unavailable. Reconnect the same account; local notes are retained."
          : "Drive synchronization paused. Your local notes are retained.",
        code === "AUTH" ? 409 : code === "CURSOR_EXPIRED" ? 409 : 503,
        code,
        Number.isFinite(seconds) ? Math.max(1, Math.min(86400, seconds)) : 5
      );
    }
    return response;
  }
  private async json(path: string, init?: RequestInit) {
    return JSON.parse(
      new TextDecoder().decode(
        await limitedBytes(await this.call(path, init), 1024 * 1024)
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
  async read(id: string, maximum = PACK_BYTES) {
    fileSchema.shape.id.parse(id);
    return limitedBytes(await this.call(`files/${id}?alt=media`), maximum);
  }
  async folder(name: string, properties: Record<string, string>) {
    return fileSchema.parse(
      await this.json("files?fields=" + fields, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          appProperties: properties,
        }),
      })
    );
  }
  async create(
    rootId: string,
    name: string,
    bytes: Uint8Array,
    properties: Record<string, string>
  ) {
    fileSchema.shape.id.parse(rootId);
    if (bytes.length > PACK_BYTES)
      throw new NotesServerError("Drive transfer is too large.", 413);
    const boundary = "sylf_" + crypto.randomUUID().replaceAll("-", "");
    const metadata = {
      name,
      parents: [rootId],
      mimeType: "application/octet-stream",
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
        "AUTH"
      );
    return file;
  }
  async checkedPack(rootId: string, libraryId: string, fileId: string) {
    const file = await this.metadata(fileId);
    if (
      file.trashed ||
      !file.parents?.includes(rootId) ||
      file.appProperties?.libraryId !== libraryId ||
      file.appProperties?.sylfNotes !== "pack-v1" ||
      !/^[a-f0-9]{64}$/.test(file.appProperties?.sha256 || "")
    )
      throw new NotesServerError(
        "This file does not belong to the connected Notes library.",
        403,
        "AUTH"
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
