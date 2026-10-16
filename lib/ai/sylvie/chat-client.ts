import { consumeResponseWithTimeout } from "@/lib/api-transport";
import { SYLVIE_CLIENT_TIMEOUT_MS } from "@/lib/ai/client-budget";
import { readEventStream } from "./event-stream";
import type { PendingSylvieAction } from "./action";
import type { SylviePlannerHandoff } from "./planner-bridge";
import type { ChatImage, ComposerImage } from "./image-contract";

export interface StoredChatMessage {
  id: number; content: string; type: string; createdAt: string; attachmentUrl?: string;
  modelUsed?: string; pendingAction?: PendingSylvieAction; plannerHandoff?: SylviePlannerHandoff;
  attachments?: ChatImage[];
  truncated?: boolean;
}
export interface ChatSessionSummary { id: number; title: string; createdAt?: string; updatedAt?: string }
export interface ChatReply {
  sessionId?: number; session?: ChatSessionSummary | null; userMessage?: StoredChatMessage; aiMessage?: StoredChatMessage;
  reply?: string; message?: string; modelUsed?: string; pendingAction?: PendingSylvieAction; plannerHandoff?: SylviePlannerHandoff;
}
export class ChatRequestError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export interface ChatRequest {
  message: string; file?: File | null; sessionId?: number | null; modelPreference?: string;
  images?: ComposerImage[]; onStatus?: (phase: "uploading" | "thinking") => void;
  pageContext?: { path: string; subject?: string }; confirmationToken?: string; multipart?: boolean;
  signal: AbortSignal; onDelta: (text: string) => void; onReset: () => void;
  onSession: (value: ChatReply) => void;
}

/** All chat surfaces use one cancellable transport. Older JSON responses remain supported. */
export function requestSylvieChat(input: ChatRequest): Promise<ChatReply> {
  const payload = { message: input.message, sessionId: input.sessionId ?? undefined,
    ...(input.modelPreference ? { modelPreference: input.modelPreference } : {}),
    pageContext: input.pageContext, confirmationToken: input.confirmationToken,
    ...(input.images?.some(image => image.reference) ? { imageReferences: input.images.flatMap(image => image.reference ? [image.reference] : []) } : {}) };
  let body: FormData | string;
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (input.multipart || input.file || input.images?.some(image => image.file)) {
    body = new FormData();
    for (const [key, value] of Object.entries(payload)) if (value !== undefined) body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    if (input.file) body.append("file", input.file);
    for (const image of input.images || []) if (image.file) body.append("images", image.file);
  } else { body = JSON.stringify(payload); headers["Content-Type"] = "application/json"; }
  return consumeResponseWithTimeout(fetch, "/api/system-messages/chat", { method: "POST", headers, body, signal: input.signal }, SYLVIE_CLIENT_TIMEOUT_MS, async (response, signal) => {
    const fail = (data: { error?: string; message?: string; status?: number }) => new ChatRequestError(data.message || data.error || "Sylvie is temporarily unavailable. Please try again.", data.status ?? response.status);
    if (!response.ok) throw fail(await response.json().catch(() => ({})));
    if (!response.headers?.get("Content-Type")?.includes("text/event-stream")) return response.json();
    let result: ChatReply | undefined;
    await readEventStream(response, (event, raw) => {
      const data = JSON.parse(raw);
      if (event === "delta" && typeof data.text === "string") input.onDelta(data.text);
      if (event === "reset") input.onReset();
      if (event === "session") input.onSession(data);
      if (event === "status" && (data.phase === "uploading" || data.phase === "thinking")) input.onStatus?.(data.phase);
      if (event === "error") throw fail(data);
      if (event === "result") result = data;
    }, signal);
    if (!result) throw new ChatRequestError("Connection interrupted. Your reply may not have been saved. Refresh this conversation before trying again.");
    return result;
  });
}
