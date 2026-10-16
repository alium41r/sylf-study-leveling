// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ChatImageError, inlineImageParts, prepareChatImages, readImageForm } from "@/lib/ai/sylvie/images-server";
import { imageSelectionError } from "@/lib/ai/sylvie/image-contract";
import { exposeChatImages, saveChatImages, signedChatImage } from "@/lib/ai/sylvie/image-storage";
import { GET } from "@/app/api/system-messages/[id]/images/[index]/route";
import { GET as legacyImage } from "@/app/api/system-messages/legacy-images/[filename]/route";
import { getSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { DeepSeekAdapter } from "@/lib/ai/providers/deepseek";
import { DEEPSEEK_MODELS } from "@/lib/ai/config";
import { readPlannerChatTurn } from "@/lib/planner/copilot/image-input";
import { CopilotTurnRequestSchema } from "@/lib/planner/copilot/contracts";

const storage = vi.hoisted(() => ({
  getBucket: vi.fn(async () => ({ data: { public: false }, error: null })),
  createBucket: vi.fn(),
  upload: vi.fn<(path: string, buffer: Buffer, options: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
  download: vi.fn(),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://synthetic.invalid/signed?expires=300" }, error: null })),
}));
vi.mock("@/lib/supabase-storage", () => ({ getStorageClient: vi.fn(async () => ({ storage: { ...storage, from: () => storage } })) }));
vi.mock("@/lib/auth-server", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemMessage: { findFirst: vi.fn() } } }));
let png: Buffer;
const file = (buffer: Buffer, name = "math.png") => new File([new Uint8Array(buffer)], name, { type: "image/png" });
beforeEach(async () => {
  vi.clearAllMocks();
  png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } }).png().toBuffer();
  storage.upload.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("bounded, private native image inputs", () => {
  it("keeps screenshot detail, strips metadata, deduplicates identical bytes and caps large dimensions", async () => {
    const prepared = await prepareChatImages([file(png), file(png, "duplicate.png")]);
    expect(prepared).toHaveLength(1);
    const metadata = await sharp(prepared[0].buffer).metadata();
    expect(metadata).toMatchObject({ width: 1200, height: 800 }); expect(metadata.exif).toBeUndefined();
    const wide = await sharp({ create: { width: 6000, height: 1000, channels: 3, background: "white" } }).png().toBuffer();
    expect((await sharp((await prepareChatImages([file(wide)]))[0].buffer).metadata()).width).toBe(4096);
  });
  it("rejects malformed images, spoofed MIME, excessive counts, oversize files and forged body lengths", async () => {
    await expect(prepareChatImages([file(Buffer.from("not an image"))])).rejects.toBeInstanceOf(ChatImageError);
    await expect(prepareChatImages([file(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))])).rejects.toThrow("could not be read");
    await expect(prepareChatImages(Array.from({ length: 5 }, () => file(png)))).rejects.toThrow("4 images");
    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" });
    expect(imageSelectionError([huge])).toContain("5 MB");
    await expect(prepareChatImages([huge])).rejects.toThrow("5 MB");
    await expect(readImageForm(new Request("https://synthetic.invalid", { method: "POST", body: "x", headers: { "content-length": "99999999" } }))).rejects.toThrow("12 MB");
  });
  it("stores owner-scoped private objects, returns authenticated references and bounds signed provider access", async () => {
    const saved = await saveChatImages(7, 100, await prepareChatImages([file(png)]), new AbortController().signal);
    expect(storage.upload.mock.calls[0][0]).toMatch(/^7\/100\/[a-f0-9-]+\.png$/);
    const { encodeStoredImages } = await import("@/lib/ai/sylvie/image-storage");
    const exposed = exposeChatImages({ id: 31, attachmentUrl: encodeStoredImages(saved) });
    expect(exposed.attachments?.[0]).toMatchObject({ messageId: 31, index: 0, url: "/api/system-messages/31/images/0" });
    expect(JSON.stringify(exposed)).not.toContain(saved[0].path);
    expect(await signedChatImage(saved[0], 7, 100)).toContain("synthetic.invalid");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(saved[0].path, 300);
    await expect(signedChatImage(saved[0], 8, 100)).rejects.toThrow("unavailable");
  });
  it("cleans partial uploads and refuses a bucket that is public", async () => {
    const prepared = await prepareChatImages([file(png)]);
    storage.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("synthetic failure") });
    await expect(saveChatImages(7, 100, [...prepared, ...prepared], new AbortController().signal)).rejects.toThrow("upload failed");
    expect(storage.remove).toHaveBeenCalledWith([expect.stringMatching(/^7\/100\//)]);
    vi.resetModules();
    storage.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    const isolated = await import("@/lib/ai/sylvie/image-storage");
    await expect(isolated.saveChatImages(7, 100, prepared, new AbortController().signal)).rejects.toThrow("Private image storage");
  });
  it("requires cookie authentication and ownership on every image delivery", async () => {
    const context = { params: Promise.resolve({ id: "31", index: "0" }) };
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await GET(new Request("https://synthetic.invalid"), context)).status).toBe(401);
    vi.mocked(getSession).mockResolvedValue({ userId: 7 } as never);
    vi.mocked(prisma.systemMessage.findFirst).mockResolvedValue(null);
    expect((await GET(new Request("https://synthetic.invalid"), context)).status).toBe(404);
    expect(prisma.systemMessage.findFirst).toHaveBeenCalledWith({ where: { id: 31, userId: 7, type: "USER" } });
    expect(storage.download).not.toHaveBeenCalled();
  });
  it("delivers owned images without caching and protects legacy URLs and traversal attempts", async () => {
    const { encodeStoredImages } = await import("@/lib/ai/sylvie/image-storage");
    vi.mocked(getSession).mockResolvedValue({ userId: 7 } as never);
    vi.mocked(prisma.systemMessage.findFirst).mockResolvedValue({ id: 31, sessionId: 100, attachmentUrl: encodeStoredImages([{ path: "7/100/00000000-0000-4000-8000-000000000000.png", mimeType: "image/png", name: "Equation" }]) } as never);
    storage.download.mockResolvedValue({ data: new Blob([new Uint8Array(png)]), error: null });
    const response = await GET(new Request("https://synthetic.invalid"), { params: Promise.resolve({ id: "31", index: "0" }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/png"); expect((await response.arrayBuffer()).byteLength).toBe(png.length);
    expect((await legacyImage(new Request("https://synthetic.invalid"), { params: Promise.resolve({ filename: "../secret.png" }) })).status).toBe(404);
    vi.mocked(prisma.systemMessage.findFirst).mockResolvedValue(null);
    expect((await legacyImage(new Request("https://synthetic.invalid"), { params: Promise.resolve({ filename: "up_123456_abcdef012345.png" }) })).status).toBe(404);
  });
  it("passes multiple native images to DeepSeek once, uses a signed reference when available and retains provider token counts", async () => {
    const fetcher = vi.fn(async () => Response.json({ model: DEEPSEEK_MODELS.flash, choices: [{ message: { content: "x = 2" }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 12, prompt_cache_hit_tokens: 30 } }));
    vi.stubGlobal("fetch", fetcher);
    const parts = inlineImageParts(await prepareChatImages([file(png)]));
    const response = await new DeepSeekAdapter("synthetic", DEEPSEEK_MODELS.vision).generateResponse([{ role: "user", content: "Compare these equations", parts: [...parts, { ...parts[0], imageUrl: "https://synthetic.invalid/short-lived" }] }], "Use visible facts", [], { singleAttempt: true });
    const payload = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.messages[1].content.map((part: { type: string }) => part.type)).toEqual(["text", "image_url", "image_url"]);
    expect(payload.messages[1].content[2]).toEqual({ type: "image_url", image_url: { url: "https://synthetic.invalid/short-lived", detail: "original" } });
    expect(response.usage).toMatchObject({ promptTokens: 900, completionTokens: 12, cacheHitTokens: 30 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(new DeepSeekAdapter("synthetic", "synthetic-text-only").generateResponse([{ role: "user", parts }], "", [])).rejects.toMatchObject({ code: "unsupported_media" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps Planner text contracts and forces review for native image-derived commands", async () => {
    const form = new FormData();
    const body = { schemaVersion: 1, expectedVersion: 1, message: "Use this availability", recent: [], proposalOnly: false };
    form.append("request", JSON.stringify(body)); form.append("images", file(png));
    const parsed = await readPlannerChatTurn(new Request("https://synthetic.invalid", { method: "POST", body: form }));
    expect(parsed.body.proposalOnly).toBe(true); expect(parsed.images).toHaveLength(1);
    expect(CopilotTurnRequestSchema.safeParse({ ...parsed.body, message: "x".repeat(601) }).success).toBe(false);
    const plain = await readPlannerChatTurn(new Request("https://synthetic.invalid", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    expect(plain.body).toEqual(body); expect(plain.images).toBeUndefined();
  });
});
