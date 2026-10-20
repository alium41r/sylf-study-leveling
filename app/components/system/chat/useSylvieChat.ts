"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchCachedJSON, invalidateClientCache } from "@/lib/client-data-cache";
import { ChatRequestError, requestSylvieChat, type ChatReply, type ChatRequest, type StoredChatMessage } from "@/lib/ai/sylvie/chat-client";
import type { PendingSylvieAction } from "@/lib/ai/sylvie/action";
import type { SylviePlannerHandoff } from "@/lib/ai/sylvie/planner-bridge";
import type { ChatImage, ComposerImage } from "@/lib/ai/sylvie/image-contract";
import { useComposerImages } from "./useComposerImages";
import { currentCalendarPage } from "@/lib/ai/sylvie/calendar-page-context";

export interface ChatMessage {
  id: string; serverId?: number; role: "user" | "assistant"; content: string; createdAt?: string;
  attachmentUrl?: string; attachmentName?: string; modelUsed?: string;
  status?: "pending" | "streaming" | "complete" | "stopped" | "error" | "incomplete"; error?: string;
  pendingAction?: PendingSylvieAction; plannerHandoff?: SylviePlannerHandoff;
  attachments?: Array<ChatImage | ComposerImage>;
}
interface Options {
  sessionId?: number | null; pageContext?: ChatRequest["pageContext"]; modelPreference?: string; multipart?: boolean;
  enabled?: boolean; onSession?: (value: ChatReply) => void; onQuotaRefresh?: () => void;
}
const fromStored = (message: StoredChatMessage): ChatMessage => ({ ...message,
  id: `stored-${message.id}`, serverId: message.id, role: message.type === "USER" ? "user" : "assistant", status: message.truncated ? "incomplete" : "complete" });

