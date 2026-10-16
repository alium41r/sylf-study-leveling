"use client";

import { memo, useCallback, useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Check, Copy, FileText, RefreshCw } from "lucide-react";
import ChatText from "./ChatText";
import ChatImages from "./ChatImages";
import type { ChatImage } from "@/lib/ai/sylvie/image-contract";
import { SylvieIcon } from "@/app/components/icons";
import SylvieResponseActions from "../SylvieResponseActions";
import type { ChatMessage } from "./useSylvieChat";
import styles from "./Chat.module.css";
import { resolveApiUrl } from "@/lib/api-transport";

const Message = memo(function Message({ message, latest, busy, onConfirm, onSave, showModel, onReuse }: {
  message: ChatMessage; latest: boolean; busy: boolean; onConfirm: (token: string) => void;
  onSave?: (text: string) => void;
  showModel?: boolean;
  onReuse?: (image: ChatImage) => void;
}) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const assistant = message.role === "assistant", pending = message.status === "pending" && !message.content;
  const incomplete = message.status === "streaming" || message.status === "stopped" || message.status === "error";
  return <article className={`${styles.message} ${assistant ? styles.assistant : styles.user}`} data-message-id={message.id} data-status={message.status}>
    <div className={styles.messageMeta}>
      <span>{assistant && <SylvieIcon size={15} />}{assistant ? "Sylvie" : "You"}</span>
      {message.createdAt && <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}
    </div>
    {message.attachments?.length ? <ChatImages images={message.attachments} onReuse={onReuse} disabled={busy} /> : message.attachmentUrl ? <a className={styles.attachment} href={message.attachmentUrl.startsWith("/api/") ? resolveApiUrl(message.attachmentUrl) : message.attachmentUrl} target="_blank" rel="noreferrer">
      {/\.(?:png|jpe?g|webp|gif)$/i.test(message.attachmentUrl) ?
        // Native uploaded images work in the shared web and Capacitor surface.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.attachmentImage} src={message.attachmentUrl.startsWith("/api/") ? resolveApiUrl(message.attachmentUrl) : message.attachmentUrl} alt={message.attachmentName || "Attached image"} loading="lazy" /> : <><FileText size={16} />{message.attachmentName || "View attachment"}</>}
    </a>
      : message.attachmentName && <span className={styles.attachment}><FileText size={16} />{message.attachmentName}</span>}
    {pending ? <div className={styles.thinking} role="status">Thinking<span aria-hidden="true">•••</span></div>
      : <ChatText content={message.content} />}
    {message.status === "streaming" && message.content && <span className={styles.streamIndicator} aria-label="Receiving reply" />}
    {message.error && <p className={styles.error} role="alert">{message.error}</p>}
    {assistant && message.modelUsed?.includes("Gemini unavailable") && <p className={styles.mediaStatus}>Gemini was unavailable. DeepSeek answered this image instead.</p>}
    {assistant && !incomplete && <SylvieResponseActions pendingAction={latest ? message.pendingAction : undefined} plannerHandoff={message.plannerHandoff} busy={busy} onConfirm={onConfirm} />}
    {assistant && message.content && !incomplete && <div className={styles.messageActions}>
      <button type="button" className={styles.iconButton} aria-label={copied ? "Reply copied" : "Copy reply"} title="Copy reply" onClick={async () => {
        try { await navigator.clipboard.writeText(message.content); setCopied(true); setCopyError(false); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800); }
        catch { setCopyError(true); }
      }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      {onSave && <button type="button" className={styles.textButton} onClick={() => onSave(message.content)} title="Save to Scratchpad"><FileText size={14} />Save to Notes</button>}
      {showModel && message.modelUsed && <span className={styles.model}>{message.modelUsed}</span>}
      {copyError && <span className={styles.muted} role="status">Select the text to copy it.</span>}
    </div>}
  </article>;
});

interface Props {
  messages: ChatMessage[]; busy: boolean; loading: boolean; historyError?: string; viewKey: number;
  onConfirm: (token: string) => void; onReload: () => void; onSave?: (text: string) => void;
  empty: ReactNode; compact?: boolean; showModels?: boolean;
  onReuse?: (image: ChatImage) => void;
}
export default memo(function ChatConversation({ messages, busy, loading, historyError, viewKey, onConfirm, onReload, onSave, empty, compact, showModels, onReuse }: Props) {
  const viewport = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true), [showLatest, setShowLatest] = useState(false);
  const previousCount = useRef(0), frame = useRef<number | null>(null);
  const bottom = useCallback(() => {
    const element = viewport.current;
    if (element) { element.scrollTop = element.scrollHeight; pinned.current = true; setShowLatest(false); }
  }, []);
  useLayoutEffect(() => { pinned.current = true; previousCount.current = 0; bottom(); }, [viewKey, bottom]);
  useLayoutEffect(() => {
    // Sending is an intentional move to the current turn. Incoming chunks only
    // follow while already near the bottom; reading earlier messages stays stable.
    if (messages.length > previousCount.current && messages.at(-2)?.role === "user" && messages.at(-1)?.status === "pending") pinned.current = true;
    previousCount.current = messages.length;
    if (pinned.current) bottom(); else setShowLatest(true);
  }, [messages, loading, bottom]);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => { frame.current = null; if (pinned.current) bottom(); });
    });
    if (content.current) observer.observe(content.current);
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [bottom]);
  const latest = messages.findLast(message => message.role === "assistant")?.id;
  return <div className={`${styles.conversation} ${compact ? styles.compact : ""}`}>
    <div ref={viewport} className={styles.transcript} role="log" aria-label="Conversation" aria-live="off" onScroll={() => {
      const element = viewport.current;
      if (element) { pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; if (pinned.current) setShowLatest(false); }
    }}>
      <div ref={content} className={styles.flow}>
        {loading ? <p className={styles.loading} role="status">Loading conversation…</p>
          : historyError ? <div className={styles.loading} role="alert"><p>{historyError}</p><button className={styles.textButton} type="button" onClick={onReload}>Try again</button></div>
          : messages.length ? messages.map(message => <Message key={message.id} message={message} showModel={showModels} latest={message.id === latest} busy={busy} onReuse={onReuse} onConfirm={onConfirm} onSave={onSave} />) : empty}
        {messages.some(message => message.status === "error" || message.status === "stopped") && <button type="button" className={styles.textButton} onClick={onReload} disabled={busy}><RefreshCw size={14} />Refresh conversation</button>}
      </div>
    </div>
    {showLatest && <button type="button" className={styles.latest} onClick={bottom}><ArrowDown size={14} />Latest reply</button>}
    <span className={styles.srOnly} aria-live="polite">{busy ? "Sylvie is responding" : ""}</span>
  </div>;
});