/** One conversation owner for requests, history, session adoption and cancellation. */
export function useSylvieChat(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const [localId, setLocalId] = useState<number | null>(options.sessionId ?? null);
  const sessionId = options.sessionId !== undefined ? options.sessionId : localId;
  const session = useRef<number | null>(sessionId);
  const handledSession = useRef<number | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [quotaReached, setQuotaReached] = useState(false);
  const request = useRef<AbortController | null>(null), history = useRef<AbortController | null>(null);
  const epoch = useRef(0), frame = useRef<number | null>(null);
  const partial = useRef(""), assistantId = useRef("");
  const [reloadKey, setReloadKey] = useState(0);
  const [viewKey, setViewKey] = useState(0);
  const media = useComposerImages(viewKey);
  const imageUrls = useRef(new Set<string>());
  useEffect(() => {
    const retained = new Set(messages.flatMap(message => message.attachments?.map(image => image.url) ?? []));
    for (const url of imageUrls.current) if (!retained.has(url)) { URL.revokeObjectURL(url); imageUrls.current.delete(url); }
  }, [messages]);
  useEffect(() => () => { for (const url of imageUrls.current) URL.revokeObjectURL(url); imageUrls.current.clear(); }, []);
  const [uploading, setUploading] = useState(false);

  const flush = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const id = assistantId.current, content = partial.current;
    setMessages(previous => previous.map(message => message.id === id ? { ...message, content, status: content ? "streaming" : "pending" } : message));
  }, []);
  const stop = useCallback(() => {
    epoch.current++; request.current?.abort(); request.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const id = assistantId.current, content = partial.current;
    setMessages(previous => previous.map(message => message.id === id && ["pending", "streaming"].includes(message.status || "")
      ? { ...message, content, status: "stopped", error: "Stopped. An incomplete reply may not be saved." } : message));
    setBusy(false);
    setUploading(false);
  }, []);

  // Synchronizing an external conversation identity must clear the previous
  // transcript before paint/input; deferring it to a fetch callback leaks a
  // frame of the old thread. This is a guarded protocol transition, not derived UI.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (options.enabled === false) return;
    if (handledSession.current === sessionId) return;
    handledSession.current = sessionId; session.current = sessionId;
    setLocalId(sessionId);
    setViewKey(key => key + 1);
    stop(); history.current?.abort();
    setMessages([]); setHistoryError(""); setDraft("");
    if (!sessionId) { setLoading(false); return; }
    const controller = new AbortController(); history.current = controller;
    let settled = false;
    setLoading(true);
    // The cache owns a shared in-flight GET. Cancelling one observer must not
    // cancel another surface/Strict Mode subscription to that same history.
    fetchCachedJSON<{ messages?: StoredChatMessage[] }>(`/api/system-messages?limit=100&sessionId=${sessionId}`, {}, { ttlMs: 3000, staleMs: 120000, storageKey: `sys-msgs:${sessionId}` })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data) throw new Error("Conversation history unavailable");
        setMessages([...(data.messages || [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id).map(fromStored));
      }).catch(() => { if (!controller.signal.aborted) setHistoryError("Couldn’t load this conversation. Try again."); })
      .finally(() => { settled = true; if (!controller.signal.aborted) setLoading(false); });
    return () => { if (!settled && history.current === controller) handledSession.current = undefined; controller.abort(); };
  }, [sessionId, reloadKey, stop, options.enabled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => { if (options.enabled === false) stop(); }, [options.enabled, stop]);
  useEffect(() => () => { epoch.current++; request.current?.abort(); history.current?.abort(); if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const adoptSession = useCallback((reply: ChatReply) => {
    if (!reply.sessionId) return;
    const changed = session.current !== reply.sessionId;
    // A newly created session is THIS conversation, not a history switch.
    // Mark it handled before notifying the parent so no blur/refetch can replace the reply.
    handledSession.current = reply.sessionId; session.current = reply.sessionId;
    setLocalId(reply.sessionId); if (changed) latest.current.onSession?.(reply);
  }, []);

  const send = useCallback(async (text: string, imageInput?: File | ComposerImage[] | null, confirmationToken?: string) => {
    const images = Array.isArray(imageInput) ? imageInput : [];
    const file = imageInput instanceof File ? imageInput : undefined;
    if (request.current || loading || (!text.trim() && !file && !images.length)) return false;
    const controller = new AbortController(); request.current = controller;
    const revision = ++epoch.current, turn = crypto.randomUUID();
    const userId = `${turn}-user`, aiId = `${turn}-assistant`;
    assistantId.current = aiId; partial.current = "";
    const previews = images.map(image => {
      if (!image.file) return image;
      const url = URL.createObjectURL(image.file); imageUrls.current.add(url); return { ...image, url };
    });
    setBusy(true); setUploading(Boolean(file || images.length)); history.current?.abort();
    setMessages(previous => [...previous,
      { id: userId, role: "user", content: text || "Sent an attachment.", attachmentName: file?.name, attachments: previews, status: "complete" },
      { id: aiId, role: "assistant", content: "", status: "pending" },
    ]);
    const current = () => epoch.current === revision && request.current === controller && !controller.signal.aborted;
    try {
      const page = latest.current.pageContext;
      const reply = await requestSylvieChat({ message: text, file, images, sessionId: session.current, confirmationToken,
        pageContext: page?.path === "/calendar" ? { ...page, calendar: currentCalendarPage() } : page, modelPreference: latest.current.modelPreference, multipart: latest.current.multipart,
        signal: controller.signal,
        onStatus: phase => { if (current()) setUploading(phase === "uploading"); },
        onSession: value => { if (current()) adoptSession(value); },
        onDelta: delta => {
          if (!current()) return; partial.current += delta;
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        },
        onReset: () => { if (current()) { partial.current = ""; flush(); } },
      });
      if (!current()) return false;
      if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null;
      adoptSession(reply);
      const content = reply.aiMessage?.content || reply.reply || reply.message || "No answer came through. Refresh the conversation before trying again.";
      setMessages(previous => previous.map(message => message.id === userId ? { ...message, serverId: reply.userMessage?.id, attachmentUrl: reply.userMessage?.attachmentUrl, attachments: reply.userMessage?.attachments, createdAt: reply.userMessage?.createdAt }
        : message.id === aiId ? { ...message, content, status: reply.aiMessage?.truncated ? "incomplete" : "complete", serverId: reply.aiMessage?.id, createdAt: reply.aiMessage?.createdAt,
          modelUsed: reply.aiMessage?.modelUsed || reply.modelUsed,
          pendingAction: reply.aiMessage?.pendingAction ?? reply.pendingAction, plannerHandoff: reply.aiMessage?.plannerHandoff ?? reply.plannerHandoff } : message));
      invalidateClientCache("/api/system-messages"); invalidateClientCache("/api/chats");
      if (reply.calendarChanged) {
        invalidateClientCache("/api/calendar/personal");
        window.dispatchEvent(new Event("calendar-content-updated"));
      }
      latest.current.onQuotaRefresh?.();
      return true;
    } catch (error) {
      if (!current()) return false;
      if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null;
      if (error instanceof ChatRequestError && error.status === 429) { setQuotaReached(true); latest.current.onQuotaRefresh?.(); }
      const message = error instanceof ChatRequestError ? error.message : "Connection interrupted. Refresh this conversation before trying again.";
      setMessages(previous => previous.map(item => item.id === aiId ? { ...item, content: partial.current, status: "error", error: message } : item));
      return false;
    } finally { if (request.current === controller) { request.current = null; setBusy(false); setUploading(false); } }
  }, [loading, flush, adoptSession]);

  const submitDraft = useCallback(async (text = draft) => {
    if (request.current || loading || (!text.trim() && !media.images.length)) return false;
    const result = send(text.trim(), media.images);
    const revision = epoch.current;
    setDraft("");
    const succeeded = await result;
    // A failure must not erase a prompt or overwrite a newer draft/thread.
    if (epoch.current === revision) {
      if (succeeded) media.clear();
      else setDraft(current => current || text);
    }
    return succeeded;
  }, [draft, loading, media, send]);

  const selectSession = useCallback((id: number | null) => {
    stop(); history.current?.abort();
    setMessages([]); setHistoryError(""); setDraft("");
    handledSession.current = undefined; session.current = id; setLocalId(id);
    latest.current.onSession?.({ sessionId: id ?? undefined, session: null });
    if (id === null) { handledSession.current = null; setLoading(false); setViewKey(key => key + 1); }
    setReloadKey(key => key + 1);
  }, [stop]);
  const reload = useCallback(() => { handledSession.current = undefined; invalidateClientCache("/api/system-messages"); setReloadKey(key => key + 1); }, []);
  return { messages, busy, loading, historyError, quotaReached, viewKey, sessionId: localId, send, stop, selectSession, reload, media, uploading, draft, setDraft, submitDraft };
}
